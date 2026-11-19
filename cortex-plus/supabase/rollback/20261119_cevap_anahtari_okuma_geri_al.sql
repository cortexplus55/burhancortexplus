-- GÖÇ DEĞİL: 20261119150000_cevap_anahtari_okuma_kapat.sql'in geri alması. Yalnız Burhan'ın kararıyla, SQL ekranında.
--
-- Tablo düzeyi SELECT iznini tarayıcı rolüne (authenticated) geri verir; satır güvenliği politikaları zaten yerinde
-- olduğu için öğrenci yine yalnız kendi satırını görür. Geri alınca cevap anahtarı okuma açığı YENİDEN AÇILIR: yalnız
-- göçten sonra bir sayfa okuma izni yüzünden bozulursa ve kod düzeltmesi beklenemiyorsa kullanılır.

DO $BODY$
DECLARE
  table_name text;
BEGIN
  FOREACH table_name IN ARRAY ARRAY[
    'practice_exam_questions', 'quiz_questions', 'exam_prep_node_attempts', 'exam_prep_intro_attempts',
    'exam_prep_lessons', 'exam_prep_podcasts', 'prep_duels'
  ]
  LOOP
    IF to_regclass('public.' || quote_ident(table_name)) IS NOT NULL THEN
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO authenticated', table_name);
    END IF;
  END LOOP;
END
$BODY$;
