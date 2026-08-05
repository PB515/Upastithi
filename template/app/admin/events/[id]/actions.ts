'use server';

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { requireAdmin } from '@/lib/require-admin';
import { writeAuditLog } from '@/lib/patterns/audit-log';
import {
  generateLinkToken,
  hashLinkToken,
  generateShortCode,
  hashShortCode,
} from '@/lib/management-token';

export interface EventDraft {
  name: string;
  event_date: string;
  location: string;
}

export async function updateEvent(eventId: string, draft: EventDraft): Promise<void> {
  const name = draft.name.trim();
  const eventDate = draft.event_date.trim();
  const location = draft.location.trim();

  // Never trust client-only validation — re-check here too.
  if (!name) throw new Error('Event name is required');
  if (!eventDate || Number.isNaN(Date.parse(eventDate))) {
    throw new Error('A valid event date is required');
  }

  const supabase = await createClient();
  const { error } = await supabase
    .from('events')
    .update({ name, event_date: eventDate, location: location || null })
    .eq('id', eventId);

  if (error) throw new Error('Could not save changes');

  revalidatePath(`/admin/events/${eventId}`);
  revalidatePath('/admin');
  revalidatePath('/viewer');
}

export interface GrantSummary {
  id: string;
  label: string | null;
  createdAt: string;
  expiresAt: string;
  revokedAt: string | null;
}

/**
 * `event_access_tokens` has zero RLS policies for any client role, admin
 * included (data-model-security.md §5.6) — every read/write here goes
 * through the service-role client, gated by `requireAdmin()` first.
 */
export async function listGrants(eventId: string): Promise<GrantSummary[]> {
  await requireAdmin();
  const service = createServiceRoleClient();

  const { data, error } = await service
    .from('event_access_tokens')
    .select('id, label, created_at, expires_at, revoked_at')
    .eq('event_id', eventId)
    .order('created_at', { ascending: false });

  if (error) throw new Error('Could not load access grants');

  return (data ?? []).map((g) => ({
    id: g.id,
    label: g.label,
    createdAt: g.created_at,
    expiresAt: g.expires_at,
    revokedAt: g.revoked_at,
  }));
}

export interface GeneratedGrant {
  grantId: string;
  label: string | null;
  token: string;
  code: string;
  expiresAt: string;
}

export async function generateGrant(eventId: string, label?: string): Promise<GeneratedGrant> {
  const { userId } = await requireAdmin();
  const service = createServiceRoleClient();

  const { data: event } = await service
    .from('events')
    .select('event_date')
    .eq('id', eventId)
    .single();
  if (!event) throw new Error('Event not found');

  // Default expiry: event_date + 24h (data-model-security.md §5.5).
  const expiresAt = new Date(`${event.event_date}T00:00:00Z`);
  expiresAt.setUTCHours(expiresAt.getUTCHours() + 24);

  const rawToken = generateLinkToken();
  const rawCode = generateShortCode();

  const { data: grant, error } = await service
    .from('event_access_tokens')
    .insert({
      event_id: eventId,
      label: label?.trim() || null,
      token_hash: hashLinkToken(rawToken),
      short_code_hash: hashShortCode(rawCode),
      created_by: userId,
      expires_at: expiresAt.toISOString(),
    })
    .select('id, label, expires_at')
    .single();

  if (error || !grant) throw new Error('Could not generate access grant');

  await writeAuditLog(service, {
    actorId: userId,
    action: 'event_token.generated',
    entity: 'event_access_tokens',
    entityId: grant.id,
    meta: { label: grant.label },
  });

  revalidatePath(`/admin/events/${eventId}`);

  // Raw secrets are returned once, here, and never stored — the client
  // component holds them in memory just long enough to display "copy this
  // now" (data-model-security.md §5.3).
  return {
    grantId: grant.id,
    label: grant.label,
    token: rawToken,
    code: rawCode,
    expiresAt: grant.expires_at,
  };
}

export async function revokeGrant(grantId: string): Promise<void> {
  const { userId } = await requireAdmin();
  const service = createServiceRoleClient();

  const { data: grant, error } = await service
    .from('event_access_tokens')
    .update({ revoked_at: new Date().toISOString() })
    .eq('id', grantId)
    .select('id, event_id, label')
    .single();

  if (error || !grant) throw new Error('Could not revoke grant');

  await writeAuditLog(service, {
    actorId: userId,
    action: 'event_token.revoked',
    entity: 'event_access_tokens',
    entityId: grant.id,
    meta: { label: grant.label },
  });

  revalidatePath(`/admin/events/${grant.event_id}`);
}

export async function regenerateGrant(grantId: string): Promise<GeneratedGrant> {
  await requireAdmin();
  const service = createServiceRoleClient();

  const { data: grant, error } = await service
    .from('event_access_tokens')
    .select('event_id, label')
    .eq('id', grantId)
    .single();

  if (error || !grant) throw new Error('Could not find grant to regenerate');

  await revokeGrant(grantId);
  return generateGrant(grant.event_id, grant.label ?? undefined);
}

export async function extendGrant(grantId: string): Promise<void> {
  const { userId } = await requireAdmin();
  const service = createServiceRoleClient();

  const newExpiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

  const { data: grant, error } = await service
    .from('event_access_tokens')
    .update({ expires_at: newExpiresAt, extended_at: new Date().toISOString(), extended_by: userId })
    .eq('id', grantId)
    .select('id, event_id, label')
    .single();

  if (error || !grant) throw new Error('Could not extend grant');

  await writeAuditLog(service, {
    actorId: userId,
    action: 'event_token.extended',
    entity: 'event_access_tokens',
    entityId: grant.id,
    meta: { label: grant.label, new_expires_at: newExpiresAt },
  });

  revalidatePath(`/admin/events/${grant.event_id}`);
}
