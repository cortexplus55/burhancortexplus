-- Veli Plus: ödeyen veli, kota ve abonelik çocuğun hesabına yazılır.

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS beneficiary_user_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

UPDATE public.payments
SET beneficiary_user_id = user_id
WHERE beneficiary_user_id IS NULL;

ALTER TABLE public.payments
  ALTER COLUMN beneficiary_user_id SET NOT NULL;

CREATE INDEX IF NOT EXISTS payments_beneficiary_idx
  ON public.payments (beneficiary_user_id);

COMMENT ON COLUMN public.payments.beneficiary_user_id IS
  'Kredi ve abonelik bu hesaba tanınır. Veli ödemesinde çocuk; aksi halde ödeyen.';
