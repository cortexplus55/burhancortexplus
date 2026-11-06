-- Eksik indeksler (6 Kasım 2026, hız paketi). Yalnız ekleme: hiçbir tablo, politika ya da indeks silinmez.
--
-- Sık süzülen (eq / in / order) ama başında bu sütun olan bir indeksi olmayan 25 sütun. Her satır
-- yazılmadan önce supabase/migrations'ta doğrulandı: tablo ve sütun var, başı bu sütun olan indeks
-- (CREATE INDEX, UNIQUE, PRIMARY KEY) yok. Bileşik indeksin İLK sütunu değilse (ör. ai_usage_events
-- (user_id, created_at), exam_prep_topic_mastery (user_id, exam_prep_id)) yalnız o sütunla süzen sorgu
-- onu kullanamıyordu.
--
-- Her indeks kendi DO bloğunda ve korumalı: tablo yoksa (to_regclass), sütun yoksa
-- (information_schema.columns) ya da canlıda başı bu sütun olan bir indeks zaten varsa (panelden
-- elle açılmış olabilir; pg_index.indkey[0]) atlanır; ad çakışmasında IF NOT EXISTS. Göç hiçbir
-- durumda düşmez.
--
-- Not: CONCURRENTLY kullanılmıyor (DO bloğu ve SQL ekranı işlem içinde çalışır); tablolar küçük,
-- kısa yazma kilidi kabul.

-- ai_usage_events (created_at)
DO $$
BEGIN
  IF to_regclass('public.ai_usage_events') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ai_usage_events' AND column_name = 'created_at'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.ai_usage_events') AND a.attname = 'created_at'
     )
  THEN
    CREATE INDEX IF NOT EXISTS ai_usage_events_created_at_idx ON public.ai_usage_events (created_at);
  END IF;
END $$;

-- exam_preps (user_id)
DO $$
BEGIN
  IF to_regclass('public.exam_preps') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'exam_preps' AND column_name = 'user_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.exam_preps') AND a.attname = 'user_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS exam_preps_user_id_idx ON public.exam_preps (user_id);
  END IF;
END $$;

-- practice_exams (user_id)
DO $$
BEGIN
  IF to_regclass('public.practice_exams') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'practice_exams' AND column_name = 'user_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.practice_exams') AND a.attname = 'user_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS practice_exams_user_id_idx ON public.practice_exams (user_id);
  END IF;
END $$;

-- practice_exams (exam_prep_id)
DO $$
BEGIN
  IF to_regclass('public.practice_exams') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'practice_exams' AND column_name = 'exam_prep_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.practice_exams') AND a.attname = 'exam_prep_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS practice_exams_exam_prep_id_idx ON public.practice_exams (exam_prep_id);
  END IF;
END $$;

-- practice_exam_questions (exam_id)
DO $$
BEGIN
  IF to_regclass('public.practice_exam_questions') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'practice_exam_questions' AND column_name = 'exam_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.practice_exam_questions') AND a.attname = 'exam_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS practice_exam_questions_exam_id_idx ON public.practice_exam_questions (exam_id);
  END IF;
END $$;

-- practice_exam_attempts (user_id)
DO $$
BEGIN
  IF to_regclass('public.practice_exam_attempts') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'practice_exam_attempts' AND column_name = 'user_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.practice_exam_attempts') AND a.attname = 'user_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS practice_exam_attempts_user_id_idx ON public.practice_exam_attempts (user_id);
  END IF;
END $$;

-- payments (user_id)
DO $$
BEGIN
  IF to_regclass('public.payments') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'payments' AND column_name = 'user_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.payments') AND a.attname = 'user_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS payments_user_id_idx ON public.payments (user_id);
  END IF;
END $$;

-- exam_prep_lessons (exam_prep_id)
DO $$
BEGIN
  IF to_regclass('public.exam_prep_lessons') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'exam_prep_lessons' AND column_name = 'exam_prep_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.exam_prep_lessons') AND a.attname = 'exam_prep_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS exam_prep_lessons_exam_prep_id_idx ON public.exam_prep_lessons (exam_prep_id);
  END IF;
END $$;

-- exam_prep_sessions (exam_prep_id)
DO $$
BEGIN
  IF to_regclass('public.exam_prep_sessions') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'exam_prep_sessions' AND column_name = 'exam_prep_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.exam_prep_sessions') AND a.attname = 'exam_prep_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS exam_prep_sessions_exam_prep_id_idx ON public.exam_prep_sessions (exam_prep_id);
  END IF;
END $$;

-- exam_prep_sessions (user_id)
DO $$
BEGIN
  IF to_regclass('public.exam_prep_sessions') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'exam_prep_sessions' AND column_name = 'user_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.exam_prep_sessions') AND a.attname = 'user_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS exam_prep_sessions_user_id_idx ON public.exam_prep_sessions (user_id);
  END IF;
END $$;

-- exam_prep_node_attempts (exam_prep_id)
DO $$
BEGIN
  IF to_regclass('public.exam_prep_node_attempts') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'exam_prep_node_attempts' AND column_name = 'exam_prep_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.exam_prep_node_attempts') AND a.attname = 'exam_prep_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS exam_prep_node_attempts_exam_prep_id_idx ON public.exam_prep_node_attempts (exam_prep_id);
  END IF;
