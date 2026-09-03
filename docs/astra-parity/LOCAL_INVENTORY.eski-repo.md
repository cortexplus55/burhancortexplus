# Cortex Plus — yerel envanter (Faz 0, 2026-09-03)

> ⚠️ **Bu dosya eski `burhan55600-pixel/cortex-plus` reposunu anlatır — canlı ürünü değil.**
> Canlı karşılaştırma için `DELTA-LIVE.md`.

Kaynak: `cortex-plus/src`, `cortex-plus/supabase/migrations`. Her "eksik" iddiası
bu dosyaya karşı doğrulanabilir olmalı.

## Rotalar — 66 sayfa
**Pazarlama/kamuya açık (17):** `/`, `/ozellikler`, `/fiyatlandirma`, `/paketler`,
`/sinav-hazirligi`, `/mobil-uygulama`, `/hakkimizda`, `/iletisim`, `/yardim`,
`/destek`, `/yaratici-program`, `/ogretmenler-ve-profesorler-icin`, `/gizlilik`,
`/kullanim-kosullari`, `/kvkk`, `/ogretmen`, `/veli`

**Auth (7):** `/giris`, `/kayit`, `/kayit/tamamla`, `/sifremi-unuttum`,
`/sifre-yenile`, `/email-dogrula`, `/auth/auth-code-error`

**Öğrenci app (16):** `/dashboard`, `/sohbetler`, `/soru-coz`, `/dokumanlar`,
`/quizler`, `/flashcardlar`, `/deneme-sinavlari`, `/calisma-plani`, `/ilerleme`,
`/uygulamalar`, `/uygulamalar/lab/[id]`, `/krediler`, `/odemeler`, `/profil`,
`/ayarlar`, `/bildirimler`

**Onboarding (3):** `/onboarding`, `/onboarding/ogretmen`, `/onboarding/veli`

**Öğretmen paneli (6):** `/ogretmen-paneli` + `/siniflar`, `/ogrenciler`,
`/odevler`, `/quizler`, `/raporlar`

**Veli (3):** `/veli`, `/veli/plus`, `/veli/sor`

**Admin (14):** `/admin` + kullanicilar, paketler, odemeler, kredi-kurallari,
promosyonlar, promptlar, ai-kullanimi, maliyetler, feature-flags, audit-log,
sistem, ogretmen-basvurulari

**Ödeme (2):** `/odeme/basarili`, `/odeme/basarisiz`

## API — 17 route
`ai/chat` (SSE streaming), `ai/solve-image`, `documents/upload`,
`documents/process`, `learning/quiz/generate`, `learning/flashcards/generate`,
`learning/exam/generate`, `learning/exam/grade`, `learning/study-plan/generate`,
`payments/paytr/create-token`, `payments/paytr/callback`, `schools/search`,
`streak`, `support`, `teacher/apply`, `teacher/bootstrap-class`, `auth/signout`

## Veritabanı — 55 tablo
profiles, user_roles, consent_records, feature_flags, audit_logs · plans,
subscriptions, credit_wallets, credit_rules, credit_ledger, credit_reservations,
payments, payment_webhook_events, refunds, promo_codes, promo_redemptions ·
conversations, messages, message_attachments, ai_usage_events, ai_model_prices,
prompt_versions · documents, document_pages, document_chunks,
document_embeddings, processing_jobs · subjects, topics, learning_goals,
study_plans, study_plan_tasks, user_progress, mastery_scores · quizzes,
quiz_questions, quiz_attempts, quiz_answers · flashcard_sets, flashcards,
flashcard_reviews · **exam_preps**, practice_exams, practice_exam_questions,
practice_exam_attempts, weak_topics · teacher_applications,
teacher_verifications, classrooms, classroom_members, assignments,
assignment_submissions · notifications, email_events, support_requests,
data_deletion_requests, parent_student_links, schools, user_streaks,
user_activity_days, parent_payment_requests

## Kredi aksiyon kodları (10)
AI_CHAT_STANDARD · AI_CHAT_ADVANCED · IMAGE_SOLUTION · DOCUMENT_PAGE_PROCESS ·
QUIZ_GENERATE · FLASHCARD_GENERATE · PRACTICE_EXAM_GENERATE ·
PRACTICE_EXAM_GRADE · STUDY_PLAN_GENERATE · EXPORT_PDF

## Doğrulanan teknik gerçekler
- AI sohbet **SSE streaming** ile çalışıyor (`api/ai/chat/route.ts:160-182`)
- Model yönlendirme: standard/advanced ikilisi (`lib/ai/model-router.ts`)
- PWA manifest var (`src/app/manifest.ts`), **native mobil uygulama yok**
- `exam_preps` tablosu var ama **UI'da hiç kullanılmıyor**; şeması yalnızca
  `user_id, exam_type, target_score` — materyal bağı, sınav tarihi,
  paylaşım/okul kapsamı **yok**
- Repoda hiç geçmeyen kavramlar: `podcast`, `voice`/`tts`/`realtime`,
  `share`/`paylas`, `oral`/`sozlu`, `odaklanma modu`
