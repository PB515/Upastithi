'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import type { GrantSummary, GeneratedGrant } from './actions';
import { generateGrant, revokeGrant, extendGrant, regenerateGrant } from './actions';

function grantStatus(grant: GrantSummary): 'active' | 'expired' | 'revoked' {
  if (grant.revokedAt) return 'revoked';
  if (new Date(grant.expiresAt).getTime() <= Date.now()) return 'expired';
  return 'active';
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function GrantsPanel({
  eventId,
  initialGrants,
}: {
  eventId: string;
  initialGrants: GrantSummary[];
}) {
  const router = useRouter();
  const [label, setLabel] = useState('');
  const [generated, setGenerated] = useState<GeneratedGrant | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function handleGenerate() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await generateGrant(eventId, label);
        setGenerated(result);
        setLabel('');
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not generate access grant');
      }
    });
  }

  function handleRevoke(grantId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await revokeGrant(grantId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not revoke grant');
      }
    });
  }

  function handleExtend(grantId: string) {
    setError(null);
    startTransition(async () => {
      try {
        await extendGrant(grantId);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not extend grant');
      }
    });
  }

  function handleRegenerate(grantId: string) {
    setError(null);
    startTransition(async () => {
      try {
        const result = await regenerateGrant(grantId);
        setGenerated(result);
        router.refresh();
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Could not regenerate grant');
      }
    });
  }

  const origin = typeof window !== 'undefined' ? window.location.origin : '';

  return (
    <div className="space-y-4">
      {error && (
        <p className="text-sm text-red-600" role="alert">
          {error}
        </p>
      )}

      {generated && (
        <div className="space-y-2 rounded-[var(--radius)] border border-accent p-4">
          <p className="text-sm font-medium">Copy this now, it won&apos;t be shown again.</p>
          <div>
            <div className="text-xs text-muted">Link</div>
            <code className="block break-all text-sm">
              {origin}/e/{generated.token}
            </code>
          </div>
          <div>
            <div className="text-xs text-muted">Fallback code</div>
            <code className="text-sm">{generated.code}</code>
          </div>
          <button type="button" onClick={() => setGenerated(null)} className="text-sm underline">
            Done, I&apos;ve saved it
          </button>
        </div>
      )}

      <div className="flex items-end gap-2">
        <div className="flex-1 space-y-1">
          <label htmlFor="grant-label" className="block text-sm text-muted">
            Label who&apos;s using this, shown to them and to you below
          </label>
          <input
            id="grant-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Gate volunteer, Registration desk"
            className="w-full rounded-[var(--radius)] border border-border px-3 py-2"
          />
        </div>
        <button
          type="button"
          onClick={handleGenerate}
          disabled={pending}
          className="rounded-[var(--radius)] bg-accent px-3 py-2 text-sm text-accent-foreground disabled:opacity-50"
        >
          {pending ? 'Working...' : 'Generate access link'}
        </button>
      </div>

      {initialGrants.length === 0 ? (
        <p className="text-sm text-muted">No access grants yet for this event.</p>
      ) : (
        <ul className="divide-y divide-border rounded-[var(--radius)] border border-border">
          {initialGrants.map((grant) => {
            const status = grantStatus(grant);
            return (
              <li key={grant.id} className="flex items-center justify-between gap-3 p-3 text-sm">
                <div>
                  <div className="font-medium">{grant.label || 'Unlabeled grant'}</div>
                  <div className="text-muted">
                    {status === 'active' && `Active until ${formatDateTime(grant.expiresAt)}`}
                    {status === 'expired' && `Expired ${formatDateTime(grant.expiresAt)}`}
                    {status === 'revoked' && 'Revoked'}
                  </div>
                </div>
                {status === 'active' && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => handleExtend(grant.id)}
                      disabled={pending}
                      className="rounded-[var(--radius)] border border-border px-2 py-1 disabled:opacity-50"
                    >
                      Extend
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRegenerate(grant.id)}
                      disabled={pending}
                      className="rounded-[var(--radius)] border border-border px-2 py-1 disabled:opacity-50"
                    >
                      Regenerate
                    </button>
                    <button
                      type="button"
                      onClick={() => handleRevoke(grant.id)}
                      disabled={pending}
                      className="rounded-[var(--radius)] border border-border px-2 py-1 text-red-600 disabled:opacity-50"
                    >
                      Revoke
                    </button>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
