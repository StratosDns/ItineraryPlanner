-- =============================================================================
-- ROUTEFORGE — MASTER SCHEMA
-- =============================================================================
-- Full idempotent setup script. Run once for a clean project start.
-- Safe to re-run: all statements use IF NOT EXISTS / OR REPLACE / ON CONFLICT.
--
-- HOW TO RUN:
--   Option A — psql:
--     psql $DATABASE_URL -f supabase/master.sql
--
--   Option B — Supabase Dashboard SQL Editor:
--     Paste the entire contents of this file and run.
--
-- INCREMENTAL SCRIPTS (for existing databases):
--   supabase/run1.sql   — Storage bucket + storage RLS (if not yet applied)
--
-- ADDING FUTURE CHANGES:
--   1. Create supabase/run(N+1).sql for the incremental change.
--   2. Append the same SQL to this file at the correct section.
--   3. Update memory.md → "Supabase Scripts" section.
-- =============================================================================

-- Enable UUID extension (already on by default in Supabase)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================================================
-- TABLES
-- =============================================================================

-- TRIPS -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trips (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  description TEXT,
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TRIP MEMBERS ----------------------------------------------------------------
-- role: 'owner' | 'editor' | 'viewer'
CREATE TABLE IF NOT EXISTS public.trip_members (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id    UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_by UUID REFERENCES auth.users(id),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, user_id)
);

-- STOPS -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.stops (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id     UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  order_index INTEGER NOT NULL DEFAULT 0,
  name        TEXT NOT NULL,
  address     TEXT,
  lat         DOUBLE PRECISION,
  lng         DOUBLE PRECISION,
  notes       TEXT,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- STOP ATTACHMENTS ------------------------------------------------------------
-- Files uploaded to Supabase Storage bucket "attachments"
CREATE TABLE IF NOT EXISTS public.stop_attachments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stop_id      UUID NOT NULL REFERENCES public.stops(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,
  file_url     TEXT NOT NULL,
  storage_path TEXT NOT NULL,
  file_type    TEXT,        -- MIME type
  label        TEXT,        -- e.g. "Hotel reservation", "Flight ticket"
  uploaded_by  UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FUEL LOGS -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.fuel_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id     UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  stop_id     UUID REFERENCES public.stops(id) ON DELETE SET NULL,
  fuel_type   TEXT NOT NULL CHECK (fuel_type IN ('gasoline', 'diesel', 'lpg', 'electric', 'other')),
  amount      NUMERIC(10,3) NOT NULL,  -- litres or kWh
  unit        TEXT NOT NULL DEFAULT 'L' CHECK (unit IN ('L', 'gal', 'kWh')),
  cost        NUMERIC(10,2) NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'EUR',
  odometer    NUMERIC(10,1),           -- optional km at fill-up
  notes       TEXT,
  logged_by   UUID REFERENCES auth.users(id),
  logged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- COSTS -----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.costs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id     UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  stop_id     UUID REFERENCES public.stops(id) ON DELETE SET NULL,
  category    TEXT NOT NULL DEFAULT 'other',
  description TEXT,
  amount      NUMERIC(10,2) NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'EUR',
  paid_by     UUID NOT NULL REFERENCES auth.users(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- COST SPLITS -----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cost_splits (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cost_id      UUID NOT NULL REFERENCES public.costs(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_amount NUMERIC(10,2) NOT NULL,
  settled      BOOLEAN NOT NULL DEFAULT FALSE,
  settled_at   TIMESTAMPTZ,
  UNIQUE (cost_id, user_id)
);

-- PROFILES (mirrors auth.users for display names) ----------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- =============================================================================
-- INDEXES
-- =============================================================================
CREATE INDEX IF NOT EXISTS idx_trip_members_trip  ON public.trip_members(trip_id);
CREATE INDEX IF NOT EXISTS idx_trip_members_user  ON public.trip_members(user_id);
CREATE INDEX IF NOT EXISTS idx_stops_trip         ON public.stops(trip_id);
CREATE INDEX IF NOT EXISTS idx_stops_order        ON public.stops(trip_id, order_index);
CREATE INDEX IF NOT EXISTS idx_stop_attachments   ON public.stop_attachments(stop_id);
CREATE INDEX IF NOT EXISTS idx_fuel_logs_trip     ON public.fuel_logs(trip_id);
CREATE INDEX IF NOT EXISTS idx_costs_trip         ON public.costs(trip_id);
CREATE INDEX IF NOT EXISTS idx_cost_splits_cost   ON public.cost_splits(cost_id);
CREATE INDEX IF NOT EXISTS idx_cost_splits_user   ON public.cost_splits(user_id);

-- =============================================================================
-- FUNCTIONS & TRIGGERS
-- =============================================================================

-- AUTO-UPDATE updated_at ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$;

DROP TRIGGER IF EXISTS trips_updated_at ON public.trips;
CREATE TRIGGER trips_updated_at BEFORE UPDATE ON public.trips
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

DROP TRIGGER IF EXISTS stops_updated_at ON public.stops;
CREATE TRIGGER stops_updated_at BEFORE UPDATE ON public.stops
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

-- AUTO-CREATE PROFILE on signup -----------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)));
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- HELPER: get current user's role for a trip ----------------------------------
CREATE OR REPLACE FUNCTION public.my_trip_role(trip UUID)
RETURNS TEXT LANGUAGE sql STABLE SECURITY DEFINER AS $$
  SELECT role FROM public.trip_members
  WHERE trip_id = trip AND user_id = auth.uid()
  LIMIT 1;
$$;

-- =============================================================================
-- ROW LEVEL SECURITY
-- =============================================================================
ALTER TABLE public.trips            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_members     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stops            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stop_attachments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fuel_logs        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.costs            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cost_splits      ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles         ENABLE ROW LEVEL SECURITY;

-- PROFILES --------------------------------------------------------------------
DROP POLICY IF EXISTS "Users can read any profile" ON public.profiles;
CREATE POLICY "Users can read any profile"
  ON public.profiles FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Users can update own profile" ON public.profiles;
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE TO authenticated USING (auth.uid() = id);

-- TRIPS -----------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can read trips" ON public.trips;
CREATE POLICY "Members can read trips"
  ON public.trips FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.trip_members
    WHERE trip_id = trips.id AND user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Authenticated users can create trips" ON public.trips;
CREATE POLICY "Authenticated users can create trips"
  ON public.trips FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = owner_id);

