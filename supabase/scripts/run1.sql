-- =============================================================================
-- SCRIPT: 00_extensions.sql
-- PURPOSE: Enable required Postgres extensions.
-- WHEN TO RUN: Once, on new Supabase project. Safe to re-run (idempotent).
-- DEPENDS ON: nothing
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
