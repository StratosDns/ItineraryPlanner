-- =============================================================================
-- SCRIPT: 05_storage.sql
-- PURPOSE: Create the Supabase Storage bucket for stop file attachments,
--          and set storage-level RLS policies.
-- WHEN TO RUN: After 04_rls.sql, once per project.
--              Safe to re-run (ON CONFLICT DO NOTHING on bucket insert).
-- DEPENDS ON: 04_rls.sql (trip membership RLS must be in place)
--
-- BUCKET: attachments (private)
--   Path convention: stops/{stop_id}/{timestamp}.{ext}
--   Access: signed URLs via supabase.storage.from('attachments').getPublicUrl()
--           (bucket is private but getPublicUrl works for non-sensitive files;
--            switch to createSignedUrl() for sensitive docs)
--
-- STORAGE POLICIES:
--   Trip members can read files belonging to their trips.
--   Trip editors/owners can upload and delete.
-- =============================================================================

-- Create private bucket (idempotent)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'attachments',
  'attachments',
  false,
  52428800,   -- 50 MB per file limit
  ARRAY[
    'image/jpeg', 'image/png', 'image/webp', 'image/gif',
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'text/plain', 'text/csv'
  ]
)
ON CONFLICT (id) DO NOTHING;

-- STORAGE RLS ----------------------------------------------------------------
-- Supabase storage policies live in storage.objects, not public tables.

-- Read: any trip member can download attachments for their stops
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

-- Insert: editors/owners can upload
DROP POLICY IF EXISTS "attachments: editors+ can upload" ON storage.objects;
CREATE POLICY "attachments: editors+ can upload"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'attachments'
    -- path format: stops/{stop_id}/...
    -- We extract the stop_id from the path and check the user's trip role
    AND EXISTS (
      SELECT 1
      FROM public.stops s
      WHERE s.id = (string_to_array(name, '/'))[2]::uuid
        AND public.my_trip_role(s.trip_id) IN ('owner', 'editor')
    )
  );

-- Delete: editors/owners can remove
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
