-- ai_model_prices tohumlaniyor.
--
-- Tablo ilk migration'da (20250825120000) kuruldu ama HICBIR migration ona
-- satir yazmadi. /admin/maliyetler gideri `ai_usage_events x ai_model_prices`
-- carpimindan buluyor; fiyat satiri olmayan her islem "fiyatsiz" sayilip
-- atlaniyordu, yani sayfa bugune kadar her zaman 0 gosterdi. Gelirin gideri
-- karsilayip karsilamadigi sorusuna cevap veremiyorduk.
--
-- BIRIM UYARISI. Kolon adlari jeton diyor; gercekte FATURALANAN BIRIM tutuluyor:
--   * metin modelleri  -> 1.000 jeton basina USD
--   * seslendirme      -> 1.000 KARAKTER basina USD   (TTS_SYNTHESIZE)
--   * cozumleme        -> 1.000 KILOBAYT basina USD   (STT_TRANSCRIBE)
-- ai_usage_events.tokens_in/out ayni birimle yaziliyor, bu yuzden sayfanin
-- aritmetigi degismedi.
--
-- BU SATIRLAR TAHMIN. Metin fiyatlari saglayicinin liste fiyati varsayimi;
-- ses satirlari ustune bir de birim cevrimi varsayimi tasiyor (dakika basi
-- fiyat / dakikadaki karakter-kilobayt). Gercek fatura goruldugunde
-- duzeltilecek tek yer burasi. Sayfa da kendini "tahmin, fatura degil"
-- diye etiketliyor.

INSERT INTO public.ai_model_prices (model, input_per_1k, output_per_1k) VALUES
  -- 1.000 jeton basina: $0,15 / $0,60 per 1M
  ('gpt-4o-mini',              0.000150, 0.000600),
  -- 1.000 jeton basina: $2,50 / $10,00 per 1M
  ('gpt-4o',                   0.002500, 0.010000),
  -- Gomme: $0,02 per 1M, cikti yok
  ('text-embedding-3-small',   0.000020, 0.000000),
  -- Seslendirme: ~$0,015/dakika, ~900 karakter/dakika -> 1.000 karakter $0,0167
  ('gpt-4o-mini-tts',          0.016667, 0.000000),
  -- Cozumleme: ~$0,003/dakika, ~180 KB/dakika -> 1.000 KB $0,0167
  ('gpt-4o-mini-transcribe',   0.016667, 0.000000)
ON CONFLICT (model) DO UPDATE
  SET input_per_1k  = EXCLUDED.input_per_1k,
      output_per_1k = EXCLUDED.output_per_1k,
      updated_at    = now();
