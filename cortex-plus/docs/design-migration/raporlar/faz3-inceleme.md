# Faz 3 · 3.0 İnceleme (kod yok)

Dal `design/faz0-envanter`, 14 Kasım 2026. Yalnız kod okundu (Read/Grep/Glob); derleme, test, sunucu çalıştırılmadı.
Girdi: `03-plan-okuyan-yerler.md`, `04-limit-ve-fiyat-yapilandirmasi.md`, `01-rota-envanteri.md`, ANA-PROMPT §FAZ 3.
Görsel kanıt: `tests/visual/__screenshots__/masaustu/e2e-{plus,sigma,free-fresh}-ogretmen.png`, `kurucu-ogretmen.png`
(taban `151da31f`).

---

## 1. Ana ekran: Plus ile Sigma arasında fark var mı?

**Kısa cevap: kodda yok. Sigma'nın gövdesi Plus'la aynı; fark yalnız profil kapsülünde.** Görsel taban da bunu
gösteriyor: `e2e-plus-ogretmen.png` ile `e2e-sigma-ogretmen.png` aynı halka, sınav şeridi ("45 GÜN SONRA"), metin bloğu,
kaydırıcı ve ince yazma çubuğunu çiziyor; ayrılan tek şey sağ üstteki etiket (PLUS / SIGMA).

Gövdeyi seçen koşul plan okumaz, veri okur:

| Parça | Koşul | Kanıt |
|---|---|---|
| Kokpit (sınav şeridi, konu halkası, metin, kaydırıcı) | `!params.sohbet && prepCount > 0` ve `loadHomeCockpit` boş değil | `src/app/ogretmen/page.tsx:181-182`, `:207`, `:247` |
| `loadHomeCockpit` | Plan okumaz; yalnız `skipKinds` alır (ücretsizde Plus adımları atlanır) | `src/lib/learning/home-cockpit.ts:79-159` |
| `skipKinds` | `pathSkipKinds`: abone ya da muaf yöneticide boş küme, ücretsizde `podcast, oral, written_exam` | `page.tsx:177-180`, `src/lib/billing/node-free-meter.ts:16-26` |
| `HomeCockpit` bileşeni | Plan dalı yok (`ExamStrip`, `TopicRing`, `CockpitText`, `TopicSlider`) | `src/components/parity/home-cockpit.tsx:446-461` |
| Hazırlığı olmayan hesap | Kokpit yerine `FirstStepLauncher` (plan değil, `prepCount === 0`) | `page.tsx:195-198` |
| Öğretmen çubuğu (ince çubuk `cx-slim`) | Plan okumaz | `src/components/chat/chat-panel.tsx:1830-1895` |

Ana ekran zincirinde plana bağlı olanların tamamı:

| Ne | Plan koşulu | Kanıt |
|---|---|---|
| Araç tepsisinde "Plus" rozeti | `freeAccount = showsUpgradeChrome && !isAdmin` | `page.tsx:203`, `:208`; `home-cockpit.tsx:514-520` |
| Dost satırında sınav sabahı kâğıdı önerisi | `cramSheetLocked = showsUpgradeChrome` | `page.tsx:167` |
| Üst çubukta "Plus'a geç" | `showBuy = !isAdmin && showsUpgradeChrome` | `src/components/parity/sor-shell.tsx:156`, `:376` |
| Plus kota şeridi (`PlusLimitBanner`) | `!isAdmin && isPremium && !canSpend` | `sor-shell.tsx:157-158`, `:415-417` |
| Profil kapsülü etiketi | `planIdentity` | `sor-shell.tsx:165`; `src/lib/student/plan-identity.ts:34-58` |
| Hak kapısı metni (402 sonrası) | `gatePremium` | `chat-panel.tsx:357`, `:164-175`, `:2922-2928` |
| Sigma'ya özel "Gelişmiş analiz" | `allowAdvanced = audience === "sigma"` | `chat-panel.tsx:355`; yalnız `variant !== "parity"` dalında (`:2414-2416`, `:2750`). `/ogretmen` `variant="parity"` (`page.tsx:209`) olduğu için **ana ekranda görünmez** |
| Seri penceresi | `isPremium ? <GamificationGate/>` | `sor-shell.tsx:557` |

