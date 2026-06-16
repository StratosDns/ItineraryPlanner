-- =============================================================================
-- SCRIPT: 02_indexes.sql
-- PURPOSE: Create performance indexes on high-query columns.
-- WHEN TO RUN: After 01_tables.sql. Safe to re-run (CREATE INDEX IF NOT EXISTS).
-- DEPENDS ON: 01_tables.sql
-- NOTES:
--   - trip_members(trip_id) and (user_id) are hit on every page load for auth.
--   - stops(trip_id, order_index) is the primary read pattern for the route map.
--   - cost_splits(user_id) is used for the per-member balance summary.
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
