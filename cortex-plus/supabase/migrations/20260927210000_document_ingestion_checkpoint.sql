-- A document is indexed in bounded, recoverable page ranges. The cursor moves
-- only after page text, chunks and vectors are all durable.
UPDATE storage.buckets SET file_size_limit = 52428800 WHERE id = 'documents';
-- Client uploads must use a short-lived server-issued token. An authenticated
-- browser INSERT policy would bypass app storage quotas and file verification.
DROP POLICY IF EXISTS documents_storage_insert ON storage.objects;
-- Deletion is also mediated by the document API so DB rows and vectors do not
-- survive a direct browser removal of the underlying object.
DROP POLICY IF EXISTS documents_storage_delete ON storage.objects;
-- Existing broad ALL policies (active_account_required and
-- document_source_not_deleted) are permissive OR policies. Dropping the two
-- named policies above alone would still allow direct writes and cross-user
-- reads. Restrictive policies AND the owner/document boundary onto every
-- permissive path. Signed upload tokens are verified by Storage separately.
CREATE POLICY documents_private_read_guard ON storage.objects AS RESTRICTIVE
  FOR SELECT TO authenticated USING (
    bucket_id <> 'documents' OR EXISTS (
      SELECT 1 FROM public.documents d
      WHERE d.storage_path = name AND d.user_id = (SELECT auth.uid())
        AND d.deleted_at IS NULL
    )
  );
CREATE POLICY documents_signed_insert_only ON storage.objects AS RESTRICTIVE
  FOR INSERT TO authenticated WITH CHECK (bucket_id <> 'documents');
CREATE POLICY documents_server_update_only ON storage.objects AS RESTRICTIVE
  FOR UPDATE TO authenticated USING (bucket_id <> 'documents')
  WITH CHECK (bucket_id <> 'documents');
CREATE POLICY documents_server_delete_only ON storage.objects AS RESTRICTIVE
  FOR DELETE TO authenticated USING (bucket_id <> 'documents');

CREATE TABLE IF NOT EXISTS public.document_ingestion_state (
  document_id uuid PRIMARY KEY REFERENCES public.documents(id) ON DELETE CASCADE,
  next_page integer NOT NULL DEFAULT 1 CHECK (next_page > 0),
  total_pages integer CHECK (total_pages IS NULL OR total_pages > 0),
  initialized boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'extracting' CHECK (status IN ('extracting','ready')),
  reservation_id uuid REFERENCES public.credit_reservations(id) ON DELETE SET NULL,
  lease_token uuid,
  lease_until timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.document_ingestion_state ENABLE ROW LEVEL SECURITY;
CREATE POLICY document_ingestion_own ON public.document_ingestion_state
  FOR SELECT TO authenticated USING (
    EXISTS (SELECT 1 FROM public.documents d
      WHERE d.id = document_id AND d.user_id = (SELECT auth.uid()) AND d.deleted_at IS NULL)
  );

CREATE OR REPLACE FUNCTION public.claim_document_ingestion(
  p_document_id uuid, p_user_id uuid
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_state public.document_ingestion_state%ROWTYPE;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.documents
    WHERE id = p_document_id AND user_id = p_user_id AND deleted_at IS NULL AND status <> 'pending') THEN
    RETURN jsonb_build_object('state','missing');
  END IF;
  INSERT INTO public.document_ingestion_state(document_id) VALUES(p_document_id)
    ON CONFLICT(document_id) DO NOTHING;
  SELECT * INTO v_state FROM public.document_ingestion_state
    WHERE document_id = p_document_id FOR UPDATE;
  IF v_state.status = 'ready' THEN
    RETURN jsonb_build_object('state','ready','totalPages',v_state.total_pages);
  END IF;
  IF v_state.lease_until > now() THEN
    RETURN jsonb_build_object('state','busy','nextPage',v_state.next_page,
      'totalPages',v_state.total_pages);
  END IF;
  UPDATE public.document_ingestion_state SET
    lease_token = gen_random_uuid(), lease_until = now() + interval '330 seconds',
    updated_at = now()
    WHERE document_id = p_document_id RETURNING * INTO v_state;
  RETURN jsonb_build_object('state','claimed','token',v_state.lease_token,
    'nextPage',v_state.next_page,'totalPages',v_state.total_pages,
    'initialized',v_state.initialized,'reservationId',v_state.reservation_id);
END;
$$;
REVOKE ALL ON FUNCTION public.claim_document_ingestion(uuid,uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_document_ingestion(uuid,uuid) TO service_role;

-- One physical OCR page consumes at most one monthly photo-page allowance,
-- even if Vercel or the browser retries an interrupted batch.
CREATE TABLE IF NOT EXISTS public.document_ocr_claims (
  document_id uuid NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  page_number integer NOT NULL CHECK (page_number > 0),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  PRIMARY KEY(document_id, page_number)
);
ALTER TABLE public.document_ocr_claims ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.claim_document_ocr_page(
  p_document_id uuid, p_user_id uuid, p_page_number integer, p_limit integer
) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_period date := date_trunc('month', now())::date;
  v_grant public.document_page_grants%ROWTYPE;
  v_used integer;
BEGIN
  IF p_page_number < 1 OR p_limit < 1 OR NOT EXISTS (
    SELECT 1 FROM public.documents WHERE id=p_document_id AND user_id=p_user_id AND deleted_at IS NULL
  ) THEN RETURN false; END IF;
  INSERT INTO public.document_page_grants(user_id,period_start,used)
    VALUES(p_user_id,v_period,0) ON CONFLICT(user_id) DO NOTHING;
  SELECT * INTO v_grant FROM public.document_page_grants WHERE user_id=p_user_id FOR UPDATE;
  IF EXISTS (SELECT 1 FROM public.document_ocr_claims
    WHERE document_id=p_document_id AND page_number=p_page_number AND user_id=p_user_id) THEN
    RETURN true;
  END IF;
  v_used := CASE WHEN v_grant.period_start=v_period THEN v_grant.used ELSE 0 END;
  IF v_used >= p_limit THEN RETURN false; END IF;
  UPDATE public.document_page_grants
    SET period_start=v_period,used=v_used+1,updated_at=now() WHERE user_id=p_user_id;
  INSERT INTO public.document_ocr_claims(document_id,page_number,user_id,period_start)
    VALUES(p_document_id,p_page_number,p_user_id,v_period);
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.claim_document_ocr_page(uuid,uuid,integer,integer)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_document_ocr_page(uuid,uuid,integer,integer) TO service_role;

CREATE OR REPLACE FUNCTION public.release_document_ocr_page(
  p_document_id uuid, p_user_id uuid, p_page_number integer
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
DECLARE v_claim public.document_ocr_claims%ROWTYPE;
BEGIN
  PERFORM 1 FROM public.document_page_grants WHERE user_id=p_user_id FOR UPDATE;
  DELETE FROM public.document_ocr_claims
    WHERE document_id=p_document_id AND page_number=p_page_number AND user_id=p_user_id
    RETURNING * INTO v_claim;
  IF v_claim.document_id IS NOT NULL AND v_claim.period_start=date_trunc('month',now())::date THEN
    UPDATE public.document_page_grants SET used=GREATEST(used-1,0),updated_at=now()
      WHERE user_id=p_user_id AND period_start=v_claim.period_start;
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.release_document_ocr_page(uuid,uuid,integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.release_document_ocr_page(uuid,uuid,integer) TO service_role;
