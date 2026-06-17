-- =============================================================================
-- run5.sql
-- PURPOSE:      trip_invite_links table — shareable viewer links per trip
-- WHEN TO RUN:  On existing DB after run4.sql has been applied
-- DEPENDS ON:   run4.sql (trips, trip_members, auth.users must exist)
--
-- DESIGN DECISIONS:
--   - Each link has a unique 32-byte hex token used in the URL path.
--   - Links expire based on expires_at (NULL = no expiry).
--   - Unlimited anonymous viewers can use a link until it expires.
--   - Only ONE person can claim the member slot (member_claimed_by).
--     After claiming, further signups via the same link get no board access.
--   - Service role is used server-side to validate tokens without exposing
--     the full table to anon/authenticated RLS reads.
--   - RLS allows owners to manage their links; anon reads are blocked
--     (token validation is always done server-side with service role).
-- =============================================================================

-- TRIP INVITE LINKS -----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.trip_invite_links (
  id                  UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  trip_id             UUID        NOT NULL REFERENCES public.trips(id) ON DELETE CASCADE,
  token               TEXT        NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  label               TEXT,                             -- owner-defined label (e.g. "For Maria")
  created_by          UUID        NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at          TIMESTAMPTZ,                      -- NULL = never expires
  member_claimed_by   UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  member_claimed_at   TIMESTAMPTZ,
  role                TEXT        NOT NULL DEFAULT 'viewer' CHECK (role = 'viewer')
);

CREATE INDEX IF NOT EXISTS idx_invite_links_trip  ON public.trip_invite_links(trip_id);
CREATE INDEX IF NOT EXISTS idx_invite_links_token ON public.trip_invite_links(token);

ALTER TABLE public.trip_invite_links ENABLE ROW LEVEL SECURITY;

-- Owners can read all links for their trips
DROP POLICY IF EXISTS "Owner can read invite links" ON public.trip_invite_links;
CREATE POLICY "Owner can read invite links"
  ON public.trip_invite_links FOR SELECT TO authenticated
  USING (public.my_trip_role(trip_id) = 'owner');

-- Owners can create links for their trips
DROP POLICY IF EXISTS "Owner can create invite links" ON public.trip_invite_links;
CREATE POLICY "Owner can create invite links"
  ON public.trip_invite_links FOR INSERT TO authenticated
  WITH CHECK (public.my_trip_role(trip_id) = 'owner');

-- Owners can update labels on their links
DROP POLICY IF EXISTS "Owner can update invite links" ON public.trip_invite_links;
CREATE POLICY "Owner can update invite links"
  ON public.trip_invite_links FOR UPDATE TO authenticated
  USING (public.my_trip_role(trip_id) = 'owner');

-- Owners can revoke (delete) links for their trips
DROP POLICY IF EXISTS "Owner can delete invite links" ON public.trip_invite_links;
CREATE POLICY "Owner can delete invite links"
  ON public.trip_invite_links FOR DELETE TO authenticated
  USING (public.my_trip_role(trip_id) = 'owner');

-- NOTE: Token validation (/api/join/[token]) uses the service role key
-- server-side and bypasses RLS. Anon users cannot read this table directly.
