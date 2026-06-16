-- =============================================================================
-- SCRIPT: 01_tables.sql
-- PURPOSE: Create all application tables.
-- WHEN TO RUN: Once on new project, or after 00_extensions.sql on a fresh DB.
--              Safe to re-run (CREATE TABLE IF NOT EXISTS).
-- DEPENDS ON: 00_extensions.sql
-- TABLES CREATED:
--   profiles         — mirrors auth.users for display names/avatars
--   trips            — a single itinerary owned by one user
--   trip_members     — junction: who has access to a trip + role
--   stops            — ordered waypoints inside a trip
--   stop_attachments — files (reservations, tickets) attached to a stop
--   fuel_logs        — refill records per trip
--   costs            — shared expenses per trip
--   cost_splits      — per-member share of each cost
-- =============================================================================

-- PROFILES -------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id           UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  display_name TEXT,
  avatar_url   TEXT,
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TRIPS ----------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trips (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title       TEXT NOT NULL,
  description TEXT,
  owner_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- TRIP MEMBERS ---------------------------------------------------------------
-- role: 'owner' | 'editor' | 'viewer'
-- owner  → full control, delete trip, manage members
-- editor → add/edit stops, fuel, costs, attachments
-- viewer → read-only
CREATE TABLE IF NOT EXISTS public.trip_members (
  id         UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id    UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  user_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  role       TEXT NOT NULL CHECK (role IN ('owner', 'editor', 'viewer')),
  invited_by UUID REFERENCES auth.users(id),
  joined_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (trip_id, user_id)
);

-- STOPS ----------------------------------------------------------------------
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

-- STOP ATTACHMENTS -----------------------------------------------------------
-- Files live in Supabase Storage bucket "attachments".
-- storage_path is the key used to fetch/delete from the bucket.
CREATE TABLE IF NOT EXISTS public.stop_attachments (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  stop_id      UUID NOT NULL REFERENCES public.stops(id) ON DELETE CASCADE,
  file_name    TEXT NOT NULL,
  file_url     TEXT NOT NULL,       -- public URL from storage.getPublicUrl()
  storage_path TEXT NOT NULL,       -- bucket path, used for deletion
  file_type    TEXT,                -- MIME type
  label        TEXT,                -- human label, e.g. "Hotel reservation"
  uploaded_by  UUID REFERENCES auth.users(id),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- FUEL LOGS ------------------------------------------------------------------
-- One row per refill event.
-- amount is in the unit specified by the `unit` column.
-- odometer is optional km reading at fill-up time.
CREATE TABLE IF NOT EXISTS public.fuel_logs (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id     UUID NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  stop_id     UUID REFERENCES public.stops(id) ON DELETE SET NULL,
  fuel_type   TEXT NOT NULL CHECK (fuel_type IN ('gasoline', 'diesel', 'lpg', 'electric', 'other')),
  amount      NUMERIC(10,3) NOT NULL,
  unit        TEXT NOT NULL DEFAULT 'L' CHECK (unit IN ('L', 'gal', 'kWh')),
  cost        NUMERIC(10,2) NOT NULL,
  currency    TEXT NOT NULL DEFAULT 'EUR',
  odometer    NUMERIC(10,1),
  notes       TEXT,
  logged_by   UUID REFERENCES auth.users(id),
  logged_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- COSTS ----------------------------------------------------------------------
-- A shared expense paid by one member (paid_by).
-- Actual per-member splits are in cost_splits.
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

-- COST SPLITS ----------------------------------------------------------------
-- One row per (cost, member) pair.
-- share_amount is the portion this member owes.
-- settled=true means this member has paid back the payer.
CREATE TABLE IF NOT EXISTS public.cost_splits (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  cost_id      UUID NOT NULL REFERENCES public.costs(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  share_amount NUMERIC(10,2) NOT NULL,
  settled      BOOLEAN NOT NULL DEFAULT FALSE,
  settled_at   TIMESTAMPTZ,
  UNIQUE (cost_id, user_id)
);
