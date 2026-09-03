-- ============================================================================
-- Kullanıcı üretimi mini uygulamalar
--
-- Astra'da "+ Uygulama oluştur" sohbetle çalışan bir üreteç:
--   "Fikrini anlat, ben de onu paylaşabileceğin küçük ve etkileşimli bir
--    uygulamaya dönüştüreyim: simülasyon, mini oyun, görselleştirme veya
--    bulmaca."
-- Üretilen uygulama mağazaya giriyor, puan ve oynanma alıyor.
--
-- Bizde o düğme bugüne kadar /quizler'e giden bir bağlantıydı; vaat ettiğini
-- yapmıyordu.
--
-- GÜVENLİK NOTU: `html` kolonu modelin ürettiği, başka kullanıcıların da
-- açabileceği bir belge. Uygulama sayfası bunu YALNIZCA
-- sandbox="allow-scripts" iframe içinde, srcdoc ile çalıştırır — allow-same-origin
-- VERİLMEZ. Böylece uygulama opak bir kaynakta çalışır; oturum çerezimize,
-- localStorage'ımıza ve DOM'umuza erişemez. Bu kısıt kalkarsa üretilen her
-- uygulama hesap ele geçirme yüzeyi hâline gelir.
--
-- Tamamen additive.
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.user_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  subject text,
  /** Modelin ürettiği tek dosyalık belge. */
  html text NOT NULL,
  /** Kullanıcının isteği — yeniden üretim ve kötüye kullanım incelemesi için. */
  prompt text,
  visibility text NOT NULL DEFAULT 'private',
  view_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.user_apps DROP CONSTRAINT IF EXISTS user_apps_visibility_check;
ALTER TABLE public.user_apps ADD CONSTRAINT user_apps_visibility_check
  CHECK (visibility IN ('private', 'school'));

-- Tek belge sınırı: kaçak bir üretim tabloyu şişirmesin.
ALTER TABLE public.user_apps DROP CONSTRAINT IF EXISTS user_apps_html_size_check;
ALTER TABLE public.user_apps ADD CONSTRAINT user_apps_html_size_check
  CHECK (length(html) BETWEEN 200 AND 200000);

CREATE INDEX IF NOT EXISTS user_apps_owner_idx
  ON public.user_apps (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS user_apps_shared_idx
  ON public.user_apps (view_count DESC) WHERE visibility = 'school';

ALTER TABLE public.user_apps ENABLE ROW LEVEL SECURITY;

-- Sahibi her şeyi yapar.
DROP POLICY IF EXISTS user_apps_owner ON public.user_apps;
CREATE POLICY user_apps_owner ON public.user_apps
  FOR ALL USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Okulla paylaşılanı aynı okuldakiler okur. Okulu olmayan kimseyi
-- kapsamasın diye school_id NULL kontrolü şart: aksi hâlde okulsuz iki
-- kullanıcı birbirinin uygulamasını görürdü.
DROP POLICY IF EXISTS user_apps_school_read ON public.user_apps;
CREATE POLICY user_apps_school_read ON public.user_apps
  FOR SELECT USING (
    visibility = 'school'
    AND EXISTS (
      SELECT 1
      FROM public.profiles me
      JOIN public.profiles owner ON owner.id = public.user_apps.user_id
      WHERE me.id = auth.uid()
        AND me.school_id IS NOT NULL
        AND me.school_id = owner.school_id
    )
  );

-- --- Üretim bedeli ----------------------------------------------------------

-- Gelişmiş modelle üretiliyor (tek dosyalık çalışan bir uygulama istemek
-- quiz üretmekten ağır), bedeli de ona göre.
INSERT INTO public.credit_rules (action_code, credit_cost, model_tier, description, active)
VALUES ('LAB_APP_GENERATE', 4, 'advanced', 'Mini uygulama üretimi', true)
ON CONFLICT (action_code) DO NOTHING;

-- --- Görüntülenme sayacı ----------------------------------------------------

CREATE OR REPLACE FUNCTION public.increment_user_app_view(p_app_id uuid)
RETURNS void
AS $BODY$
  UPDATE public.user_apps
     SET view_count = view_count + 1
   WHERE id = p_app_id
     AND user_id <> auth.uid();
$BODY$ LANGUAGE sql SECURITY DEFINER;

-- --- Okul akışı -------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.user_app_feed(p_limit integer DEFAULT 24)
RETURNS TABLE (
  id uuid,
  title text,
  description text,
  subject text,
  view_count integer,
  owner_name text,
  is_own boolean
)
AS $BODY$
  SELECT a.id, a.title, a.description, a.subject, a.view_count,
         COALESCE(NULLIF(split_part(COALESCE(p.full_name, ''), ' ', 1), ''), 'Öğrenci'),
         a.user_id = auth.uid()
  FROM public.user_apps a
  JOIN public.profiles p ON p.id = a.user_id
  WHERE a.visibility = 'school'
    AND p.school_id IS NOT NULL
    AND p.school_id = (SELECT me.school_id FROM public.profiles me WHERE me.id = auth.uid())
  ORDER BY a.view_count DESC, a.created_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100);
$BODY$ LANGUAGE sql STABLE SECURITY DEFINER;
