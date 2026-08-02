'use client';
/**
 * offline-queue — use when a write must succeed even through a dropped
 * connection: optimistic UI + a local retry queue, not a spinner that just
 * fails silently. Built for Upasthiti's Management flow (patchy field
 * network, decision 4), generic enough to reuse anywhere the same shape
 * applies.
 *
 * Persists to localStorage, not IndexedDB — the queue is a handful of items
 * at most, localStorage's synchronous API is simpler and needs no new
 * dependency. Retries on the browser's `online` event, a periodic backstop
 * (some mobile browsers don't fire `online` reliably), and once on mount
 * (recovers a queue left over from a killed tab).
 *
 * `sync` doesn't need to know anything about this hook — network-shaped
 * failures (the fetch itself never reached the server) and application
 * rejections (the server ran and explicitly threw, e.g. "not authorized")
 * are told apart automatically: browsers throw TypeError for fetch-level
 * failures, so anything else is treated as a real rejection and stops
 * retrying. Erring toward "keep trying" is the safer default here.
 */
import { useCallback, useEffect, useRef, useState } from 'react';

export interface QueueItem<TPayload> {
  id: string;
  payload: TPayload;
  status: 'pending' | 'syncing' | 'failed';
  attempts: number;
  error?: string;
}

export interface UseOfflineQueueOptions<TPayload, TResult> {
  storageKey: string;
  sync: (payload: TPayload) => Promise<TResult>;
  onSynced?: (payload: TPayload, result: TResult) => void;
  retryIntervalMs?: number;
}

function isNetworkFailure(err: unknown): boolean {
  return err instanceof TypeError || (err instanceof Error && /fetch|network/i.test(err.message));
}

function makeId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadQueue<TPayload>(storageKey: string): QueueItem<TPayload>[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(storageKey);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as QueueItem<TPayload>[];
    // Anything mid-flight when the tab died goes back to pending, not lost.
    return parsed.map((item) => (item.status === 'syncing' ? { ...item, status: 'pending' as const } : item));
  } catch {
    return [];
  }
}

function saveQueue<TPayload>(storageKey: string, queue: QueueItem<TPayload>[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(storageKey, JSON.stringify(queue));
  } catch {
    /* storage full or unavailable — the in-memory queue still works for this session */
  }
}

export function useOfflineQueue<TPayload, TResult = void>({
  storageKey,
  sync,
  onSynced,
  retryIntervalMs = 20_000,
}: UseOfflineQueueOptions<TPayload, TResult>) {
  const [queue, setQueue] = useState<QueueItem<TPayload>[]>(() => loadQueue<TPayload>(storageKey));

  const queueRef = useRef(queue);
  queueRef.current = queue;
  const syncRef = useRef(sync);
  syncRef.current = sync;
  const onSyncedRef = useRef(onSynced);
  onSyncedRef.current = onSynced;
  // Guards against firing the same item's sync twice concurrently — found
  // via real testing, not by inspection: React's Strict Mode double-invokes
  // the mount effect in development, so the mount-time flush() call ran
  // twice back-to-back, and both invocations saw the item as still
  // "pending" (React state updates aren't synchronous) before either had
  // removed it, producing two real inserted rows from one registerWalkIn.
  // A ref-backed Set is checked and updated synchronously, unlike the
  // queue's own React state, so it actually closes the race.
  const inFlightRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    saveQueue(storageKey, queue);
  }, [storageKey, queue]);

  const attemptOne = useCallback((item: QueueItem<TPayload>) => {
    if (inFlightRef.current.has(item.id)) return;
    inFlightRef.current.add(item.id);

    setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: 'syncing' as const } : i)));
    syncRef
      .current(item.payload)
      .then((result) => {
        inFlightRef.current.delete(item.id);
        setQueue((q) => q.filter((i) => i.id !== item.id));
        onSyncedRef.current?.(item.payload, result);
      })
      .catch((err: unknown) => {
        inFlightRef.current.delete(item.id);
        if (isNetworkFailure(err)) {
          setQueue((q) =>
            q.map((i) => (i.id === item.id ? { ...i, status: 'pending' as const, attempts: i.attempts + 1 } : i))
          );
        } else {
          const message = err instanceof Error ? err.message : 'Could not sync';
          setQueue((q) => q.map((i) => (i.id === item.id ? { ...i, status: 'failed' as const, error: message } : i)));
        }
      });
  }, []);

  const flush = useCallback(() => {
    queueRef.current.filter((i) => i.status === 'pending').forEach(attemptOne);
  }, [attemptOne]);

  useEffect(() => {
    flush();
    window.addEventListener('online', flush);
    const interval = setInterval(flush, retryIntervalMs);
    return () => {
      window.removeEventListener('online', flush);
      clearInterval(interval);
    };
    // Deliberately mount-only: flush/attemptOne close over refs, not stale state.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const enqueue = useCallback(
    (payload: TPayload) => {
      const item: QueueItem<TPayload> = { id: makeId(), payload, status: 'pending', attempts: 0 };
      setQueue((q) => [...q, item]);
      attemptOne(item);
      return item.id;
    },
    [attemptOne]
  );

  const retry = useCallback(
    (id: string) => {
      const item = queueRef.current.find((i) => i.id === id);
      if (item) attemptOne({ ...item, status: 'pending' });
    },
    [attemptOne]
  );

  return { queue, enqueue, retry };
}
