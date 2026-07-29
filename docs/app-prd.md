# App PRD — Upasthiti

*Per `doc-gen-master.md`'s authenticated-app addendum: user roles, what each can see/do, and the data that must stay private. Feeds `data-model-security.md` (the schema + RLS that enforces this) and the App Build Roadmap in `CLAUDE.md`. Nothing here was invented — every capability traces to a resolved decision in [`discovery-brief.md`](discovery-brief.md); items not yet decided are flagged in [Open items](#open-items), not guessed.*

---

## 1. Purpose & scope

Upasthiti replaces Ramdootrestores' paper/Excel attendance tracking, which currently fails because it depends on one specific, unreachable person. It is an ops tool for a small NGO team, not a public-facing site. Three roles, two different access mechanisms:

- **Admin** and **Viewer** — logged-in Supabase Auth users, follow the IDP's standard portal pattern ([`golden-paths/portal.md`](golden-paths/portal.md)).
- **Management** — no login at all. A different team member every event opens an event-scoped access link on their phone. This is the one real deviation from the portal golden path (decision 3) and is specified in full in [`data-model-security.md`](data-model-security.md).

Craft tier is deliberately Essential (0/10 on the discovery scorecard, every hard override fires — see `discovery-brief.md`). Capability tier is not small: full RBAC, event lifecycle, attendee CRUD, CSV export, cross-event reporting.

## 2. Roles at a glance

| Role | Who | Device | Access mechanism | Primary job |
|---|---|---|---|---|
| **Admin** | NGO staff running events | Laptop | Supabase Auth login | Create events, generate/revoke/extend access links, view all data, export CSV, cross-event reporting |
| **Viewer** | Other staff (assumed ongoing, not per-event) | Laptop | Supabase Auth login | Read-only version of the Admin views |
| **Management** | A different team member each event | Phone, PWA, field conditions | Event-scoped access token in the URL, no login | Mark existing attendees present, register new walk-in volunteers — for one event only |

## 3. Admin

**Access:** `/login` → Supabase Auth session → RLS grants full read/write via `has_role('admin')`.

**Can do:**
- Create, edit, and view all events (`/admin`, `/admin/events/[id]`).
- Generate one or more access grants per event — each a labeled link + short fallback code, independently revocable and extendable. Multiple grants per event exist specifically so a large event (e.g. 150 people) can have 2+ Management devices working it at once, each with their own grant (`data-model-security.md` §5.2).
- View and edit every attendee row for every event (name, phone, present, remarks).
- Export a CSV of any single event's attendee list.
- View cross-event reporting: per-event counts and basic trends, for planning (`/admin/reports`).
- View the audit trail of admin-side sensitive actions (token generate/revoke/extend, CSV export) — see §7.

**Cannot do / must not see:**
- Cannot see *who on the Management side* marked a given attendee present — that identity was never captured (decision 3's accepted tradeoff). Admin sees only that an entry exists and when it was created/updated.
- Cannot see a previously generated grant's raw link or short code again after creation — only its status (label, active / expired / revoked) and expiry. The system never stores either raw secret, so there is nothing to redisplay (see `data-model-security.md` §5.3).

## 4. Viewer

**Access:** `/login` → Supabase Auth session → RLS grants read-only via `has_role('viewer')`. Confirmed as a real login (not a shared token like Management) — ongoing staff use this repeatedly, so the account is worth it, and it means access is revocable per person rather than all-or-nothing.

**Can do:**
- View the same event list, attendee lists, and cross-event reports as Admin (`/viewer`).

**Cannot do:**
- Cannot create/edit events, attendees, or access tokens.
- Cannot generate, revoke, or extend access links.
- Cannot export CSV, see grant status (active/expired/revoked), see the admin/viewer roster, or see the audit log — confirmed deny for all four, same "read the core data, nothing operational" boundary.

## 5. Management

**Access:** Opens `https://<domain>/e/<token>` — a link/QR code the Admin generated and shared for one specific event — or, as a fallback when sharing a full link isn't practical (e.g. reading it aloud over a call in a dead zone), enters the shorter access code tied to the same grant. No account, no login screen, no session. Either path is the entire authorization for that request; it is verified server-side on every load and every write (mechanics in `data-model-security.md` §5). For a large event, Admin issues one grant per person working it — each person gets their own link/code, not a shared one (§5.2, §5.9 for why that's a convention rather than a technical lock).

