# Data Model & Security — Upasthiti

*Per `doc-gen-master.md`'s authenticated-app addendum: the schema plus, for every table, who may read/write which rows — deny by default. Companion to [`app-prd.md`](app-prd.md) (who the roles are) and [`golden-paths/portal.md`](golden-paths/portal.md) (the pattern this mostly follows). This doc exists specifically because decision 3 in `CLAUDE.md` calls for the Management access-token boundary to be "designed with the same care as a real login, not less" — §5 is that design. Schema is a frozen doc per Safety Rail 7: changing it after this is approved is a separate, logged step, migration written after.*

---

## 1. Security posture

**Deny by default, allow on purpose** (Playbook Safety Rail / PART 7). Row Level Security is enabled on every table in `public`. A table with no policy for a given role denies that role completely — that's the default state, not an oversight, for tables noted as "no client policy" below.

Two access paths exist in this app, and they map to two different enforcement mechanisms:

- **Admin / Viewer** — logged-in Supabase Auth users. Enforced by **RLS policies** keyed off `has_role()`, same as any portal build.
- **Management** — no session, no `auth.uid()`. RLS cannot key off a user identity that doesn't exist, so this path is **service-role-mediated**: a Server Action/Route Handler verifies the bearer token itself, then performs the scoped read/write using the service-role client (which bypasses RLS by design — see §6). RLS on the underlying tables still denies the `anon` role directly; the service-role path is the *only* way Management data moves, and every scope decision happens in reviewed application code, not in the client's hands.

## 2. Roles → Postgres mapping

```sql
-- migrate:up
create table if not exists staff (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null unique references auth.users(id) on delete cascade,
  role        text not null check (role in ('admin', 'viewer')),
  created_at  timestamptz not null default now()
);

alter table staff enable row level security;

create policy "staff can read own row"
  on staff for select
  using (user_id = auth.uid());

create policy "admins can read all staff"
  on staff for select
  using (has_role('admin'));

create policy "admins manage staff"
  on staff for insert, update, delete
  using (has_role('admin'));
```

`has_role()` is the IDP's standard pattern (`template/lib/patterns/has_role.sql`), adapted to this table name (the template assumes a generic `user_roles` table; this schema calls it `staff` to keep the domain vocabulary — "admin" and "viewer" are staff, not a generic role list):

```sql
create or replace function public.has_role(required_role text)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.staff s
    where s.user_id = auth.uid() and s.role = required_role
  );
$$;

revoke all on function public.has_role(text) from public;
grant execute on function public.has_role(text) to authenticated;
```

**Bootstrapping the first Admin** is a manual step (insert directly via the Supabase SQL editor or the service-role client after the person signs up) — there is no self-serve "become admin" path in the app, intentionally. Document this as a one-line runbook step when Phase 1 lands, not automated.

## 3. Schema

*Every field here traces to a decision or a plainly necessary mechanic (a timestamp, a foreign key). Nothing speculative — Phase 2's structured fields (decision 6) are deliberately not modeled yet; `remarks text` is the seam they'll attach to later.*

```sql
-- migrate:up

create table if not exists events (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  event_date  date not null,
  location    text,
  created_by  uuid not null references auth.users(id),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table if not exists event_access_tokens (
  id               uuid primary key default gen_random_uuid(),
  event_id         uuid not null references events(id) on delete cascade,
  label            text,                     -- admin-facing name, e.g. "Gate volunteer 2" — required once a 2nd grant exists for an event, see §5.2
  token_hash       text not null unique,     -- the link token, SHA-256
  short_code_hash  text not null unique,     -- the fallback code, salt:hash via Node's scrypt (see §5.3)
  created_at       timestamptz not null default now(),
  created_by       uuid not null references auth.users(id),
  expires_at       timestamptz not null,
  revoked_at       timestamptz,
  extended_at      timestamptz,
  extended_by      uuid references auth.users(id)
);
create index if not exists event_access_tokens_event_id_idx on event_access_tokens(event_id);

create table if not exists attendees (
  id          uuid primary key default gen_random_uuid(),
  event_id    uuid not null references events(id) on delete cascade,
  name        text not null,
  phone       text,
  present     boolean not null default false,
  remarks     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists attendees_event_id_idx on attendees(event_id);

create table if not exists audit_log (
  id          uuid primary key default gen_random_uuid(),
  actor_id    uuid not null references auth.users(id),
  action      text not null,
  entity      text not null,
  entity_id   uuid,
  meta        jsonb not null default '{}',
  created_at  timestamptz not null default now()
);
```

