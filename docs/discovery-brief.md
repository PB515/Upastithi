# Discovery Brief — Upasthiti

*Produced by the IDP's `discovery` skill, 2026-07. Feeds `doc-gen-master` (or straight to build, given the modest scope — see "Next step" at the end).*

## Raw input (verbatim, lightly reformatted)

> NGO facing a problem of attendance tracking and other tracking stuff. Currently using Excel and a physical notebook. The person who's been tracking attendance isn't answering calls or responding — single point of failure. As an NGO, we don't know most attendees personally; we meet people randomly at events. Idea: a PWA with an admin side and a management-team side. Management team can add attendees and mark them present. Admin can see all lists by event and download a CSV.

## Forced early questions — answers

| Question | Answer |
|---|---|
| Audience → device → network | Management: a different team member every event, opens on their own phone. Admin: laptop, no install needed. |
| The one action | Management: mark present, or register a brand-new walk-in volunteer on the spot. |
| Existing data | None. Currently just name + number written down + "present" noted by hand. |
| Real goal vs. the ask | Stop depending on one unreachable person. Also want per-event counts to inform future event planning. |
| Constraints | 1-2 people take attendance per event. English only. Small team, no dedicated IT staff. |

## Tier scorecard

| Signal | Score | Why |
|---|---|---|
| Budget / timeline | 0 | tight, small team |
| Brand sells on | 0 | pure utility, not identity |
| "Wow" matters to the goal | 0 | no — this is an ops tool |
| Audience devices | 0 | low-end/patchy-network mobile in the field |
| Content vs. experience | 0 | the task (mark attendance) *is* the content |

**Total: 0/10 → Essential craft tier.** Every hard override fires too: task-critical flow, low-end/patchy audience, content-they-came-to-do. This is a deliberate call, not a shortfall — `reveal` + `smooth-scroll` only, no cinematic elements. Speed and reliability matter far more than polish here.

**Capability tier is a separate axis and is NOT small**: full RBAC, event management, attendance CRUD, CSV export, and lightweight reporting. Same pattern as the IDP's own Inspire Academy precedent — capability-heavy, craft-restrained.

## Resolved decisions

1. **Access model — event-scoped codes, not accounts, for Management.** Admin creates an event and generates an access link/code scoped to that one event; whoever has it can mark attendance / register volunteers for that event only. No login for Management.
   **Known tradeoff, accepted:** there's no way to know *which* management-team member marked a given entry — only that it was marked via that event's link. Acceptable given the whole point is people rotate freely and shouldn't need onboarding.
2. **Independent per-event lists.** No cross-event person-matching / dedup by phone. Simpler schema; matches the actual goal (per-event counts for planning), not individual attendance history.
3. **Network: good-or-zero, no middle ground.** Build the primary flow assuming a normal connection; add a local retry/queue as a fallback for total signal loss. Not a full offline-first rebuild — a bounded fallback per Safety Rail 8 (every runtime-dependent feature needs a planned failure path).
4. **Three roles, decided now to avoid a later rebuild:** Admin (laptop, full control — create events, generate/revoke access codes, view all events, CSV export, manage Viewer accounts), Management (mobile, event-code access, no login), Viewer (read-only, for other staff — assumed to use a real login since it's ongoing staff, not rotating per-event; flag if wrong).
5. **Data fields — V1 vs. Phase 2.** V1: name, phone, present (bool), remarks (free text — covers "food: Jain" etc. well enough for now). Phase 2 (deferred, agreed): admin-configurable structured per-event fields (e.g. a real dropdown for food preference: Jain / Swaminarayan / Regular). This is a small form-builder, meaningfully more engineering than the rest of V1, so it's explicitly out of scope for the first build.

## Architecture note — a real deviation from the IDP's default auth pattern

The IDP's portal golden path (`docs/golden-paths/portal.md`) assumes every role is a logged-in Supabase Auth user with `has_role()` RLS. That still holds for **Admin** and **Viewer**. **Management does not fit that pattern** — it's anonymous, event-token-scoped access, not a session. This needs its own careful design before Phase 1 starts:
- A random, unguessable per-event token (not sequential, not derivable from the event id).
- Server-side verification against the `events` table, RLS or service-role-mediated writes scoped to *only* that event's rows — never broader.
- Sensible expiry (tied to the event date, admin-extendable) so a stale link doesn't stay live forever.
- This is conceptually similar to the QR-token pattern already used elsewhere in IDP-built sites (event-scoped, time-bounded), just simpler — a shared link/code instead of a rotating QR, since the threat model here is a small trusted team, not anti-cheat.

## Site map (all Essential tier)

| Route | Role | Notes |
|---|---|---|
| `/e/<event-token>` | Management (no login) | Mark present / register new volunteer. Mobile PWA, installable, optimistic UI + local retry queue for zero-signal moments. |
| `/admin` | Admin | Event list, create event, generate/revoke access codes. |
| `/admin/events/[id]` | Admin | Attendee list, remarks, CSV export. |
| `/admin/reports` | Admin | Per-event counts, basic trends across events (for planning). |
| `/viewer` | Viewer | Read-only version of the admin views. |
| `/login` | Admin, Viewer | Standard Supabase Auth. |

## Perf budget

Dominant constraint is the Management mobile path: field use, sometimes zero signal. LCP fast even on a poor connection; the mark-present/register actions must respond instantly via optimistic UI, not wait on a round-trip; a visible pending/synced/failed state per entry; local queue + retry when signal returns. Admin/Viewer on laptop have normal web perf headroom.

## Tightened brief (feeds the build)

An NGO ops PWA replacing paper/Excel attendance tracking, which currently fails because it depends on one specific, now-unreachable person. Three roles: **Management** (rotates every event, mobile-only, event-scoped access code instead of a login, marks existing attendees present or registers new walk-in volunteers, resilient to patchy field network via optimistic UI + local retry queue), **Admin** (laptop, full control, creates events, generates/revokes access codes, downloads CSV per event, sees lightweight cross-event reporting for planning), **Viewer** (read-only, for other staff, added now to avoid a later rebuild). Deliberately Essential craft tier throughout — scorecard lands at 0/10 and every hard override confirms it — but capability-heavy (RBAC, event management, CRUD, CSV, reporting), matching the IDP's Inspire Academy precedent. Security-first build order applies: auth → RLS → prove cross-role denial → features, with the added wrinkle that Management's "auth" is a scoped, expiring access token, not a session — that boundary needs to be at least as carefully drawn as a real login would be. V1 data: name, phone, present, remarks (free text). Explicitly deferred: admin-configurable structured per-event fields (Phase 2).

## Next step

Given the modest, well-bounded scope, going straight to build (skipping the full 11-doc `doc-gen-master` treatment) is reasonable — but the **App PRD** and **Data Model & Security** docs are genuinely load-bearing here given the access-token auth wrinkle, and worth writing properly before Phase 1 starts.