Sonuç: tahtada Sigma ana ekranı farklı çiziliyorsa bu bugünkü kodun davranışı değil, yeni bir tasarım kararıdır.
Kurucu taban görüntüsü (`kurucu-ogretmen.png`) gerçek hesap değil, fikstür (`/e2e/ana-ekran?plan=kurucu&hazirlik=1`,
`tests/visual/route-matrix.json:51`); verisi farklı olduğu için görüntüsü farklı.

---

## 2. Sayaçlar: nerede artıyor, atomik mi, ne zaman yenileniyor

**Tek giriş:** `reserveCredits` (`src/lib/credits/service.ts:118-225`) → SQL `credit_reserve_metered`
(`supabase/migrations/20261111180000_free_lesson_trial.sql:39-141`).

| Hesap | Ne artıyor/azalıyor | Nerede | Atomik mi |
|---|---|---|---|
| Ücretsiz | `free_usage.used` (+1), sayaç `chat`/`photo`/`included` | `free_lesson_trial.sql:105-111`: `INSERT … ON CONFLICT DO UPDATE SET used = used + 1 WHERE used < v_limit RETURNING` | **Evet.** Tek ifade, koşullu; öncesinde cüzdan satırı `FOR UPDATE` (`:93`); aynı `idempotency_key` ikinci kez saymaz (`:95-101`) |
| Ücretsiz, ders sayacı | Sınır 0: satır yazılmaz, doğrudan "dolu"; bakiye yetiyorsa bakiyeden | `:104-121` | Evet |
| Plus / Sınav Haftası / Sigma | `credit_wallets.free_allowance_remaining` düşer, sonra `balance` (ek paket/hediye) | `supabase/migrations/20261024123000_free_daily_zero.sql:186-197` | **Evet.** Cüzdan `FOR UPDATE` (`:67`), idempotency (`:70-76`) |
| Kurucu / yönetici | Hiçbir şey düşmez; deftere 0 tutarlı `admin_bypass` kaydı | `20261024123000_free_daily_zero.sql:79-136`; metered'de `:60,77-79` | — |

**Ne zaman sayılıyor:** işten ÖNCE, ayırma anında. Başarı `credit_commit` ile kesinleşir
(`20260923120001_uat_credit_atomicity.sql:258-272`), hata yolunda `credit_refund` sayacı geri verir
(`20261024121000_free_tier_counts.sql:242-281`). İki sınır:
- Ücretsiz sayaç yalnız **aynı dönemdeyse** geri döner (`free_tier_counts.sql:256`): gece yarısını geçen başarısız iş hakkı geri vermez.
- İşlev 300 sn'de öldürülürse bekleyen ayırmayı yalnız `STALE_REFUND_ACTION_CODES` listesindekiler için cron iade eder
  (`service.ts:273-285`, tek çağıran `src/app/api/cron/subscription-renewal/route.ts:206`). Listede **olmayanlar**:
  `PODCAST_GENERATE`, `ORAL_EXAM_GENERATE`, `VIDEO_GENERATE`, `SKETCH_VIDEO_GENERATE`, `VOICE_TURN`. Bunlar öldürülürse
  ücretli kota düşmüş kalır.

**Yenilenme:**

| Hesap | Dönem anahtarı / sonu | Saat dilimi | Kanıt |
|---|---|---|---|
| Ücretsiz günlük (mesaj, fotoğraf, derse dahil) | `free_period_key` = `(now UTC + 3 sa)` günü | İstanbul (sabit UTC+3) | SQL `20261024121000_free_tier_counts.sql:59-65`; TS `src/lib/billing/free-meters.ts:81-91` (`freeMeterResetsAt` = İstanbul 00:00) |
| Plus aylık | Cüzdan `period_ends_at = date_trunc('day', now()) + 30 gün` | DB oturumu (UTC) gün başı → TR 03:00 | Ödemede `20260923180000_paytr_subscription_tier_only.sql:194-206`; dönem dolunca ilk işte `free_daily_zero.sql:138-183` |
| Sınav Haftası | Aynı, `+ 7 gün`, `period_kind = 'weekly'` | Aynı | Aynı satırlar (`v_window` `:160`) |
| Sigma | Aynı, 30 gün, hak 60.000 | Aynı | Aynı |

