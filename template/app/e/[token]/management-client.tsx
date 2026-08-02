'use client';

import { useMemo, useState } from 'react';
import { useOfflineQueue } from '@/lib/patterns/offline-queue';
import { setPresent, registerWalkIn } from './actions';
import { Loader2, AlertCircle } from '@/lib/icons';

interface Attendee {
  id: string;
  name: string;
  phone: string | null;
  present: boolean;
  remarks: string | null;
}

// One queue, two operation kinds — simpler than two separate hook instances
// since both need the same optimistic/pending/failed treatment on the same
// attendee list.
type QueuePayload =
  | { kind: 'setPresent'; attendeeId: string; present: boolean }
  | { kind: 'registerWalkIn'; tempId: string; name: string; phone?: string; remarks?: string };

export function ManagementClient({
  token,
  initialAttendees,
}: {
  token: string;
  initialAttendees: Attendee[];
}) {
  // `attendees` is the settled/confirmed state — updated only once a queue
  // item actually finishes syncing, never optimistically. The optimistic
  // view is computed separately (`displayAttendees`, below) by overlaying
  // the current queue on top of it. This is deliberately NOT split into "an
  // imperative optimistic mutation at click time" — a queue item rehydrated
  // from localStorage after a reload has no click event to hook that
  // mutation into, and a first version of this component that did it that
  // way showed the stale pre-sync value once a rehydrated item finished
  // syncing, even though the database was already correct. One derived
  // overlay covers both a fresh click and a rehydrated reload the same way.
  const [attendees, setAttendees] = useState<Attendee[]>(initialAttendees);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [remarks, setRemarks] = useState('');

  const { queue, enqueue, retry } = useOfflineQueue<QueuePayload>({
    storageKey: `upasthiti:e:${token}:queue`,
    sync: async (payload) => {
      if (payload.kind === 'setPresent') {
        await setPresent(token, payload.attendeeId, payload.present);
        setAttendees((prev) =>
          prev.map((a) => (a.id === payload.attendeeId ? { ...a, present: payload.present } : a))
        );
      } else {
        const result = await registerWalkIn(token, {
          name: payload.name,
          phone: payload.phone,
          remarks: payload.remarks,
        });
        setAttendees((prev) => {
          const alreadyLocal = prev.some((a) => a.id === payload.tempId);
          if (alreadyLocal) {
            return prev.map((a) => (a.id === payload.tempId ? { ...a, id: result.id } : a));
          }
          // Rehydrated after a reload — the temp entry only ever existed in
          // the derived overlay, never in this state, so add it fresh.
          return [
            ...prev,
            {
              id: result.id,
              name: payload.name,
              phone: payload.phone ?? null,
              present: true,
              remarks: payload.remarks ?? null,
            },
          ];
        });
      }
    },
  });

  const displayAttendees = useMemo(() => {
    let result = attendees;
    for (const item of queue) {
      const payload = item.payload;
      if (payload.kind === 'setPresent') {
        const { attendeeId, present } = payload;
        result = result.map((a) => (a.id === attendeeId ? { ...a, present } : a));
      } else if (!result.some((a) => a.id === payload.tempId)) {
        const { tempId, name: pName, phone: pPhone, remarks: pRemarks } = payload;
        result = [...result, { id: tempId, name: pName, phone: pPhone ?? null, present: true, remarks: pRemarks ?? null }];
      }
    }
    return result;
  }, [attendees, queue]);

  function queueItemFor(attendeeId: string) {
    return queue.find(
      (i) =>
        (i.payload.kind === 'setPresent' && i.payload.attendeeId === attendeeId) ||
        (i.payload.kind === 'registerWalkIn' && i.payload.tempId === attendeeId)
    );
  }

  function toggle(attendee: Attendee) {
    enqueue({ kind: 'setPresent', attendeeId: attendee.id, present: !attendee.present });
  }

  function handleRegister() {
    const trimmedName = name.trim();
    if (!trimmedName) return;

    const tempId = `temp-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    enqueue({
      kind: 'registerWalkIn',
      tempId,
      name: trimmedName,
      phone: phone.trim() || undefined,
      remarks: remarks.trim() || undefined,
    });

    setName('');
    setPhone('');
    setRemarks('');
  }

  const pendingCount = queue.filter((i) => i.status === 'pending' || i.status === 'syncing').length;
  const failedCount = queue.filter((i) => i.status === 'failed').length;

  return (
    <>
      {(pendingCount > 0 || failedCount > 0) && (
        <div className="mb-4 space-y-1 rounded-[var(--radius)] border border-border p-3 text-sm">
          {pendingCount > 0 && (
            <p className="flex items-center gap-2 text-muted">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {pendingCount} change{pendingCount === 1 ? '' : 's'} waiting to sync
            </p>
          )}
          {failedCount > 0 && (
            <p className="flex items-center gap-2 text-red-600">
              <AlertCircle className="size-4" aria-hidden />
              {failedCount} change{failedCount === 1 ? '' : 's'} failed to sync
            </p>
          )}
        </div>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-sm font-medium text-muted">Attendees</h2>
        {displayAttendees.length === 0 ? (
          <p className="text-sm text-muted">No one registered yet. Add a walk-in below.</p>
        ) : (
          <ul className="divide-y divide-border rounded-[var(--radius)] border border-border">
            {displayAttendees.map((a) => {
              const item = queueItemFor(a.id);
              return (
                <li key={a.id} className="flex items-center justify-between gap-2 p-3">
                  <div>
                    <div className="font-medium">{a.name}</div>
                    {a.phone && <div className="text-sm text-muted">{a.phone}</div>}
                  </div>
                  {item?.status === 'pending' || item?.status === 'syncing' ? (
                    <span className="flex items-center gap-1 text-sm text-muted">
                      <Loader2 className="size-4 animate-spin" aria-hidden />
                      Syncing...
                    </span>
                  ) : item?.status === 'failed' ? (
                    <button
                      type="button"
                      onClick={() => retry(item.id)}
                      className="flex items-center gap-1 text-sm text-red-600 underline"
                    >
                      <AlertCircle className="size-4" aria-hidden />
                      Failed, tap to retry
                    </button>
                  ) : a.present ? (
                    <div className="flex items-center gap-2">
                      <span className="text-sm text-green-700">Present</span>
                      <button type="button" onClick={() => toggle(a)} className="text-sm underline">
                        Undo
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => toggle(a)}
                      className="rounded-[var(--radius)] bg-accent px-3 py-1.5 text-sm text-accent-foreground"
                    >
                      Mark present
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-sm font-medium text-muted">Register a walk-in</h2>
        <div className="max-w-sm space-y-3">
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Name"
            className="w-full rounded-[var(--radius)] border border-border px-3 py-2"
          />
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="Phone (optional)"
            className="w-full rounded-[var(--radius)] border border-border px-3 py-2"
          />
          <input
            value={remarks}
            onChange={(e) => setRemarks(e.target.value)}
            placeholder="Remarks (optional)"
            className="w-full rounded-[var(--radius)] border border-border px-3 py-2"
          />
          <button
            type="button"
            onClick={handleRegister}
            disabled={!name.trim()}
            className="rounded-[var(--radius)] bg-accent px-3 py-2 text-sm text-accent-foreground disabled:opacity-50"
          >
            Register and mark present
          </button>
        </div>
      </section>
    </>
  );
}