`actor_id` is `not null`, not the generic pattern's nullable — every row this app ever writes is an admin action (§7); there's no "system" actor in this design, so leaving room for one was a leftover from copying the template pattern rather than a real need.

No table stores *which Management team member* wrote a given `attendees` row — that identity is never captured, per decision 3's accepted tradeoff. `attendees.created_at`/`updated_at` give operational visibility ("when"), not "who," for rows written via the Management path.

## 4. RLS per table

| Table | `anon` | `authenticated` (no role row) | `viewer` | `admin` | service-role |
|---|---|---|---|---|---|
| `staff` | deny | deny | own row only | full | **bootstrap only** — creating the first Admin/Viewer accounts happens before any admin session exists, so that one write is necessarily service-role (§2, `tooling/dev-seed.ts` locally / Supabase dashboard in production), not the "Management" path this column is otherwise about |
| `events` | deny | deny | select | full | never touched directly — server reads it once during token verification, via service-role |
| `event_access_tokens` | deny | deny | **deny — no policy at all, admin included** (see §5) | **deny — no policy at all** (see §5) | never touched by Management; service-role reads it during verification only |
| `attendees` | deny | deny | select | full | scoped select/insert/update, service-role-mediated, `event_id` fixed server-side |
| `audit_log` | deny | deny | deny (confirmed) | select, insert | never touched |

The `event_access_tokens` row is the one deliberate exception to "admin gets full access" in this app, and it's the most important line in this table — explained in §5.

## 5. The Management access token — designed like a login

This is decision 3's core ask: an event-scoped bearer token that stands in for a login, drawn with the same care. Every property below is a specific answer to "how does this not become the weak point."

### 5.1 What it is, and what it explicitly is not

It's a **bearer token / magic-link model** (closer to an API key than to an authentication *protocol*): possession of the raw value is the entire authorization, for exactly one event, until it expires or is revoked. There is no separate identity behind it — this is a deliberate, decided tradeoff (decision 3), not an oversight.

It is a different shape from a QR/time-rotating code, and worth stating explicitly since the discovery brief's architecture note draws the comparison: an existing IDP-built site (a sibling project, not part of this IDP's own template) uses an HMAC-derived, 90-second-rotating code to let an *already-logged-in* user prove "I'm physically at this event" — that code authenticates a *scan*, layered on top of a session that already exists. Upasthiti's Management token is the opposite shape: there is no session to layer on top of, so the token itself must carry the full weight of authorization. Copying the rotating-code mechanic here would add complexity (clock sync, epoch windows) without adding security, since there's no separate identity for it to corroborate.

### 5.2 Token format — a link, a fallback code, and one grant per person working an event

Two entry points into the same grant, generated together:

- **The link token** — `crypto.randomBytes(32)`, base64url-encoded (~43 chars), embedded in `https://<domain>/e/<token>` and the QR code. This is the primary path.
- **The short fallback code** — for when sharing a full URL isn't practical (reading it aloud over a call in a dead zone, handing it over verbally). 8 characters from a 32-symbol alphabet that excludes visually-ambiguous characters (`0`/`O`, `1`/`I`/`L`) — Crockford-style base32 — giving ~40 bits of entropy. Generated with the same `crypto.randomBytes`-backed randomness as the link token, independently, not derived from it.

Both are **not derived from the event id, not sequential, not guessable from anything the client can see.**

