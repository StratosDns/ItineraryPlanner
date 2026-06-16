-- =============================================================================
-- MASTER SCRIPT — RouteForge
-- =============================================================================
-- Runs all scripts in dependency order.
-- Use this for first-time project setup or a full reset.
--
-- HOW TO RUN:
--   Option A (psql / Supabase CLI):
--     psql $DATABASE_URL -f supabase/master.sql
--     -- OR run each file individually:
--     psql $DATABASE_URL -f supabase/scripts/run1.sql
--     psql $DATABASE_URL -f supabase/scripts/run2.sql
--     psql $DATABASE_URL -f supabase/scripts/run3.sql
--     psql $DATABASE_URL -f supabase/scripts/run4.sql
--     psql $DATABASE_URL -f supabase/scripts/run5.sql
--     psql $DATABASE_URL -f supabase/scripts/run6.sql
--
--   Option B (Supabase Dashboard SQL Editor):
--     Paste each runN.sql in order — the \i directive is not supported
--     in the web editor, so paste file contents directly.
--
-- SCRIPT INDEX:
--   run1.sql  — Extensions (uuid-ossp)
--   run2.sql  — All table definitions
--   run3.sql  — Performance indexes
--   run4.sql  — Functions and triggers
--   run5.sql  — Row Level Security policies
--   run6.sql  — Storage bucket + storage policies
--
-- ADDING NEW SCRIPTS:
--   1. Create supabase/scripts/run(N+1).sql with the standard header.
--   2. Add a \i entry below at the correct position.
--   3. Add a row to the SCRIPT INDEX above.
--   4. Update memory.md → "Supabase Scripts" section.
-- =============================================================================

\i supabase/scripts/run1.sql
\i supabase/scripts/run2.sql
\i supabase/scripts/run3.sql
\i supabase/scripts/run4.sql
\i supabase/scripts/run5.sql
\i supabase/scripts/run6.sql

-- =============================================================================
-- END OF MASTER SCRIPT
-- =============================================================================