Yenileme tembel: dönem bitince satır ilk işe kadar eskisini taşır; arayüz bunu `quotaView` ile önceden hesaplar
(`src/lib/credits/period.ts:67-124`, `pendingRefill`).

**"Yenilenme 14 sa 20 dk"yi üretecek veri bugün var:**
- Ücretsiz: `account.freeMeters[].resetsAtIso` (`src/lib/billing/free-usage-server.ts:38`) ve `account.resetsAtIso`
  (mesaj sayacının saati, `src/lib/student/account-context.ts:63-71`). Kapı bunu kullanıyor
  (`src/components/paywall/credit-gate.tsx:102-114`); biçim `countdownParts` (`src/components/paywall/upgrade-sheet.tsx:193-205`).
- Ücretli: `account.resetsAtIso` = cüzdan `period_ends_at` (`account-context.ts:140-141`, `period.ts:115`).
- Not: ücretsizde mesaj sayacı satırı yoksa yedek `new Date()` (`account-context.ts:65`) → geri sayım 0 gösterir.

---

## 3. Planlar veride nasıl ayrışıyor

| Plan | Veri | Okuyan | Kanıt |
|---|---|---|---|
| Ücretsiz | Etkin premium abonelik yok | `registeredFreeEntitlements` (`audience 'free'`, `showsUpgradeChrome true`) | `src/lib/billing/entitlements.ts:116-139`, `:180-195` |
| Plus | `subscriptions` etkin + `plans.tier='plus'`, slug `plus-aylik`, `monthly_allowance 7200`, `billing_period monthly` | `resolveTier` → `badge 'Plus'` | `entitlements.ts:141-155`, `:200-221`; 04:17 |
| Sınav Haftası | Aynı tablo, slug `plus-haftalik`, `period_days 7`, `billing_period weekly`, hak 2.700 | Kademe **plus** (ayrı tier yok); kimlikte slug'dan ayrılır | `plan-identity.ts:42-53`; `account-context.ts:136` (`planSlug`); 04:18 |
| Sigma | `plans.tier='sigma'` (boşsa ad/slug'da "sigma") | `badge 'Sigma'`, `advanced_chat`, `photoPageLimit 1000` | `entitlements.ts:148-153`, `:210-220` |
| Kurucu | `user_roles.role='founder'` (iptalsiz) | SQL `is_admin` founder'ı da sayar → `isAdminUser` → `account.isAdmin` | `supabase/migrations/20261106150000_founder_role.sql:38-49`; `src/lib/auth/roles.ts:34`; `account-context.ts:87,138`; `plan-identity.ts:35-36` |
| Kurucu önizlemede | `admin_free_preview` satırı | Ücretsiz gibi (`isAdmin false`) | `account-context.ts:91-113`; `src/lib/billing/free-preview.ts:63-66` (`billingExempt`) |

**Sınav Haftası kalan gün:** `planDaysLeft(subscriptionPeriodEnd)` = `ceil((current_period_end − şimdi) / 24 sa)`
(`plan-identity.ts:27-32`, `:43`). `subscriptionPeriodEnd` aboneliğin `current_period_end`'i (`entitlements.ts:206`,
`account-context.ts:135`); ödemede `now() + period_days` (`paytr_subscription_tier_only.sql:141-142`, `:159`).

**Sınav Haftası kotası:** ders ve mesaj ayrı sayılmaz; **tek kredi havuzu** (2.700). Ders 30, mesaj 3 kredi
(`src/lib/credits/price-table.ts:27,40,97-104`); "yaklaşık 90 ders ya da 900 mesaj" yalnız bölmeyle türetilir
(`allowanceInWork`, `:114-119`). Ekranda yüzde (`src/app/krediler/page.tsx:197-219`) ve haftalık şerit metni
(`src/components/paywall/plus-limit-banner.tsx:22-28`). Ücretli hesapta ücretsiz kota kapısı yok: `CreditGate`
abonede `CreditLimitToast` gösterir (`credit-gate.tsx:68-75`).

---

## 4. Düello: bugünkü plan davranışı (DUEL_ACCESS'e aynen)