**Can do, for that one event only:**
- View that event's current attendee list.
- Mark an existing attendee present.
- Register a new walk-in volunteer (name, phone, remarks) and mark them present.
- Continue working through a signal drop: writes that fail outright queue locally and retry when connectivity returns, with a visible pending/synced/failed state per entry (decision 4, Safety Rail 8).

**Cannot do / must not see:**
- Cannot see, list, or infer any other event's data — not even that other events exist. The token scopes every read and write to exactly one `event_id`, enforced server-side, never trusted from client input (data-model-security.md §5, §8).
- Cannot see admin-only data: other access tokens (raw or hashed), the admin/viewer roster, cross-event reports, or the audit log.
- Has no identity captured against the entries it creates — by design (decision 3's accepted tradeoff, restated here because it also bounds what Management *cannot* later be asked to prove: there is no "who marked this" answer, for anyone).
- Loses access the moment the token expires or an Admin revokes it — mid-session, not just on next load (§8, denial gate item 4).

## 6. Data privacy matrix

*What each role can see, per data category. "—" means no access at all (not even existence).*

| Data | Admin | Viewer | Management |
|---|---|---|---|
| Event details (name, date, location) | Full | Read-only | Read-only, current event only |
| Attendee list (name, phone, present, remarks) | Full, all events | Read-only, all events | Full, current event only |
| Which Management team member marked an entry | — (never captured, any role) | — | — |
| Access grant raw secrets (link token + short code) | Shown once at creation, never again | — | Holds one (in the URL / typed in), doesn't "see" it as data |
| Access grant status (label, active/expired/revoked, expiry) | Full, all grants on all events | — (confirmed deny) | — |
| Admin/Viewer roster | Full | — (confirmed deny) | — |
| Cross-event reports | Full | Read-only | — |
| Admin-action audit log | Full | — (confirmed deny) | — |

## 7. Runtime-dependency fallbacks (Safety Rail 8)

Every feature here that depends on a live fetch needs a planned failure path, decided now rather than improvised mid-build:

| Feature | Loading | Empty | Failed |
|---|---|---|---|
| Management: load event + attendee list | Skeleton list, timeout → retry prompt | "No attendees yet — register the first one" | Calm message + retry; if a cached copy from this session exists, show it marked stale |
| Management: mark present / register walk-in | Optimistic UI — the row updates instantly, a pending indicator shows until confirmed | n/a | Entry marked "failed to sync," queued locally, auto-retries on reconnect (decision 4) |
| Admin/Viewer: event list, attendee list, reports | Skeleton, timeout → error state | "No events yet" / "No attendees yet" | Calm message + retry button, never an endless spinner |
| Admin: CSV export | Disabled button + spinner while generating | n/a | Error toast, no partial file downloaded |
| Admin: generate/revoke/extend access link | Disabled button + spinner | n/a | Error toast, state not changed until confirmed by the server |

## 8. No-List

Split per gates.md #16 — "never" (a real scope change to reverse) vs. "Phase 2+" (deferred, architected for).

**Never (v1 boundary):**
- Cross-event attendee de-duplication by phone number (decision 2) — each event's list is independent by design, matches the actual planning-counts goal.
- A per-person audit trail for Management-side actions (decision 3, accepted tradeoff) — the system deliberately does not know which team member marked which entry.
- Full offline-first architecture (decision 4) — the app assumes good connectivity is the normal case; only a bounded local retry/queue covers total signal loss, not a complete offline data layer.

**Phase 2+ (deferred, design for the seam, don't build now):**
- Admin-configurable structured per-event fields (decision 6) — e.g., a real dropdown for food preference instead of the free-text `remarks` field. V1's `remarks text` column is intentionally unstructured so this can be added later without a breaking schema change (a future `event_field_defs` + structured-values table can sit alongside `remarks`, not replace it, unless the team decides otherwise at that time).

## 9. Open items

None remaining. All four items originally carried forward from `CLAUDE.md` are resolved: org name spelling confirmed, Viewer confirmed as a real Supabase Auth login, Viewer's read boundary confirmed as deny-by-default beyond core event/attendee/report data (no grant status, no roster, no audit log, no CSV export), and "one link, one person" per grant confirmed as an operational convention rather than a device lock (`data-model-security.md` §5.9).