**Multiple grants per event, not one.** A single event can need more than one person marking attendance at once — the concrete case that surfaced this: a 150-person event needs at least 2 people working it simultaneously. So `event_access_tokens` is a list per event, not a single row: Admin generates one grant per person actually working that event (each with its own link, its own code, its own `label` so Admin can tell "Reena's phone" from "Gate volunteer 2" when revoking one without touching the others).

**"One link, one person" is an operational convention here, not a technically enforced constraint** — see §5.9 for why, and how to change that if it turns out to matter more than I'm assuming.

### 5.3 Storage — hashed, never raw, and not the same hash for both secrets

Neither raw secret is **ever written to the database**. On generation:

1. Generate the raw link token and the raw short code (independently).
2. Hash the link token with SHA-256 → `token_hash`. It already carries 256 bits of entropy, so a fast hash doesn't weaken it (unlike password hashing, this isn't defending low-entropy human input against offline guessing) — and a fast hash keeps every Management request cheap to verify.
3. Hash the short code with a **slow KDF**, not SHA-256 → `short_code_hash`. This one matters: at ~40 bits, the short code is far weaker than the link token, and if the database ever leaked, a fast hash would make it crackable offline in minutes on commodity GPU hardware. Use Node's built-in `crypto.scrypt` rather than reaching for a `bcrypt` package — this project has a "no new dependencies without asking" rule (Safety Rail 5), and everything else in this design already uses only Node's built-in `crypto` (§5.2's `randomBytes`, `token_hash`'s SHA-256), so `scrypt` keeps that consistent at zero dependency cost. Store as `salt:hash` (16-byte random salt, hex, `:`-joined with the scrypt digest, hex) — `crypto.scrypt` doesn't manage salting/versioning itself the way a password library does, so the app does it explicitly, the standard pattern for using it directly. A slow KDF makes offline cracking impractical even at that lower entropy — the online-guessing side (someone just typing guesses at the live endpoint, no leak needed) is separately handled by the IP-based rate limiting in §5.8.
4. Insert both hashes (plus `label`) into `event_access_tokens`.
5. Show the raw link and raw code to the Admin **once**, in the response to that action. Neither is stored, so neither can be redisplayed — the admin UI can only ever show a grant's status (label, active/expired/revoked, expiry, created date), matching the "shown once" pattern of any API-key issuance flow.

This means a database read (backup, dump, misconfigured export) never hands out a live, usable credential for either entry path — only hashes that are useless without the original secret.

### 5.4 Verification flow (every page load AND every write)

The `/e/[token]` route and every Server Action it exposes (mark present, register walk-in) re-verify on **every** call, not just once at page load — a stale open tab must lose access the moment an Admin revokes:

```
LINK PATH (the common case):
1. Client sends the raw token (from the URL path segment / bound Server Action arg).
2. Server hashes it (SHA-256).
3. Server queries event_access_tokens via the SERVICE-ROLE client:
     where token_hash = <hash>
       and revoked_at is null
       and expires_at > now()
4. No match → generic "this link is no longer active" page/response.
   (Same message whether the token never existed, expired, or was revoked —
   don't leak which, that's a distinguishing oracle for free.)
5. Match → proceed as below.

SHORT-CODE PATH (the fallback — entered by hand at a generic entry page,
e.g. /e — the caller has no link and so, by definition, hasn't picked an
event yet; there is nothing to scope the lookup by ahead of time):
1. Client submits the code at the generic entry page.
2. Server splits each candidate's stored `salt:hash`, re-runs `crypto.scrypt`
   on the submitted code with that salt, and compares digests with
   `crypto.timingSafeEqual` (never `===` on hash bytes — this project's
   `security.ts` conventions favor exactly this care in the adjacent
   rate-limit/honeypot code, same standard applies here) against EVERY
   currently-active grant system-wide (where revoked_at is null and
   expires_at > now()) — this can't be looked up by an index the way
   token_hash can, so it's a loop, not a single indexed query. This only
   stays fast because active-grant volume is small at this app's real scale
   (a handful of events running at once, a handful of grants each) — see
   the scale note below.
3. No match on any row → generic "code not recognized" response. There's no
   single grant to blame a wrong guess on (a scrypt match is binary, not
   "closest"), so per-grant lockout isn't the right defense here — see §5.8
   for the actual defense (IP-based rate limiting on this endpoint).
4. Match → proceed as below.

ONCE VERIFIED (either path):
Server now holds a server-verified event_id for THIS request only.
Every subsequent read/write in that request uses this event_id.
A client-supplied event_id (hidden field, body param, whatever) is
NEVER trusted — if one is present, it's ignored, not merged or checked
against the verified value.
```

