/**
 * management-token — the Management access-grant crypto + verification.
 *
 * Implements docs/data-model-security.md §5 exactly: a bearer link token
 * (SHA-256, cheap indexed lookup) plus a short fallback code (scrypt
 * salt:hash, slow on purpose — it's the weaker of the two secrets). Node's
 * built-in `crypto` only, no new dependency, per §5.3's own reasoning.
 *
 * `verifyManagementAccess` is the ONE place the link path gets checked
 * against the database — every page load and every write re-calls it fresh
 * (§5.4). Never cache its result across requests.
 */
import 'server-only';
import { randomBytes, createHash, scryptSync, timingSafeEqual } from 'node:crypto';
import { createServiceRoleClient } from './supabase/service-role';

const TOKEN_BYTES = 32;
const SHORT_CODE_LENGTH = 8;
// Excludes visually-ambiguous characters (0/O, 1/I/L, U/V confusable in some
// fonts is a stretch — keeping U out too, per §5.2's "Crockford-style").
const SHORT_CODE_ALPHABET = '23456789ABCDEFGHJKMNPQRSTWXYZ';

export function generateLinkToken(): string {
  return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function hashLinkToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function generateShortCode(): string {
  const bytes = randomBytes(SHORT_CODE_LENGTH);
  let code = '';
  for (let i = 0; i < SHORT_CODE_LENGTH; i++) {
    code += SHORT_CODE_ALPHABET[bytes[i] % SHORT_CODE_ALPHABET.length];
  }
  return code;
}

export function hashShortCode(code: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(code, salt, 64);
  return `${salt.toString('hex')}:${hash.toString('hex')}`;
}

/** Not wired to any route yet (the short-code entry page is deferred) —
 * kept here so the storage format and verification are designed together. */
export function verifyShortCode(code: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const candidate = scryptSync(code, salt, 64);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

export interface ManagementAccess {
  eventId: string;
  grantId: string;
}

/**
 * The §5.4 link-path check: hash the raw token, look up a matching,
 * non-revoked, non-expired grant via the service-role client (this table
 * has zero RLS policies for any client role — service-role is the only
 * path in, by design). Returns null on ANY failure reason (never existed,
 * expired, revoked) — deliberately no oracle distinguishing why.
 */
export async function verifyManagementAccess(rawToken: string): Promise<ManagementAccess | null> {
  if (!rawToken) return null;

  const tokenHash = hashLinkToken(rawToken);
  const supabase = createServiceRoleClient();

  const { data } = await supabase
    .from('event_access_tokens')
    .select('id, event_id')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (!data) return null;
  return { eventId: data.event_id, grantId: data.id };
}
