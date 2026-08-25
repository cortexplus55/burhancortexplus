# Cortex Plus — Gap analizi (P0 kilidi)

| Astra işlevi | guest/free/premium | Cortex gerekli? | Özgün çözüm | Öncelik | Bağımlılık | Risk | Kabul kriteri |
|--------------|-------------------|-----------------|-------------|---------|------------|------|---------------|
| Marketing + legal | guest | Evet | TR landing, `/gizlilik`, `/kvkk`, `/kullanim-kosullari` | P0 | — | Düşük | Tüm public route’lar 200 |
| Auth Google+email | guest→app | Evet | Supabase Auth + birleşik profil | P0 | Supabase | Orta | Giriş/kayıt/reset E2E |
| Onboarding | free | Evet | Çok adımlı wizard | P0 | profiles | Düşük | İlk giriş tamamlanır |
| AI öğretmen stream | free/premium | Evet | Responses API + router | P0 | OpenAI, credits | Yüksek maliyet | Stream + LaTeX |
| Kredi cüzdan | free | Evet | RPC reserve/commit/refund | P0 | Postgres | Yüksek | Idempotent ledger |
| Paywall | free | Evet | UpgradeSheet + returnPath | P0 | credits | Düşük | Limitte yönlendirme |
| PDF/RAG | premium | Evet | Storage + pgvector pipeline | P0 | Supabase | Orta | Kaynaklı cevap |
| Görsel çözüm | premium | Evet | gpt-4o + IMAGE_SOLUTION | P0 | OpenAI | Orta | JPG/PNG upload |
| Quiz/flashcard | free/premium | Evet | AI generate + persist | P0 | AI, DB | Orta | Liste + tekrar aç |
| Deneme sınavı | free/premium | Evet | Generate + grade | P0 | AI | Orta | Sonuç ekranı |
| Çalışma planı | free | Evet | plan + tasks | P0 | AI | Düşük | CRUD görevler |
| PayTR test | guest/free | Evet | iframe token + callback | P0 | PayTR | Orta | Hash + no double credit |
| Öğretmen başvuru | free | Evet | upload + admin onay | P0 | Storage, admin | Düşük | Rol atanır |
| Admin MVP | admin | Evet | users, rules, applications | P0 | RLS | Yüksek | Server-side guard |
| Öğretmen paneli | teacher | Evet | sınıf, ödev, quiz | P1 | M6 tables | Orta | Öğrenci AI gizli |
| PostHog/Sentry | all | Evet | env-gated init | P1 | env | Düşük | Preview’da event |
| EN çeviri | guest | Kısmi | next-intl keys | P1 | i18n | Düşük | TR default |
| Native app stores | guest | Hayır | PWA | P2 | — | — | not-applicable |

**P0 uygulama onayı:** Plan onayı ile kilitleildi; kodlama başlatıldı.
