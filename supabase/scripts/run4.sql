-- =============================================================================
-- SCRIPT: 03_functions_triggers.sql
-- PURPOSE: Database functions and triggers.
-- WHEN TO RUN: After 01_tables.sql. Safe to re-run (CREATE OR REPLACE).
-- DEPENDS ON: 01_tables.sql
--
-- FUNCTIONS:
--   handle_updated_at()   — sets updated_at = NOW() on any UPDATE
--   handle_new_user()     — auto-creates a profile row when a user signs up
--   my_trip_role(trip)    — returns the calling user's role for a given trip_id
--                           used extensively in RLS policies
--
-- TRIGGERS:
--   trips_updated_at      — fires handle_updated_at() on trips UPDATE
--   stops_updated_at      — fires handle_updated_at() on stops UPDATE
--   on_auth_user_created  — fires handle_new_user() on auth.users INSERT
-- =============================================================================

-- AUTO updated_at ----------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trips_updated_at ON public.trips;
CREATE TRIGGER trips_updated_at
  BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS stops_updated_at ON public.stops;
CREATE TRIGGER stops_updated_at
  BEFORE UPDATE ON public.stops
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- AUTO-CREATE PROFILE on signup --------------------------------------------
-- SECURITY DEFINER so the function can write to public.profiles
-- even though the trigger fires before the user's session is established.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- HELPER: caller's role for a trip ----------------------------------------
-- Used in RLS policies. STABLE + SECURITY DEFINER so it can bypass RLS
-- on trip_members when evaluating policies on other tables.
-- Returns NULL if the calling user has no membership.
CREATE OR REPLACE FUNCTION public.my_trip_role(trip UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role
  FROM public.trip_members
  WHERE trip_id = trip AND user_id = auth.uid()
  LIMIT 1;
$$;
