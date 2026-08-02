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

export function verifyShortCode(code: string, stored: string): boolean {
  const [saltHex, hashHex] = stored.split(':');
  if (!saltHex || !hashHex) return false;
  const salt = Buffer.from(saltHex, 'hex');
  const expected = Buffer.from(hashHex, 'hex');
  const candidate = scryptSync(code, salt, 64);
  return candidate.length === expected.length && timingSafeEqual(candidate, expected);
}

/** Rough shape check used only to pick a rate-limit bucket (§5.8) — link
 * tokens are 43 chars, short codes are exactly SHORT_CODE_LENGTH. Not used
 * for anything security-load-bearing itself. */
export function looksLikeShortCode(credential: string): boolean {
  return credential.length <= 10;
}

export interface ManagementAccess {
  eventId: string;
  grantId: string;
}

/**
 * Checks a credential against BOTH paths from §5.4:
 *  - LINK PATH: hash the raw token, one indexed lookup. Tried first — it's
 *    the common case and it's cheap.
 *  - SHORT-CODE PATH: only reached if the link lookup misses. No index is
 *    possible for a slow KDF, so this loops every currently-active grant
 *    and scrypt-compares (§5.8's documented scale assumption: cheap only
 *    because this app's real grant volume is small).
 * Returns null on ANY failure reason (never existed, expired, revoked,
 * wrong path entirely) — deliberately no oracle distinguishing why, on
 * either path.
 */
export async function verifyManagementAccess(credential: string): Promise<ManagementAccess | null> {
  if (!credential) return null;

  const supabase = createServiceRoleClient();

  const tokenHash = hashLinkToken(credential);
  const { data: byToken } = await supabase
    .from('event_access_tokens')
    .select('id, event_id')
    .eq('token_hash', tokenHash)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .maybeSingle();

  if (byToken) return { eventId: byToken.event_id, grantId: byToken.id };

  const { data: candidates } = await supabase
    .from('event_access_tokens')
    .select('id, event_id, short_code_hash')
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString());

  for (const candidate of candidates ?? []) {
    if (verifyShortCode(credential, candidate.short_code_hash)) {
      return { eventId: candidate.event_id, grantId: candidate.id };
    }
  }

  return null;
}