| Eylem | Ücretsiz | Plus / Sınav Haftası / Sigma | Kurucu | Misafir |
|---|---|---|---|---|
| Düello **kurmak** (`POST /api/learning/exam-prep/duel`, "Yeni düello" ve "AI rakiple hemen başla" aynı uç) | Kapalı: 402 `free_lesson_limit`; **istisna** cüzdan bakiyesi ≥ `QUIZ_GENERATE` bedeli (10) ise açık ve bakiyeden düşer | Açık; dönem kotasından `QUIZ_GENERATE` = 10 kredi | Açık, düşmez | Kapalı (401) |
| Paylaşılan düelloyu **oynamak** (`/api/duels/[code]/run`) | Açık | Açık | Açık | Açık (ad zorunlu, cevap anahtarı gitmez) |
| **Bot** turu (`/api/duels/[code]/bot`) | Açık | Açık | Açık | Açık; kayıt ve yıldız yok |

Kanıt: kurma kapısı `src/app/api/learning/exam-prep/duel/route.ts:65` (`freeLessonRefused`), ücret
`generateExamQuiz` → `QUIZ_GENERATE`, sayaç verilmediği için `lesson` (`src/lib/learning/exam-quiz-generate.ts:92-94`,
`free-meters.ts:52-57`); hak yalnız düello kurulunca kesinleşir (`duel/route.ts:160-163`), aksi iade (`:146`, `:168`).
"Bakiye istisnası": `src/lib/billing/free-lesson-gate.ts:61-71`. Oynama ve bot: plan okumaz, yalnız `duelLimit`
(`run/route.ts:43`, `bot/route.ts:24`). İstemci 402'de `CreditGate meter="lesson"` açar
(`src/components/duel/new-duel-button.tsx:28-31`, `:53-60`).

**Günlük düello hakkı yok.** Yalnız hız sınırı: kurma `withUser limit 6` → dakikada 6, günde `max(100, 6×20)=120`,
yöneticide ×10 (`duel/route.ts:42`, `src/lib/api/guards.ts:131-133`, `:169-171`); oynama/bot oturumlu 10/dk, misafir
IP başına 60/dk (`guards.ts:286-298`).

---

## 5. `/ogretmen`: ana ekran ile sohbet aynı bileşende — sınır

Tek bileşen `ChatPanel` hem boş ana ekranı hem sohbeti çiziyor (`page.tsx:205-230`). Başka kullananlar: hazırlık
sohbeti (`src/app/deneme-sinavlari/[prepId]/sohbet/page.tsx:130`, `examChrome`) ve fikstür
(`src/app/e2e/ana-ekran/fixture.tsx:189`).

| Parça | Ana ekran mı sohbet mi | Kanıt |
|---|---|---|
| `cockpitMode = homeCockpit && showParityEmpty && !examChrome` | Ana ekran (ilk mesajla kalkar) | `chat-panel.tsx:1264-1267` |
| `cx-home-stage` → `HomeCockpit` | **Ana ekran (Faz 3)** | `chat-panel.tsx:1597`; `home-cockpit.tsx:446-461` |
| `HomeSelectionProvider` (seçili hazırlık/konu) | Ana ekran | `page.tsx:247`; `home-cockpit.tsx:41` |
| İnce çubuk `cx-slim` (öğretmen düğmesi, tepsi, alan, mikrofon) | Ana ekran; `slimComposer = cockpitMode && !wideComposer` | `chat-panel.tsx:1268`, `:1830-1895` |
| `HomeToolsTray` | Ana ekran | `chat-panel.tsx:1836-1848`; `home-cockpit.tsx:473-527` |
| Geniş yazma kutusu (`cp-sor-controls`, `cp-sor-composer-box`) | **Ortak**: ana ekranda çubuğa dokununca açılır, sohbette hep açık | `chat-panel.tsx:1896-1990+` |
| Hazırlığı olmayan hesabın selam/Başla/`FirstStepLauncher` | Ana ekran (eski görünüm, bilerek) | `chat-panel.tsx:1598-1624`; `page.tsx:195-198` |
| Mesaj akışı (`showParityThread`), balonlar, devam çipleri | Sohbet (Faz 6) | `chat-panel.tsx:1265`, `:222-226` |
| Gönderim (`send`, `sendComposer`, `solvePhoto`) ve 402 akışı, `CreditGate` | **Ortak mantık** | `chat-panel.tsx:843-908`, `:1005-1068`, `:2922-2928` |
| Üst çubuk `ParitySorShell home` | Ortak kabuk | `page.tsx:233-246` |

