# RouteForge — Project Memory

> This file is the single source of truth for all LLMs working on this project.
> Update it whenever architecture, decisions, or conventions change.
> Address content to ALL LLMs (not just the current session).

---

## Universal Rules (enforce in every session)

1. **Supabase scripts** — Every new SQL script must follow the standard header format (see `supabase/scripts/` for examples) documenting: PURPOSE, WHEN TO RUN, DEPENDS ON, and any notable design decisions. After adding a script, update `supabase/master.sql` to include it at the correct position and update the script index in `master.sql` and in this file.

2. **Master script** — `supabase/master.sql` is the single entry point for a full DB setup. It must always be in sync with the individual scripts in `supabase/scripts/`. Never add a script without updating master.

---

## Supabase Scripts

All SQL files live directly in `supabase/` — no subdirectories.

| File | Purpose | When to run |
|---|---|---|
| `master.sql` | Full idempotent schema — clean project start | Fresh DB only |
| `run1.sql` | Storage bucket + storage RLS | Existing DB missing storage setup |
| `run2.sql` | `route_notes` on stops · trip_members RLS recursion fix · `routes` table + RLS · `route_id` FK on stops | Existing DB after run1 |
| `run3.sql` | `map_notes` table + RLS (sticky notes per route, with lat/lng/color/content) | Existing DB after run2 |
| `run4.sql` | Fuel metadata columns on `costs` table (`fuel_liters`, `fuel_price_per_unit`, `fuel_unit`, `fuel_type`, `odometer`) | Existing DB after run3 |
| `run5.sql` | `trip_invite_links` table — shareable viewer links with 1-member-slot constraint | Existing DB after run4 |

**Naming convention:** `run1.sql`, `run2.sql`, ..., `runN.sql` — sequential integers, no descriptive suffix, directly in `supabase/`.  
**`master.sql` contract:** Always contains the complete cumulative schema. Every `runN.sql` addition must also be appended to `master.sql`.  
**Adding a future change:** Create `supabase/run(N+1).sql` → append same SQL to `master.sql` → add row to this table.

> `supabase/scripts/` and `supabase/schema.sql` are DEPRECATED — delete them with `git rm -r supabase/scripts/ supabase/schema.sql`.

---

## Project Overview

**App name:** RouteForge  
**Purpose:** Multi-stop itinerary planner with unlimited stops — replacing Google Maps route creation for road trips. Features fuel tracking, cost splitting, per-stop notes/attachments, and team collaboration.  
**Status:** Phase 1 complete — full working app scaffold.

---

## Tech Stack

| Layer | Choice | Reason |
|---|---|---|
| Framework | Next.js 16.2.9 (App Router) | Vercel-native, SSR, file routing |
| Language | TypeScript | Required |
| Styling | Tailwind CSS v4 | Utility-first, no config file needed |
| Maps | Leaflet + OpenStreetMap | Free, no API key |
| Geocoding | Nominatim (OSM) | Free, no key — rate limit 1 req/s |
| Routing | OSRM public server | Free driving routes |
| Database | Supabase (Postgres) | Auth + DB + Storage + RLS |
| Auth | Supabase Auth | Email/password + magic link |
| File storage | Supabase Storage (bucket: `attachments`) | Stop file attachments |
| DnD | @dnd-kit | Stop reordering |
| Date utils | date-fns | Formatting |

---

## Architecture

