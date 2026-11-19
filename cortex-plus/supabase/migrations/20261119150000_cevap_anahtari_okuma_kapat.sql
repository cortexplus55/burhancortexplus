-- YAZILDI, UYGULANMADI: Burhan onayıyla SQL ekranında uygulanır (kayıt satırıyla); docs/operasyon/goc-kayitlari.md.
--
-- 19 Kasım 2026 (Faz 2 denetimi): cevap anahtarı okuma açığı kapanır.
--
-- Neden: 6 Kasım göçü (20261106120000) tarayıcının YAZMASINI kapattı; OKUMA açık kaldı. Politikalar "satır benimse
-- okurum" diyor ve sütun sınırı yok. Açık anahtar tarayıcıda olduğu için oturum açmış öğrenci uygulamayı atlayıp
-- süren sınavının doğru cevabını doğrudan tablodan okuyabiliyordu (canlıda doğrulandı, 19 Kasım 2026:
-- practice_exam_questions.correct_answer, exam_prep_node_attempts.payload, quiz_questions.correct_answer ...).
--
-- Ne yapar: aşağıdaki tablolarda tarayıcı rollerinin (anon, authenticated) tablo düzeyi SELECT izni kalkar;
-- authenticated yalnız anahtar TAŞIMAYAN sütunları okuyabilir. Anahtar sütunlarını yalnız sunucu (service_role) okur;
-- sunucu sahipliği kendisi denetler ve süren sınavda anahtarı soyar. Sütun listesi kodla tek kaynaktan:
-- src/lib/security/answer-key-columns.ts (bekçi test ikisini karşılaştırır).
--
-- Yalnız izin kısma: satır silinmez, sütun düşmez, politika kaldırılmaz, veri değişmez. Tablo yoksa atlanır; sonradan
-- eklenen sütun kendiliğinden KAPALI doğar (açık liste). İki kez çalıştırmak zararsız.
--
-- YAYIN SIRASI: önce kod (anahtar sütunlarını artık yalnız sunucu anahtarıyla okuyor; kod göçten önce de sonra da
-- çalışır), sonra bu göç. Göç koddan önce uygulanırsa eski kod bu sütunları öğrenci oturumuyla okuyamaz ve sonuç /
-- inceleme / ders sayfaları boş açılır.
--
-- Geri alma: supabase/rollback/20261119_cevap_anahtari_okuma_geri_al.sql (tablo düzeyi SELECT'i geri verir).

DO $BODY$
DECLARE
  target record;
  open_columns text;
BEGIN
  FOR target IN
    SELECT *
      FROM (VALUES
        ('practice_exam_questions', ARRAY['correct_answer', 'correct_answers', 'explanation', 'model_answer', 'rubric']),
        ('quiz_questions', ARRAY['correct_answer', 'explanation']),
        ('exam_prep_node_attempts', ARRAY['payload']),
        ('exam_prep_intro_attempts', ARRAY['payload']),
        ('exam_prep_lessons', ARRAY['content_json', 'content_md']),
        ('exam_prep_podcasts', ARRAY['listening_check']),
        ('prep_duels', ARRAY['questions'])
      ) AS listed(table_name, hidden)
  LOOP
    IF to_regclass('public.' || quote_ident(target.table_name)) IS NULL THEN
      CONTINUE;
    END IF;

    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
      INTO open_columns
      FROM pg_attribute a
     WHERE a.attrelid = to_regclass('public.' || quote_ident(target.table_name))
       AND a.attnum > 0
       AND NOT a.attisdropped
       AND NOT (a.attname = ANY (target.hidden));

    EXECUTE format('REVOKE SELECT ON TABLE public.%I FROM anon, authenticated', target.table_name);
    IF open_columns IS NOT NULL THEN
      EXECUTE format('GRANT SELECT (%s) ON TABLE public.%I TO authenticated', open_columns, target.table_name);
    END IF;
  END LOOP;
END
$BODY$;