**Bugün yazma alanında hak göstergesi yok** (parity dalında `quotaHint`/kalan mesaj hiç çizilmiyor; `quotaHint` yalnız
eski `variant="default"` dalında, `chat-panel.tsx:2746-2749`, ve `/ogretmen` göndermiyor).

Önerilen sınır: Faz 3 = `HomeCockpit` çocukları + ince çubuğa (ve geniş kutunun aynı yerine) eklenecek tek bir hak
göstergesi öğesi. Faz 6 = akış, balonlar, `cp-sor-controls`, kutunun içi, devam çipleri.
**Sınırı zorlayan madde:** 3B'nin "gönder'e basınca yazılan metin silinmez" şartı ortak gönderim mantığına dokunur:
bugün `send` metni istek atılmadan siler (`chat-panel.tsx:1020`) ve 402'de kullanıcı balonunu da kaldırır (`:1055-1067`);
fotoğrafta dosya ve not baştan temizlenir (`:871-875`). Yani bugün metin **kayboluyor**; düzeltme Faz 3B'de bu
satırlara dokunmayı gerektirir.

---

## 6. API rotaları: plan / limit zorlayanlar ve zorlamayanlar

"SQL" = `credit_reserve_metered` (sayaç, `plus_only_action` → `plus_required`, `free_lesson_trial.sql:81-121`).
`requireFeature("podcast"|"speech"|"oral_transcribe")` ücretsizde **geçer** (`studios: true`, `entitlements.ts:75-77`,
`:131-136`); bu uçlarda asıl kapı SQL'dir.

