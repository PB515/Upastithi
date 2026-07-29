# CLAUDE.md — Upasthiti

*The context anchor for this site. Read first every session. Keep Status and the Build Log current at the end of every phase.*

---

## What this is

A mobile-first PWA for Ramdootrestores (an NGO) replacing paper/Excel-based event attendance tracking, which currently fails because it depends on one specific, now-unreachable person. Three roles: **Management** (a different team member every event, mobile-only, no login — an event-scoped access code instead — marks existing attendees present or registers new walk-in volunteers, resilient to patchy field network), **Admin** (laptop, full control — creates events, generates/revokes access codes, downloads CSV per event, sees lightweight cross-event reporting for planning), **Viewer** (read-only, for other staff, added now to avoid a later rebuild). This is an **authenticated app with private per-role data** for Admin/Viewer, plus a genuinely different **anonymous, event-scoped access model for Management** — see decision 3 below, this is the one piece that deviates from the IDP's default portal pattern.

Full discovery process (forced questions, tier scorecard, all resolved decisions): [`docs/discovery-brief.md`](docs/discovery-brief.md).

## Current status

- **Phase:** 0 of 6 — Setup
- **Last completed:** Cloned from the Website IDP, discovery brief written and resolved (5 open questions answered), this file filled from real decisions — nothing invented.
- **Next up:** Write the App PRD and Data Model & Security doc properly before Phase 1 — the access-token auth model (decision 3) needs to be at least as carefully drawn as a real login would be, and that deserves its own doc, not just this summary. Then Phase 1 per the portal golden path: auth → RLS → **prove cross-role denial** → features.
- **Last commit:** — (not yet committed)
- **Resume note:** Nothing built yet. This was a from-scratch discovery (no client-supplied docs) — the full reasoning trail is in `docs/discovery-brief.md`, don't re-derive it from this summary alone.

## Stack

Next.js App Router · Tailwind v4 + tokens · Supabase (4-client split + RLS, for Admin/Viewer only — Management uses a separate token-based access path, see decision 3) · Vercel. PWA scaffold already present in the template (`app/manifest.ts`, `public/sw.js`, `lib/pwa/register-sw.tsx`) — the Management side genuinely needs it (installable on the field team's phones).

## Conventions

Tokens only — no hardcoded hex · secrets in `.env.local` only · no new/upgraded deps without asking · git per phase, branch per phase · changing a frozen doc is a separate logged step. Full list: `docs/conventions.md`.

## Decisions made (do not revisit)

*From the discovery brief's "Resolved decisions" — nothing here was invented; everything traces to an explicit answer. See `docs/discovery-brief.md` for the full reasoning.*

1. **Craft tier = Essential, deliberately.** Discovery scorecard: 0/10, every hard override fires (task-critical flow, low-end/patchy-network audience, content-they-came-to-do). `reveal` + `smooth-scroll` only — no cinematic elements. This is a task-critical field tool; speed and reliability matter far more than polish. Capability tier is NOT small (full RBAC, event management, CRUD, CSV, reporting) — same pattern as the IDP's Inspire Academy precedent.
2. **Independent per-event attendee lists — no cross-event dedup by phone.** Matches the actual goal (per-event counts for planning), not individual attendance history. Simpler schema on purpose.
3. **★ Management access = event-scoped token, not a login.** Admin generates a random, unguessable, expiring (tied to event date, admin-extendable) per-event link/code. Whoever has it can mark attendance / register volunteers for *that event only* — verified server-side against the `events` table, writes scoped narrowly (RLS or service-role-mediated), never broader. **Known, accepted tradeoff:** no per-person audit trail on the Management side — only that an entry was marked via that event's link, not by whom. This deviates from the IDP's default portal pattern (`docs/golden-paths/portal.md` assumes every role is a logged-in Supabase Auth user) — Admin and Viewer still follow that pattern; Management does not. Design this boundary with the same care as a real login, not less.
4. **Network: build for good connectivity, add a bounded fallback for zero signal.** Not full offline-first. Optimistic UI + a local retry/queue for writes that fail outright; clear pending/synced/failed state per entry. Per Safety Rail 8 (every runtime-dependent feature needs a planned failure path).
5. **Three roles, decided now to avoid a later rebuild:** Admin (laptop, full control), Management (mobile, token access, no login), Viewer (read-only; assumed real login since it's ongoing staff, not rotating per-event — flag if wrong, this one assumption wasn't explicitly confirmed).
6. **V1 data = name, phone, present, remarks (free text).** Admin-configurable structured per-event fields (e.g. a real dropdown for food preference) is explicitly **Phase 2**, agreed as out of scope for V1 — it's a small form-builder, meaningfully more engineering than the rest of this build.

## Where things live

- Discovery process + full reasoning → `docs/discovery-brief.md`
- Golden path (mostly applies — see decision 3 for where it doesn't) → `docs/golden-paths/portal.md`
- Tokens → `template/app/globals.css`
- Brand/contact constants → `template/lib/site.ts`
- Schema + migrations → `template/db/migrations/`
- PWA → `template/app/manifest.ts`, `template/public/sw.js`, `template/lib/pwa/register-sw.tsx`
- App PRD + Data Model & Security (not yet written — next up) → `docs/`

## Known open items

- **Org name spelling** — going with "Ramdootrestores" as given; not yet double-confirmed. Fix before it lands in `lib/site.ts`.
- **Viewer role's access mechanism** (real login, assumed) wasn't explicitly confirmed — only that a 3rd role should exist.
- **The event-token security design (decision 3) is not yet fully specified** — token format, exact RLS/service-role boundary, and expiry mechanics need to be nailed down in the Data Model & Security doc before Phase 1 starts, not improvised during the build.

---

## Build log

*Newest last. One entry per phase: what was built, what was verified, any deviation. Before closing out a phase, also run `/cost` and log a row in the IDP's `docs/metrics/token-usage.md`.*

### Phase 0 — Setup
- Cloned from the Website IDP (`github.com/PB515/IDP`) into its own folder, git history to be started fresh.
- Ran the `discovery` skill end-to-end from a raw, verbal idea (no client-supplied docs) — forced questions, tier scorecard, 5 open questions asked and resolved, architecture note on the token-auth deviation. Full trail in `docs/discovery-brief.md`.
- Filled this file's Decisions section directly from the resolved discovery answers — nothing invented.
- Not yet done: App PRD, Data Model & Security doc, `npm run setup`, `db:start`/`migrate:up`, tokens, or any code.
