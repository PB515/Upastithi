'use server';

import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { verifyManagementAccess, looksLikeShortCode } from '@/lib/management-token';
import { rateLimit, clientIp } from '@/lib/security';

/**
 * Re-verifies the credential (link token OR short code — see
 * lib/management-token.ts) on every call (data-model-security.md §5.4) —
 * never trusts that a prior page load was valid. Every write that follows
 * scopes itself to the returned, server-verified `eventId`, never a
 * client-supplied one.
 */
async function verifyOrDeny(credential: string): Promise<{ eventId: string }> {
  const access = await verifyManagementAccess(credential);
  if (access) return access;

  // Failed attempts are tracked in two separate buckets (§5.8): a generous
  // one for link-shaped failures (256 bits isn't meaningfully
  // brute-forceable regardless of rate — this is mostly a scanning-abuse
  // signal) and a tight one for code-shaped failures (~40 bits, genuinely
  // guessable online without any leak).
  const ip = clientIp(await headers());
  const strict = looksLikeShortCode(credential);
  rateLimit(`management-verify-fail:${strict ? 'code' : 'link'}:${ip}`, strict ? 5 : 20, 15 * 60_000);

  // Same generic message for expired/revoked/malformed/never-existed, on
  // either path — deliberately no oracle (§5.4).
  throw new Error('This link is no longer active');
}

// A toggle, not one-way — walk-in registration already marks present on
// creation (below), so a one-way "mark present" would never have anything
// left to act on. This lets a mistaken entry be undone too.
export async function setPresent(token: string, attendeeId: string, present: boolean): Promise<void> {
  const { eventId } = await verifyOrDeny(token);
  const service = createServiceRoleClient();

  const { error } = await service
    .from('attendees')
    .update({ present })
    .eq('id', attendeeId)
    .eq('event_id', eventId); // a tampered attendeeId from another event matches zero rows

  if (error) throw new Error('Could not update attendance');

  revalidatePath(`/e/${token}`);
}

export async function registerWalkIn(token: string, formData: FormData): Promise<void> {
  const { eventId } = await verifyOrDeny(token);

  const name = String(formData.get('name') ?? '').trim();
  const phone = String(formData.get('phone') ?? '').trim();
  const remarks = String(formData.get('remarks') ?? '').trim();

  if (!name) throw new Error('Name is required');

  const service = createServiceRoleClient();
  const { error } = await service.from('attendees').insert({
    event_id: eventId,
    name,
    phone: phone || null,
    remarks: remarks || null,
    present: true,
  });

  if (error) throw new Error('Could not register attendee');

  revalidatePath(`/e/${token}`);
}
