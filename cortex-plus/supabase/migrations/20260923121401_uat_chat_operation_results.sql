ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS citations jsonb NOT NULL DEFAULT '[]'::jsonb;
CREATE TABLE public.chat_operations (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  request_hash text NOT NULL,
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE CASCADE,
  message_id uuid REFERENCES public.messages(id) ON DELETE CASCADE,
  result jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.chat_operations ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.chat_operations FROM anon,authenticated;
GRANT ALL ON public.chat_operations TO service_role;
CREATE INDEX chat_operations_owner_idx ON public.chat_operations(user_id,created_at);

-- Saving the answer and settling the credit are one transaction. A lost HTTP
-- response can replay the saved result without another provider call or debit.
CREATE FUNCTION public.complete_chat_operation(
  p_user_id uuid, p_operation_id uuid, p_reservation_id uuid,
  p_user_message text, p_content text, p_citations jsonb,
  p_model text, p_charge boolean, p_tokens_in integer, p_tokens_out integer
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE op public.chat_operations%ROWTYPE; r public.credit_reservations%ROWTYPE;
  conv uuid; msg uuid; v_result jsonb;
BEGIN
  PERFORM 1 FROM public.profiles WHERE id=p_user_id AND deleted_at IS NULL FOR SHARE;
  IF NOT FOUND THEN RAISE EXCEPTION 'account_unavailable'; END IF;
  SELECT * INTO op FROM public.chat_operations WHERE id=p_operation_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'operation_not_found'; END IF;
  IF op.result IS NOT NULL THEN RETURN op.result; END IF;
  PERFORM 1 FROM public.credit_wallets WHERE user_id=p_user_id FOR UPDATE;
  SELECT * INTO r FROM public.credit_reservations WHERE id=p_reservation_id AND user_id=p_user_id FOR UPDATE;
  IF NOT FOUND OR r.status <> 'pending' OR r.execution_token IS NULL
     OR r.idempotency_key <> 'chat:' || p_operation_id::text
     OR r.action_code NOT IN ('AI_CHAT_STANDARD','AI_CHAT_ADVANCED') THEN
    RAISE EXCEPTION 'invalid_chat_reservation';
  END IF;
  IF jsonb_typeof(p_citations) <> 'array' OR EXISTS (
    SELECT 1 FROM jsonb_array_elements(p_citations) c
    WHERE NOT EXISTS(SELECT 1 FROM public.documents d WHERE d.id=(c->>'documentId')::uuid
      AND d.user_id=p_user_id AND d.deleted_at IS NULL)
  ) THEN RAISE EXCEPTION 'source_unavailable'; END IF;
  conv := op.conversation_id;
  IF conv IS NOT NULL THEN
    PERFORM 1 FROM public.conversations WHERE id=conv AND user_id=p_user_id AND deleted_at IS NULL FOR UPDATE;
    IF NOT FOUND THEN RAISE EXCEPTION 'conversation_unavailable'; END IF;
  ELSE
    INSERT INTO public.conversations(user_id,title) VALUES(p_user_id,left(p_user_message,60)) RETURNING id INTO conv;
  END IF;
  INSERT INTO public.messages(conversation_id,user_id,role,content)
    VALUES(conv,p_user_id,'user',p_user_message);
  INSERT INTO public.messages(conversation_id,user_id,role,content,model,tokens_in,tokens_out,citations)
    VALUES(conv,p_user_id,'assistant',p_content,p_model,p_tokens_in,p_tokens_out,p_citations) RETURNING id INTO msg;
  IF p_charge THEN PERFORM public.credit_commit(p_reservation_id);
  ELSE PERFORM public.credit_refund(p_reservation_id); END IF;
  UPDATE public.conversations SET updated_at=now() WHERE id=conv AND user_id=p_user_id;
  v_result := jsonb_build_object('content',p_content,'conversationId',conv,'messageId',msg,
    'creditsUsed',CASE WHEN p_charge THEN r.amount ELSE 0 END,'citations',p_citations,'model',p_model);
  UPDATE public.chat_operations SET conversation_id=conv,message_id=msg,result=v_result WHERE id=p_operation_id;
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.complete_chat_operation(uuid,uuid,uuid,text,text,jsonb,text,boolean,integer,integer) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.complete_chat_operation(uuid,uuid,uuid,text,text,jsonb,text,boolean,integer,integer) TO service_role;
