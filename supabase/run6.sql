-- =============================================================================
-- run6.sql
-- PURPOSE:      Add is_stay boolean to stops — marks a stop as an overnight stay
-- WHEN TO RUN:  On existing DB after run5.sql has been applied
-- DEPENDS ON:   run5.sql (stops table must exist)
--
-- DESIGN DECISIONS:
--   - Simple boolean flag per stop; no separate table needed.
--   - Default FALSE so all existing stops are unaffected.
--   - No additional RLS needed — inherits existing stops policies (editors+ can update).
-- =============================================================================

ALTER TABLE public.stops
  ADD COLUMN IF NOT EXISTS is_stay BOOLEAN NOT NULL DEFAULT FALSE;
