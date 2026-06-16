-- =============================================================================
-- RUN 2 — route_notes on stops + trip_members RLS fix + routes table
-- =============================================================================
-- PURPOSE:
--   1. Add route_notes column to stops (leg-level notes from stop N to N+1)
--   2. Fix trip_members SELECT policy (was self-referential → infinite recursion)
--   3. Create routes table (named route segments within a trip)
--   4. Add route_id FK to stops
--
-- WHEN TO RUN:
--   On any existing DB that has run master.sql or run1.sql but not these changes.
--   Safe to re-run (IF NOT EXISTS / DROP POLICY IF EXISTS guards throughout).
--
-- DEPENDS ON:
--   Base schema (trips, stops, trip_members, profiles tables)
--   my_trip_role() SECURITY DEFINER function
-- =============================================================================

-- 1. STOPS: add route_notes (notes for the leg FROM this stop to the next) ----
ALTER TABLE public.stops
  ADD COLUMN IF NOT EXISTS route_notes TEXT;

-- 2. TRIP_MEMBERS: fix infinite-recursion SELECT policy -----------------------
--    Old policy used EXISTS (SELECT FROM trip_members ...) — self-referential.
--    New policy delegates to my_trip_role() which is SECURITY DEFINER.
DROP POLICY IF EXISTS "Members can read trip_members" ON public.trip_members;
CREATE POLICY "Members can read trip_members"
  ON public.trip_members FOR SELECT TO authenticated
  USING (public.my_trip_role(trip_id) IS NOT NULL);

-- 3. ROUTES table -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.routes (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id     UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  name        TEXT NOT NULL DEFAULT 'Route',
  created_by  UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  order_index INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_routes_trip ON public.routes(trip_id);

ALTER TABLE public.routes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read routes" ON public.routes;
CREATE POLICY "Members can read routes"
  ON public.routes FOR SELECT TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor', 'viewer'));

DROP POLICY IF EXISTS "Editors+ can insert routes" ON public.routes;
CREATE POLICY "Editors+ can insert routes"
  ON public.routes FOR INSERT TO authenticated
  WITH CHECK (public.my_trip_role(trip_id) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "Editors+ can update routes" ON public.routes;
CREATE POLICY "Editors+ can update routes"
  ON public.routes FOR UPDATE TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "Editors+ can delete routes" ON public.routes;
CREATE POLICY "Editors+ can delete routes"
  ON public.routes FOR DELETE TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor'));

-- 4. STOPS: add route_id FK ---------------------------------------------------
ALTER TABLE public.stops
  ADD COLUMN IF NOT EXISTS route_id UUID REFERENCES public.routes(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_stops_route ON public.stops(route_id);
