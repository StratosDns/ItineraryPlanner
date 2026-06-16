-- =============================================================================
-- RUN 1 — Storage bucket + storage RLS
-- =============================================================================
-- Run this on an EXISTING database that already has the base schema applied
-- (i.e. you ran master.sql or the original schema script but skipped storage).
--
-- Safe to re-run (ON CONFLICT DO NOTHING on bucket insert).
-- DEPENDS ON: base schema (tables, my_trip_role function, stop_attachments table)
-- =============================================================================

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,
  52428800,
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

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
