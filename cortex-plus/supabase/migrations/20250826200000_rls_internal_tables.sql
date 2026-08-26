-- Dahili tablolar: RLS açık, yalnızca service role (backend) erişir.

ALTER TABLE public.payment_webhook_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.refunds ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.promo_codes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_model_prices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.prompt_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_events ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS payment_webhook_events_service ON public.payment_webhook_events;
CREATE POLICY payment_webhook_events_service ON public.payment_webhook_events
  FOR ALL USING (false);

DROP POLICY IF EXISTS refunds_service ON public.refunds;
CREATE POLICY refunds_service ON public.refunds
  FOR ALL USING (false);

DROP POLICY IF EXISTS promo_codes_service ON public.promo_codes;
CREATE POLICY promo_codes_service ON public.promo_codes
  FOR ALL USING (false);

DROP POLICY IF EXISTS ai_model_prices_read ON public.ai_model_prices;
CREATE POLICY ai_model_prices_read ON public.ai_model_prices
  FOR SELECT USING (true);

DROP POLICY IF EXISTS prompt_versions_service ON public.prompt_versions;
CREATE POLICY prompt_versions_service ON public.prompt_versions
  FOR ALL USING (false);

DROP POLICY IF EXISTS email_events_service ON public.email_events;
CREATE POLICY email_events_service ON public.email_events
  FOR ALL USING (false);
