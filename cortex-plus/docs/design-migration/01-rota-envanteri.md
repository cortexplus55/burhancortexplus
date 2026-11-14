# 01 · Rota envanteri

Üretim: `node scripts/design/route-inventory.mjs --json docs/design-migration/data/rotalar.json` + `node scripts/design/route-doc.mjs` (yalnız okur).
Kaynak: `src/app` ağacı, `src/lib/supabase/middleware.ts` (`PROTECTED_PREFIXES`), üst klasörlerdeki `layout.tsx`.

## Özet
- Gerçek sayfa: **131** (ayrıca 24 test fikstürü `/e2e/*`, yalnız `E2E_FIXTURE=1` iken açılır). API ucu: **148**.
- Girişli sayfa: 90 · herkese açık: 41.
- Öğrenci kabuğunu çizen (kapsülde plan görünür): 62.
- İçeriği plan okuyan (sezgi, aşağıda): 29. Tam liste 03'te.
- Ürün sahibinin 35 rotalık listesi: 39 adres (araç alt sayfaları tek tek), depoda karşılığı olmayan: **0**.

## Sütunlar nasıl çıkarıldı
- **Giriş**: `sayfa kapısı` = sayfa ya da üst `layout.tsx` `requireStudentArea` / `requireUser` / `requireAdminPage` / `requireFounderPage` çağırıyor; `middleware` = yalnız ara katmanın korumalı önekleri (24 önek); `herkese açık` = ikisi de yok. Misafir /admin'de 404 alır (`GUEST_NOT_FOUND_PREFIXES`).
- **Plan**: `içerik` = sayfa dosyası ya da doğrudan içe aktardığı yerel dosyalardan biri plan okuyan bir ad taşıyor (`isPremium`, `showsUpgradeChrome`, `planIdentity`, `entitlements`, `freeLessonGate`, `pathSkipKinds` …). Kabuğun kendisi ve veri yükleyicileri (`sor-shell`, `app-shell`, `parity-shell-props`, `account-context`) sayılmaz; onlar `yalnız kabuk` sütunundadır. Tek kat: daha derindeki okumalar 03'teki taramada.
- **Bileşenler**: sayfa dosyasının `@/components/*` ve yerel içe aktarımları.
- ⚑ = ürün sahibinin 35 rotalık listesinde yok (aşağıdaki not).