DROP POLICY IF EXISTS "Owner can update trip" ON public.trips;
CREATE POLICY "Owner can update trip"
  ON public.trips FOR UPDATE TO authenticated
  USING (public.my_trip_role(id) = 'owner');

DROP POLICY IF EXISTS "Owner can delete trip" ON public.trips;
CREATE POLICY "Owner can delete trip"
  ON public.trips FOR DELETE TO authenticated
  USING (public.my_trip_role(id) = 'owner');

-- TRIP MEMBERS ----------------------------------------------------------------
DROP POLICY IF EXISTS "Members can read trip_members" ON public.trip_members;
CREATE POLICY "Members can read trip_members"
  ON public.trip_members FOR SELECT TO authenticated
  USING (public.my_trip_role(trip_id) IS NOT NULL);  -- SECURITY DEFINER avoids self-referential recursion

DROP POLICY IF EXISTS "Owner can insert members" ON public.trip_members;
CREATE POLICY "Owner can insert members"
  ON public.trip_members FOR INSERT TO authenticated
  WITH CHECK (public.my_trip_role(trip_id) = 'owner'
    OR (auth.uid() = user_id AND role = 'owner'));  -- allow self-insert as owner on trip creation

DROP POLICY IF EXISTS "Owner can update member roles" ON public.trip_members;
CREATE POLICY "Owner can update member roles"
  ON public.trip_members FOR UPDATE TO authenticated
  USING (public.my_trip_role(trip_id) = 'owner');

DROP POLICY IF EXISTS "Owner can remove members" ON public.trip_members;
CREATE POLICY "Owner can remove members"
  ON public.trip_members FOR DELETE TO authenticated
  USING (public.my_trip_role(trip_id) = 'owner' OR user_id = auth.uid());

-- STOPS -----------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can read stops" ON public.stops;
CREATE POLICY "Members can read stops"
  ON public.stops FOR SELECT TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor', 'viewer'));

DROP POLICY IF EXISTS "Editors+ can insert stops" ON public.stops;
CREATE POLICY "Editors+ can insert stops"
  ON public.stops FOR INSERT TO authenticated
  WITH CHECK (public.my_trip_role(trip_id) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "Editors+ can update stops" ON public.stops;
CREATE POLICY "Editors+ can update stops"
  ON public.stops FOR UPDATE TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "Editors+ can delete stops" ON public.stops;
CREATE POLICY "Editors+ can delete stops"
  ON public.stops FOR DELETE TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor'));

-- STOP ATTACHMENTS ------------------------------------------------------------
DROP POLICY IF EXISTS "Members can read attachments" ON public.stop_attachments;
CREATE POLICY "Members can read attachments"
  ON public.stop_attachments FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stops s
    JOIN public.trip_members tm ON tm.trip_id = s.trip_id
    WHERE s.id = stop_attachments.stop_id AND tm.user_id = auth.uid()
  ));

