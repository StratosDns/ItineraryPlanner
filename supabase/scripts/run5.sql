-- =============================================================================
-- SCRIPT: 04_rls.sql
-- PURPOSE: Enable Row Level Security and define all access policies.
-- WHEN TO RUN: After 03_functions_triggers.sql. Safe to re-run (DROP IF EXISTS
--              before each CREATE POLICY).
-- DEPENDS ON: 01_tables.sql, 03_functions_triggers.sql (my_trip_role)
--
-- POLICY SUMMARY:
--   profiles         → any authenticated user can read; owner can update own
--   trips            → members can read; owner can update/delete
--   trip_members     → members can read their trip's roster; owner manages
--   stops            → members read; editors+ write
--   stop_attachments → members read; editors+ write
--   fuel_logs        → members read; editors+ write
--   costs            → members read; editors+ write
--   cost_splits      → members read; editors+ write; member can settle own
-- =============================================================================

-- Enable RLS on all tables
ALTER TABLE public.trips            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stops            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stop_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.costs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_splits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;

-- PROFILES -------------------------------------------------------------------
DROP POLICY IF EXISTS "profiles: any member can read" ON public.profiles;
CREATE POLICY "profiles: any member can read"
  ON public.profiles FOR SELECT TO authenticated
  USING (true);

DROP POLICY IF EXISTS "profiles: owner can update own" ON public.profiles;
CREATE POLICY "profiles: owner can update own"
  ON public.profiles FOR UPDATE TO authenticated
  USING (auth.uid() = id);

-- TRIPS ----------------------------------------------------------------------
DROP POLICY IF EXISTS "trips: members can read" ON public.trips;
CREATE POLICY "trips: members can read"
  ON public.trips FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_members
      WHERE trip_id = trips.id AND user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "trips: authenticated users can create" ON public.trips;
CREATE POLICY "trips: authenticated users can create"
  ON public.trips FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "trips: owner can update" ON public.trips;
CREATE POLICY "trips: owner can update"
  ON public.trips FOR UPDATE TO authenticated
  USING (public.my_trip_role(id) = 'owner');

DROP POLICY IF EXISTS "trips: owner can delete" ON public.trips;
CREATE POLICY "trips: owner can delete"
  ON public.trips FOR DELETE TO authenticated
  USING (public.my_trip_role(id) = 'owner');

-- TRIP MEMBERS ---------------------------------------------------------------
DROP POLICY IF EXISTS "trip_members: members can read roster" ON public.trip_members;
CREATE POLICY "trip_members: members can read roster"
  ON public.trip_members FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.trip_members tm
      WHERE tm.trip_id = trip_members.trip_id AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "trip_members: owner can insert" ON public.trip_members;
CREATE POLICY "trip_members: owner can insert"
  ON public.trip_members FOR INSERT TO authenticated
  WITH CHECK (
    public.my_trip_role(trip_id) = 'owner'
    -- allow self-insert as owner at trip creation time (before member row exists)
    OR (auth.uid() = user_id AND role = 'owner')
  );

DROP POLICY IF EXISTS "trip_members: owner can update roles" ON public.trip_members;
CREATE POLICY "trip_members: owner can update roles"
  ON public.trip_members FOR UPDATE TO authenticated
  USING (public.my_trip_role(trip_id) = 'owner');

DROP POLICY IF EXISTS "trip_members: owner or self can delete" ON public.trip_members;
CREATE POLICY "trip_members: owner or self can delete"
  ON public.trip_members FOR DELETE TO authenticated
  USING (
    public.my_trip_role(trip_id) = 'owner'
    OR user_id = auth.uid()  -- members can remove themselves
  );

-- STOPS ----------------------------------------------------------------------
DROP POLICY IF EXISTS "stops: members can read" ON public.stops;
CREATE POLICY "stops: members can read"
  ON public.stops FOR SELECT TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor', 'viewer'));

DROP POLICY IF EXISTS "stops: editors+ can insert" ON public.stops;
CREATE POLICY "stops: editors+ can insert"
  ON public.stops FOR INSERT TO authenticated
  WITH CHECK (public.my_trip_role(trip_id) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "stops: editors+ can update" ON public.stops;
CREATE POLICY "stops: editors+ can update"
  ON public.stops FOR UPDATE TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "stops: editors+ can delete" ON public.stops;
CREATE POLICY "stops: editors+ can delete"
  ON public.stops FOR DELETE TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor'));

-- STOP ATTACHMENTS -----------------------------------------------------------
DROP POLICY IF EXISTS "stop_attachments: members can read" ON public.stop_attachments;
CREATE POLICY "stop_attachments: members can read"
  ON public.stop_attachments FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stops s
      JOIN public.trip_members tm ON tm.trip_id = s.trip_id
      WHERE s.id = stop_attachments.stop_id AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "stop_attachments: editors+ can insert" ON public.stop_attachments;
CREATE POLICY "stop_attachments: editors+ can insert"
  ON public.stop_attachments FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stops s
      WHERE s.id = stop_id
        AND public.my_trip_role(s.trip_id) IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "stop_attachments: editors+ can delete" ON public.stop_attachments;
CREATE POLICY "stop_attachments: editors+ can delete"
  ON public.stop_attachments FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stops s
      WHERE s.id = stop_id
        AND public.my_trip_role(s.trip_id) IN ('owner', 'editor')
    )
  );

-- FUEL LOGS ------------------------------------------------------------------
DROP POLICY IF EXISTS "fuel_logs: members can read" ON public.fuel_logs;
CREATE POLICY "fuel_logs: members can read"
  ON public.fuel_logs FOR SELECT TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor', 'viewer'));

DROP POLICY IF EXISTS "fuel_logs: editors+ can manage" ON public.fuel_logs;
CREATE POLICY "fuel_logs: editors+ can manage"
  ON public.fuel_logs FOR ALL TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor'))
  WITH CHECK (public.my_trip_role(trip_id) IN ('owner', 'editor'));

-- COSTS ----------------------------------------------------------------------
DROP POLICY IF EXISTS "costs: members can read" ON public.costs;
CREATE POLICY "costs: members can read"
  ON public.costs FOR SELECT TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor', 'viewer'));

DROP POLICY IF EXISTS "costs: editors+ can manage" ON public.costs;
CREATE POLICY "costs: editors+ can manage"
  ON public.costs FOR ALL TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor'))
  WITH CHECK (public.my_trip_role(trip_id) IN ('owner', 'editor'));

-- COST SPLITS ----------------------------------------------------------------
DROP POLICY IF EXISTS "cost_splits: members can read" ON public.cost_splits;
CREATE POLICY "cost_splits: members can read"
  ON public.cost_splits FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.costs c
      WHERE c.id = cost_splits.cost_id
        AND public.my_trip_role(c.trip_id) IN ('owner', 'editor', 'viewer')
    )
  );

DROP POLICY IF EXISTS "cost_splits: editors+ can manage" ON public.cost_splits;
CREATE POLICY "cost_splits: editors+ can manage"
  ON public.cost_splits FOR ALL TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.costs c
      WHERE c.id = cost_splits.cost_id
        AND public.my_trip_role(c.trip_id) IN ('owner', 'editor')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.costs c
      WHERE c.id = cost_splits.cost_id
        AND public.my_trip_role(c.trip_id) IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "cost_splits: member can settle own" ON public.cost_splits;
CREATE POLICY "cost_splits: member can settle own"
  ON public.cost_splits FOR UPDATE TO authenticated
  USING (user_id = auth.uid());
