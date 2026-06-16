# RouteForge — Project Memory

> This file is the single source of truth for all LLMs working on this project.
> Update it whenever architecture, decisions, or conventions change.
> Address content to ALL LLMs (not just the current session).

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
│   └── api/invite/route.ts    Invite member (service role)
├── components/
│   ├── TripClient.tsx         Tab shell (Route/Fuel/Costs/Members)
│   ├── CreateTripButton.tsx   Modal to create trip
│   ├── SignOutButton.tsx      Client sign-out
│   ├── FuelTab.tsx            Fuel log CRUD
│   ├── CostsTab.tsx           Expense + split CRUD
│   ├── MembersTab.tsx         Member management
│   ├── map/RouteMap.tsx       Leaflet map (dynamic import, no SSR)
│   └── stops/
│       ├── StopsTab.tsx       Stop list + map + search
│       └── StopPanel.tsx      Per-stop notes + attachments
├── lib/
│   ├── nominatim.ts           Geocode + reverse geocode + OSRM route
│   └── supabase/
│       ├── client.ts          Browser client
│       ├── server.ts          Server component client
│       └── middleware.ts      Session refresh + auth redirect
├── middleware.ts              Route protection
└── types/database.ts         All DB types + convenience aliases
supabase/
└── schema.sql                 Full schema + RLS (run in Supabase SQL Editor)
```

---

## Database Schema

| Table | Key columns |
|---|---|
| `profiles` | id (FK auth.users), display_name, avatar_url |
| `trips` | id, title, description, owner_id |
| `trip_members` | trip_id, user_id, role (owner/editor/viewer) |
| `stops` | trip_id, order_index, name, address, lat, lng, notes |
| `stop_attachments` | stop_id, file_name, file_url, storage_path, label |
| `fuel_logs` | trip_id, stop_id?, fuel_type, amount, unit, cost, currency, odometer |
| `costs` | trip_id, stop_id?, category, amount, currency, paid_by |
| `cost_splits` | cost_id, user_id, share_amount, settled |

**RLS:** All tables protected. `my_trip_role(trip_id)` helper function used in policies.

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
- **Invite route TypeScript**: `@supabase/ssr`'s `createServerClient` loses its `Database` generic in API routes under certain cookie configurations, causing queries to type `data` as `never`. Fixed by using the admin client for all DB operations in the invite route and casting with `as { role: TripRole } | null`.

---

## Key Decisions

- **Leaflet over Google Maps** — free, no billing, no key required. Nominatim for geocoding (OSM policy: max 1 req/s, must set User-Agent).
- **OSRM public server** — free for low volume. For production use, self-host OSRM or switch to a paid routing API.
- **Supabase Storage bucket `attachments`** — must be created manually in Supabase dashboard or via SQL (see schema.sql comment).
- **Invite flow** — uses service role key server-side to look up users by email. Target user must already have an account. Consider adding email-based invitation (send magic link) in Phase 2.
- **Fuel log** — supports gasoline/diesel/lpg/electric/other, multiple units (L/gal/kWh), optional odometer, optional linked stop.
- **Cost splits** — equal or custom. Per-split settled toggle. Balance summary (who owes who).
- **No SSR for Leaflet** — `dynamic(() => import(...), { ssr: false })` used to avoid window-not-defined errors.

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
