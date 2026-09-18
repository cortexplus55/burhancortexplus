-- Fotoğraf sayfası kotası.
--
-- --------------------------------- NEDEN ---------------------------------
--
-- Öğrenci belgesini fotoğraf olarak da yükleyebiliyor: `document-upload`,
-- `phone-upload`, sohbet ve deneme sihirbazı `image/jpeg`, `image/png`,
-- `image/webp` kabul ediyor. Ama `extract-text.ts` yalnızca PDF ve TXT
-- okuyordu, dolayısıyla yüklenen her fotoğraf işleme adımında
-- "Bu dosyadan metin çıkarılamadı" ile düşüyordu. Yükleme çalışıyor,
-- okuma hiç çalışmıyordu.
--
-- Fotoğrafı okumak artık görüntü modeliyle yapılıyor (`extract-image-text.ts`)
-- ve BİÇİM DÖNÜŞÜMÜ sayılıyor: PDF'in metin katmanını okumaktan farkı yok,
-- o yüzden ayrı bir eylem kodu ve ayrı bir kredi fiyatı yok — belge işleme
-- neyse o (`DOCUMENT_PAGE_PROCESS`).
--
-- ---------------------------- NEDEN AYRI KOTA ----------------------------
--
-- Kredi bu işi frenlemiyor. Bir belge 2 kredi; Plus'ın 400 kredisi 200 belge
-- eder ve bunların hepsi fotoğraf olabilir. Fotoğraf okumak bir PDF sayfası
-- okumaktan pahalı (görüntü modeli), ama asıl mesele maliyet değil: fotoğraf
-- tek tek çekilen bir şey, yüzlercesi bir öğrencinin çalışması değil.
--
-- Kotalar (ürün sahibi kararı, 18 Eylül 2026): ücretsiz 2, Plus 300,
-- Sigma 1000 — aylık. Ücretsiz taraf bilerek dar: iki fotoğraf ürünü
-- görmeye yeter, üçüncüsü abonelik konusudur. Sayılar `PHOTO_PAGE_LIMITS`
-- ile koddan geliyor ve `p_limit` ile buraya iniyor; tek yerde dursun.
--
-- Bir fotoğraf bir sayfa. (Taranmış PDF'ler — metin katmanı olmayanlar —
-- bu turda kapsam dışı: sayfaları görüntüye çevirmek ayrı bir bağımlılık
-- istiyor. Kota çok sayfalı belgeyi kaldıracak biçimde yazıldı ki o iş
-- geldiğinde burası değişmesin.)
--
-- OKUNAMAYAN FOTOĞRAF KOTA YAKMIYOR: hak önce alınıyor, okuma düşerse
-- geri veriliyor. Kredideki `reserve` / `refund` ile aynı mantık.

CREATE TABLE IF NOT EXISTS public.document_page_grants (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  used         integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- İstemciye kapalı: RLS açık, politika YOK. Yalnız service role giriyor.
ALTER TABLE public.document_page_grants ENABLE ROW LEVEL SECURITY;

/*
  Hak alma.

  Satır `FOR UPDATE` ile kilitleniyor — `credit_reserve` ile aynı desen.
  Okuyup sonra yazan kilitsiz iki sorgu, yan yana gelen iki yüklemede kotayı
  aşardı.

  Reddedilen istek sayacı ARTIRMIYOR. Bu, tek ifadelik bir `LEAST` ile
  yazılamıyordu: 2 hakkı kalan bir öğrenci 3 sayfa isteyip reddedilseydi,
  doyuran bir sayaç onun kalan 2 hakkını da yakardı.
*/
CREATE OR REPLACE FUNCTION public.claim_document_pages(
  p_user_id uuid,
  p_pages integer,
  p_limit integer
)
RETURNS boolean AS $BODY$
DECLARE
  v_period date := date_trunc('month', now())::date;
  v_row public.document_page_grants%ROWTYPE;
  v_used integer;
BEGIN
  IF COALESCE(p_pages, 0) <= 0 THEN RETURN true; END IF;
  IF COALESCE(p_limit, 0) <= 0 THEN RETURN false; END IF;

  INSERT INTO public.document_page_grants (user_id, period_start, used)
    VALUES (p_user_id, v_period, 0)
  ON CONFLICT (user_id) DO NOTHING;

  SELECT * INTO v_row FROM public.document_page_grants
    WHERE user_id = p_user_id FOR UPDATE;

  v_used := CASE WHEN v_row.period_start = v_period THEN v_row.used ELSE 0 END;

  IF v_used + p_pages > p_limit THEN
    -- Dönem sıfırlaması yine de yazılıyor; sayaç bayat kalmasın.
    UPDATE public.document_page_grants
       SET used = v_used, period_start = v_period, updated_at = now()
     WHERE user_id = p_user_id;
    RETURN false;
  END IF;

  UPDATE public.document_page_grants
     SET used = v_used + p_pages, period_start = v_period, updated_at = now()
   WHERE user_id = p_user_id;
  RETURN true;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

/*
  Hakkı geri verme — okuma düştüğünde.

  Yalnızca AYNI DÖNEM içinde geri veriyor. Ay dönmüşse alınan sayfa bu ayın
  sayacından düşmemeli; aksi hâlde geçen ayın başarısız denemesi bu ayın
  hakkını şişirirdi.
*/
CREATE OR REPLACE FUNCTION public.release_document_pages(
  p_user_id uuid,
  p_pages integer
)
RETURNS void AS $BODY$
DECLARE
  v_period date := date_trunc('month', now())::date;
BEGIN
  IF COALESCE(p_pages, 0) <= 0 THEN RETURN; END IF;

  UPDATE public.document_page_grants
     SET used = GREATEST(used - p_pages, 0), updated_at = now()
   WHERE user_id = p_user_id
     AND period_start = v_period;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.claim_document_pages(uuid, integer, integer) SET search_path = public, pg_temp;
ALTER FUNCTION public.release_document_pages(uuid, integer) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.claim_document_pages(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.release_document_pages(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_document_pages(uuid, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.release_document_pages(uuid, integer) TO service_role;
