-- =============================================================================
-- run7.sql
-- PURPOSE:  Per-note side panel items (links, images, text, cost refs) +
--           per-note zoom-relative size toggle on map
-- WHEN TO RUN: Existing DB after run6.sql
-- DEPENDS ON:  run6.sql (is_stay on stops), run3.sql (map_notes), run4.sql (costs)
-- =============================================================================

-- Add zoom-relative toggle to map_notes ----------------------------------
ALTER TABLE public.map_notes
  ADD COLUMN IF NOT EXISTS is_zoom_relative BOOLEAN NOT NULL DEFAULT FALSE;

-- NOTE ITEMS TABLE -----------------------------------------------------------
-- Stores attachable items for each map note:
--   link     → label (opt) + url
--   image    → file_url + storage_path + file_name (stored in attachments bucket under note-images/)
--   text     → content (free text / markdown)
--   cost_ref → cost_id FK + label (denormalised category·amount·currency for display)

CREATE TABLE IF NOT EXISTS public.note_items (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  note_id      UUID        NOT NULL REFERENCES public.map_notes(id) ON DELETE CASCADE,
  trip_id      UUID        NOT NULL REFERENCES public.trips(id)     ON DELETE CASCADE,
  type         TEXT        NOT NULL CHECK (type IN ('link', 'image', 'text', 'cost_ref')),
  label        TEXT,
  url          TEXT,
  content      TEXT,
  storage_path TEXT,
  file_url     TEXT,
  file_name    TEXT,
  cost_id      UUID        REFERENCES public.costs(id) ON DELETE SET NULL,
  order_index  INTEGER     NOT NULL DEFAULT 0,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_note_items_note_id ON public.note_items(note_id);
CREATE INDEX IF NOT EXISTS idx_note_items_trip_id ON public.note_items(trip_id);

ALTER TABLE public.note_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "note_items: members can read"    ON public.note_items;
CREATE POLICY "note_items: members can read"
  ON public.note_items FOR SELECT TO authenticated
  USING (public.my_trip_role(trip_id) IS NOT NULL);

DROP POLICY IF EXISTS "note_items: editors+ can insert" ON public.note_items;
CREATE POLICY "note_items: editors+ can insert"
  ON public.note_items FOR INSERT TO authenticated
  WITH CHECK (public.my_trip_role(trip_id) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "note_items: editors+ can update" ON public.note_items;
CREATE POLICY "note_items: editors+ can update"
  ON public.note_items FOR UPDATE TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor'));

DROP POLICY IF EXISTS "note_items: editors+ can delete" ON public.note_items;
CREATE POLICY "note_items: editors+ can delete"
  ON public.note_items FOR DELETE TO authenticated
  USING (public.my_trip_role(trip_id) IN ('owner', 'editor'));

-- STORAGE RLS for note images (bucket: attachments, path: note-images/{note_id}/...) ---

DROP POLICY IF EXISTS "note-images: members can read" ON storage.objects;
CREATE POLICY "note-images: members can read"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'attachments'
    AND name LIKE 'note-images/%'
    AND EXISTS (
      SELECT 1 FROM public.note_items ni
      JOIN  public.map_notes mn ON mn.id = ni.note_id
      WHERE ni.storage_path = name
        AND public.my_trip_role(mn.trip_id) IS NOT NULL
    )
  );

DROP POLICY IF EXISTS "note-images: editors+ can upload" ON storage.objects;
CREATE POLICY "note-images: editors+ can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    AND name LIKE 'note-images/%'
    AND EXISTS (
      SELECT 1 FROM public.map_notes mn
      WHERE mn.id = split_part(name, '/', 2)::uuid
        AND public.my_trip_role(mn.trip_id) IN ('owner', 'editor')
    )
  );

DROP POLICY IF EXISTS "note-images: editors+ can delete" ON storage.objects;
CREATE POLICY "note-images: editors+ can delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'attachments'
    AND name LIKE 'note-images/%'
    AND EXISTS (
      SELECT 1 FROM public.note_items ni
      JOIN  public.map_notes mn ON mn.id = ni.note_id
      WHERE ni.storage_path = name
        AND public.my_trip_role(mn.trip_id) IN ('owner', 'editor')
    )
  );