```
src/
├── app/
│   ├── layout.tsx             Root layout (fonts, global CSS)
│   ├── page.tsx               Redirects → /dashboard
│   ├── login/page.tsx         Auth: password + magic link
│   ├── register/page.tsx      Auth: signup + email verification
│   ├── auth/callback/route.ts OAuth/magic link exchange
│   ├── dashboard/
│   │   ├── layout.tsx         Nav header, session check
│   │   └── page.tsx           Trip grid
│   ├── trips/[tripId]/
│   │   └── page.tsx           Trip detail (server, fetches data)
│   ├── api/invite/route.ts    Invite member by email (service role)
│   ├── api/invite-link/route.ts          POST: generate viewer link
│   ├── api/invite-link/[id]/route.ts     PATCH/DELETE: update label / revoke link
│   ├── api/join/[token]/route.ts         GET: validate token (public)
│   ├── api/join/[token]/claim/route.ts   POST: claim member slot (authenticated)
│   └── api/join/[token]/trip-data/route.ts  GET: fetch route+stops for viewer (public, token-gated)
├── app/
│   ├── join/[token]/page.tsx  Landing page: visitor vs sign-up choice
│   └── viewer/[token]/page.tsx  Anonymous read-only route view (no auth)
├── components/
│   ├── TripClient.tsx         Tab shell (Route/Costs/Members) — Fuel tab removed
│   ├── CreateTripButton.tsx   Modal to create trip
│   ├── SignOutButton.tsx      Client sign-out
│   ├── FuelTab.tsx            DEPRECATED — not imported, fuel now in CostsTab under Category=Fuel
│   ├── CostsTab.tsx           Expense + split CRUD (incl. fuel sub-form when category=fuel)
│   ├── MembersTab.tsx         Member management + viewer link generator/manager
│   ├── map/RouteMap.tsx       Leaflet map (dynamic import, no SSR)
│   └── stops/
│       ├── StopsTab.tsx       Route tabs + stop list + map
│       ├── StopPanel.tsx      Per-stop notes + attachments
│       ├── RouteSegmentPanel.tsx  Leg notes (stop N → N+1)
│       └── CopyRouteModal.tsx Copy route to same or another trip
├── lib/
│   ├── nominatim.ts           Geocode + reverse geocode + OSRM route
│   └── supabase/
│       ├── client.ts          Browser client
│       ├── server.ts          Server component client
│       └── middleware.ts      Session refresh + auth redirect (public paths include /join/, /viewer/, /api/join/)
├── middleware.ts              Route protection
└── types/database.ts         All DB types + convenience aliases
supabase/
├── master.sql                 Full schema — use for fresh DB setup
├── run1.sql                   Storage bucket — run on existing DB if not yet applied
├── run2.sql                   Routes table + stops.route_notes/route_id — run after run1
├── run3.sql                   map_notes table (sticky notes on map) — run after run2
├── run4.sql                   fuel metadata columns on costs table — run after run3
└── run5.sql                   trip_invite_links table — run after run4
```

---

## Database Schema

| Table | Key columns |
|---|---|
| `profiles` | id (FK auth.users), display_name, avatar_url |
| `trips` | id, title, description, owner_id |
| `trip_members` | trip_id, user_id, role (owner/editor/viewer) |
| `routes` | trip_id, name, created_by (→ profiles), order_index |
| `stops` | trip_id, route_id (→ routes), order_index, name, address, lat, lng, notes, route_notes |
| `map_notes` | route_id, trip_id, lat, lng, content, color (yellow/green/red/blue), created_by |
| `stop_attachments` | stop_id, file_name, file_url, storage_path, label |
| `fuel_logs` | **DEPRECATED for new entries** — legacy table, not used by current UI |
| `costs` | trip_id, stop_id?, category, amount, currency, paid_by, fuel_liters?, fuel_price_per_unit?, fuel_unit?, fuel_type?, odometer? |
| `cost_splits` | cost_id, user_id, share_amount, settled |
| `trip_invite_links` | id, trip_id, token (32-byte hex unique), label, created_by, created_at, expires_at (nullable), member_claimed_by (nullable), member_claimed_at, role ('viewer') |

**RLS:** All tables protected. `my_trip_role(trip_id)` helper function used in policies.
**`trip_invite_links` RLS:** Owner can INSERT/SELECT/UPDATE/DELETE their trip's links. Token validation always done server-side with service role (anon cannot read the table).

---

## Role Hierarchy (per trip)

| Role | Permissions |
|---|---|
| `owner` | Full control: delete trip, manage all members, all edits |
| `editor` | Add/edit/delete stops, fuel logs, costs, attachments |
| `viewer` | Read-only across all tabs |

---

## Known Issues / Fixed Bugs

