-- =============================================================================
-- run8.sql
-- PURPOSE:  Add note_scale to map_notes for persisting per-note resize
-- WHEN TO RUN: Existing DB after run7.sql
-- DEPENDS ON:  run7.sql
-- =============================================================================

ALTER TABLE public.map_notes
  ADD COLUMN IF NOT EXISTS note_scale FLOAT NOT NULL DEFAULT 1.0;