DROP POLICY IF EXISTS "Editors+ can insert attachments" ON public.stop_attachments;
CREATE POLICY "Editors+ can insert attachments"
  ON public.stop_attachments FOR INSERT TO authenticated
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.stops s
    WHERE s.id = stop_id AND public.my_trip_role(s.trip_id) IN ('owner', 'editor')
  ));

DROP POLICY IF EXISTS "Editors+ can delete attachments" ON public.stop_attachments;
CREATE POLICY "Editors+ can delete attachments"
  ON public.stop_attachments FOR DELETE TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.stops s
    WHERE s.id = stop_id AND public.my_trip_role(s.trip_id) IN ('owner', 'editor')
  ));

-- FUEL LOGS -------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can read fuel logs" ON public.fuel_logs;
CREATE POLICY "Members can read fuel logs"
  ON public.fuel_logs FOR SELECT TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor', 'viewer'));

DROP POLICY IF EXISTS "Editors+ can manage fuel logs" ON public.fuel_logs;
CREATE POLICY "Editors+ can manage fuel logs"
  ON public.fuel_logs FOR ALL TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor'))
  WITH CHECK (public.my_trip_role(trip_id) IN ('owner', 'editor'));

-- COSTS -----------------------------------------------------------------------
DROP POLICY IF EXISTS "Members can read costs" ON public.costs;
CREATE POLICY "Members can read costs"
  ON public.costs FOR SELECT TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor', 'viewer'));

DROP POLICY IF EXISTS "Editors+ can manage costs" ON public.costs;
CREATE POLICY "Editors+ can manage costs"
  ON public.costs FOR ALL TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor'))
  WITH CHECK (public.my_trip_role(trip_id) IN ('owner', 'editor'));

-- COST SPLITS -----------------------------------------------------------------
DROP POLICY IF EXISTS "Members can read cost splits" ON public.cost_splits;
CREATE POLICY "Members can read cost splits"
  ON public.cost_splits FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.costs c
    WHERE c.id = cost_splits.cost_id AND public.my_trip_role(c.trip_id) IN ('owner', 'editor', 'viewer')
  ));

DROP POLICY IF EXISTS "Editors+ can manage cost splits" ON public.cost_splits;
CREATE POLICY "Editors+ can manage cost splits"
  ON public.cost_splits FOR ALL TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.costs c
    WHERE c.id = cost_splits.cost_id AND public.my_trip_role(c.trip_id) IN ('owner', 'editor')
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.costs c
    WHERE c.id = cost_splits.cost_id AND public.my_trip_role(c.trip_id) IN ('owner', 'editor')
  ));

DROP POLICY IF EXISTS "Members can settle own splits" ON public.cost_splits;
CREATE POLICY "Members can settle own splits"
  ON public.cost_splits FOR UPDATE TO authenticated
  USING (user_id = auth.uid());

-- =============================================================================
-- STORAGE BUCKET
-- =============================================================================

-- Private bucket for stop file attachments ------------------------------------
-- Path convention: stops/{stop_id}/{timestamp}.{ext}
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,
  52428800,   -- 50 MB per file
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- Storage RLS -----------------------------------------------------------------
DROP POLICY IF EXISTS "attachments: members can read" ON storage.objects;
CREATE POLICY "attachments: members can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1
      FROM public.stop_attachments sa
      JOIN public.stops s ON s.id = sa.stop_id
      JOIN public.trip_members tm ON tm.trip_id = s.trip_id
      WHERE sa.storage_path = name
        AND tm.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "attachments: editors+ can upload" ON storage.objects;
CREATE POLICY "attachments: editors+ can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1
      FROM public.stops s
      WHERE s.id = (string_to_array(name, '/'))[2]::uuid
        AND public.my_trip_role(s.trip_id) IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "attachments: editors+ can delete" ON storage.objects;
CREATE POLICY "attachments: editors+ can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND EXISTS (
      SELECT 1
      FROM public.stop_attachments sa
      JOIN public.stops s ON s.id = sa.stop_id
      WHERE sa.storage_path = name
        AND public.my_trip_role(s.trip_id) IN ('owner', 'editor')
    )
  );

-- =============================================================================
-- END
-- =============================================================================