- **Next.js version**: Originally set to 15.3.3 (had CVE-2025-66478). Updated to 16.2.9 which fixes both the CVE and aligns with the eslint-config-next version (both must match).
- **ESLint config**: `create-next-app@16.x` generates a flat config using `defineConfig` and named imports from `eslint-config-next`. Imports must use `.js` extension (`core-web-vitals.js`, `typescript.js`) for Node ESM resolution — omitting `.js` causes a build failure on Vercel.
- **`dashboard/layout.tsx` profile query cast**: Supabase `@supabase/ssr` server client without generated types causes `.from('profiles')` to resolve to `never`. Fixed by adding an explicit `as { data: { display_name: string | null; avatar_url: string | null } | null; error: unknown }` cast directly on the `.single()` call. This is a stopgap — generating `database.ts` via Supabase CLI eliminates all such casts.
- **Supabase `.from()` inferring `never` — two distinct causes**:
  1. **`database.ts` type bug (affects `@supabase/ssr` clients)**: `Views: Record<string, never>` made every string a valid view name (`keyof Record<string, never>` = `string`). Supabase's `.from()` has overloads for Tables and Views — with Views matching every string and returning `never`, all `.from()` calls collapsed to `never`. **Fix**: use `{ [_ in never]: never }` for empty Views/Enums. Applied in `database.ts`. Never use `Record<string, never>` for empty Supabase schema sections.
  2. **Admin client generic loss (affects `@supabase/supabase-js` direct `createClient`)**: `createAdminClient<Database>()` called directly (not through `@supabase/ssr`) loses its generic in Next.js 16 strict TS. `as SupabaseClient<Database>` cast does not propagate through the query builder chain either. **Fix**: cast the client `as any`, then manually type-assert individual query results where needed. Applied in `api/invite/route.ts`. This is scoped to a single small file; runtime is unaffected.

---

## Key Decisions

- **Leaflet over Google Maps** — free, no billing, no key required. Nominatim for geocoding (OSM policy: max 1 req/s, must set User-Agent).
- **OSRM public server** — free for low volume. For production use, self-host OSRM or switch to a paid routing API.
- **Supabase Storage bucket `attachments`** — must be created manually in Supabase dashboard or via SQL (see schema.sql comment).
- **Invite flow** — uses service role key server-side to look up users by email. Target user must already have an account. Consider adding email-based invitation (send magic link) in Phase 2.
- **Fuel logging** — moved from dedicated `FuelTab` into `CostsTab` under Category=Fuel. Fuel sub-form appears inline when category=fuel. Supports all 3 combinations: liters+price→total, total+price→liters, total+liters→price. Units: L/gal/kWh with adaptive price label. Data stored as `fuel_*` columns on `costs` table (added in run4.sql). `fuel_logs` table is legacy/unused by current UI.
- **Cost splits** — equal or custom. Per-split settled toggle. Balance summary (who owes who).
- **No SSR for Leaflet** — `dynamic(() => import(...), { ssr: false })` used to avoid window-not-defined errors.
- **Sticky notes draggable** — `RouteMap` accepts `canEditNotes` and `onNoteMove` props. When `canEditNotes=true`, note markers are `draggable: true` and fire `dragend` → `onNoteMove(id, lat, lng)` → Supabase update. Auto-saves on drop. Uses stable `useRef` pattern to avoid stale callback captures.
- **Viewer invite links** — `trip_invite_links` table stores shareable tokens. Key design decisions:
  - Unlimited anonymous viewers per link (no consumption on view). Link remains valid until `expires_at` or revoked.
  - **One member slot per link**: `member_claimed_by` is set once. Subsequent signups via the same link can still view anonymously but are NOT added to `trip_members`.
  - Token = 32-byte hex via `gen_random_bytes(32)`. Token is the access credential for `/viewer/[token]` and `/join/[token]`.
  - Viewer page (`/viewer/[token]`) is fully public (no auth). It fetches routes/stops via service role using the token, stripping `notes` and `route_notes` fields. Map notes (sticky notes) ARE visible.
  - Signup flow: `/register?joinToken=xxx` → `emailRedirectTo` includes `joinToken` → callback at `/auth/callback?joinToken=xxx` → inline claim logic runs immediately after email verification → redirect to trip.
  - Authenticated users visiting `/join/[token]` see a "Join as viewer" button backed by a Server Action (inline claim, no HTTP call to self).
  - Public paths that bypass auth middleware: `/join/`, `/viewer/`, `/api/join/`.

---

## Phase 2 Ideas (not yet built)

- Email invitation with magic link for users not yet registered
- OSRM route polyline drawn on map (currently dashed straight line)
- Trip duplication
- Export to PDF / GPX
- Google Maps / Mapbox swap toggle
- Mobile-responsive layout refinements
- Offline support (PWA)
- Multi-currency exchange rates

---

## Environment Variables

See `.env.example` for all required vars and setup instructions.

Required:
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_APP_URL`

---

## Conventions

- All components that use hooks or browser APIs are `'use client'`
- Server components fetch data directly via `createClient()` from `lib/supabase/server.ts`
- Database mutations from client components use `createClient()` from `lib/supabase/client.ts`
- Types live in `src/types/database.ts` — update manually when schema changes, or regenerate with Supabase CLI
- Tailwind v4 — no `tailwind.config.js` needed; uses CSS-based config