END $$;

-- exam_prep_topic_mastery (exam_prep_id)
DO $$
BEGIN
  IF to_regclass('public.exam_prep_topic_mastery') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'exam_prep_topic_mastery' AND column_name = 'exam_prep_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.exam_prep_topic_mastery') AND a.attname = 'exam_prep_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS exam_prep_topic_mastery_exam_prep_id_idx ON public.exam_prep_topic_mastery (exam_prep_id);
  END IF;
END $$;

-- exam_prep_podcasts (user_id)
DO $$
BEGIN
  IF to_regclass('public.exam_prep_podcasts') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'exam_prep_podcasts' AND column_name = 'user_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.exam_prep_podcasts') AND a.attname = 'user_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS exam_prep_podcasts_user_id_idx ON public.exam_prep_podcasts (user_id);
  END IF;
END $$;

-- prep_videos (exam_prep_id)
DO $$
BEGIN
  IF to_regclass('public.prep_videos') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'prep_videos' AND column_name = 'exam_prep_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.prep_videos') AND a.attname = 'exam_prep_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS prep_videos_exam_prep_id_idx ON public.prep_videos (exam_prep_id);
  END IF;
END $$;

-- exam_prep_prefetch (exam_prep_id)
DO $$
BEGIN
  IF to_regclass('public.exam_prep_prefetch') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'exam_prep_prefetch' AND column_name = 'exam_prep_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.exam_prep_prefetch') AND a.attname = 'exam_prep_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS exam_prep_prefetch_exam_prep_id_idx ON public.exam_prep_prefetch (exam_prep_id);
  END IF;
END $$;

-- exam_prep_review_answers (user_id)
DO $$
BEGIN
  IF to_regclass('public.exam_prep_review_answers') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'exam_prep_review_answers' AND column_name = 'user_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.exam_prep_review_answers') AND a.attname = 'user_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS exam_prep_review_answers_user_id_idx ON public.exam_prep_review_answers (user_id);
  END IF;
END $$;

-- document_chunks (page_id)
DO $$
BEGIN
  IF to_regclass('public.document_chunks') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'document_chunks' AND column_name = 'page_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.document_chunks') AND a.attname = 'page_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS document_chunks_page_id_idx ON public.document_chunks (page_id);
  END IF;
END $$;

-- notifications (user_id)
DO $$
BEGIN
  IF to_regclass('public.notifications') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'notifications' AND column_name = 'user_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.notifications') AND a.attname = 'user_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS notifications_user_id_idx ON public.notifications (user_id);
  END IF;
END $$;

-- quizzes (user_id)
DO $$
BEGIN
  IF to_regclass('public.quizzes') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'quizzes' AND column_name = 'user_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.quizzes') AND a.attname = 'user_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS quizzes_user_id_idx ON public.quizzes (user_id);
  END IF;
END $$;

-- quiz_questions (quiz_id)
DO $$
BEGIN
  IF to_regclass('public.quiz_questions') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'quiz_questions' AND column_name = 'quiz_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.quiz_questions') AND a.attname = 'quiz_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS quiz_questions_quiz_id_idx ON public.quiz_questions (quiz_id);
  END IF;
END $$;

-- flashcards (set_id)
DO $$
BEGIN
  IF to_regclass('public.flashcards') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'flashcards' AND column_name = 'set_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.flashcards') AND a.attname = 'set_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS flashcards_set_id_idx ON public.flashcards (set_id);
  END IF;
END $$;

-- prep_duels (creator_id)
DO $$
BEGIN
  IF to_regclass('public.prep_duels') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'prep_duels' AND column_name = 'creator_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.prep_duels') AND a.attname = 'creator_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS prep_duels_creator_id_idx ON public.prep_duels (creator_id);
  END IF;
END $$;

-- prep_duel_runs (player_id)
DO $$
BEGIN
  IF to_regclass('public.prep_duel_runs') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'prep_duel_runs' AND column_name = 'player_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.prep_duel_runs') AND a.attname = 'player_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS prep_duel_runs_player_id_idx ON public.prep_duel_runs (player_id);
  END IF;
END $$;

-- lesson_quality_samples (user_id)
DO $$
BEGIN
  IF to_regclass('public.lesson_quality_samples') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'lesson_quality_samples' AND column_name = 'user_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.lesson_quality_samples') AND a.attname = 'user_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS lesson_quality_samples_user_id_idx ON public.lesson_quality_samples (user_id);
  END IF;
END $$;

-- open_timings (user_id)
DO $$
BEGIN
  IF to_regclass('public.open_timings') IS NOT NULL
     AND EXISTS (
       SELECT 1 FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'open_timings' AND column_name = 'user_id'
     )
     AND NOT EXISTS (
       SELECT 1
       FROM pg_index i
       JOIN pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = i.indkey[0]
       WHERE i.indrelid = to_regclass('public.open_timings') AND a.attname = 'user_id'
     )
  THEN
    CREATE INDEX IF NOT EXISTS open_timings_user_id_idx ON public.open_timings (user_id);
  END IF;
END $$;
