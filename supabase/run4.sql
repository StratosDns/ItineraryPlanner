-- =============================================================================
-- run4.sql
-- PURPOSE    : Add fuel metadata columns to the costs table so that fuel
--              fill-ups can be logged directly as a "fuel" category expense.
--              Deprecates the standalone fuel_logs table for new entries.
-- WHEN TO RUN: Existing DB after run3.sql
-- DEPENDS ON : run3.sql (map_notes table)
-- =============================================================================

ALTER TABLE public.costs
  ADD COLUMN IF NOT EXISTS fuel_liters        NUMERIC(10,3),
  ADD COLUMN IF NOT EXISTS fuel_price_per_unit NUMERIC(10,4),
  ADD COLUMN IF NOT EXISTS fuel_unit          TEXT CHECK (fuel_unit IN ('L', 'gal', 'kWh')),
  ADD COLUMN IF NOT EXISTS fuel_type          TEXT CHECK (fuel_type IN ('gasoline', 'diesel', 'lpg', 'electric', 'other')),
  ADD COLUMN IF NOT EXISTS odometer           NUMERIC(10,1);
