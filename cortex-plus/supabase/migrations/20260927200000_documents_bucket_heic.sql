-- Add HEIC/HEIF to the documents Storage bucket's allowed mime types
--
-- Root cause: app-level validation (store-upload.ts DOCUMENT_ALLOWED_TYPES,
-- the /dokumanlar upload form's <input accept=...>, and resolveUploadMime's
-- HEIC magic-byte sniffing for browsers that send an empty content-type)
-- has accepted and advertised HEIC/HEIF since that support was added, but
-- the Storage bucket itself (20250825120100_storage.sql) was never updated
-- to match — its allowed_mime_types array still only has the original 7
-- types from initial setup.
--
-- Supabase Storage enforces allowed_mime_types at the Storage API layer for
-- every caller, including the service-role client this app's upload path
-- uses (createServiceClient() bypasses RLS, but not bucket-level config).
-- So every HEIC/HEIF upload — the default photo format on iPhone, and
-- therefore a common case for a Turkish student photographing a notebook
-- page or a printed worksheet — passed every app-level check and then
-- failed at the actual storage write with an opaque "upload_failed",
-- surfaced to the student as a bare, untranslated error code (see the
-- companion fix in src/lib/api/guards.ts + src/app/api/documents/upload/route.ts).
UPDATE storage.buckets
SET allowed_mime_types = ARRAY[
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif',
  'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation'
]
WHERE id = 'documents';
