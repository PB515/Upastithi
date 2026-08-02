'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { StaffSummary, AddedViewer } from './actions';
import { addViewer, removeViewer } from './actions';

export function StaffPanel({
  initialStaff,
  currentUserId,
}: {
  initialStaff: StaffSummary[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [added, setAdded] = useState<AddedViewer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleAdd() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await addViewer(email);
        setAdded(result);
        setEmail('');
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not add viewer');
      }
    });
  }

  function handleRemove(userId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await removeViewer(userId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not remove viewer');
      }
    });
  }

  return (
    <div className="max-w-xl space-y-4">
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {added && (
        <div className="space-y-2 rounded-[var(--radius)] border border-accent p-4">
          <p className="text-sm font-medium">Copy this now, it won&apos;t be shown again.</p>
          <div>
            <div className="text-xs text-muted">Email</div>
            <code className="text-sm">{added.email}</code>
          </div>
          <div>
            <div className="text-xs text-muted">Temporary password</div>
            <code className="text-sm">{added.tempPassword}</code>
          </div>
          <button type="button" onClick={() => setAdded(null)} className="text-sm underline">
            Done, I&apos;ve saved it
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <label htmlFor="viewer-email" className="block text-sm text-muted">
            Viewer&apos;s email
          </label>
          <input
            id="viewer-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-[var(--radius)] border border-border px-3 py-2"
          />
        </div>
        <button
          type="button"
          onClick={handleAdd}
          disabled={pending}
          className="rounded-[var(--radius)] bg-accent px-3 py-2 text-sm text-accent-foreground disabled:opacity-50"
        >
          {pending ? 'Working...' : 'Add Viewer'}
        </button>
      </div>

      <ul className="divide-y divide-border rounded-[var(--radius)] border border-border">
        {initialStaff.map((s) => (
          <li key={s.userId} className="flex items-center justify-between gap-2 p-3 text-sm">
            <div>
              <div className="font-medium">{s.email ?? 'Unknown email'}</div>
              <div className="text-muted">
                {s.role === 'admin' ? 'Admin' : 'Viewer'}
                {s.userId === currentUserId ? ' (you)' : ''}
              </div>
            </div>
            {s.role === 'viewer' && (
              <button
                type="button"
                onClick={() => handleRemove(s.userId)}
                disabled={pending}
                className="rounded-[var(--radius)] border border-border px-2 py-1 text-red-600 disabled:opacity-50"
              >
                Remove
              </button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
