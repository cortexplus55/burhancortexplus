-- Ödeme webhook'u cüzdanı select-then-update ile güncelliyordu: aynı cüzdana
-- gelen eşzamanlı iki yükleme birbirinin sonucunu ezebiliyordu. Kredi
-- akışının geri kalanı (credit_reserve/commit/refund) zaten satır kilidiyle
-- çalışıyor; yükleme de aynı desene geçiyor.
--
-- Idempotency, credit_ledger üzerindeki UNIQUE (user_id, idempotency_key)
-- kısıtına dayanır: aynı siparişin ikinci teslimi krediyi tekrar yüklemez.

CREATE OR REPLACE FUNCTION public.credit_topup(
  p_user_id uuid,
  p_amount integer,
  p_idempotency_key text,
  p_reference_id uuid DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
) RETURNS integer AS $$
DECLARE
  v_balance integer;
BEGIN
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'invalid_amount';
  END IF;

  -- Tekrar teslimde mevcut bakiyeyi döndür, ikinci kez yükleme yapma.
  SELECT w.balance INTO v_balance
  FROM public.credit_wallets w
  WHERE w.user_id = p_user_id
  FOR UPDATE;

  IF EXISTS (
    SELECT 1 FROM public.credit_ledger
    WHERE user_id = p_user_id AND idempotency_key = p_idempotency_key
  ) THEN
    RETURN COALESCE(v_balance, 0);
  END IF;

  INSERT INTO public.credit_wallets (user_id, balance, reserved)
  VALUES (p_user_id, 0, 0)
  ON CONFLICT (user_id) DO NOTHING;

  UPDATE public.credit_wallets
  SET balance = balance + p_amount,
      updated_at = now()
  WHERE user_id = p_user_id
  RETURNING balance INTO v_balance;

  INSERT INTO public.credit_ledger (
    user_id, delta, balance_after, entry_type, idempotency_key,
    reference_id, metadata
  )
  VALUES (
    p_user_id, p_amount, v_balance, 'purchase', p_idempotency_key,
    p_reference_id, p_metadata
  );

  RETURN v_balance;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, pg_temp;

-- Diğer kredi RPC'leriyle aynı sertleştirme: yalnızca service role çağırabilir.
REVOKE ALL ON FUNCTION public.credit_topup(uuid, integer, text, uuid, jsonb)
  FROM PUBLIC, anon, authenticated;
