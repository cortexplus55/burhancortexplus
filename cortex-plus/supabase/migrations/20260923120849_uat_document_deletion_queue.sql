-- Only explicit delete requests enter this queue; historical soft deletions
-- are not retroactively purged. Receipts survive removal of the document.
CREATE TABLE public.document_deletion_requests (
  document_id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  requested_at timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz,
  last_error text
);
ALTER TABLE public.document_deletion_requests ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.document_deletion_requests FROM anon, authenticated;
GRANT ALL ON public.document_deletion_requests TO service_role;
CREATE INDEX document_deletion_pending_idx ON public.document_deletion_requests(requested_at) WHERE processed_at IS NULL;

CREATE OR REPLACE FUNCTION public.soft_delete_document(p_user_id uuid, p_document_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp AS $$
BEGIN
  PERFORM 1 FROM public.documents WHERE id=p_document_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN
    RETURN EXISTS (SELECT 1 FROM public.document_deletion_requests WHERE document_id=p_document_id AND user_id=p_user_id);
  END IF;
  INSERT INTO public.document_deletion_requests(document_id,user_id) VALUES(p_document_id,p_user_id)
    ON CONFLICT (document_id) DO NOTHING;
  UPDATE public.documents SET deleted_at=coalesce(deleted_at,now()),updated_at=now()
    WHERE id=p_document_id AND user_id=p_user_id;
  -- The confirmation includes the study plan and its generated activities.
  DELETE FROM public.exam_preps WHERE document_id=p_document_id AND user_id=p_user_id;
  RETURN true;
END;
$$;
REVOKE ALL ON FUNCTION public.soft_delete_document(uuid,uuid) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.soft_delete_document(uuid,uuid) TO service_role;

-- Authenticated REST reads must not bypass the application's deleted filter.
CREATE POLICY document_not_deleted ON public.documents AS RESTRICTIVE FOR ALL TO authenticated
  USING (deleted_at IS NULL) WITH CHECK (deleted_at IS NULL);
-- Explicit deletion goes through the server's durable queue.
REVOKE DELETE ON public.documents FROM authenticated;
CREATE POLICY document_source_not_deleted ON public.document_chunks AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.documents d WHERE d.id=document_id AND d.deleted_at IS NULL))
  WITH CHECK (EXISTS(SELECT 1 FROM public.documents d WHERE d.id=document_id AND d.deleted_at IS NULL));
CREATE POLICY document_source_not_deleted ON public.document_pages AS RESTRICTIVE FOR ALL TO authenticated
  USING (EXISTS(SELECT 1 FROM public.documents d WHERE d.id=document_id AND d.deleted_at IS NULL))
  WITH CHECK (EXISTS(SELECT 1 FROM public.documents d WHERE d.id=document_id AND d.deleted_at IS NULL));
CREATE POLICY document_source_not_deleted ON storage.objects AS RESTRICTIVE FOR ALL TO authenticated
  USING (bucket_id <> 'documents' OR EXISTS(SELECT 1 FROM public.documents d WHERE d.storage_path=name AND d.user_id=auth.uid() AND d.deleted_at IS NULL))
  WITH CHECK (bucket_id <> 'documents' OR EXISTS(SELECT 1 FROM public.documents d WHERE d.storage_path=name AND d.user_id=auth.uid() AND d.deleted_at IS NULL));