| Rota | Zorlama | Kanıt |
|---|---|---|
| `/api/ai/chat` | `reserveCredits` mesaj (`chat`), görselde `photo`; 402 + kod | `route.ts:322-324` |
| `/api/ai/solve` | `IMAGE_SOLUTION` (fotoğraf) / `AI_CHAT_STANDARD` (yazılı); fotoğraf istismar sınırı | `src/lib/solve/solve-run.ts:112-123`; `service.ts:165-167` |
| `/api/learning/exam-prep/node` | 1. konu dışı 402 `free_topic_limit`; Plus adımı 402 `premium_required`; harcama sigortası; 402 `free_lesson_limit`; motor ayırması | `src/lib/learning/node/start.ts:67-79`, `:283-285`, `:310-312`, `:332-333`, `:342-344` |
| `/api/learning/exam-prep/podcast`, `/api/learning/podcast/generate` | `requireFeature` (ücretsiz geçer) + SQL `PODCAST_GENERATE` | `exam-prep/podcast/route.ts:61-62`; `podcast/generate/route.ts:34-35`; `teacher-podcast-run.ts:425` |
| `/api/learning/podcast/audio`, `/api/learning/speech` | Ücretsizde yalnız önbellek / SQL `AUDIO_SYNTHESIZE` | `podcast/audio/route.ts:63`, `:88`, `:99-100`; `speech/route.ts:32-33`, `:49-50` |
| `/api/learning/exam-prep/video` | `requireFeature("video")` (yalnız ücretli) veya `billingExempt` | `video/route.ts:36-37`; `video-run.ts:256-258` |
| `/api/learning/exam-prep/voice` | SQL `VOICE_TURN` | `voice/route.ts:116-125` |
| `/api/learning/oral/generate` | SQL `ORAL_EXAM_GENERATE` | `oral/generate/route.ts:40` |
| `/api/learning/exam-prep/mock-exam`, `/api/learning/exam/generate` | SQL `PRACTICE_EXAM_GENERATE`; havuz kâğıdı yalnız ücretli | `mock-exam-durable.ts:197`; `mock-exam/create.ts:110`; `pool-exam.ts:39` |
| `/api/learning/exam-prep/duel` | `freeLessonRefused` + `QUIZ_GENERATE` | `duel/route.ts:65`, `:109-125` |
| `/api/learning/{quiz,flashcards,true-false,study-plan}/generate`, `/exam-prep/challenge` | `freeLessonRefused` (402 `free_lesson_limit`) + ayırma | `quiz/generate:41`; `flashcards/generate:37`; `true-false/generate:60`; `study-plan/generate:40`; `challenge:94` |
| `/exam-prep/{coach,reexplain,feedback,intro}` | Ayırma, sayaç `included` (ücretsizde günde 40) | `coach:88-90`; `reexplain:55-57`; `feedback:114-116`; `intro:481` |
| `/api/learning/explain` | Ayırma, varsayılan `chat` sayacı | `explain/route.ts:56` |
| `/exam-prep/create`, `/exam-prep/invite/join` | Ücretsizde tek hazırlık, 402 | `create/route.ts:213`; `invite/join/route.ts:46` |
| `/api/school` | 402 (03'e göre) | `school/route.ts:107` |
| `/api/documents/process`, `/api/documents/preflight` | Sayfa/fotoğraf hakkı 402, belge ücreti | `process/route.ts:336`, `:559`; `preflight/route.ts:58` (03) |
| `/api/learning/oral/transcribe` | `requireFeature` (ücretsiz geçer), kredi yok | `oral/transcribe/route.ts:28-31` |
| **Zorlamayan:** `/api/duels/[code]/run`, `/bot` | Yalnız hız sınırı | `run/route.ts:43`; `bot/route.ts:24` |
| **Zorlamayan:** `/exam/paper-read` | Model çağırır, kredi ve plan yok; sahiplik + 6/dk, 20/gün | `paper-read/route.ts:39`, `:46-51` |
| **Zorlamayan:** `/twin-question`, `/two-option-hint`, `/question-report` | Yalnız hız sınırı | `twin-question:35`; `two-option-hint:23`; `question-report:38` |
| **Zorlamayan:** `/exam-prep/intake` | `chargeCredits: false` | `intake/route.ts:509` |
| **Zorlamayan:** `/exam/grade`, `/oral/grade` | 0 kredilik iş, 402 yok | `exam/grade/route.ts:34`; `oral/grade/route.ts:101` |
| **Zorlamayan:** `/api/student/create-class`, `/api/calendar` | Yalnız hız sınırı | `create-class/route.ts:12-16`; `calendar/route.ts:15,39` |
| `cram.export` (sınav sabahı kâğıdı) | **API yok**; karar sayfada (`plusOnlyLocked`) | `src/app/deneme-sinavlari/[prepId]/sinav-sabahi/page.tsx:41` |

---

## 7. `/siniflar`, `/takvimim`, `/krediler`

| Sayfa | Plan / kredi / limit okuyor mu | Kanıt | Öneri |
|---|---|---|---|
| `/siniflar` | Sayfa okumaz (yalnız kabuk). Katılım ucu, grup sahibinin **öğretmen** hakkını okur: sahibinde `teacher`/`verified_teacher`/`admin` rolü varsa ve abone değilse 30 öğrenci sınırı (403) | `src/app/siniflar/page.tsx:27-41`; `src/app/api/student/join-class/route.ts:104-115`; `src/lib/teacher/entitlements.ts:6-7`, `:56-78`, `:111` | Gate'e girmesin (plan eylemi değil). Eski öğretmen sınırı ayrı raporlanmalı; `getGate` dışında kalmalı |
| `/takvimim` | Okumaz (yalnız `calendar_events`, `exam_preps`) | `src/app/takvimim/page.tsx:13-26` | Gate'e girmesin |
| `/krediler` | Yoğun okur: kurucu dalı `isAdmin`, `isPremium`, `planTier`, cüzdan, `quotaView`, ücretsiz sayaçlar, `firstLessonStatus` | `src/app/krediler/page.tsx:116-138`, `:147-179`, `:197-219` | Kapı değil, **görünüm**: rakamlarını `resolvePlan` / `config.ts` ile aynı kaynaktan okumalı (Kullanım satırıyla tutarlı olsun); kendi hesabını tutmamalı |

---

## DUR adayı mı?

Yalnız olgular. §2.6 koşuluna göre karar yöneticinin.

**(a) Atomik olmayan sayaç: bulunamadı.** Ücretsiz sayaç tek koşullu `INSERT … ON CONFLICT … WHERE used < limit` ve
cüzdan kilidi altında; ücretli kota cüzdan `FOR UPDATE` altında; ikisi de `idempotency_key` ile çift saymıyor
(§2 tablosu). Bununla birlikte ANA-PROMPT 3A'nın "sayaç işlem BAŞARILI olunca artar" tanımıyla birebir değil:
- Sayaç işten **önce** artar, hatada iade edilir (ayır → kesinleştir/iade).
- Ücretsiz sayaç gün değişince iade edilmez (`free_tier_counts.sql:256`).
- Öldürülen podcast/sözlü/video/çizimli video/sesli tur ayırmaları otomatik iade edilmez (`service.ts:273-285`).

**(b) `getGate`'in bugünkü sunucuyla ayrışabileceği yerler (bulundu):**
1. **Plus %100 ile ek paket:** sunucu `balance + free_allowance_remaining ≥ bedel` ise izin verir
   (`free_daily_zero.sql:186-197`). Yüzde %100 iken bakiye (ek paket, hediye) varsa sunucu açar; yüzdeye bakan
   `locked` yanlış olur.
2. **Sınav Haftası'nın sıfırlanma anı:** abonelik `ödeme anı + 7 gün` biter, cüzdan `UTC gün başı + 7 gün` sıfırlanır
   (`paytr_subscription_tier_only.sql:141-142,159` vs `:202-204`). Aradaki saatlerde abonelik hâlâ etkin olduğu için
   `credit_reserve` 7 günlük **yeni 2.700** hak yazar (`free_daily_zero.sql:138-162`). `resetAt = paket bitişi` kuralı
   bugünkü sunucuyla aynı değil. Test hesabı bunu göstermez: tohum iki tarihi eşit yazıyor (`scripts/seed-e2e-users.mjs:204`, `:229`).
3. **Ücretsiz "ilk ders":** sunucuda tek bir "kullanıldı" durumu yok. Karar düğüm başına ve açılış anında:
   1. konunun her adımının **ilk açılışı** ücretsiz (`first-lesson-cycle.ts:57-79`); ders bittikten sonra da konu testi,
   D/Y, kartlar açık; başka konu 402 `free_topic_limit` (`start.ts:67-79`), yeniden yazım/"Farklı anlat"
   `free_lesson_limit` (`:342-344`); bakiye varsa yine açık (`free-lesson-gate.ts:61-71`). Düğüm bağlamı olmayan
   `getGate(user, 'lesson.create')` bu kararı birebir veremez.
4. **Kurucu = `is_admin`:** sunucu muafiyeti `admin` ve `founder` rolüne birlikte verir (`founder_role.sql:38-49`,
   `free_daily_zero.sql:79`, `free_lesson_trial.sql:60`). `founder` planı `is_founder`'dan çözülürse yönetici rolündeki
   hesap için gate "sayaçlı" derken sunucu "muaf" der (06 §3).
5. **Okuma hatasında yön farkı:** sayaç okunamazsa ekran 0 kullanılmış der (`free-usage-server.ts:28-31`), SQL yine
   reddeder; `plusOnlyLocked` ve `pathSkipKinds` okuma hatasında **açık** döner (`node-free-meter.ts:23-24,31`);
   `freeLessonGate` plan okunamazsa `open`, cüzdan okunamazsa `gift` (`free-lesson-gate.ts:55-56,66,71-72`).
6. **GateReason listesinde olmayan sunucu retleri:** `spend_cap_free` (`service.ts:162-164`), `free_photo_abuse_limit`
   (`:165-167`), `free_included_limit` (günde 40), `free_topic_limit`, `free_prep_limit`.
7. **`photo.solve` iki yoldan:** sohbetteki görsel `AI_CHAT_STANDARD` + `photo` sayacı (`chat/route.ts:322-323`),
   soru çözücü `IMAGE_SOLUTION` (`solve-run.ts:112`); ücretli kotada bedel 3 ile 4.
8. **Ders ve mesaj tek havuz:** ücretlide "kalan ders" ve "kalan mesaj" ayrı sayılmıyor; ikisi aynı kredilerden
   türetilen tahmin (`price-table.ts:114-119`).
9. **Sınav Haftası kota metni:** tahtada sheet yok; bugün aboneye `PlusLimitBanner` (haftalık metin) ve
   `CreditLimitToast` çıkıyor (`sor-shell.tsx:415-417`, `plus-limit-banner.tsx:22-28`, `credit-gate.tsx:68-75`).
   ANA-PROMPT "tahtada olmayan şerit YOK" diyor; bu şerit bugün var.
