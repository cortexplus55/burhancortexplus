-- Zor soru yükseltmesine aylık tavan.
--
-- --------------------------------- NEDEN ---------------------------------
--
-- `model-router.ts` premium bir hesapta zor soruyu gpt-4o'ya çıkarıyor ama
-- KREDİYİ artırmıyor: `actionCode` `AI_CHAT_STANDARD` kalıyor, yani 1 kredi.
-- Bu bilerek böyle; modeli seçen taraf biz olduğumuza göre bedeli de bizim ve
-- öğrenci aynı görünen iki soruda farklı kredi harcadığını görmemeli.
--
-- Eksik olan, bu cömertliğin bir tavanı olmamasıydı. Zorluğu sunucu ölçüyor
-- (`assessQuestionDifficulty`), yani istemci "zor" diyemiyor — ama ölçüm
-- girdiyi okuyor: matematik gösterimi, çok parçalı soru, "neden" soruları
-- ve üçüncü turda hâlâ anlamamak zoru işaretliyor. Hep bu biçimde yazan bir
-- öğrencinin HER mesajı yükseliyor. Plus ayda 400 kredi veriyor; tavansız
-- hâlde bunların 400'ü de gpt-4o'ya gidebiliyordu.
--
-- -------------------------------- TAVAN ----------------------------------
--
-- Aylık 60. Bu, bir Plus ayının kredisinin %15'i: gerçekten takılan öğrenci
-- (günde ~2 zor soru) tavanı hiç görmüyor, her mesajı zor okunan hesap ise
-- 60'tan sonra standart modelde devam ediyor. Sayı `HARD_UPGRADE_MONTHLY_LIMIT`
-- olarak koddan geliyor ve `p_limit` ile buraya iniyor — tek yerde durması
-- için.
--
-- Tavan dolunca İSTEK REDDEDİLMİYOR. Öğrenci cevabını almaya devam ediyor,
-- yalnızca standart modelden. Reddetmek, ödediği krediyi alamadığı bir
-- duvar olurdu; burada kaybedilen şey öğrencinin ödemediği bir ikramdı.
--
-- Sayaç ayın başında sıfırlanıyor (takvim ayı). Abonelik dönemiyle
-- hizalamak daha doğru görünebilir ama o dönem haftalık da olabiliyor ve
-- yükseltme kredi değil, bizim maliyetimiz; takvim ayı hem okunur hem
-- faturamızla aynı ritimde.

CREATE TABLE IF NOT EXISTS public.model_upgrade_grants (
  user_id      uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  used         integer NOT NULL DEFAULT 0 CHECK (used >= 0),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Tablo istemciye tümüyle kapalı: RLS açık, politika YOK. Yalnız service role
-- giriyor. Öğrencinin bu sayacı okumasına da yazmasına da ihtiyacı yok.
ALTER TABLE public.model_upgrade_grants ENABLE ROW LEVEL SECURITY;

/*
  Tek turda hem sayıyor hem karar veriyor.

  Okuyup sonra yazan iki ayrı sorgu, yan yana gelen iki istekte tavanı
  aşardı. `INSERT ... ON CONFLICT DO UPDATE` satırı kilitliyor ve dönem
  sıfırlamasını da aynı ifadenin içinde yapıyor: dönem değiştiyse `used`
  1'den başlıyor.

  Dönüş `true` ise yükseltme hakkı verildi. Sayaç `p_limit + 1`'de duruyor:
  tavana dayanmış bir hesabın her mesajı sayacı sonsuza kadar şişirmesin, ama
  "tavanı geçti" ile "tam tavanda" da ayrılabilsin. Bu ayrım olmadan
  `used = p_limit` hem 60'ıncı hakkı veren hem de tavanı dolduran durum
  olurdu ve tavan hiç kapanmazdı.
*/
CREATE OR REPLACE FUNCTION public.claim_model_upgrade(
  p_user_id uuid,
  p_limit integer
)
RETURNS boolean AS $BODY$
DECLARE
  v_period date := date_trunc('month', now())::date;
  v_used integer;
BEGIN
  IF COALESCE(p_limit, 0) <= 0 THEN RETURN false; END IF;

  INSERT INTO public.model_upgrade_grants (user_id, period_start, used)
    VALUES (p_user_id, v_period, 1)
  ON CONFLICT (user_id) DO UPDATE
    SET used = CASE
          WHEN public.model_upgrade_grants.period_start <> v_period THEN 1
          ELSE LEAST(public.model_upgrade_grants.used + 1, p_limit + 1)
        END,
        period_start = v_period,
        updated_at = now()
  RETURNING used INTO v_used;

  RETURN v_used <= p_limit;
END;
$BODY$ LANGUAGE plpgsql SECURITY DEFINER;

ALTER FUNCTION public.claim_model_upgrade(uuid, integer) SET search_path = public, pg_temp;
REVOKE ALL ON FUNCTION public.claim_model_upgrade(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_model_upgrade(uuid, integer) TO service_role;
