-- Telefondan çok dosya (31 Ekim 2026, ürün sahibi: "kullanıcı bir derse kaç döküman isterse yükleyebilir").
-- QR kodu tek dosyadan sonra "kullanıldı" oluyordu. Oturum artık süresi bitene kadar dosya alır; gelenler sırayla
-- dizide tutulur. `document_id` / `file_name` ilk dosyayı tutmaya devam eder (eski masaüstü sekmesi onu okur).
-- Yalnız ekleme: var olan satırlar ve kod bu göçten önce de çalışır.

ALTER TABLE public.phone_upload_sessions
  ADD COLUMN IF NOT EXISTS document_ids uuid[] NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS file_names text[] NOT NULL DEFAULT '{}';

-- Gelen dosyayı tek adımda ekler (aynı anda iki yükleme birbirinin kaydını ezmesin). Dönen değer oturumdaki dosya
-- sayısı; oturum yoksa, süresi dolmuşsa ya da tavana ulaştıysa NULL.
CREATE OR REPLACE FUNCTION public.append_phone_upload(
  p_session_id uuid,
  p_document_id uuid,
  p_file_name text,
  p_max integer DEFAULT 1000
) RETURNS integer
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  UPDATE public.phone_upload_sessions
     SET document_ids = array_append(document_ids, p_document_id),
         file_names = array_append(file_names, coalesce(p_file_name, '')),
         document_id = coalesce(document_id, p_document_id),
         file_name = coalesce(file_name, p_file_name)
   WHERE id = p_session_id
     AND expires_at > now()
     AND coalesce(array_length(document_ids, 1), 0) < p_max
  RETURNING array_length(document_ids, 1);
$$;

REVOKE ALL ON FUNCTION public.append_phone_upload(uuid, uuid, text, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.append_phone_upload(uuid, uuid, text, integer) FROM anon, authenticated;
GRANT EXECUTE ON FUNCTION public.append_phone_upload(uuid, uuid, text, integer) TO service_role;