## /siniflar, /takvimim, /krediler ⚑ (listede yok)
- `/siniflar` ve `/siniflar/:id`: **Çalışma grupları** (öğrenci grup kurar ya da kodla katılır; öğretmen paneli değil). Kütüphane'den açılır.
- `/takvimim`: **Takvimim** (ay görünümü, yaklaşan sınavlar, etkinlik ekle). Profil panelinin karosundan açılır.
- `/krediler`: **Kullanım limitleri**. Plan okuyor (03'te satırları var): kurucuda `FounderCreditsView` (kredi sınırı yok, maliyet takibi); Plus/Sigma'da dönem kotası (aylık 7.200 / haftalık 2.700 / Sigma 60.000 kredi, yüzde olarak), "Ek paket al" (`/pay`); ücretsizde günlük sayaçlar (günde 3 mesaj, 1 fotoğraf), ilk dersin durumu (`firstLessonStatus`), cüzdan bakiyesi ("Ek hakkın: yaklaşık N ders"; davet hediyesi, eski ek paket ya da promosyon). **Kredi/hediye/ödül mekanizması var**: davet kartı (`ReferralRewardCard`: doğrulanmış davetli ilk işinde iki tarafa bir kez 90 kredi = 3 ders, davet eden en çok 3 davet) ve cüzdan bakiyesi. Profil panelinin listesinden açılır.

## Senin gezmediklerin
- `/mobil-uygulama`: oturum açık öğrenciye uygulama kabuğu, misafire pazarlama sayfası (`loadOptionalStudentShell`). `/yardim` aynı.
- Giriş ve kayıt: `/giris` (istemci), `/kayit`, `/kayit/tamamla`, `/sifremi-unuttum`, `/sifre-yenile`, `/email-dogrula`, `/onboarding`, `/auth/auth-code-error`.
- Çalışma grupları: `/siniflar`, `/siniflar/:id` (yukarıda).
- `/d/*`: **depoda yok** (`src/app/d` klasörü yok).
- 404: `src/app/not-found.tsx`. 500: `src/app/error.tsx` (sayfa hatası), `src/app/global-error.tsx` (kök yerleşim hatası).
- E-posta şablonları (HTML, sayfa değil): `src/lib/email/templates.ts` (hatırlatma, doğrulama, şifre), `lifecycle-templates.ts` (hoş geldin, satın alma, deneme), `plan-notice-mails.ts` (dönem bitişi), `campaign.ts` (toplu), `daily-mails.ts` (davet), `brand-header.ts` (ortak başlık).
- PDF: **PDF üreten şablon yok**. Sözleşme örneği HTML sayfası (`/odemeler/sozlesme/:siparis`); sınav sabahı kâğıdı tarayıcının yazdırmasıyla; `pdf-split-client.ts` yalnız yüklenen PDF'i böler.

## Öğrenci uygulaması (35 rotalık listede olanlar) (33)

| Rota | Dosya | Sunucu/istemci | Giriş | Plan | Parametre | Bileşenler (ilk 4) |
|---|---|---|---|---|---|---|
| `/araclar` | `src/app/araclar/page.tsx` | sunucu | sayfa kapısı | içerik (1 dosya) | — | parity/sor-shell, parity/tools-hub |
| `/araclar/:id` | `src/app/araclar/[id]/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | id | parity/sor-shell, lab/tools/birim-cember, lab/tools/birim-donusturucu, lab/tools/denklem-cozucu +4 |
| `/ayarlar` | `src/app/ayarlar/page.tsx` | sunucu | sayfa kapısı | içerik (2 dosya) | — | layout/app-shell, profile/data-deletion-button, legal/cookie-banner, profile/email-change-card +4 |
| `/davet` | `src/app/davet/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | parity/page-shell, parity/sor-shell, parity/invite-share, parity/referral-reward-card |
| `/deneme-sinavlari` | `src/app/deneme-sinavlari/page.tsx` | sunucu | sayfa kapısı | içerik (3 dosya) | — | parity/exam-prep, parity/sor-shell |
| `/deneme-sinavlari/:prepId` | `src/app/deneme-sinavlari/[prepId]/page.tsx` | sunucu | sayfa kapısı | içerik (7 dosya) | prepId | parity/sor-shell, level-check/unit-level-check, level-check/mastery-map, parity/exam-prep-home +1 |
| `/deneme-sinavlari/:prepId/dugum/:nodeId` | `src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx` | sunucu | sayfa kapısı | içerik (4 dosya) | prepId, nodeId | parity/sor-shell, parity/exam-node-session, parity/first-topic-lock |
| `/deneme-sinavlari/ara` | `src/app/deneme-sinavlari/ara/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | parity/sor-shell, parity/prep-search-view |
| `/deneme-sinavlari/hazirliklarim` | `src/app/deneme-sinavlari/hazirliklarim/page.tsx` | sunucu | sayfa kapısı | içerik (3 dosya) | — | parity/sor-shell, parity/my-preps-view |
| `/deneme-sinavlari/mufredat` | `src/app/deneme-sinavlari/mufredat/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | parity/sor-shell, parity/exam-catalog-pages |
| `/deneme-sinavlari/okulum` | `src/app/deneme-sinavlari/okulum/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | parity/sor-shell, parity/exam-catalog-pages |
| `/deneme-sinavlari/olustur` | `src/app/deneme-sinavlari/olustur/page.tsx` | sunucu | sayfa kapısı | içerik (1 dosya) | — | parity/sor-shell, parity/exam-create-entry |
| `/deneme-sinavlari/resmi` | `src/app/deneme-sinavlari/resmi/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | parity/sor-shell, parity/exam-catalog-pages |
| `/dokumanlar` | `src/app/dokumanlar/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | layout/app-shell, documents/document-retry-button, documents/document-delete-button, documents/document-status-poller +1 |
| `/dokumanlar/:documentId` | `src/app/dokumanlar/[documentId]/page.tsx` | sunucu | sayfa kapısı | içerik (2 dosya) | documentId | parity/sor-shell, documents/topic-map-editor, documents/document-delete-button, documents/document-retry-button +3 |
| `/flashcardlar` | `src/app/flashcardlar/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | layout/app-shell, learning/learning-generate-panels, learning/flashcard-deck, ui-kit/empty-state |
| `/gunluk` | `src/app/gunluk/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | parity/sor-shell, parity/page-shell, parity/daily-drill-view |
| `/ilerleme` | `src/app/ilerleme/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | parity/page-shell, parity/sor-shell, ui-kit/empty-state, student/topic-bars +7 |
| `/ogretmen` | `src/app/ogretmen/page.tsx` | sunucu | sayfa kapısı | içerik (6 dosya) | — | chat/chat-panel, parity/sor-shell, parity/app-utils, parity/first-step-launcher +2 |
| `/pay` | `src/app/pay/page.tsx` | sunucu | sayfa kapısı | içerik (3 dosya) | — | layout/app-shell, parity/subscription-cards, billing/promo-redeem, marketing/plus-month +1 |
| `/profil` | `src/app/profil/page.tsx` | sunucu | sayfa kapısı | içerik (2 dosya) | — | parity/page-shell, parity/sor-shell, parity/profile-identity, parity/app-utils |
| `/quizler` | `src/app/quizler/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | layout/app-shell, learning/learning-generate-panels, learning/quiz-runner, ui-kit/empty-state |
| `/sohbetler` | `src/app/sohbetler/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | parity/sor-shell, parity/sohbetler-list |
| `/soru-coz` | `src/app/soru-coz/page.tsx` | sunucu | sayfa kapısı | içerik (1 dosya) | — | layout/app-shell, learning/question-solver, learning/solver-hero |
| `/studio/anlat` | `src/app/studio/anlat/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | learning/studio/explain-studio |
| `/studio/dogru-yanlis` | `src/app/studio/dogru-yanlis/page.tsx` | sunucu | sayfa kapısı | içerik (1 dosya) | — | learning/studio/true-false-studio |
| `/studio/flashcard` | `src/app/studio/flashcard/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | learning/studio/flashcard-studio |
| `/studio/podcast` | `src/app/studio/podcast/page.tsx` | sunucu | sayfa kapısı | içerik (1 dosya) | — | learning/studio/podcast-studio |
| `/studio/quiz` | `src/app/studio/quiz/page.tsx` | sunucu | sayfa kapısı | içerik (1 dosya) | — | learning/studio/quiz-studio |
| `/studio/sozlu` | `src/app/studio/sozlu/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | learning/studio/oral-studio |
| `/studio/yazili` | `src/app/studio/yazili/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | learning/studio/written-studio |
| `/yanlislarim` | `src/app/yanlislarim/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | parity/sor-shell, parity/mistake-notebook-view |
| `/yardim` | `src/app/yardim/page.tsx` | sunucu | herkese açık | içerik (2 dosya) | — | layout/marketing-page, parity/page-shell, parity/sor-shell |

## Öğrenci uygulaması (listede olmayanlar) (32)

| Rota | Dosya | Sunucu/istemci | Giriş | Plan | Parametre | Bileşenler (ilk 4) |
|---|---|---|---|---|---|---|
| `/bildirimler` | `src/app/bildirimler/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | layout/app-shell, ui-kit/empty-state, notifications/notification-item |
| `/deneme-sinavlari/:prepId/calis` | `src/app/deneme-sinavlari/[prepId]/calis/page.tsx` | sunucu | middleware | — | prepId | — |
| `/deneme-sinavlari/:prepId/degerlendirme` | `src/app/deneme-sinavlari/[prepId]/degerlendirme/page.tsx` | sunucu | sayfa kapısı | içerik (3 dosya) | prepId | parity/sor-shell, parity/exam-prep-assessment |
| `/deneme-sinavlari/:prepId/deneme/:examId` | `src/app/deneme-sinavlari/[prepId]/deneme/[examId]/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | prepId, examId | parity/sor-shell, parity/exam-runner, parity/paper-exam-runner |
| `/deneme-sinavlari/:prepId/deneme/:examId/incele` | `src/app/deneme-sinavlari/[prepId]/deneme/[examId]/incele/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | prepId, examId | parity/sor-shell, parity/exam-question-review-client |
| `/deneme-sinavlari/:prepId/deneme/kurulum` | `src/app/deneme-sinavlari/[prepId]/deneme/kurulum/page.tsx` | sunucu | sayfa kapısı | içerik (4 dosya) | prepId | parity/sor-shell, parity/mock-exam-setup |
| `/deneme-sinavlari/:prepId/ders/:lessonId` | `src/app/deneme-sinavlari/[prepId]/ders/[lessonId]/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | prepId, lessonId | parity/exam-lesson-body, parity/exam-lesson-toolbar, parity/exam-lesson-steps, parity/sor-shell |
| `/deneme-sinavlari/:prepId/duello` | `src/app/deneme-sinavlari/[prepId]/duello/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | prepId | parity/sor-shell, duel/new-duel-button |
| `/deneme-sinavlari/:prepId/dugum/:nodeId/sonuc` | `src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/sonuc/page.tsx` | sunucu | sayfa kapısı | içerik (2 dosya) | prepId, nodeId | parity/lesson-rating-card, parity/level-suggest-card, parity/sor-shell |
| `/deneme-sinavlari/:prepId/konu` | `src/app/deneme-sinavlari/[prepId]/konu/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | prepId | parity/sor-shell, parity/exam-topic-pick |
| `/deneme-sinavlari/:prepId/oturum` | `src/app/deneme-sinavlari/[prepId]/oturum/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | prepId | parity/sor-shell, parity/adaptive-study-session |
| `/deneme-sinavlari/:prepId/podcast` | `src/app/deneme-sinavlari/[prepId]/podcast/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | prepId | parity/sor-shell, parity/prep-podcast-session, parity/prep-studio-entry |
| `/deneme-sinavlari/:prepId/sinav-sabahi` | `src/app/deneme-sinavlari/[prepId]/sinav-sabahi/page.tsx` | sunucu | sayfa kapısı | içerik (3 dosya) | prepId | parity/sor-shell, parity/cram-sheet-view, parity/plus-only-gate |
| `/deneme-sinavlari/:prepId/sohbet` | `src/app/deneme-sinavlari/[prepId]/sohbet/page.tsx` | sunucu | sayfa kapısı | içerik (5 dosya) | prepId | chat/chat-panel, parity/sor-shell, parity/app-utils |
| `/deneme-sinavlari/:prepId/sonuc` | `src/app/deneme-sinavlari/[prepId]/sonuc/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | prepId | parity/sor-shell |
| `/deneme-sinavlari/:prepId/tanisma` | `src/app/deneme-sinavlari/[prepId]/tanisma/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | prepId | parity/sor-shell, parity/exam-intro-quiz |
| `/deneme-sinavlari/:prepId/tekrar` | `src/app/deneme-sinavlari/[prepId]/tekrar/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | prepId | parity/sor-shell, parity/prep-review-session |
| `/deneme-sinavlari/:prepId/tekrarlar` | `src/app/deneme-sinavlari/[prepId]/tekrarlar/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | prepId | parity/sor-shell, parity/exam-prep-reviews |
| `/deneme-sinavlari/:prepId/video` | `src/app/deneme-sinavlari/[prepId]/video/page.tsx` | sunucu | sayfa kapısı | içerik (4 dosya) | prepId | parity/sor-shell, parity/video-lesson |
| `/deneme-sinavlari/:prepId/zor-sorular` | `src/app/deneme-sinavlari/[prepId]/zor-sorular/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | prepId | parity/challenge-set-play, parity/sor-shell |
| `/deneme-sinavlari/resmi/kurulum` | `src/app/deneme-sinavlari/resmi/kurulum/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | parity/sor-shell, parity/official-setup-flow |
| `/destek` | `src/app/destek/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | layout/app-shell, ui-kit/empty-state, support/support-form |
| `/krediler` ⚑ | `src/app/krediler/page.tsx` | sunucu | sayfa kapısı | içerik (8 dosya) | — | parity/page-shell, parity/sor-shell, ui-kit/empty-state, parity/referral-reward-card +1 |
| `/odemeler` | `src/app/odemeler/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | layout/app-shell, ui-kit/empty-state, ui/badge, billing/subscription-card |
| `/odemeler/sozlesme/:siparis` | `src/app/odemeler/sozlesme/[siparis]/page.tsx` | sunucu | sayfa kapısı | — | siparis | layout/legal-document |
| `/onboarding` | `src/app/onboarding/page.tsx` | istemci | middleware | — | — | ui/label, layout/onboarding-shell, parity/marketing |
| `/profil/duzenle` | `src/app/profil/duzenle/page.tsx` | sunucu, yönlendirme | middleware | — | — | — |
| `/siniflar` ⚑ | `src/app/siniflar/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | parity/page-shell, parity/sor-shell, student/create-class-form, student/join-class-form |
| `/siniflar/:id` | `src/app/siniflar/[id]/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | id | parity/classroom-discussion, parity/classroom-share-prep, parity/class-invite, parity/sor-shell |
| `/takvimim` ⚑ | `src/app/takvimim/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | parity/sor-shell, parity/calendar-view |
| `/tasarim` | `src/app/tasarim/page.tsx` | sunucu | sayfa kapısı | — | — | ui/button, ui/icon-button, ui/badge, ui/card +9 |
| `/tekrar` | `src/app/tekrar/page.tsx` | sunucu | sayfa kapısı | yalnız kabuk | — | parity/sor-shell, learning/review-deck-session |

## Herkese açık (pazarlama, hukuk, giriş, kayıt, ödeme dönüşü) (40)

| Rota | Dosya | Sunucu/istemci | Giriş | Plan | Parametre | Bileşenler (ilk 4) |
|---|---|---|---|---|---|---|
| `/` | `src/app/page.tsx` | sunucu | herkese açık | — | — | parity/marketing, landing/landing-page |
| `/auth/auth-code-error` | `src/app/auth/auth-code-error/page.tsx` | sunucu | herkese açık | — | — | layout/marketing-page, marketing/result-card |
| `/cerez-politikasi` | `src/app/cerez-politikasi/page.tsx` | sunucu | herkese açık | — | — | layout/legal-document, legal/cookie-banner |
| `/duello/:code` | `src/app/duello/[code]/page.tsx` | sunucu | herkese açık | — | code | duel/duel-play |
| `/email-dogrula` | `src/app/email-dogrula/page.tsx` | istemci | herkese açık | — | — | layout/marketing-page, ui/button |
| `/eposta/abonelik` | `src/app/eposta/abonelik/page.tsx` | sunucu | herkese açık | — | — | layout/marketing-page, ./unsubscribe-button |
| `/fiyatlandirma` | `src/app/fiyatlandirma/page.tsx` | sunucu | herkese açık | — | — | parity/marketing, marketing/advantage-sections, parity/subscription-cards |
| `/giris` | `src/app/giris/page.tsx` | istemci | herkese açık | — | — | ./giris-inner |
| `/gizlilik` | `src/app/gizlilik/page.tsx` | sunucu | herkese açık | — | — | layout/legal-document |
| `/hakkimizda` | `src/app/hakkimizda/page.tsx` | sunucu | herkese açık | — | — | layout/marketing-page |
| `/hazirlik-davet/:token` | `src/app/hazirlik-davet/[token]/page.tsx` | sunucu | herkese açık | yalnız kabuk | token | parity/sor-shell, parity/prep-invite-join-button |
| `/hizli-tarama` | `src/app/hizli-tarama/page.tsx` | sunucu | herkese açık | — | — | level-check/guest-quick-scan |
| `/iletisim` | `src/app/iletisim/page.tsx` | sunucu | herkese açık | — | — | layout/marketing-page, layout/seller-warning |
| `/iptal-iade` | `src/app/iptal-iade/page.tsx` | sunucu | herkese açık | — | — | layout/legal-document, layout/seller-warning |
| `/kayit` | `src/app/kayit/page.tsx` | sunucu | herkese açık | — | — | ./signup-wizard |
| `/kayit/tamamla` | `src/app/kayit/tamamla/page.tsx` | sunucu | herkese açık | — | — | ./finalizer |
| `/kullanim-kosullari` | `src/app/kullanim-kosullari/page.tsx` | sunucu | herkese açık | — | — | layout/legal-document |
| `/kunye` | `src/app/kunye/page.tsx` | sunucu | herkese açık | — | — | layout/marketing-page, layout/seller-warning |
| `/kvkk` | `src/app/kvkk/page.tsx` | sunucu | herkese açık | — | — | layout/legal-document |
| `/mesafeli-satis` | `src/app/mesafeli-satis/page.tsx` | sunucu | herkese açık | — | — | layout/legal-document, layout/seller-warning |
| `/mobil-uygulama` | `src/app/mobil-uygulama/page.tsx` | sunucu | herkese açık | yalnız kabuk | — | layout/marketing-page, pwa/install-app, parity/page-shell, parity/sor-shell |
| `/mufredat` | `src/app/mufredat/page.tsx` | sunucu | herkese açık | — | — | layout/marketing-page |
| `/mufredat/:programId` | `src/app/mufredat/[programId]/page.tsx` | sunucu | herkese açık | — | programId | layout/marketing-page, curriculum/official-links, ui/external-anchor |
| `/mufredat/:programId/:unitId` | `src/app/mufredat/[programId]/[unitId]/page.tsx` | sunucu | herkese açık | — | programId, unitId | layout/marketing-page |
| `/mufredat/:programId/:unitId/:outcomeId` | `src/app/mufredat/[programId]/[unitId]/[outcomeId]/page.tsx` | sunucu | herkese açık | — | programId, unitId, outcomeId | layout/marketing-page |
| `/odeme/basarili` | `src/app/odeme/basarili/page.tsx` | sunucu | herkese açık | — | — | parity/marketing, billing/payment-activation |
| `/odeme/basarisiz` | `src/app/odeme/basarisiz/page.tsx` | sunucu | herkese açık | — | — | layout/marketing-page, marketing/result-card |
| `/odeme/veli/:token` | `src/app/odeme/veli/[token]/page.tsx` | sunucu | herkese açık | — | token | layout/marketing-page, marketing/result-card, billing/parent-pay-form |
| `/odeme/veli/basarisiz` | `src/app/odeme/veli/basarisiz/page.tsx` | sunucu | herkese açık | — | — | layout/marketing-page, marketing/result-card |
| `/odeme/veli/tesekkurler` | `src/app/odeme/veli/tesekkurler/page.tsx` | sunucu | herkese açık | — | — | layout/marketing-page, marketing/result-card |
| `/ogretmenler-ve-profesorler-icin` | `src/app/ogretmenler-ve-profesorler-icin/page.tsx` | sunucu, yönlendirme | herkese açık | — | — | — |
| `/on-bilgilendirme` | `src/app/on-bilgilendirme/page.tsx` | sunucu | herkese açık | — | — | layout/legal-document, layout/seller-warning |
| `/ornek` | `src/app/ornek/page.tsx` | sunucu | herkese açık | — | — | demo/demo-walkthrough, marketing/advantage-sections, parity/marketing |
| `/ozellikler` | `src/app/ozellikler/page.tsx` | sunucu | herkese açık | içerik (1 dosya) | — | marketing/advantage-sections, parity/marketing, ui/icon-3d |
| `/resmi` | `src/app/resmi/page.tsx` | sunucu | herkese açık | — | — | layout/marketing-page, ui/external-anchor |
| `/sifre-yenile` | `src/app/sifre-yenile/page.tsx` | istemci | herkese açık | — | — | layout/premium-auth-shell |
| `/sifremi-unuttum` | `src/app/sifremi-unuttum/page.tsx` | istemci | herkese açık | — | — | layout/premium-auth-shell |
| `/sinav-hazirligi` | `src/app/sinav-hazirligi/page.tsx` | sunucu | herkese açık | — | — | parity/marketing, ui/icon-3d |
| `/teslimat` | `src/app/teslimat/page.tsx` | sunucu | herkese açık | — | — | layout/legal-document, layout/seller-warning |
| `/yukle/:token` | `src/app/yukle/[token]/page.tsx` | sunucu | herkese açık | — | token | parity/phone-upload-client |

## Yönetim paneli (kapsam dışı; listede yok) (26)

| Rota | Dosya | Sunucu/istemci | Giriş | Plan | Parametre | Bileşenler (ilk 4) |
|---|---|---|---|---|---|---|
| `/admin` | `src/app/admin/page.tsx` | sunucu | sayfa kapısı | içerik (1 dosya) | — | admin/admin-shell, admin/cockpit-quarantine, admin/cockpit-superseded, admin/free-preview-toggle +3 |
| `/admin/adaptive` | `src/app/admin/adaptive/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui |
| `/admin/ai-kullanimi` | `src/app/admin/ai-kullanimi/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui |
| `/admin/anket` | `src/app/admin/anket/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui |
| `/admin/audit-log` | `src/app/admin/audit-log/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui |
| `/admin/beta` | `src/app/admin/beta/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui |
| `/admin/ders-hatalari` | `src/app/admin/ders-hatalari/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui, admin/stuck-reset-button |
| `/admin/destek` | `src/app/admin/destek/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui, admin/support-answered-button |
| `/admin/eposta` | `src/app/admin/eposta/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui, admin/email-composer, admin/referral-cap-form +2 |
| `/admin/etkinlik` | `src/app/admin/etkinlik/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui |
| `/admin/feature-flags` | `src/app/admin/feature-flags/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui, admin/admin-rows |
| `/admin/kapi` | `src/app/admin/kapi/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui, admin/admin-gate-form |
| `/admin/kotuye-kullanim` | `src/app/admin/kotuye-kullanim/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui |
| `/admin/kredi-kurallari` | `src/app/admin/kredi-kurallari/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui, admin/admin-rows |
| `/admin/kullanicilar` | `src/app/admin/kullanicilar/page.tsx` | sunucu | sayfa kapısı | içerik (1 dosya) | — | admin/admin-shell, admin/admin-ui, admin/user-actions |
| `/admin/kullanicilar/:userId` | `src/app/admin/kullanicilar/[userId]/page.tsx` | sunucu | sayfa kapısı | — | userId | admin/admin-shell, admin/admin-ui, admin/subscription-extend, admin/user-actions +2 |
| `/admin/kullanicilar/:userId/hazirlik/:prepId` | `src/app/admin/kullanicilar/[userId]/hazirlik/[prepId]/page.tsx` | sunucu | sayfa kapısı | — | userId, prepId | admin/admin-shell, admin/admin-ui |
| `/admin/maliyetler` | `src/app/admin/maliyetler/page.tsx` | sunucu | sayfa kapısı | içerik (1 dosya) | — | admin/admin-shell, admin/admin-ui, admin/fx-rate-form, admin/spend-cap-form |
| `/admin/odemeler` | `src/app/admin/odemeler/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui, admin/refund-button |
| `/admin/ogretmen-basvurulari` | `src/app/admin/ogretmen-basvurulari/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui, admin/application-review |
| `/admin/paketler` | `src/app/admin/paketler/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui, admin/plan-editor |
| `/admin/promosyonlar` | `src/app/admin/promosyonlar/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui, admin/promo-tools, admin/campaign-form |
| `/admin/promptlar` | `src/app/admin/promptlar/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui, admin/admin-rows, admin/prompt-editor |
| `/admin/sistem` | `src/app/admin/sistem/page.tsx` | sunucu | sayfa kapısı | içerik (1 dosya) | — | admin/admin-shell, admin/admin-ui, admin/smtp-test-button, admin/digest-send-button +2 |
| `/admin/yanit-oylari` | `src/app/admin/yanit-oylari/page.tsx` | sunucu | sayfa kapısı | — | — | admin/admin-shell, admin/admin-ui |
| `/admin/yoneticiler` | `src/app/admin/yoneticiler/page.tsx` | sunucu | sayfa kapısı | içerik (2 dosya) | — | admin/admin-shell, admin/admin-ui, admin/admin-team-controls |

## Test fikstürleri (24; canlıda 404)

`/e2e/ana-ekran` · `/e2e/ayarlar` · `/e2e/deneme` · `/e2e/ders-mobil` · `/e2e/hakimiyet` · `/e2e/hakimiyet-tyt` · `/e2e/havuz-ders` · `/e2e/hizli-tarama` · `/e2e/ic-ekran` · `/e2e/ilerleme` · `/e2e/ilk-adim` · `/e2e/kamp` · `/e2e/kurucu` · `/e2e/kurulum` · `/e2e/mufredat` · `/e2e/odeme` · `/e2e/paket-j` · `/e2e/profil` · `/e2e/quiz-kilit` · `/e2e/resmi-kurulum` · `/e2e/rozet` · `/e2e/sihirbaz` · `/e2e/studyo` · `/e2e/unite-kontrol`

## API uçları (148)

Tam liste `docs/design-migration/data/rotalar.json` içinde (`kind: "api"`). Plan zorlaması yapan uçlar 03'te.