This is what "service-role-mediated writes are scoped to only that one event's rows, never broader" (CLAUDE.md decision 3) means concretely: the scoping boundary is a variable in server memory for the duration of one verified request, re-derived from the token every time, never carried forward from a previous request or trusted from the client.

### 5.5 Expiry mechanics

- `expires_at` defaults to **event_date + 24 hours** at creation — enough grace to finish marking attendance the same night without leaving a link live indefinitely.
- **Admin-extendable**: an "Extend access" action updates `expires_at` on the active token row and writes an `audit_log` entry (`action: 'event_token.extended'`). No limit on how many times, decided per the Admin's judgment of the actual event.
- **Revocable immediately**: "Revoke access" sets `revoked_at = now()`. Takes effect on the *next* verification (§5.4), so mid-write requests already past step 3 complete, but no new request succeeds — acceptable given writes are small, fast, single-row operations.
- **Regenerate** operates on **one specific grant** (by its row id, e.g. "regenerate Reena's link because she lost her phone") — revoke that row + insert a replacement with the same `label`, in one server-side transaction. Produces a new link + code for that person only; the old pair stops working immediately; every other grant on the same event is untouched.

### 5.6 Admin-side token mutations are also service-role-mediated

Symmetry worth calling out: `event_access_tokens` has **zero RLS policies for any client role, admin included** (§4). The admin UI (generate / revoke / extend) does not do a direct `.insert()`/`.update()` from the browser against this table. Instead:

1. The admin's own logged-in session proves `has_role('admin')` (checked server-side in the Server Action, same as any other admin mutation).
2. Once confirmed, the Server Action performs the actual write using the **service-role client**, not the admin's own RLS-governed session.

Net effect: even a fully compromised admin browser session (stolen cookie, XSS) cannot read `token_hash` or `short_code_hash` directly via PostgREST/the Supabase client, because no policy ever grants that — the only code path that touches either hash is the verification flow in §5.4 and the generation/mutation flow here, neither of which ever returns a hash to any client. Generation returns the two **raw** secrets once (§5.3 step 5); the admin UI otherwise only ever lists grants by `label` + status.

### 5.7 Why there's no DB-level uniqueness constraint tying an event to one token

Earlier drafts of this design assumed one active token per event and considered a partial unique index to close a regenerate race (two concurrent "regenerate" clicks both producing an active row). That assumption turned out to be wrong: **multiple concurrent active grants per event is the intended behavior** (§5.2), not an edge case to guard against — a 150-person event legitimately needs 2+ people, each with their own grant, active at the same time. So there's nothing to constrain at the `event_id` level.

What's still enforced: `token_hash` and `short_code_hash` each carry a table-wide `unique` constraint (§3), so no two grants — whether for the same event or different events — can ever collide on either secret. Regenerate (§5.5) now targets one specific grant row by id, so a double-click race there just risks creating two replacement rows for that one person instead of one — a UX annoyance (admin sees an extra unused grant to clean up), not a security gap.

### 5.8 Hardening notes (defense in depth, not new scope)

