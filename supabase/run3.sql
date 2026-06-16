-- =============================================================================
-- RUN 3 — map_notes table (sticky notes anchored to lat/lng per route)
-- =============================================================================
-- PURPOSE:
--   Allow trip editors to pin sticky notes anywhere on the route map.
--   Notes are scoped to a route (route_id) and carry a color, content, and
--   the lat/lng where they were placed.
--
-- WHEN TO RUN:
--   On any existing DB that has run2.sql applied (routes table must exist).
--
-- DEPENDS ON:
--   routes table, profiles table, trips table, my_trip_role() function
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.map_notes (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  route_id   UUID NOT NULL REFERENCES public.routes(id)  ON DELETE CASCADE,
  trip_id    UUID NOT NULL REFERENCES public.trips(id)   ON DELETE CASCADE,
  lat        DOUBLE PRECISION NOT NULL,
  lng        DOUBLE PRECISION NOT NULL,
  content    TEXT NOT NULL DEFAULT '',
  color      TEXT NOT NULL DEFAULT 'yellow'
               CHECK (color IN ('yellow', 'green', 'red', 'blue')),
  created_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_map_notes_route ON public.map_notes(route_id);

ALTER TABLE public.map_notes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members can read map_notes" ON public.map_notes;
CREATE POLICY "Members can read map_notes"
  ON public.map_notes FOR SELECT TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor', 'viewer'));

DROP POLICY IF EXISTS "Editors+ can insert map_notes" ON public.map_notes;
CREATE POLICY "Editors+ can insert map_notes"
  ON public.map_notes FOR INSERT TO authenticated
  WITH CHECK (public.my_trip_role(trip_id) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "Editors+ can update map_notes" ON public.map_notes;
CREATE POLICY "Editors+ can update map_notes"
  ON public.map_notes FOR UPDATE TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "Editors+ can delete map_notes" ON public.map_notes;
CREATE POLICY "Editors+ can delete map_notes"
  ON public.map_notes FOR DELETE TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor'));
