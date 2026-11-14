# 02 · Bileşen kullanım matrisi

Üretim: `node scripts/design/component-usage.mjs --json docs/design-migration/data/bilesen-kullanimi.json` + `node scripts/design/component-doc.mjs`.
Yöntem: `src/` içe aktarma grafiği; her sayfanın (ve üst `layout.tsx`'lerinin) dolaylı olarak ulaştığı dosyalar. "Rota" = o bileşen dosyasına ulaşan gerçek sayfa (131 sayfa; fikstürler hariç).

## Özet
| Bileşen (ORTAK KURALLAR 4.3) | Depodaki karşılık | Rota | Doğrudan içe aktaran |
|---|---|---|---|
| Button | `Button` (`ui/button.tsx`, sınıflar `ui/button-variants.ts`) | 66 | 19 |
| IconButton | `IconButton` (`ui/icon-button.tsx`) | 1 | 1 |
| Badge | `Badge`, `Chip` (`ui/badge.tsx`) | 4 | 4 |
| Segmented | `SegmentedControl` (`ui/segmented-control.tsx`); kendi seçicileri: `TutorModeSwitcher` (sohbet), `AudienceTabs` (misafir) | 4 | 3 |
| Card | `Card` ailesi (`ui/card.tsx`), `StatCard` (`ui/stat-card.tsx`) | 1 | 1 |
| ListRow | **Ortak bileşen yok.** Aynı desen sınıf olarak: `cx-lib-row` (Kütüphane), `cx-pp-row` (profil), `cp-set-row` (Ayarlar), `cp-more-action` (sınav sohbeti menüsü), `mk-faq__q` (Yardım). | 0 | 0 |
| Dialog | **Ortak bileşen yok.** Her pencere kendi bileşeni: `ProfileDialog`, `StarsDialog`, `JourneyDialog`, `ParityDialogHost` (adres `?dialog=`), Kütüphane (sor-shell içinde). Ortak davranış kancası `useDismiss` (`lib/ui/use-dismiss.ts`: Esc, odak dönüşü). | 63 | 4 |
| Sheet | `ProfileSidePanel` (`parity/profile-identity.tsx`, 480 px yan panel), `UpgradeSheet` (`paywall/upgrade-sheet.tsx`) | 63 | 5 |
| Popover | **Ortak bileşen yok.** Tek örnek: `SourceModePill` menüsü (`chat/source-mode-pill.tsx`); `cp-mood-menu` sohbet içinde. | 2 | 1 |
| Toast | `Toaster` (`ui/sonner.tsx`) + `toast()` (sonner) | 131 | 1 |
| Skeleton | `Skeleton` (`ui/skeleton.tsx`) | 1 | 1 |
| Progress | `ProgressBar`, `ProgressSegments` (`ui/progress-bar.tsx`), `ProgressRing` (`ui/progress-ring.tsx`) | 4 | 3 |
| AnswerOption | `OptionCard` (`ui/option-card.tsx`); test ekranı (`exam-quiz-play.tsx`) kendi şık düğmelerini çiziyor | 1 | 1 |
| Composer | `ChatPanel` içindeki yazma kutusu (`chat/chat-panel.tsx`), ana ekranın ince çubuğu (`HomeToolsTray` / `cx-slim`, `parity/home-cockpit.tsx`) | 2 | 3 |
| Callout | **Ortak bileşen yok.** Ders notları (`als-note--*`), `cp-info*`, uyarı kutuları sayfa sayfa. | 0 | 0 |
| TopBar | `ParitySorShell` üst çubuğu (`header.cx-home-top`, `parity/sor-shell.tsx`) | 62 | 53 |
| ProfileCapsule | `AccountCapsule` (`parity/profile-identity.tsx`) | 62 | 3 |
| PhoneTabBar | `ParitySorShell` alt çubuğu (`nav.cp-sor-bottomnav`) | 62 | 53 |

Not: Toast kökte (`app/layout.tsx`) olduğu için bütün rotalara ulaşır. TopBar, ProfileCapsule ve PhoneTabBar aynı kabuk dosyasında.

## Button
- **Depoda:** `Button` (`ui/button.tsx`, sınıflar `ui/button-variants.ts`)
- **Props sözleşmesi:** `variant`, `size`, `block`, `loading`, `loadingLabel` + base-ui Button props. `data-slot="button"`, Faz 0'dan beri `data-variant` (rol).
- **Varyantlar:** variant: primary (varsayılan), default, secondary, ghost, danger, danger-ghost, brand, outline, destructive, link · size: sm 36, md/default 44, lg 52, xs 32, icon 44, icon-xs 32, icon-sm 36, icon-lg 52. `data-variant` eşlemesi: primary/default/brand → brand, secondary/outline → glass, ghost → weak, link → link, danger* → danger (prompt'un listesinde yok). `inverse` karşılığı yok.
- **Rotalar (66):** `/admin/sistem`, `/araclar`, `/araclar/:id`, `/ayarlar`, `/bildirimler`, `/davet`, `/deneme-sinavlari`, `/deneme-sinavlari/:prepId`, `/deneme-sinavlari/:prepId/degerlendirme`, `/deneme-sinavlari/:prepId/deneme/:examId`, `/deneme-sinavlari/:prepId/deneme/:examId/incele`, `/deneme-sinavlari/:prepId/deneme/kurulum`, `/deneme-sinavlari/:prepId/ders/:lessonId`, `/deneme-sinavlari/:prepId/duello`, `/deneme-sinavlari/:prepId/dugum/:nodeId`, `/deneme-sinavlari/:prepId/dugum/:nodeId/sonuc`, `/deneme-sinavlari/:prepId/konu`, `/deneme-sinavlari/:prepId/oturum`, `/deneme-sinavlari/:prepId/podcast`, `/deneme-sinavlari/:prepId/sinav-sabahi`, `/deneme-sinavlari/:prepId/sohbet`, `/deneme-sinavlari/:prepId/sonuc`, `/deneme-sinavlari/:prepId/tanisma`, `/deneme-sinavlari/:prepId/tekrar`, `/deneme-sinavlari/:prepId/tekrarlar` … +41
- **Doğrudan içe aktaran (19):** `src/app/email-dogrula/page.tsx`, `src/app/kayit/signup-wizard.tsx`, `src/app/tasarim/page.tsx`, `src/components/admin/digest-send-button.tsx`, `src/components/admin/smtp-test-button.tsx`, `src/components/billing/promo-redeem.tsx`, `src/components/billing/subscription-card.tsx`, `src/components/chat/chat-panel.tsx`, `src/components/learning/flashcard-deck.tsx`, `src/components/learning/generator-form.tsx`, `src/components/learning/quiz-runner.tsx`, `src/components/parity/gamification.tsx` … +7

## IconButton
- **Depoda:** `IconButton` (`ui/icon-button.tsx`)
- **Props sözleşmesi:** `aria-label` zorunlu (tipte), `size`, `variant` + base-ui Button props.
- **Varyantlar:** size: sm 36, md 44 · variant: ghost (varsayılan), secondary.
- **Rotalar (1):** `/tasarim`
- **Doğrudan içe aktaran (1):** `src/app/tasarim/page.tsx`

## Badge
- **Depoda:** `Badge`, `Chip` (`ui/badge.tsx`)
- **Props sözleşmesi:** `variant` + span props.
- **Varyantlar:** neutral, brand, action, success, warning, danger, info, ai, default, secondary, destructive (+ Chip varyantları).
- **Rotalar (4):** `/deneme-sinavlari/:prepId/sohbet`, `/odemeler`, `/ogretmen`, `/tasarim`
- **Doğrudan içe aktaran (4):** `src/app/odemeler/page.tsx`, `src/app/tasarim/page.tsx`, `src/components/billing/subscription-card.tsx`, `src/components/chat/chat-panel.tsx`

## Segmented
- **Depoda:** `SegmentedControl` (`ui/segmented-control.tsx`); kendi seçicileri: `TutorModeSwitcher` (sohbet), `AudienceTabs` (misafir)
- **Props sözleşmesi:** SegmentedControl: seçenekler + değer + değişim.
- **Varyantlar:** Tek görünüm; öbür seçiciler kendi CSS'iyle.
- **Rotalar (4):** `/`, `/deneme-sinavlari/:prepId/sohbet`, `/ogretmen`, `/tasarim`
- **Doğrudan içe aktaran (3):** `src/components/chat/chat-panel.tsx`, `src/components/landing/audience-hero.tsx`, `src/components/ui/tasarim-interactive.tsx`

## Card
- **Depoda:** `Card` ailesi (`ui/card.tsx`), `StatCard` (`ui/stat-card.tsx`)
- **Props sözleşmesi:** div props.
- **Varyantlar:** Yok. Sayfaların çoğu kendi kart sınıfını yazıyor (`cp-*-card`, `cx-pp-*`, `sg-card`).
- **Rotalar (1):** `/tasarim`
- **Doğrudan içe aktaran (1):** `src/app/tasarim/page.tsx`

## ListRow
- **Depoda:** **Ortak bileşen yok.** Aynı desen sınıf olarak: `cx-lib-row` (Kütüphane), `cx-pp-row` (profil), `cp-set-row` (Ayarlar), `cp-more-action` (sınav sohbeti menüsü), `mk-faq__q` (Yardım).
- **Props sözleşmesi:** —
- **Varyantlar:** —
- **Rotalar (0):** —
- **Doğrudan içe aktaran (0):** —

## Dialog
- **Depoda:** **Ortak bileşen yok.** Her pencere kendi bileşeni: `ProfileDialog`, `StarsDialog`, `JourneyDialog`, `ParityDialogHost` (adres `?dialog=`), Kütüphane (sor-shell içinde). Ortak davranış kancası `useDismiss` (`lib/ui/use-dismiss.ts`: Esc, odak dönüşü).
- **Props sözleşmesi:** Her biri `open` + `onClose`.
- **Varyantlar:** —
- **Rotalar (63):** `/`, `/araclar`, `/araclar/:id`, `/ayarlar`, `/bildirimler`, `/davet`, `/deneme-sinavlari`, `/deneme-sinavlari/:prepId`, `/deneme-sinavlari/:prepId/degerlendirme`, `/deneme-sinavlari/:prepId/deneme/:examId`, `/deneme-sinavlari/:prepId/deneme/:examId/incele`, `/deneme-sinavlari/:prepId/deneme/kurulum`, `/deneme-sinavlari/:prepId/ders/:lessonId`, `/deneme-sinavlari/:prepId/duello`, `/deneme-sinavlari/:prepId/dugum/:nodeId`, `/deneme-sinavlari/:prepId/dugum/:nodeId/sonuc`, `/deneme-sinavlari/:prepId/konu`, `/deneme-sinavlari/:prepId/oturum`, `/deneme-sinavlari/:prepId/podcast`, `/deneme-sinavlari/:prepId/sinav-sabahi`, `/deneme-sinavlari/:prepId/sohbet`, `/deneme-sinavlari/:prepId/sonuc`, `/deneme-sinavlari/:prepId/tanisma`, `/deneme-sinavlari/:prepId/tekrar`, `/deneme-sinavlari/:prepId/tekrarlar` … +38
- **Doğrudan içe aktaran (4):** `src/components/parity/badge-unlock-notice.tsx`, `src/components/parity/exam-node/use-node-lifecycle.ts`, `src/components/parity/sor-shell.tsx`, `src/components/parity/video-lesson.tsx`

## Sheet
- **Depoda:** `ProfileSidePanel` (`parity/profile-identity.tsx`, 480 px yan panel), `UpgradeSheet` (`paywall/upgrade-sheet.tsx`)
- **Props sözleşmesi:** `open`, `onClose` + içerik props.
- **Varyantlar:** —
- **Rotalar (63):** `/`, `/araclar`, `/araclar/:id`, `/ayarlar`, `/bildirimler`, `/davet`, `/deneme-sinavlari`, `/deneme-sinavlari/:prepId`, `/deneme-sinavlari/:prepId/degerlendirme`, `/deneme-sinavlari/:prepId/deneme/:examId`, `/deneme-sinavlari/:prepId/deneme/:examId/incele`, `/deneme-sinavlari/:prepId/deneme/kurulum`, `/deneme-sinavlari/:prepId/ders/:lessonId`, `/deneme-sinavlari/:prepId/duello`, `/deneme-sinavlari/:prepId/dugum/:nodeId`, `/deneme-sinavlari/:prepId/dugum/:nodeId/sonuc`, `/deneme-sinavlari/:prepId/konu`, `/deneme-sinavlari/:prepId/oturum`, `/deneme-sinavlari/:prepId/podcast`, `/deneme-sinavlari/:prepId/sinav-sabahi`, `/deneme-sinavlari/:prepId/sohbet`, `/deneme-sinavlari/:prepId/sonuc`, `/deneme-sinavlari/:prepId/tanisma`, `/deneme-sinavlari/:prepId/tekrar`, `/deneme-sinavlari/:prepId/tekrarlar` … +38
- **Doğrudan içe aktaran (5):** `src/app/e2e/paket-j/wall.tsx`, `src/app/e2e/profil/fixture.tsx`, `src/app/profil/page.tsx`, `src/components/parity/sor-shell.tsx`, `src/components/paywall/credit-gate.tsx`

## Popover
- **Depoda:** **Ortak bileşen yok.** Tek örnek: `SourceModePill` menüsü (`chat/source-mode-pill.tsx`); `cp-mood-menu` sohbet içinde.
- **Props sözleşmesi:** —
- **Varyantlar:** —
- **Rotalar (2):** `/deneme-sinavlari/:prepId/sohbet`, `/ogretmen`
- **Doğrudan içe aktaran (1):** `src/components/chat/chat-panel.tsx`

## Toast
- **Depoda:** `Toaster` (`ui/sonner.tsx`) + `toast()` (sonner)
- **Props sözleşmesi:** sonner.
- **Varyantlar:** success, error, info (sonner).
- **Rotalar (131):** `/`, `/admin`, `/admin/adaptive`, `/admin/ai-kullanimi`, `/admin/anket`, `/admin/audit-log`, `/admin/beta`, `/admin/ders-hatalari`, `/admin/destek`, `/admin/eposta`, `/admin/etkinlik`, `/admin/feature-flags`, `/admin/kapi`, `/admin/kotuye-kullanim`, `/admin/kredi-kurallari`, `/admin/kullanicilar`, `/admin/kullanicilar/:userId`, `/admin/kullanicilar/:userId/hazirlik/:prepId`, `/admin/maliyetler`, `/admin/odemeler`, `/admin/ogretmen-basvurulari`, `/admin/paketler`, `/admin/promosyonlar`, `/admin/promptlar`, `/admin/sistem` … +106
- **Doğrudan içe aktaran (1):** `src/components/providers.tsx`

## Skeleton
- **Depoda:** `Skeleton` (`ui/skeleton.tsx`)
- **Props sözleşmesi:** div props.
- **Varyantlar:** Yok.
- **Rotalar (1):** `/tasarim`
- **Doğrudan içe aktaran (1):** `src/app/tasarim/page.tsx`

## Progress
- **Depoda:** `ProgressBar`, `ProgressSegments` (`ui/progress-bar.tsx`), `ProgressRing` (`ui/progress-ring.tsx`)
- **Props sözleşmesi:** değer + en çok.
- **Varyantlar:** Yok.
- **Rotalar (4):** `/`, `/deneme-sinavlari/:prepId/dugum/:nodeId`, `/ornek`, `/tasarim`
- **Doğrudan içe aktaran (3):** `src/app/tasarim/page.tsx`, `src/components/demo/demo-walkthrough.tsx`, `src/components/parity/oral-exam-flow.tsx`

## AnswerOption
- **Depoda:** `OptionCard` (`ui/option-card.tsx`); test ekranı (`exam-quiz-play.tsx`) kendi şık düğmelerini çiziyor
- **Props sözleşmesi:** `letter`, `state`, `label` …
- **Varyantlar:** state: idle, hover, selected, correct, incorrect, missed, dimmed.
- **Rotalar (1):** `/tasarim`
- **Doğrudan içe aktaran (1):** `src/app/tasarim/page.tsx`

## Composer
- **Depoda:** `ChatPanel` içindeki yazma kutusu (`chat/chat-panel.tsx`), ana ekranın ince çubuğu (`HomeToolsTray` / `cx-slim`, `parity/home-cockpit.tsx`)
- **Props sözleşmesi:** ChatPanel'in props'u (çok sayıda).
- **Varyantlar:** parity / exam görünümü.
- **Rotalar (2):** `/deneme-sinavlari/:prepId/sohbet`, `/ogretmen`
- **Doğrudan içe aktaran (3):** `src/app/deneme-sinavlari/[prepId]/sohbet/page.tsx`, `src/app/e2e/ana-ekran/fixture.tsx`, `src/app/ogretmen/page.tsx`

## Callout
- **Depoda:** **Ortak bileşen yok.** Ders notları (`als-note--*`), `cp-info*`, uyarı kutuları sayfa sayfa.
- **Props sözleşmesi:** —
- **Varyantlar:** —
- **Rotalar (0):** —
- **Doğrudan içe aktaran (0):** —

## TopBar
- **Depoda:** `ParitySorShell` üst çubuğu (`header.cx-home-top`, `parity/sor-shell.tsx`)
- **Props sözleşmesi:** Kabuğun props'u (`account`, `userName`, `streak`, `chrome`, `home` …).
- **Varyantlar:** chrome: app, exam, focus, session (session'da çubuk yok).
- **Rotalar (62):** `/araclar`, `/araclar/:id`, `/ayarlar`, `/bildirimler`, `/davet`, `/deneme-sinavlari`, `/deneme-sinavlari/:prepId`, `/deneme-sinavlari/:prepId/degerlendirme`, `/deneme-sinavlari/:prepId/deneme/:examId`, `/deneme-sinavlari/:prepId/deneme/:examId/incele`, `/deneme-sinavlari/:prepId/deneme/kurulum`, `/deneme-sinavlari/:prepId/ders/:lessonId`, `/deneme-sinavlari/:prepId/duello`, `/deneme-sinavlari/:prepId/dugum/:nodeId`, `/deneme-sinavlari/:prepId/dugum/:nodeId/sonuc`, `/deneme-sinavlari/:prepId/konu`, `/deneme-sinavlari/:prepId/oturum`, `/deneme-sinavlari/:prepId/podcast`, `/deneme-sinavlari/:prepId/sinav-sabahi`, `/deneme-sinavlari/:prepId/sohbet`, `/deneme-sinavlari/:prepId/sonuc`, `/deneme-sinavlari/:prepId/tanisma`, `/deneme-sinavlari/:prepId/tekrar`, `/deneme-sinavlari/:prepId/tekrarlar`, `/deneme-sinavlari/:prepId/video` … +37
- **Doğrudan içe aktaran (53):** `src/app/araclar/page.tsx`, `src/app/araclar/[id]/page.tsx`, `src/app/davet/page.tsx`, `src/app/deneme-sinavlari/ara/page.tsx`, `src/app/deneme-sinavlari/hazirliklarim/page.tsx`, `src/app/deneme-sinavlari/mufredat/page.tsx`, `src/app/deneme-sinavlari/okulum/page.tsx`, `src/app/deneme-sinavlari/olustur/page.tsx`, `src/app/deneme-sinavlari/page.tsx`, `src/app/deneme-sinavlari/resmi/kurulum/page.tsx`, `src/app/deneme-sinavlari/resmi/page.tsx`, `src/app/deneme-sinavlari/[prepId]/degerlendirme/page.tsx` … +41

## ProfileCapsule
- **Depoda:** `AccountCapsule` (`parity/profile-identity.tsx`)
- **Props sözleşmesi:** `name`, `initial`, `identity` (`planIdentity`), `open`, `onOpen`.
- **Varyantlar:** look: free, plus, sigma (kurucu = sigma).
- **Rotalar (62):** `/araclar`, `/araclar/:id`, `/ayarlar`, `/bildirimler`, `/davet`, `/deneme-sinavlari`, `/deneme-sinavlari/:prepId`, `/deneme-sinavlari/:prepId/degerlendirme`, `/deneme-sinavlari/:prepId/deneme/:examId`, `/deneme-sinavlari/:prepId/deneme/:examId/incele`, `/deneme-sinavlari/:prepId/deneme/kurulum`, `/deneme-sinavlari/:prepId/ders/:lessonId`, `/deneme-sinavlari/:prepId/duello`, `/deneme-sinavlari/:prepId/dugum/:nodeId`, `/deneme-sinavlari/:prepId/dugum/:nodeId/sonuc`, `/deneme-sinavlari/:prepId/konu`, `/deneme-sinavlari/:prepId/oturum`, `/deneme-sinavlari/:prepId/podcast`, `/deneme-sinavlari/:prepId/sinav-sabahi`, `/deneme-sinavlari/:prepId/sohbet`, `/deneme-sinavlari/:prepId/sonuc`, `/deneme-sinavlari/:prepId/tanisma`, `/deneme-sinavlari/:prepId/tekrar`, `/deneme-sinavlari/:prepId/tekrarlar`, `/deneme-sinavlari/:prepId/video` … +37
- **Doğrudan içe aktaran (3):** `src/app/e2e/profil/fixture.tsx`, `src/app/profil/page.tsx`, `src/components/parity/sor-shell.tsx`

## PhoneTabBar
- **Depoda:** `ParitySorShell` alt çubuğu (`nav.cp-sor-bottomnav`)
- **Props sözleşmesi:** Kabuktan.
- **Varyantlar:** Beş öğe; <768 px.
- **Rotalar (62):** `/araclar`, `/araclar/:id`, `/ayarlar`, `/bildirimler`, `/davet`, `/deneme-sinavlari`, `/deneme-sinavlari/:prepId`, `/deneme-sinavlari/:prepId/degerlendirme`, `/deneme-sinavlari/:prepId/deneme/:examId`, `/deneme-sinavlari/:prepId/deneme/:examId/incele`, `/deneme-sinavlari/:prepId/deneme/kurulum`, `/deneme-sinavlari/:prepId/ders/:lessonId`, `/deneme-sinavlari/:prepId/duello`, `/deneme-sinavlari/:prepId/dugum/:nodeId`, `/deneme-sinavlari/:prepId/dugum/:nodeId/sonuc`, `/deneme-sinavlari/:prepId/konu`, `/deneme-sinavlari/:prepId/oturum`, `/deneme-sinavlari/:prepId/podcast`, `/deneme-sinavlari/:prepId/sinav-sabahi`, `/deneme-sinavlari/:prepId/sohbet`, `/deneme-sinavlari/:prepId/sonuc`, `/deneme-sinavlari/:prepId/tanisma`, `/deneme-sinavlari/:prepId/tekrar`, `/deneme-sinavlari/:prepId/tekrarlar`, `/deneme-sinavlari/:prepId/video` … +37
- **Doğrudan içe aktaran (53):** `src/app/araclar/page.tsx`, `src/app/araclar/[id]/page.tsx`, `src/app/davet/page.tsx`, `src/app/deneme-sinavlari/ara/page.tsx`, `src/app/deneme-sinavlari/hazirliklarim/page.tsx`, `src/app/deneme-sinavlari/mufredat/page.tsx`, `src/app/deneme-sinavlari/okulum/page.tsx`, `src/app/deneme-sinavlari/olustur/page.tsx`, `src/app/deneme-sinavlari/page.tsx`, `src/app/deneme-sinavlari/resmi/kurulum/page.tsx`, `src/app/deneme-sinavlari/resmi/page.tsx`, `src/app/deneme-sinavlari/[prepId]/degerlendirme/page.tsx` … +41

## Ham kullanım (ortak düğme yerine kendi `<button>` / sınıflı bağlantı yazan dosyalar)

273 dosya, toplam 844 `<button>` ve 337 sınıflı bağlantı; 264 dosya ortak `Button`/`IconButton`'ı hiç içe aktarmıyor. Faz 3+ için anlamı: `data-variant` yalnız ortak `Button`'da; ham düğmelerin rolü sınıflarından (`cx-brand`, `cx-glass`, `cx-weak`, `cp-exam-continue` …) okunur (denetim betiği bu sınıfları da sayar). Tam liste `docs/design-migration/data/bilesen-kullanimi.json` (`raw`).

| Dosya | `<button>` | Sınıflı bağlantı | Ortak düğme |
|---|---|---|---|
| `src/components/chat/chat-panel.tsx` | 49 | 1 | evet |
| `src/components/parity/exam-create-wizard.tsx` | 46 | 1 | hayır |
| `src/components/parity/exam-prep-home.tsx` | 22 | 14 | hayır |
| `src/components/parity/oral-exam-flow.tsx` | 21 | 2 | hayır |
| `src/components/parity/exam-podcast-player.tsx` | 17 | 3 | hayır |
| `src/components/parity/exam-lesson-steps.tsx` | 19 | 0 | hayır |
| `src/components/parity/official-setup-flow.tsx` | 18 | 0 | hayır |
| `src/components/landing/futuristic-guided-journey.tsx` | 14 | 2 | hayır |
| `src/components/parity/exam-runner.tsx` | 16 | 0 | hayır |
| `src/components/parity/sor-shell.tsx` | 5 | 10 | hayır |
| `src/components/parity/video-lesson.tsx` | 13 | 2 | hayır |
| `src/components/parity/subscription-cards.tsx` | 12 | 2 | hayır |
| `src/components/learning/question-solver.tsx` | 12 | 1 | hayır |
| `src/components/parity/adaptive-study-session.tsx` | 9 | 4 | hayır |
| `src/components/parity/exam-prep.tsx` | 5 | 8 | hayır |
| `src/components/parity/mock-exam-setup.tsx` | 13 | 0 | hayır |
| `src/components/admin/promo-tools.tsx` | 12 | 0 | hayır |
| `src/components/parity/profile-dialog.tsx` | 9 | 2 | hayır |
| `src/components/admin/user-manage-tools.tsx` | 10 | 0 | hayır |
| `src/components/marketing/parity-site-header.tsx` | 1 | 9 | hayır |
| `src/components/parity/official-curriculum-panel.tsx` | 10 | 0 | hayır |
| `src/components/parity/profile-identity.tsx` | 5 | 5 | hayır |
| `src/components/parity/stars-dialog.tsx` | 8 | 2 | hayır |
| `src/components/admin/email-composer.tsx` | 9 | 0 | hayır |
| `src/components/admin/refund-button.tsx` | 9 | 0 | hayır |
| `src/components/demo/demo-walkthrough.tsx` | 8 | 1 | hayır |
| `src/components/duel/duel-play.tsx` | 8 | 1 | hayır |
| `src/components/parity/exam-intro-quiz.tsx` | 6 | 3 | hayır |
| `src/components/parity/exam-node/result.tsx` | 5 | 4 | hayır |
| `src/components/parity/exam-voice-tutor.tsx` | 9 | 0 | hayır |
| `src/components/parity/journey-dialog.tsx` | 7 | 2 | hayır |
| `src/components/parity/paper-exam-runner.tsx` | 9 | 0 | hayır |
| `src/components/parity/prep-basics-panel.tsx` | 9 | 0 | hayır |
| `src/app/deneme-sinavlari/[prepId]/sonuc/page.tsx` | 0 | 8 | hayır |
| `src/components/feedback/weekly-survey-card.tsx` | 8 | 0 | hayır |
| `src/components/learning/studio/podcast-studio.tsx` | 6 | 2 | hayır |
| `src/components/learning/studio/studio-shared.tsx` | 5 | 3 | hayır |
| `src/components/legal/cookie-banner.tsx` | 8 | 0 | hayır |
| `src/components/parity/first-step-launcher.tsx` | 3 | 5 | hayır |
| `src/components/parity/generation-warmup.tsx` | 8 | 0 | hayır |
| … | | | |