- **Referrer leakage**: set `Referrer-Policy: no-referrer` on the `/e/[token]` route (not "no-referrer or same-origin" — there's no reason to send a referrer at all here, so there's nothing to hedge between) so the token in the URL path never leaks to a third-party resource loaded on that page via the `Referer` header.
- **Log redaction**: server access logs should redact the token path segment (e.g. log `/e/[redacted]` not the full URL) — a log aggregator is a database too, for this purpose.
- **Rate limiting the verification path — scoped to failures, not all traffic, and stricter for the short code.** The field reality this app is built for (decision 4: patchy, sometimes-shared networks) means several genuine Management phones can share one IP at a small venue — a blanket per-IP limit on `/e/[token]` would throttle legitimate simultaneous use, which is exactly the scenario §5.2's multi-grant design exists to support. So: don't rate-limit successful, already-verified requests at all. Do apply `rateLimit()` (`template/lib/security.ts`) keyed by IP to **failed** attempts on both paths — a generous threshold on the link path (256 bits doesn't need much help), a tight one on the short-code path (e.g. 5 failed codes per IP per 15 minutes) since ~40 bits of entropy is guessable *online* without any leak at all. This is the real defense for the short code's lower entropy, replacing the per-grant lockout idea in an earlier draft, which didn't actually work once the lookup became global (§5.4) — there's no single grant to lock, so the limiter has to live on the endpoint, keyed by requester, not by grant.
- **Short-code scale assumption**: the global scrypt loop (§5.4) is only cheap because this app's real usage is small — a handful of events live at once, a handful of grants each. If that assumption ever breaks (this NGO's usage grows by an order of magnitude, or the pattern gets reused for a bigger org), the short-code path would need revisiting — e.g. a short, indexable prefix (fast hash) to narrow candidates before the slow scrypt compare on the remainder. Not needed now; flagged so it isn't forgotten if scale changes later.
- **`SECURITY DEFINER` grants**: N/A here — this design uses no `SECURITY DEFINER` SQL function for token handling (verification happens in TypeScript against a plain table via the service-role client, not in a Postgres function). This sidesteps a real class of bug seen in the sibling site referenced in §5.1, where a `SECURITY DEFINER` helper was left with Postgres's default `PUBLIC` execute grant and became callable anonymously. If a future iteration *does* move verification into a SQL function for any reason, `revoke all ... from public` is mandatory in the same migration that creates it, not a follow-up.

### 5.9 "One link, one person" — operational convention, not enforced

You raised wanting each grant usable by exactly one person. I designed multi-grant-per-event (§5.2) to solve the *capacity* problem this pointed at — 150-person events needing several simultaneous Management devices — by giving each person their own separate grant with its own label, rather than one shared grant. What I did **not** design is technical enforcement that a single grant, once opened, can only ever be used from one device (e.g. binding it to the first browser/device that opens it, rejecting a second).

**Recommendation: leave it as an operational convention** — Admin hands out one labeled grant per person, and that's what keeps them separate — rather than building device-binding. Reasoning: this app's own decision 4 is built around resilience to patchy field conditions (a phone dying mid-event, someone reinstalling the PWA, switching from a browser tab to the installed icon, clearing site data). Device-binding would mean any of those ordinary field events could lock a legitimate volunteer out of their own grant mid-event, with an Admin who's also in the field needing to notice and regenerate — trading a soft, easily-fixed convention for a hard failure mode, against a threat model the discovery brief already frames as "a small trusted team, not anti-cheat." If in practice team members do end up sharing one grant across two phones and that turns out to matter (e.g. you want to know load per device, or genuinely want to block sharing), that's a bounded follow-up — a "claimed by this device" flag with an admin override — not a schema change.

## 6. Service-role usage boundary

The service-role client (`template/lib/supabase/service-role.ts`, already marked "CROWN JEWELS," `import 'server-only'`) is used in exactly two places in this app:

1. **Management token verification + scoped attendee read/write** (§5.4) — because no `auth.uid()` exists for RLS to key off.
2. **Admin token mutations** (generate/revoke/extend, §5.6) — because `event_access_tokens` intentionally carries no client-facing policies at all.

It must never be imported into a Client Component or any code bundled to the browser (enforced at build time by the `server-only` import, per the existing template). It must never be used as a shortcut for ordinary Admin/Viewer reads of `events`/`attendees`/`staff` — those go through the user's own RLS-governed session client (`template/lib/supabase/server.ts`), same as any portal build, so RLS stays the enforced boundary everywhere it can be.

## 7. Audit logging

Per the IDP's `audit-log` pattern (`template/lib/patterns/audit-log.ts`), append-only, never updated or deleted (no `audit_log` UPDATE/DELETE policy exists for any role, §4):

**Logged** (admin-side sensitive actions — every one of these is a live admin action, so `actor_id not null` (§3) holds without exception here):
- `event_token.generated`, `event_token.revoked`, `event_token.extended`, `event_token.regenerated` — `entity: 'event_access_tokens'`, `entity_id`: the grant row's id, `meta.label`: that grant's label, `actor_id`: the admin's `auth.uid()`.
- `event.attendees_exported` (CSV download) — `entity: 'events'`, `entity_id`: the event id.

**Deliberately not logged** (per decision 3's accepted tradeoff, restated here because it's a security-doc-relevant absence, not an omission):
- Any Management-side action (mark present, register walk-in) is not attributed to an actor, because no actor identity exists to attribute it to. `attendees.created_at`/`updated_at` are the only trail.

## 8. The cross-role / cross-event denial gate

PART 7 (`playbook.md`) requires: log in as user A, try to reach user B's data, confirm it fails, before any feature ships. This app has both a cross-*user* dimension (Admin vs. Viewer) and a cross-*event* dimension (Management token A vs. event B) that PART 7's literal text doesn't anticipate — both must be proven before Phase 1's features are considered done, as an explicit acceptance gate, same as `golden-paths/portal.md` prescribes for the standard case:

```
[ ] Logged in as Viewer → attempt INSERT/UPDATE/DELETE on events/attendees/staff
    (direct API call, not just hidden UI) → must fail (RLS: viewer has select-only policies).
[ ] Logged in as Viewer or Admin → attempt to SELECT event_access_tokens (any column,
    including via the Supabase client directly, not the app) → must fail (zero policies
    on that table for any client role — see §5.6).
[ ] No session (anon) → attempt to SELECT or INSERT on events / attendees / staff /
    event_access_tokens / audit_log directly via the Supabase client → must fail
    (deny by default, no anon policy anywhere).
[ ] Valid Management token for Event A → attempt to submit an attendee write carrying
    Event B's id (tamper a hidden field / body param) → must fail; the server must use
    ONLY the server-verified event_id from the token, never a client-supplied one (§5.4).
[ ] Expired token → load /e/<token> and attempt a write → must fail with the generic
    "no longer active" message, not a crash, not a 500, not a hint about why.
[ ] Revoked token (revoke while a tab is open) → next action on that open tab → must fail.
[ ] Malformed/nonexistent token (truncated, edited one character, random string) →
    must fail the same generic way as expired/revoked (§5.4 step 4 — no oracle).
[ ] Two active grants on the same event (e.g. "Reena" and "Gate volunteer 2") →
    revoking one must NOT affect the other's ability to read/write that event's attendees.
[ ] Grant A's short code, submitted against Grant B (same event or a different one) →
    must fail — each grant's short_code_hash only matches its own row.
[ ] Short code guessed wrong repeatedly from one IP → the rate limiter (§5.8) must
    kick in and block further attempts from that IP, independent of which (if any)
    grant the guesses were aimed at.
```

This gate is non-negotiable before any Phase-1 feature that touches attendee or event data ships, per the security-first build order in `golden-paths/portal.md` and `CLAUDE.md`'s "Next up" line.

## 9. Open items

None remaining. Viewer's deny on `event_access_tokens` status and `audit_log` (§4) is confirmed, not a placeholder — if that ever needs to change, it's an additive RLS `select` policy using `has_role('viewer')`, not a schema change. "One link, one person" (§5.9) is confirmed as the operational convention, not device-binding — schema is frozen as of this doc (Safety Rail 7); the migration in Phase 1 should implement exactly what §2/§3 specify.

**Resolved this round** (was open, now decided): default expiry grace period is **event date + 24h** (§5.5) — confirmed, not a placeholder.
