# Cortex Plus Platform

## TEK KAYNAK — başka hiçbir yer yok

| | Değer |
|---|---|
| **Repo** | `cortexplus55/burhancortexplus` — **tek repo** |
| **Yerel klasör** | `C:\Users\burha\OneDrive\Masaüstü\Cortex-Plus-Dev` |
| **Vercel** | scope `cortexplus55` → proje `burhancortexplus-app` → `cortexplus.app` (Root Directory: `cortex-plus/`) |
| **Supabase** | `dgjfyewgrukglsehyntc` |
| **GitHub hesabı** | `cortexplus55` (repoya `git config --local` ile sabitlendi) |

"Commit et" / "deploy et" denince gidilecek yer budur. Başka repo, başka klasör,
başka Supabase projesi **yok**. Bir tanesini gördüğünüzde bu dosyaya geri dönün.

**Kullanılmayacaklar:** `burhan55600-pixel/*` (GitHub'dan silindi),
`burhan55600-5553s-projects/*`, Supabase `gwqonggqzvavljguiryx` (emekli),
`nslhmgbicczkrcjwmdix` (duraklatılmış).

> Doğrulama sırası — bir daha yanlış hedefe çalışmamak için:
> 1. `cortexplus.app` istemci paketinden Supabase ref'ini oku
> 2. Vercel'de hangi projenin hangi repoyu deploy ettiğine bak
> 3. Ancak ondan sonra kod veya şema değiştir

---

- **App path:** `cortex-plus/` (Vercel Root Directory)
- **Bağlantı rehberi:** `docs/delivery/GREENFIELD-CONNECT.md`
- **CLI (Vercel / Supabase / gh):** `docs/delivery/CLI-CONNECT.md` — tek hedef; kurulum: `scripts/setup-cli.ps1`
  - ⚠️ **Yerel `vercel` CLI yanlış hesapta oturumlu** (`burhan55600-5553s-projects` / BrhnOndr — yukarıdaki
    "kullanılmayacaklar" listesinde). Deploy için CLI'ya güvenmeyin: `git push origin main` zaten
    production deploy'unu tetikliyor, doğrulama Chrome'daki panelden yapılır.
  - Panel URL'i: `https://vercel.com/cortexplus55/burhancortexplus-app/deployments`
    (`cortexplus55s-projects` diye bir scope **yok**, 404 verir).
- **Operasyon e-postası (tek):** **`cortexplus@cortexplus.app`** — panel, OAuth test, Squarespace, Gmail MCP, doküman; kişisel `@gmail.com` **yasak**. Ayrıntı: `docs/delivery/IDENTITY.md`, kural: `.cursor/rules/cortexplus-identity.mdc`
- **Bir şey bozulduğunda:** `docs/ops/README.md` — takılı ders, yanlış kredi, PayTR bildirimi, OpenAI kota, Supabase duraklama, yayın geri alma (belirti → bakılacak yer → işlem). Satışa hazırlık durumu: `docs/delivery/SATISA-HAZIRLIK-PLANI.md`

Kullanıcı **github hazır** dedikten sonra: Supabase proje oluştur, migration push, Vercel env, MCP `project_ref` güncelle.

---

## Ürün yönü — Astra paritesi kuzey yıldızı DEĞİL

**Karar tarihi: 2026-09-04.** Astra AI bir referans; "Astra'da var, bizde yok"
tek başına yapılacak iş gerekçesi **değil**. Bir özellik ancak Cortex Plus
öğrencisine bir şey öğrettiği için yazılır.

`docs/astra-parity/` ve `docs/astra-audit/` **arşivdir** — iş listesi değil.
İçlerindeki "bizde yok" ve "kapatıldı ✓" satırları bayat; kullanmadan önce
koddan doğrulayın. Gerekçe: `docs/astra-parity/README.md`.

**İçerik ev stili: `docs/delivery/ICERIK-EV-STILI.md`.** Konunun nasıl
bölüneceği, ders adımlarının ve podcast bölümlerinin nasıl adlandırılacağı,
eşik/sınıflandırma iddialarının kaynağa nasıl bağlanacağı orada. Kurallar
kodda doğrulayıcı olarak duruyor (`topic-title.ts`, `teaching-standards.ts`,
`CONTENT_STYLE`); belge nedeni anlatır. İkisi ayrışırsa **kod haklıdır**.
Ders/konu/podcast üretimine dokunmadan önce okuyun — buradaki her kural
canlıda çıkmış somut bir hatadan geliyor.

## Suspense sınırı bu projede sayfayı boşaltıyor

**4 Eylül 2026'da yayında yedi sayfa boştu.** Sunucu doğru HTML'i gönderiyordu;
sayfanın içeriği tarayıcıya ulaşıp gizli bir kutuda bekliyor, React'in onu
yerine koyan çağrısı ise sınırı bulamıyordu. Ekranda yalnızca menü ya da
sonsuza kadar duran bir iskelet kalıyordu.

Kural — bu projede bir sayfaya **Suspense sınırı eklemeyin**:

| Yapmayın | Yapın |
|---|---|
| Oturum gerektiren sayfaya `loading.tsx` koymak | Koymayın. Sayfa hazır olunca gelsin. |
| `useSearchParams()` kullanan istemci bileşenini `<Suspense>` ile sarmak | Sayfaya `export const dynamic = "force-dynamic"` ekleyin; sınır gereksizleşir. |

Tek istisna `/sohbetler/loading.tsx`: boş bir koyu kutu çiziyor ve çalıştığı
doğrulandı. Yeni bir tane eklerseniz, ekledikten sonra sayfanın **yayında
gerçekten açıldığını gözle görün** — derleme ve testler bunu yakalamıyor.
Bekçi test: `tests/unit/loading-fallbacks.test.ts`.

---

## Her hazırlığın kendi yolu — belgeler tek programda birleşmez

**3 Ekim 2026, ürün sahibi çok net:** "öğrenciye bütün yüklediği belgeleri tek
bir yolda birleştirmiş … her yüklediği dökümanın yolu farklı". Astra'da her
sınav bir derse ve kendi materyaline bağlı, yolu yalnız kendi kartında.

| Yapmayın | Yapın |
|---|---|
| Birden çok hazırlığı/belgeyi tek ekranda "bugünkü program" diye toplamak (eski "Çalış" sekmesi, `ProgramHub`) | Öğrenci Sınavlar'dan hazırlığını seçer, o yolu yürür |
| Kurulumun materyal adımında öğrencinin bütün eski belgelerini seçtirmek | Ders → tarih → hedef → yalnız o dersin materyali (Astra sırası) |
| Aynı belge için ikinci hazırlık açtıran düğme | Belgenin yolu varsa "Yoluna devam et" |

Menü Astra sırasında: Ana Sayfa · Sınavlar · Araçlar · Profil; Belgelerim "Daha
fazla" menüsünde (#234). `/calisma-plani` kalıcı olarak Sınavlar'a yönleniyor. #232.
Bekçi test: `tests/unit/separate-paths.test.ts`.

**3 Ekim 2026 son Astra turu (#234–#240), aynı ekranlar yan yana bakılarak:**

| Ekran | Kural |
|---|---|
| Ders / test / podcast oturumu | Üst çubuk yok, tek çıkış × (`chrome="session"`) |
| Hazırlık sayfası | Simgeler üst çubukta; tanı bandı yok — "Seviye tespiti" yolun ilk düğümü |
| "Devam et" | Dersi doğrudan açar: etkin konu yoksa ilk konu, tanı zorunlu değil (açılınca ertelenir) |
| Hazırlık adı | Ana konulardan model yazar (`PREP_TITLE`); dosya adı yalnız yedek |
| Yol kartı, ders kurulumu | Kavram birimli derste dersin kendi adı |

3 Ekim'de eklenmeyenler (Yıldızlar, "Kağıtta çöz", video ders) **17 Ekim 2026'da ürün sahibinin kararıyla
eklendi** — aşağıdaki bölüm. Bekçi: `astra-final-ui.test.ts`, `continue-opens-lesson.test.ts`, `prep-title.test.ts`.

## Astra ile yan yana, 17 Ekim 2026 — eski "eklenmesin"ler geri alındı

Ürün sahibi: "geri kalanları tek tek en ince ayrıntısına kadar eksiksiz ekle". Bulgular ve sıra:
`docs/delivery/ASTRA-YAN-YANA-17-EKIM.md`. Simülasyon bölümü (/lab) **kapalı kalıyor**.

| Ne | Kural | Nerede |
|---|---|---|
| Yıldızlar | Kazanç tek satır (öğrenci, kaynak, ref) — aynı test iki kez saymaz; günlük hedef 50 (+25), haftalık seri (+100), davet (+100/+50), abone olan davetli (+300), okuldan katılım (+50), sohbet (günde bir, 3. mesajdan sonra 15), düello (Astra'nın okul maçının yeri). Sıralamada ad + soyadın baş harfi + okul; **Ayarlar'da gizleme** (ürün sahibinin kararı) | göç `20261017120000_stars.sql` (`award_stars`), `src/lib/stars/`, `stars-dialog.tsx` |
| Kâğıtta çöz | Yazılı denemede önce "Nasıl çözmek istiyorsun?"; kâğıt yalnız baskıda; Başla yazdırınca; fotoğraf en çok 10, cihazda küçültülür (4,5 MB gövde sınırı), saklanmaz; model yalnız işaret ve yazıyı okur, **çözmez**; not yine `/api/learning/exam/grade` | `paper-exam*.ts(x)`, `/api/learning/exam/paper-read` |
| Video ders | **Oynatıcıda birleşen video** (MP4 değil) ve **yalnız Plus** (ürün sahibinin kararları); senaryo öğretmen motoru kalıbında, sahne başına resim (`OPENAI_IMAGE_MODEL`) + ses; `VIDEO_GENERATE` 280 kredi. **1 dakika = 6-8 sahne, 85-115 kelime**: seslendirme saniyede ~1,64 kelime okuyor (178 kelime 1:48 çıktı); hedef kaçarsa düzeltme turu, yalnız sert sınır (70-140 kelime) videoyu düşürür | göç `20261017150000_prep_videos.sql`, `video-lesson.ts`, `video-run.ts` |
| Çok cevaplı soru | Yalnız hazırlığın konu testinde, tam bir soru, sonda; kısmi puan ekranda ("Kısmen doğru · %50"), kayıtlı puan tam sayı | `teacher-quiz.ts` (`multi`), `withOneMultiLast` |
| Kurulum | "Nasıl çalışmayı seversin?" çoklu seçim ve gerçekten kullanılıyor ("Önerilen" rozeti) | `learning_preferences.modalities`, `recommendedStudyTool` |
| Sınavlar / hazırlık sayfası | Astra düzeni: üç kutu ayrı sayfa, iki sütunlu ızgara, Yaklaşan/Geçmiş, Taslaklar; hazırlıkta sade üst çubuk (`minimalTop`), kahraman alanı, "Sıradaki" etiketi, hazırlık düzeyi beşgeni | `exam-prep.tsx`, `exam-prep-home.tsx` |
| Podcast | Diyalogda Kerem de anlatır (örnek, toparlama); soru-cevap türünde yine sorar | `podcast-formats.ts` |
| Yazılı deneme | Astra'nın kâğıdı gibi **çoktan seçmeli + açık uçlu** (%80 / %20; doğru/yanlış ve sayısal yer yok). Çoktan seçmeli test motorundan, açık uçlu sözlü motorundan (beklenen noktalar rubrik olur); **kod soruyu başka türe çevirmez** — şık silip doğru/yanlış yapınca "hangi grupta sınıflanır?" sorusuna Doğru/Yanlış şıkkı çıkmıştı. Açık uçlu cevabı tek model çağrısı ölçüt ölçüt, cevaptan **birebir alıntıyla** notlar; cevapta olmayan alıntı puan getirmez | `mock-exam/create.ts`, `mock-exam/open-grade.ts`, `grade-exam.ts` |

Canlı veritabanına göçler SQL ekranında uygulandı; panel `DROP POLICY` satırını "yıkıcı" sayıp onay
istiyor — yeni tabloda o satıra gerek yok, yazmayın.

### Tasarım: Astra'nın yazı ve renk sistemi birebir (17 Ekim 2026)

Ürün sahibinin kararı: yazı tipleri ve palet Astra'yla **birebir**; hazırlık sayfası iki sütun + 3B
düğüm; görseller **bize özgü** 3B set. Ölçümler ve 8 adım: `docs/delivery/TASARIM-ASTRA-17-EKIM.md`.

| Kural | Nerede |
|---|---|
| Dört yazı tipi: Figtree (metin), JetBrains Mono (etiket), Jersey 10 (karşılama, 404), Caveat ("hedef puan"); `ui-monospace` ya da tırnaklı başlık yazmayın | `layout.tsx`, `tokens.css` (`--font-mono/pixel/hand`) |
| Koyu palet: zemin #0d0d0d, yüzey #141414 / #1f1f1f, çerçeve #242424 / #303030, mavi #4353f3; **durum renkleri altın değil** (seçili sekme gri cam, seçim mavi, ilerleme yeşil); sarı yalnız marka, Plus, yıldız, seri, "hedef puan" | `tokens.css` `.dark`, `--glass-bg` |
| Yazı ölçeği `--t-*` (başlık 600, -0.02em; etiket 500, +0.01em); yeni ara boyut (13.6, 16.8) uydurmayın | `tokens.css` |
| 3B simgeler `Icon3D` ile, ad listesi tek kaynak; yeni görsel aynı tarzda üretilir | `components/ui/icon-3d.tsx`, `public/illustrations/3d` |
| `.cp-exam-page` ders/test/hazırlık ekranlarında da var: liste genişliği yalnız `.cp-exam-page--list` | `parity-shell.css` |

Bekçi: `astra-design-system.test.ts`, `icon-3d.test.ts`, `node-result.test.ts`.

### Telefon denetimi (18 Ekim 2026) — 375 px'te her sayfa tek tek gezildi

Ürün sahibi: "kendi tarayıcında mobile uyumlu mu değil mi, her sayfayı tek tek kontrol et".
Yerleşik tarayıcıda 375×812, koyu tema, herkese açık 26 + giriş yapılmış ~90 sayfa (ders, test,
video, sohbet, stüdyo, yönetim dahil). Ölçüm her sayfada aynı betikle: belge genişliği, kırpılan
metin, 24 px'ten küçük dokunma alanı; sonra ekran görüntüsü. Dört gerçek hata çıktı, hepsi CSS:

| Hata | Neden | Düzeltme |
|---|---|---|
| "Geri"li üst çubuk 456 px (sohbet, podcast, düello, ara, müfredat, okulum, resmî, hazırlıklarım): sayfa yana kayıyor ya da avatar kırpılıyor | Daraltma yalnız `--focus` kabuğundaydı; `--exam` kabuğunda "Daha fazla" yazısı + 20 px boşluklar; kurucu çipi tek başına 79 px | `@media (max-width: 480px)` kuralı iki kabuğa; kurucu çipi telefonda gizli |
| Belgelerim 418 px | `.cp-docs` ızgara hücresi `min-width: auto` → tek satırlık dosya adı hücreyi büyütüyor | `.cp-docs { min-width: 0 }` |
| Kayıt sihirbazı 384 px | `.onboarding-ambient` ışık katmanı `inset` ile 1,5 rem yanlara taşıyor | yatay `inset: 0` |
| Video: kilit bilgi kutusu duraklatınca oynat düğmesine biniyor (223–313 / 299) | kutu %40'ta, orta düğmeler %50'de | kutu %24 (#303) |

Küçük: belge kartında "Sil" 13×16 ve "← Belgeler" 58×14 → 32 px; `/duello/KOD` büyük harf → küçük harfe
çevrilir. **Sorun çıkmayanlar:** ders ekranları (tablo kendi kutusunda yana kayar), test, sonuç,
podcast/düello kurulumu, stüdyo, araçlar, ödeme, profil/ayarlar, menüler ve yıldız/etkinlik pencereleri,
yönetim sayfaları (tablolar kendi kutusunda kayar; `/admin/adaptive` 622 px — hata ayıklama sayfası,
bırakıldı). Bekçi: `mobile-audit-guards.test.ts`; oturumlu e2e 390 px (`authenticated.spec.ts`, `E2E_USER_*` ister).

**Kurulum taslağı cihazlar arası (18 Ekim 2026, plan 2.3):** sihirbazın yarım taslağı tarayıcıda
(24 saat) **ve** sunucuda (`exam_wizard_drafts`, kullanıcı başına tek satır, yazma yalnız
`/api/learning/exam-prep/draft`). Açılışta ikisinden yeni olan alınır (`pickNewerDraft`); boş taslak
satırı siler; tablo ya da ağ yoksa tarayıcı kopyasıyla sessizce devam. Sınavlar sayfasındaki
"Taslaklar" kartı bu cihazda taslak yoksa sunucudakini gösterir. Bekçi: `exam-wizard-draft*.test.ts`.

### Paralel işler aynı ödeme anahtarını paylaşmaz

**2–17 Ekim 2026 yazılı deneme yalnız ilk konunun sorularıyla çıktı** (Pediatri'de 10 sorudan 1).
Deneme her konu için ayrı öğretmen üretimi başlatıyor, hepsine aynı `idempotencyKey`'i veriyordu;
kredi sistemi anahtarı ilk işe veriyor, ötekiler `operation_in_progress` / `operation_completed` alıp
**sessizce boş** dönüyordu. Ekranda yalnız "Planlanan 10 sorudan 1'i hazırlandı" görünüyordu.

| Yapmayın | Yapın |
|---|---|
| Bir işin parçalarına aynı anahtarla ayrı ayrı `reserveCredits` | Krediyi bir kez ayırın, parçalara `heldReservationId` verin (`runTeacherQuiz`, `runWithTeacherModel`); en az bir sonuç varsa kesinleştirin, yoksa iade |
| Parça başına yeni anahtar | Öğrenciden parça sayısı kadar ücret keser (16 konu × deneme ücreti) |

Bekçi: `mock-exam-charge.test.ts` (gerçek kredi davranışını taklit eder; eski kodla 16 sorudan 1'i üretir).

**Aynı içeriğe aynı anahtar doğru, ama anahtarı alamayan istek düşmez — bekler (19 Ekim 2026).**
Podcast sesi: oynatıcı aynı sese 5 sn arayla iki istek attı (kayıt tazelenince bölümler yeni diziyle
geldi, ses etkisi yeniden koştu). İlk istek 14 sn'de sesi üretip krediyi düştü; ikincisi
`credit_reserve`'den `operation_in_progress` alıp "Ses şu an üretilemedi" dedi — öğrenci ödediği sesi
duymadı. Şimdi `synthesizeCharged` bu cevapta öteki işin bitmesini bekleyip sesi önbellekten bedava
veriyor (`waitForInFlightAudio`); oynatıcı ses isteğini içerik anahtarına bağlıyor (`chaptersKey`),
kaldığı-yer anahtarı isteği yenilemiyor. Runbook: `docs/ops/podcast-ses.md`. Bekçi:
`audio-credits.test.ts`, `podcast-audio-once.test.tsx`.

---

## Ürün öğrenci-only — veli ve öğretmen paneli yok

**`3e666f6` (29 Ağustos 2026)** veli ve öğretmen arayüzünü tümüyle emekli
etti: `/ogretmen-paneli/*`, `/odevlerim/*`, `/onboarding/veli`,
`/onboarding/ogretmen` silindi, kayıt sihirbazından veli/öğretmen adımları
çıkarıldı, `/ogretmenler-ve-profesorler-icin` emekli rota oldu (middleware
`/ogretmen`'e gönderiyor; oturumsuz ziyaretçi `/giris`'e düşer — e2e
`auth.spec.ts`). "Veli tarafını düzeltelim" denince önce bu satır okunmalı.

Bugün geriye kalanlar (4 Eylül 2026 itibarıyla doğrulandı):

| Kalan | Durum |
|---|---|
| `/siniflar` | **Öğrenci** sayfası — öğrenci sınıf kurar ya da koda katılır. Öğretmen paneli değil. |
| `verified_teacher` rolü | Hâlâ iş görüyor (quiz üretiminde daha yüksek sınır). Yalnızca yönetim panelinden elle veriliyor. |
| `/admin/ogretmen-basvurulari` | Duruyor ama **yeni başvuru gelmiyor** — form ve API kaldırıldı. Bekleyen kayıt yok (20 Ekim 2026'da bakıldı: tek kayıt 28 Ağustos'ta onaylanmış). |
| `parent_payment_requests` | Yaşıyor ve öğrenci tarafı: "veliden ödeme iste". Astra'da bu yok, bizde çalışıyor — bilerek duruyor. |
| **Velime ödeme linki** (29 Ekim 2026, ürün sahibinin kararı) | Öğrenci-only kuralının tek istisnası: veli **hesap açmadan**, imzalı 3 günlük bağlantıyla öğrencinin planını öder (`/odeme/veli/[token]`). Veli paneli yok; veli hiçbir öğrenci verisini görmez (yalnız ad ve plan). Ayrıntı: "Paket F" bölümü. |
| `src/lib/parent/link-status.ts`, `profile.ts` | Canlı: veli bağlama ve veli profili kaydı hâlâ kullanılıyor. |

**Astra karşılaştırması (4 Eylül 2026, siteden doğrulandı):** Astra'da veli
paneli, öğretmen paneli, okul/kurum planı ve aile planı **yok**. Pazarlama
sitesinde yalnızca öğrenci sayfaları var; "ebeveyn" kelimesi tek bir yerde,
yorum başlığında geçiyor ("Ebeveynler ve öğrenciler ne düşünüyor?").
"Öğretmen" her yerde yapay zekâ öğretmeni anlamında. Ödeme sayfasında iki
ücretli kademe var (Plus, Sigma), veliyle ilgili hiçbir şey yok.

**Bu yüzden 4 Eylül'de temizlendi:** `coach-context`, `coach-quota`,
`constants`, `child-profile`, `child-summary`, `plus-children`,
`plus-href`, `study-days`, `teacher/ai-tools-catalog`,
`TeacherApplicationForm`, `/api/teacher/apply`,
`/api/teacher/bootstrap-class` — 567 satır ölü kod. Son ikisi arayüzden
erişilemeyen ama canlı POST uçlarıydı; `bootstrap-class` ayrıca
`/api/student/create-class`'ın hız sınırı olmayan bayat kopyasıydı.

Veritabanı tabloları bilerek duruyor — arayüz geri gelebilir, veri gelmez.

---

**Geri alınmış özellikler — yeniden yazmayın:** `13a175e` "Uygulamalar"
bölümünü tümüyle kaldırdı (34 simülasyon, 5 mini oyun, günün bulmacaları,
liderlik tablosu, AI uygulama üreteci). Yerine 12 araçlık `/araclar` geldi;
`/uygulamalar` kalıcı yönlendirme. Veritabanı tabloları (`lab_app_plays`,
`daily_puzzles`, `user_apps` …) bilerek duruyor — arayüz geri gelir, veri gelmez.

**11 Eylül 2026 — karar bir kez daha soruldu, aynı kaldı.** Astra paritesi
turunun sonunda "Astra'da `/lab` var, bizde yok" maddesi ürün sahibine açıkça
soruldu; cevap **geri getirilmesin** oldu. Gerekçe değişmedi: 34 simülasyonun
öğrenciye ne öğrettiği ölçülemiyordu, yerine gelen 12 araçlı `/araclar` ölçülebilir
iş yapıyor. Bu satır tartışmayı kapatmak için duruyor — bir sonraki parite
turunda bu maddeyi yeniden açmayın.

---

## Ödeme: otomatik yenileme bugün açılamıyor — mimari engel

**17 Eylül 2026'da PayTR'nin kendi dokümanından doğrulandı.** "Auto renew
açalım" istendiğinde bakılacak yer burası; cevap "yetki bekliyoruz" değil.

Kullandığımız **iFrame API'nin kart saklama parametresi yok** — `store_card`,
`utoken`, `ctoken` iFrame token isteğinin parametre listesinde geçmiyor. Kart
saklama tümüyle **Direkt API** başlığının altında ve Direkt API'de kart
numarası ile CVV **kendi sunucumuzdan** PayTR'ye gidiyor: PCI-DSS kapsamı.

Yani Non3D yetkisi alınsa bile saklanacak bir kart olmuyor. Engeller kodda
tek yerde: `src/lib/payments/paytr-capability.ts` → `RECURRING_BLOCKERS`,
`/admin/sistem` sayfasında tablo olarak görünüyor. Aynı dosyadaki
`AUTO_RENEW_SUPPORTED` **tek kaynak**: `false` durduğu sürece bir bekçi test
sözleşme metninin "otomatik olarak yenilenmez" demeye devam ettiğini tutuyor.

**Sıra önemli:** önce Direkt API + kart saklama + Non3D yetkisi, en son
sözleşme metni ve `AUTO_RENEW_SUPPORTED`. Tersi yapılırsa sözleşme
tutulamayan bir söz verir — abonelik sessizce biter, vaat edilen tahsilat hiç
olmaz. Ayrıntı: `cortex-plus/docs/delivery/PAYTR-ABONELIK.md`.

Mağazada yetkinin gerçekten olup olmadığı artık tahmin değil:
`probePaytrRecurring()` kart saklama servisine var olmayan bir kullanıcı için
liste soruyor (para hareketi yok) ve cevabı `/admin/sistem`'e yazıyor.

**Karar park edildi (17 Eylül 2026):** "Direkt API'ye geçip PCI'ı kabul
edelim mi" sorusu ürün sahibine soruldu; cevap **önce PayTR'ye soralım**
oldu. Talep **3 Ekim 2026'da gönderildi** (Mağaza Paneli → Destek, Teknik Destek /
Entegrasyon, mağaza 747272): `cortex-plus/docs/delivery/PAYTR-DESTEK-TALEBI.md`
— dört soru ve her cevabın ne değiştireceği yazılı. Cevap panelde "Destek
Talepleriniz" altında ve hesabın e-postasına gelir.

**PayTR cevap verdi (5 Ekim 2026):** abonelik yalnız **Direkt API + Non3D** ile;
hazır aylık çekim yok (zamanlayıcı bizde), ödeme sayfası ve taksitler de bizde;
geçiş PayTR onayına bağlı; 3D'siz itirazda ispat yükü bizde. **Ürün sahibi 8 Ekim'de
başvurmaya karar verdi**, talep gönderildi (Direkt API Talebi; ilk ödeme 3D, yalnız
yenilemeler Non3D; PCI seviyesi soruldu). **Onay gelene kadar hiçbir şey
değişmiyor:** iFrame, hatırlatmalı elle yenileme, "otomatik olarak yenilenmez",
`AUTO_RENEW_SUPPORTED = false`. Ayrıntı ve onay sonrası sıra aynı belgede.

## Ücretsiz katman (3 Ekim 2026) — günde bir ders, bir hazırlık, toplam 5 sayfa

Ürün sahibinin kararı, aynı gün Astra'nın ücretsiz hesabı ölçülerek: Astra'da
**tek sohbet mesajı günlük hakkın %64'ünü** yedi; ikinci mesajla hak doldu,
üçüncüsünde cevap bulanık + geri sayımlı yükseltme kapısı çıktı. Sayaç %0'dayken
bile ücretsiz hesap yeni hazırlık kuramıyordu.

| Kural | Nerede |
|---|---|
| ~~Günlük hak 6 kredi~~ → **24 Ekim 2026'dan beri sayaç:** haftada 3 ders, günde 3 mesaj, günde 1 fotoğraf; günlük kredi 0 (aşağıdaki "Kredi v3") | `free-meters.ts`, göç `20261024121000` |
| **Bir** sınav hazırlığı ("Hedef puan" kaydı sayılmaz); ders seçilince kapı | `free-prep-limit.ts`, sihirbaz + sohbet + okul kopyası |
| Hesap başına **toplam 5 sayfa** belge işleme (silinenler dahil); fazlası işlenmez, "ilk N sayfa işlendi" yazar | `free-pages.ts`, `pdf-ingestion.ts`, `pipeline.ts`, `documents.source_page_count` |
| Resim sayfası hakkı dolunca belge **reddedilmez**; o sayfalar atlanır | `scan_pages_skipped` |
| Konu haritası, kurulum sohbeti ve ücretsizde belge işleme **ders hakkından yemez** | `generateJson({ chargeCredits: false })` |
| Kapıda geri sayım + "neden ücretsiz değil" | `upgrade-sheet.tsx` |

Sayılar tek yerde: `src/lib/billing/free-tier-copy.ts`. Kampanya bandı kurulmadı
(karar: şimdilik değil; `/admin/promosyonlar` hazır). Bekçi: `free-tier.test.ts`.

**Ücretsiz akışı denemek için test hesabı açmayın:** `/admin` → "Ücretsiz gibi gör"
(8 Ekim 2026). Kurucu hesabı o an ücretsiz öğrenci gibi sınırlanır: 24 Ekim 2026'dan beri ücretsiz
sayaçlarla (önizleme açılınca sıfırlanır; günlük kredi 0, cüzdana dokunmaz), belge ve hazırlık sınırı yalnız önizleme
başladıktan sonra eklenenleri sayar. Kapatma düğmesi öğrenci ekranlarının üstündeki
şeritte. Yeni bir yönetici muafiyeti eklerken `isAdminUser` değil `billingExempt`
kullanın, yoksa önizleme o noktada sınırı atlar. Bekçi: `free-preview.test.ts`.

## Kredi sistemi v2 (8 Ekim 2026) — 1 kredi = $0,001, Plus ayda 7.200

Ürün sahibinin kararı: tek sayaç, **Astra'dan fazla kullanım**, yoğun öğrencide
**%50 kâr**. Astra Plus canlıda ölçüldü (1 mesaj aylık hakkın %0,05'i → ≈2.000 mesaj;
1 ders %0,26–0,45 → 220–380 ders); bizde Plus ayda 2.400 mesaj ya da 1.200 ders.
Hesap, tablo ve kararlar: `docs/delivery/KREDI-SISTEMI.md`. **24 Ekim 2026: fiyatlar v3** (ders 30, test 10,
mesaj 3; Plus ayda 240 ders ya da 2.400 mesaj) — aşağıdaki "Kredi v3" bölümü.

| Kural | Nerede |
|---|---|
| Her işin kredisi ölçülen maliyetinden (mesaj 3, ders 6, test 4, podcast 12, sözlü 8, deneme 15) | göç `20261008120000`, `price-table.ts` |
| Podcast, sözlü, sesli sohbet kendi koduyla (eskiden ders ya da sohbet fiyatındaydı) | `PODCAST_GENERATE`, `ORAL_EXAM_GENERATE`, `VOICE_TURN` |
| Belge sayfa başına: metinli 2, taranmış +6; hak yetmezse yettiği kadar sayfa | `pdf-ingestion.ts`, `process/route.ts`, sihirbazda önceden "%X" |
| Büyük belgenin konu haritası luna (gpt-4.1'de 100 sayfa $0,30 idi) | `OPENAI_OUTLINE_LARGE_MODEL` (eski ad Vercel'de kalsa da okunmuyor) |
| Öğrenci kredi sayısı görmez; hak somut sayıyla anlatılır, "kat" yazılmaz | `allowanceWorkLine` |

Bir işin bedelini değiştirirken önce `ai_usage_events`'ten yeniden ölçün; göç ve
`price-table.ts` birlikte değişir. Bekçi: `credit-system-v2.test.ts` (göçü PGlite'ta
çalıştırır), `tutor-surface-credits.test.ts`.

## Satıcı bilgileri: bir alan bilerek yayınlanmıyor

Vergi levhasından girildi (`src/lib/legal/seller.ts`): **Mukadder Önder**,
şahıs işletmesi, Bafra / Samsun, vergi dairesi **Bafra**, iletişim
`cortexplus@cortexplus.app` ve telefon.

**Telefon yayınlanıyor (20 Eylül 2026'dan beri):** PayTR canlı onayı sitede
telefon istedi; o güne kadar "kişisel numara yayınlanmasın" kararı vardı,
onayla birlikte kalktı. `missingSellerFields()` telefonu zorunlu sayar.

**Yayınlanmayan — ürün sahibinin kararı, eksiklik değil:**

| Alan | Neden |
|---|---|
| Vergi kimlik numarası | Şahıs işletmesinde bu numara T.C. kimlik numarası; herkese açık olması gerçek bir gizlilik riski. Vergi dairesi gösteriliyor. |

`ACCEPTED_OMISSIONS` altında gerekçesiyle duruyor ve `missingSellerFields()`
bunu eksik saymıyor — saysaydı hukuki sayfaların başında sürekli kırmızı
uyarı dururdu ve uyarı anlamını yitirirdi. Kabul edilen risk: bir denetimde
eksik sayılabilir.

---

## Vercel Hobby: en fazla 2 cron, her biri günde 1 kez — aşarsan HİÇBİR deploy çıkmaz

**23 Eylül 2026'da dört commit main'e gitti, hiçbiri yayına çıkmadı.** Vercel'de
ne READY ne ERROR kaydı vardı; tek iz GitHub commit statüsündeki "Deployment
failed" ve `vercel.link` kısaltmasının açıldığı sayfaydı:
`vercel.com/docs/cron-jobs/usage-and-pricing`. Sebep: `vercel.json`'a üçüncü ve
**saatlik** bir cron (`/api/cron/data-deletion`, `30 * * * *`) eklenmişti.
Hobby plan 2 cron ve günde 1 çalışma ile sınırlı; kota aşımında Vercel
deploy'u **oluşturmadan** reddediyor. Build, typecheck, test ve e2e bunu
göremez — hepsi yeşildi.

| Yapmayın | Yapın |
|---|---|
| `vercel.json` `crons`'a üçüncü giriş eklemek | İşi mevcut günlük cron'un içine bağlayın (veri silme kuyruğu `subscription-renewal` içinde çalışıyor) |
| Saatlik/dakikalık cron (`*` dakika ya da saat alanında) | Dakika ve saat sabit rakam olsun (`0 6 * * *`) |
| Push sonrası "deploy oldu" varsaymak | `gh api repos/cortexplus55/burhancortexplus/commits/<sha>/status` — `Vercel` statüsü `failure` ise `target_url`'i takip edin |

Bekçi test: `tests/unit/uat-gate-guards.test.ts` → "vercel.json cron kotası".

## Tek geçiş (26 Ekim 2026) — bölüm ve soru silinmez

Yazar tek çağrıda yazar. Denetçi, avukat ve kavramı baştan yazma turu yok. JSON bozulursa o parça bir kez daha istenir; sayı eksikse yalnız eksik kadar bir çağrı daha yapılır. Ayrışan taslak öğrenciye gider: `missingConcepts` ve "Bu bölüm bu sefer yetişmedi" üretilmez. İnce notta `origin: "curriculum"` alt konu açılır; belge dışı sınav bilgisi "Sınav Müfredatı Tamamlaması" kutusundadır. Hazırlık yüzdesi çalışılmamış konuyu 0 sayan hâkimiyet ortalamasıdır. Sözlüde kesintiye yalnız hakem modeli karar verir; kod hakemin puanını düşürmez ("Paket H", 29 Ekim 2026). İstisna (30 Ekim): ders bitince `diagram_card` yoksa tek küçük tamamlama çağrısı yapılır.

## Öğretmen ders motoru (2 Ekim 2026) — eski onarım zinciri silindi (3 Ekim 2026)

Belgeli sınav hazırlığı dersleri öğretmen motorundan geliyor: temiz sayfa metni (`document_pages.clean_text`) → tek öğretmen
istemi (`teacher-lesson.ts`) → kavram kavram model denetimi → yalnız sorunlu kavramın düzeltilmesi
(18 Ekim 2026'dan beri, aşağıdaki "Ders hızı" bölümü).
**Kod ders metnine hiçbir şey eklemez** — "Kaynak:" satırı, kalıp özet, dolgu
soru yok. Düzelmeyen kavram öğrenciye gitmez: bir kez baştan yazılır (18 Ekim 2026), o da geçmezse atılır ve
bitiş ekranında adıyla söylenir (`missingConcepts`); **19 Ekim 2026'dan beri ilk kavram için de aynı** — hiçbir kavram geçmezse ders bir kez baştan yazılır, o da olmazsa kredi iade (aşağıdaki "İçerik üretilemedi demez" bölümü).
Gerekçe ve altın deneme sonuçları: `docs/delivery/ICERIK-KALITE-YOL-HARITASI.md`.

| Yapmayın | Yapın |
|---|---|
| Kötü bir dersi kodla "onarmak" | İstemi ya da denetimi düzeltin, sonra altın denemeyi (`tests/unit/_tmp/golden-lesson.test.ts`, yerel) yeniden koşun |
| Kaynaktaki bozuk cümleyi kopyalatmak | Yazar kaynağın kendi örnekleriyle tutarlı anlamı sessizce yazar; denetçi bunu sorun saymaz |
| Yazar ve denetçiye farklı kural vermek | Bir kural eklenince ikisine de eklenir — çelişirse düzeltme turu hiçbir şey değiştirmez |

Belgesiz hazırlık dersleri de aynı motordan (`mode: "topic"`): aynı akış, kaynak
kuralı yerine doğruluk kuralı, denetçi doğruluğa bakar. Hazırlık sohbeti de öğretmen
yolunda (`teacher-tutor.ts`), öğrencinin seçtiği moda göre; **varsayılan mod 9 Ekim 2026'dan beri
"Belgem + genel bilgi"** (belgede olmayan bilgi "Genel bilgiden:" etiketiyle, Faz 5 kararı).

**2 Ekim 2026: bütün içerik öğretmen motorlarında** (ürün sahibinin kararı). Hepsi
aynı kalıp: temiz çekirdek sayfalar (dersle aynı sayfalar) → tek öğretmen istemi →
öğeyi **önce kendisi çözen/cevaplayan** model denetimi → sorunlu öğenin düzeltilmesi
ya da elenmesi → yetmezse içerik gösterilmez, kredi iade. Kod metne dokunmaz; yalnız
biçim (başlık yazımı, gösterim/seslendirme) ve sıra (şık karıştırma, zor kart önce).

| İçerik | Dosya |
|---|---|
| Ders (belgeli + belgesiz) | `teacher-lesson*.ts` |
| Hazırlık sohbeti (`TUTOR_ENGINE`) | `teacher-tutor*.ts` |
| Konu testi, tuzak, yazılı deneme, son kontrol, odaklı pratik, soru-cevap, deneme sınavı, düello, tanışma, tanı, test aracı | `teacher-quiz*.ts`, `exam-quiz-generate.ts` |
| Podcast (5 tür) | `teacher-podcast*.ts` |
| Kartlar, aralıklı tekrar | `teacher-cards.ts` |
| Doğru/yanlış, sözlü deneme | `teacher-practice.ts` |
| Kavram birimi (`TOPIC_UNITS_ENGINE`) | `concept-units*.ts` |

Ortak parçalar: `teacher-item-loop.ts` (yedekli taslak, öğe öğe denetim, düzeltme),
`teacher-engine-run.ts` (kredi kabuğu). Çoktan seçmeli şıklar soru metnine bağlı
sabit sırayla karışır — model doğru cevabı neredeyse hep ilk şıkka yazıyordu.

**Eski taslak + onarım zinciri 3 Ekim 2026'da silindi** (ürün sahibinin kararı;
~8.200 satır: `lesson-repair`, `lesson-teach`, `lesson-quality-pipeline`, eski
test zinciri, `/calis` oturumu, `LESSON/QUIZ/PODCAST/CARDS/PRACTICE_ENGINE`
anahtarları). Çekirdek sayfası bulunamayan belgeli içerik yazılmaz:
`source_unavailable`, kredi düşmez. Eski zincirin canlı hatalardan çıkmış
kuralları (aralık uçları, iki doğru kural yan yana şık) `teacher-quiz.ts`'in yazar
ve denetçi istemine taşındı. Kötü içerik için kod onarımı geri getirilmez — istem
ya da denetim düzeltilir.

**Araçlar da öğretmen motorunda (3 Ekim 2026, #242):** `/araclar` kartları, podcast,
sözlü deneme, sesli ders/sesli sözlü ve ders podcast'i aynı motorlardan;
kaynak `studio-teacher-source.ts` (belge seçiliyse konunun sayfaları, değilse konu
modu). Eski `generateJson` taslak yolu bu uçlardan kalktı.

**Sıradaki ders önceden yazılıyor (3 Ekim 2026, #243):** öğrenci bir dersi açınca
aynı konunun yolundaki sonraki ders (18 Ekim'den beri: yoksa sıradaki konunun ilki; hazırlık
kurulunca da ilk ders) arka planda yazılır, `exam_prep_prefetch`'te
bekler. **Kredi yalnız öğrenci açınca düşer**; açılmayan dersin model maliyeti
bizde (kullanım `LESSON_PREFETCH` koduyla). Arka plan isteği öğrencinin çerezini
taşımaz — Supabase yenileme anahtarını iki istekte kullanmak oturumu düşürebilir;
sunucu imzalı kısa ömürlü başlık (`lesson-prefetch.ts`) taşır. Öğrencinin aşinalık
cevabı başka kuşaktaysa (yeni/duymuştum · temel · iyi/güvenli) hazır ders atılır,
yeniden yazılır. Bekçi test: `lesson-prefetch.test.ts`.

**Ders biçimi LessonV3: Ders → Ekran → Blok dizisi (16 Ekim 2026, ürün sahibinin kararı).**
Yeni dersler `format: 3` yazılır (`lesson-v3.ts`): her ekran sıralı bloklar (`text`,
`formula`, `procedure`, `table`, `cards`, `note`, `diagram`, `example`, `check`); bir
kavram 2-3 ekrana yayılabilir (`concept` aynı kalır). Kayıtlı V2 dersler veritabanında
olduğu gibi durur, okunurken çevrilir.

| Kural | Neden |
|---|---|
| **Ekran i = bölüm i** ve **ekran başına bir soru** (ilk `check` bloğu) | Cevaplar (`lessonAnswers[i]`), `grade-check`'in `sectionIndex`'i, puanlama ve tekrar soruları değişmeden çalışsın |
| Ders okuyan her yer `readLessonV3` (ekran) ya da `readLessonV2` (metin/puan görünümü) ile okur; `lessonV2Schema.safeParse` ile değil | Kayıtta iki biçim var; doğrudan V2 ayrıştırma V3 dersi sessizce boş sayar (podcast dersi görmez, sohbet bağlamı kaybolur) |
| İstemci `lessonFormat: 3` gönderir; göndermeyen V2 paketi alır (`sealStoredLesson`) | Yayın sırasında açık kalan eski sekme V3'ü okuyamaz, ders boş açılmasın |
| V3 mühür/oynatma kodu `lesson-play-v3.ts`'te, `lesson-play.ts`'te değil | `teaching-standards → lesson-play → lesson-v3 → teaching-standards` döngüsü şemaları yarım yükler; bütün test dosyaları içe aktarmada düşer |
| Soru ilk bloksa "önce dene": sonraki bloklar cevaptan sonra açılır | Gövde sorunun altında cevabı veriyordu (#259) |

Bekçi testler: `lesson-v3.test.ts` (çeviri, gidiş-dönüş), `lesson-v3-zscore.test.tsx`
(Z-skoru / hedef boy örneği: iki ekranlı kavram, blok sırası, mühür, V3 yapı kuralları).

**Belgede olmayan bilgi: yalnız etiketli (16 Ekim 2026, ürün sahibinin kararı).** Astra
aynı PDF'te belgede olmayan sınav bilgisini "metinde belirtilmiştir" diye veriyordu. Bizde
kaynak kuralı kesin kalır; tek istisna etiketli ve denetlenmiş genel bilgi:

| Yüzey | Biçim | Denetim |
|---|---|---|
| Ders | `note` bloğu, tone `general`, başlık "Genel bilgi: …", en çok 2; soru/özet/doğrusu buna dayanmaz | Denetçi H (yüksek) |
| Podcast | Cümle "Belgende geçmiyor ama bilmen iyi olur:" ile başlar, en çok 2 | Denetçi F (yüksek) |
| Sohbet | "Belgem + genel bilgi" modunda "Genel bilgiden:" paragrafı | Öğretmen denetimi |

Etiketsiz dış bilgi hâlâ hata (A). Yalnız belgeli içerikte; belgesiz hazırlık zaten konu bilgisiyle yazılır.

### Ders hızı (18 Ekim 2026) — akışlı yazım, kavram kavram denetim, parça parça açılış

**17 Ekim'de canlı bir ders ~4 dk sürdü ve "oluşturulamadı" dedi:** her düzeltme turu dersin
tamamını baştan yazıyordu (tur başına ~60 sn) ve tek bir eşik itirazı bütün dersi attı. Ürün
sahibinin kararları: ders ~10 sn'de açılsın, kalite düşmesin; **hızlı işlem (Fast mode) öğrencibeklerken herkese** (önce yalnız Plus'tı; canlıda ücretsiz öğrencinin ilk ekranı 18 sn çıkınca aynı
gün herkese açıldı; önceden yazım normal işlemde); ders parça parça açılsın; önceden hazırlama genişlesin. Ölçümler ve altın kıyas:
`docs/delivery/DERS-HIZI-18-EKIM.md`.

| Yapmayın | Yapın |
|---|---|
| Düzeltme turunda dersin tamamını yeniden yazdırmak | Yalnız sorunlu kavramı (`fixPartUserPrompt`); dönmeyen ekran yerinde kalır (`mergePartScreens`) |
| Tek bir itiraz yüzünden bütün dersi atmak | Düzelmeyen kavram bir kez baştan yazılır (`rewritePartUserPrompt`; yama aynı yerde takılıyordu); o da geçmezse atılır ve öğrenciye söylenir; ilk kavram da dahil (19 Ekim 2026) — hiçbir kavram geçmezse ders bir kez baştan yazılır |
| Kavramı sessizce atıp "Dersin tamamı bu kadar" demek | `missingConcepts` → "Dersin hazır olan kısmı bu kadar · Bu bölüm hazırlanamadı: …"; yeniden yazım sürerken yayımlanan kısım 40 sn'de bir tazelenir (takıldı sayılmasın) |
| Yazarı her itirazı kabule zorlamak ("listedeki her alanı değiştir") | Yazar gerekçeyle itiraz eder (`disputes`), denetçi tartar; kod kuralları (`[yapı kuralı]`) itiraz edilemez |
| Eksik ayrıntıyı ("şunu belirtmiyor") ciddi saymak | `CALIBRATION`: eksiklik ifadeyi yanlış yapmıyorsa düşük önem |
| Açıklamada şıklara sırayla gönderme ("ilk seçenek …") | Şıklar karışık gösteriliyor: `OPTION_ORDER_RULE` yazar + denetçi + kod, ders ve testte |
| Yazarı varsayılan düşünmeyle çalıştırmak | Yazar akışla ve `reasoning_effort: "low"`; denetçi varsayılan; ilk kavramın düzeltmesi düşük, sonrakiler varsayılan |
| Ders bitmeden öğrenciye bir şey göstermemek | İlk denetlenmiş kavram `building: true` ile döner; kalanlar `after` ile aynı kayda, ekran `action: "progress"` sorar |
| Denetlenmemiş ekranı göstermek | Kavramlar sırayla ve yalnız denetimden geçince yayımlanır; giriş kartında gelecek kavramların yalnız adı |
| Önceden yazımı süren dersi açılışta ikinci kez yazdırmak | Devral (`peekBuildingPrefetch`, `adoptedPrefetch`); kredi yazım bitince kesinleşir |

**Hep bir adım önde (18 Ekim 2026, ürün sahibinin kararları):** hızlı işlem pahalı; öğrenci
beklemesin diye içerik önceden yazılır, hızlı işlem yalnız hazır içerik yoksa çalışır.

| Kural | Nerede |
|---|---|
| Her açılış yoldaki sıradaki hazırlanabilir etkinliği yazdırır (ders, test, doğru/yanlış, kartlar, podcast, sözlü; ~~yalnız yolun kesin penceresi: 2 adım, `PATH_LOOKAHEAD` — 20 Ekim 2026'ya kadar 3~~ **30 Ekim 2026'dan beri** penceredeki ilk adım + penceredeki podcast + sıradaki **iki ders**, aradaki adımlar sayılmadan — "Canlı tur (30 Ekim 2026)"). Zayıf nokta, odaklı pratik, son kontrol, aralıklı tekrar kayıtlardan anında kurulur — önceden yazılmaz | `PREFETCH_KINDS`, `requestNextPrefetch` (rotada tek tetik), `prefetchTargets` |
| Hazırlık kurulunca ve hazırlık sayfası her açıldığında "Sıradaki" hazır değilse yazılır | `requestPrepPrefetch` |
| Önceden yazım kredisiz (`charge: false`, kullanım `LESSON_PREFETCH` / `CONTENT_PREFETCH`); kredi açılınca düşer | ders, test, kart, podcast, sözlü kabukları |
| Hazır içerik yalnız seçim anahtarı tutarsa verilir (zorluk; podcast süresi; sözlü soru sayısı, konu, öğretmen tipi); tutmazsa atılır, yeniden yazılır | `prefetchVariant` |
| Aşinalık kurulumda bir kez sorulur, bütün konulara yazılır; açılışta sorulmaz ("Düzey: … · Değiştir"). Ruh hali **günde bir kez** sorulur (19 Ekim 2026; bugün verildiyse kart atlanır, `todayMood`), yalnız kaydedilir — içerik üretimine nötr gider (sözlüde öğretmen tipi kalır) | `exam-create-wizard`, `exam-create-chat`, `create/route.ts` |
| "Dersi tekrarla" aynı dersi yeni kayıtta açar (anında, kredisiz, şıklar başka sırayla); "Farklı anlat" yeniden yazdırır | `lesson-replay.ts`, `?tekrar=1` |
| Önceden yazılan podcast önbelleğe girmez (açılmadan ücretsiz dinlenmesin) | `writePodcastCache` koşulu |
| **Isınma (19 Ekim 2026):** öğrenci ders düğümünü açıp ruh hali / aşinalık ekranına gelince istemci bir kez `action: "warm"` ister; sunucu yazımı hemen ve kredisiz başlatır (**23 Ekim 2026'dan beri normal işlemde**, ürün sahibinin kararı: ısınma açılmayan derste de ödeniyordu, hızlı işlem iki kat fiyat) (bitmiş düğüm de — "Farklı anlat"; yalnız süren kayıt ya da hazır/taze yazım varsa atlar); "Ders oluştur" yazımı süren dersi devralır. Ölçüm: soğuk ilk ekran 13-15 sn'nin ~2,8 sn'si rota, 7,8 sn'si motor (ilk jeton 3,8), kalanı yanıt/çizim; kartlarda geçen 5-10 sn yazıma kazandırılır | `requestNodePrefetch(…, { warm: true })`, `nodeHasOpenAttempt`, `exam-node-session.tsx` ısınma etkisi |

Takılı yazım: 120 sn ilerlemezse ders olduğu kadarıyla kapanır, kredi iade (`lesson-build.ts`).
Hızlı işlem kullanımı `gpt-6-luna-fast` adıyla kayda geçer (göç `20261018120000`). Bekçi:
`lesson-stream-pipeline.test.ts`, `lesson-building-ui.test.tsx`, `lesson-prefetch.test.ts`.

**Astra ile yan yana, 18 Ekim 2026 (aynı Pediatri hazırlığında ölçüldü):** Astra'da soğuk ders
43,5 sn (tamamı birden), ders sonu testi 0,3 sn (dersle birlikte yazılıyor), podcast 43 sn; "Sıradaki"
ders önceden yazılmıyor. Bizde hazır ders 3 sn, hazır test 1,3 sn, soğuk dersin ilk ekranı 15-19 sn.
Ürün sahibi: "Astra'ya bakarak bütün düzeltmeleri ona göre yap".

| Kural | Nerede |
|---|---|
| **Öğrenci kendi düğümünü açar** (27 Ekim 2026): sıradaki adım öneridir. Kilitli düğüm "Bu Etkinliği Şimdi Başlat" ve konu seçiciyle açılır; giriş `locked` → `ready` yapar. `hidden` açılmaz. Önceden yazım durumu değiştirmez. Sırası gelmeden biten düğüm sonrakini kendiliğinden açmaz. Her derste en az bir parametrik `diagram_card` (sayı doğrusu, terazi, eğri, zaman çizgisi, süreç ağı); eksik kart orta önem, kavram düşmez | `studentMayStartNode`, `node/route.ts`, `diagram-card.tsx`, `PARAMETRIC_DIAGRAM_RULE` |
| Başka etkinlik "Başka birini seç" / "+" ile: seçim kilidi kaldırır (`action: "choose"`). Sözlüden sonraki önerilen pratik, konu seçimi ve tanı da seçili adımı açar. Yazılı deneme her zaman açık | `chooseStudyNode`, `study-tools-hub.tsx` |
| Sıradaki kartta türden başka başlık yoksa konunun adı; biten adımda yüzde ("%40 · Konu testi") | `nodeHeading`, `nodeScores` |
| Son iki puanlı sonuç %50 altı → "Bu hazırlık sana fazla zor gelebilir", ikisi %90+ → "kolay gelebilir"; seçim bütün konuların aşinalığını bir basamak kaydırır, hazır bekleyen içerik atılıp yeni düzeyde yazılır | `prep-level.ts`, `/api/learning/exam-prep/level` |
| **"+%X kazandın" kartı (19 Ekim 2026):** test, doğru/yanlış gibi kanıt üreten etkinlikte konu hâkimiyeti (`exam_prep_topic_mastery.confidence`) arttıysa sonuç ekranındaki "Devam et" önce bu kartı açar: "+%X kazandın · {konu} konusunda · Konu hâkimiyeti %Y", sonra sıradaki adım. Düşüş ya da aynı kalış kutlanmaz; ders, kart, podcast kanıt üretmez, kart çıkmaz | `topicMasteryGain`, `topic-gain-card.tsx` |
| Hazır içerik yokken test, kart, podcast, sözlü, doğru/yanlış da hızlı işlemde (soğuk podcast 85 sn idi); önceden yazım ve yazılı denemenin parçaları normal. Test taslağı ve düzeltmesi `reasoning_effort: low` (19 Ekim 2026; soğuk test 30 sn, Astra ~15), soruyu kendisi çözen denetçi varsayılan | `teacher-tier.ts` |
| **Öğretmen gözü**: belge yüklenince (ve hazırlık kurulunca eksikse) öğretmen analizi çalışır, her konuya 3-6 "Sınavda sorulur" maddesi çıkarır (belgenin SINAV İPUCU / AKILDA TUT / ALARM kutuları, tablolar, eşikler; her sayı kaynakta olmalı). Ders, test, podcast, kartlar, doğru/yanlış ve sözlü aynı maddeleri okur; ders denetçisi kavramına ait madde yanlış aktarıldıysa `high`, kısımda hiç geçmiyorsa `medium` yazar (24 Ekim 2026: eksik madde `high` iken tek ekranlık ilk kavram 4 tur dönüp derste ana üç kavram atıldı; eksik madde yanlış bilgi değildir). Analiz öğrenciden kredi düşmez. 7 Ekim'den (#146) beri yeni hazırlıklarda çalışmıyordu, motorlar 2-3 Ekim'den beri okumuyordu | `exam-points.ts`, `teacher-brain.ts` `examPoints`, `ensureTeacherAnalyses` |
| **Renkli vurgu ve ezber kodu**: sınavda soru olacak kesin bilgi `==…==` (turuncu işaret, ekran başına en çok 2; kod 3'ten fazlasını yapı kuralı sayar); terimler yine `**koyu**` (renksiz — paragraf alacalı olmasın). Belgenin kutuları derste kendi rengiyle: "Sınav ipucu" (`tone: exam`, turuncu), "Akılda tut" (`remember`, yeşil), "Alarm bulguları" (`warn`). Ezber kodu `tone: mnemonic` (mor), kavram başına en çok bir, yalnız kaynaktaki öğelerden; denetçi I maddesi. `==` içi boşlukla başlayamaz ("a == b" vurgu değil); düz metne çevrilirken `stripEmphasis`. **19 Ekim 2026:** yazar ve denetçi aynı kod örneklerini görür (`MNEMONIC_EXAMPLES`; Türkçe harf birebir, C≠Ç); kavramda kalan tek sorun ezber koduysa bir düzeltme turundan sonra kutu çıkar ve kavram yayımlanır (önce 5-7 tur dönüp kavram atılıyordu), fazla kod hemen çıkar | `EMPHASIS_RULE`, `stripMnemonics`, `lesson-board.ts`, `lesson-chrome.ts`, `exam-lesson-steps.css` |
| **Videoda kilit bilgi**: her sahnede `keyFact` (en çok 8 kelime, kaynaktaki sayı/terimle, "Sınavda sorulur" maddelerinden) resmin üstüne büyük ve turuncu; resim yazısız kalır (yazıyı oynatıcı çizer, resim modeli bozuyor). Anlatımdaki `**anahtar kelime**` alt yazıda turuncu, seslendirmede okunmaz (`speechText`). Astra'nın tahtasındaki eşikler belgede yoktu; bizde denetçi E maddesi kaynak dışı kilit bilgiyi `high` sayar | `video-lesson.ts`, `video-run.ts`, `video-lesson.tsx` |
| **Türkçe sıra sayısı liste numarası değil**: "2. ay / 6. ay / 9. ay" silinmez, 1-2-3 diye yeniden numaralanmaz (Astra'da tam bu oldu, bizde de tahta ve sohbet aynı hatayı yapıyordu). Liste ancak sırayla giderse liste; kendi numarasından başlar | `lesson-board.ts` `guardOrdinals`, `markdown.ts` `orderedListStart` |

Bekçi: `oral-exam-grade.test.ts` ("study path opens in order"), `exam-prep-home-path.test.tsx`,
`study-tools-hub.test.tsx`, `prep-level.test.tsx`, `lesson-board-numbers.test.ts`.

**Tüm test paketini `npx vitest run --exclude "tests/unit/_tmp/**"` ile koşun.**
`tests/unit/_tmp/` yerel altın denemeleri `.env.local` anahtarıyla canlı model
çağırıyor ve kapıları yok; düz `npx vitest run` onları da çalıştırır (3 Ekim'de
onaysız ~0,04 $).

## Konu haritası: ince harita kabul edilmez (18 Ekim 2026)

**20 sayfalık trigonometri notu tek konu olarak haritalandı; Astra aynı PDF'ten 7 konu çıkardı.**
Vercel `pipeline_timing`: `outline_stage first · gpt-4o-mini · 3,1 sn · topics 1 · dropped 0`. ≤30 sayfa
ucuz modele gidiyor (`OUTLINE_MINI_PAGE_LIMIT`), model tek konu önerdi, doğrulama hiçbir şey
düşürmedi ve `goodEnough` (tutulan ≥ önerilenin 2/3'ü) 1/1'i geçirdi — öneri ince olunca oran kör.

| Yapmayın | Yapın |
|---|---|
| Mini'nin haritasını yalnız tutulan/önerilen oranıyla kabul etmek | Sayfa tabanı: `minTopicsForPages` (≤3 sayfa 1, ≤8 sayfa 2, sonra sayfa/5, en çok 8); altındaysa `escalate` (güçlü model, bütün metin) |
| Güçlü modelin ince haritasını da reddedip döngüye sokmak | Kabul edin — tek konulu dosya olabilir, soracak daha iyi model yok |
| "Konu az çıktı" diye haritayı kodla bölmek | Model yeniden yazar; kod yalnız kapıyı tutar (`outline-oneshot.ts`) |
| 20–30 sayfalık notu ucuz modele vermek | **19 Ekim 2026:** `OUTLINE_MINI_PAGE_LIMIT` 30 → **12**. Mini'nin sayfa atıfları orta boy notta kayıyor (KPSS'te "Yürütme [15-18]" — bölüm 22–25'te — düştü, yoldan kayboldu); luna jeton başına mini'den **ucuz** ve aynı notu doğru atıflıyor; bedeli sihirbazda ~40 sn. Mini'nin tuttuğu haritada temellendirmeyle düşen konu varsa (≥11 metin sayfası) yine güçlü model okur (`outlineDroppedByGrounding`) |
| Bir birimin bütün konuları temellendirmede düşünce birimi atmak | **Birim kurtarma (19 Ekim 2026):** birimin kendi başlığı aynı sayfalarda temelleniyorsa bölüm, modelin verdiği birim adıyla **tek konu** olarak kalır (`unit_rescued`); kod başlık uydurmaz, sayfa eklemez. KPSS'te "Siyasi partiler"in iki konusu da düşmüş ("üyelik" kökü sayfada "üye"), bölüm yoldan kaybolmuştu |
| Konu sayısı tabanı geçti diye haritayı kabul etmek | **Kapsam da sayılır (19 Ekim 2026):** mini'nin tuttuğu konuların alıntıladığı sayfalar, metin hacmi ≥3 konuluk belgede sayfaların %60'ından azını kapsıyorsa `escalate` (`outlineCoverageTooLow`). KPSS notunda mini TOC'un 10 başlığını önerdi, 7'si kaldı ama hepsi 3–11. sayfadaydı: Yasama, Yürütme, Yargı (dosyanın üçte ikisi) yolda yoktu |

Bekçi: `outline-thin-map.test.ts`. Kıyas belgesi masaüstünde `trigonometri_20_sayfa_detayli.pdf`.

## Glif numaralı PDF metni — Calibri'nin bozuk metin katmanı (19 Ekim 2026)

**30 sayfalık KPSS Anayasa notu canlıda 2 konuya düştü; Astra aynı PDF'ten 6 konu çıkardı.** Kullanım
kaydı: mini 6 konu önerdi (2 tutuldu), luna 34 konu (6.810 jeton) ve onarım turu (7.212 jeton) —
ikisi de **tamamen** atıldı, kalan mini'nin 2 konusu. Neden kod değil metin: PDF'in metin katmanı
Calibri'nin glif numaralarıyla çıkmış ("Anayasacılık Tarihi" → `\u0004ŶĂǇĂƐĂĐŦůŦŬ\u0003dĂƌŝŚŝ`; her
sayfanın harflerinin %75–85'i). Model metni yine de anlıyor ve düzgün başlıklar yazıyor, ama
temellendirme başlığın kelimelerini sayfada arayınca 34 başlığın 34'ü `absent_word` ile düşüyor.
Kayıtta bu görünmüyordu: `outline_stage` yalnız `continue` yazıyordu.

| Yapmayın | Yapın |
|---|---|
| Böyle bir belgede temellendirmeyi gevşetmek ya da kapatmak | Metni çözün: `decodeGlyphIdText` (`glyph-id-text.ts`) çıkarmada (`extractText`), okumada (`cleanOcrPageText`) ve sayfa temizliğinde (`ensureCleanPages`) çalışır; yalnız sayfada ≥8 farklı, ≥30 adet, harflerin ≥%8'i tablo kodu olunca ve yalnız kod içeren parçalara uygulanır — düzgün yazı tipiyle basılmış satırlar ("DEVLET", "I. Devlet") dokunulmaz, çözüm Türkçeye benzemiyorsa (ünlü payı) metin olduğu gibi kalır |
| Tabloyu tahminle genişletmek | Tablo o belgenin ham metni ile modelin temizlediği metin satır satır hizalanarak çıkarıldı (Calibri glif sırası: küçük harf 258+, büyük harf ASCII/kontrol kodu, rakam 1004+, noktalama 842+, bitişik harfler `ti/tt/tti/ft/fl`); başka yazı tipi için aynı yöntem |
| Düşen başlığa bakmadan "model kötü" demek | `outline_stage` kaydında artık `draftModel · proposed · keptTopics · issues {"ungrounded:absent_word": 31} · next · callError` var; önce ona bakın |
| Çerçeve sözcüğü ("devletin **unsurları**", "TBMM'nin iç **yapısı**", "anayasa değişikliği **süreci**", "hakların **sınıflandırılması**", "ilk **belgeler**") sayfada yok diye başlığı düşürmek | Bu sözcükler temellendirmede kanıt sayılmaz (`STOPWORDS`); "sayısı"/"sayıları" gibi tampon harfli gövdeler çıplak biçimiyle de dizine girer |

Çözülmüş metinle aynı 34 başlığın 29'u tutuluyor (modelin temizlediği metinle 24, ham metinle 0).
Bekçi: `glyph-id-text.test.ts`, `outline-grounding.test.ts` (sahte başlık eşikleri aynen 9/10 ve
15/18). Denenip vazgeçilen: iki uzun gövdeyi ortak altı harflik kökten eşlemek — gerçek başlık
kurtarmadı, bir sahteyi ("Miras Paylaşımı" ← "paylaşılır") geçirdi.

## Fonksiyon bölgesi Frankfurt (`fra1`) — veritabanının yanı

**29 Eylül 2026'ya kadar fonksiyonlar `iad1`'de (Washington) çalışıyordu;
Supabase Frankfurt'ta.** Bir sayfa 5–15 sorguyu art arda yapıyor ve her biri
Atlantik'i gidip geliyordu. Kayıtlı bir dersi yalnızca geri getiren istek
1,8–6,6 saniye, tek sorguluk `/api/streak` 2,7 saniye sürüyordu. Yanıt
başlığındaki `x-vercel-id: fra1::iad1::…` bunu gösteriyordu: giriş Frankfurt,
çalışma Washington.

`vercel.json` → `"regions": ["fra1"]`. Hobby planı tek bölgeye izin veriyor;
o bölge veritabanının yanı olmalı. Supabase bölgesi değişirse bu da değişir.
Bekçi test: `uat-gate-guards.test.ts` → "vercel.json fonksiyon bölgesi".

## `npm install` "up to date" derken lockfile bozuk olabilir

**17 Eylül 2026'da CI main'de kırmızıydı** ve üç işin hepsi aynı yerde
düşüyordu:

```
npm error Missing: @esbuild/linux-x64@0.28.2 from lock file
```

Sebep: `package-lock.json` **kendi içinde tutarsızdı**. `tsx@4.23.13` girişi
`"esbuild": "~0.28.0"` bağımlılığını bildiriyordu ama lockfile'da ne `esbuild`
ne `@esbuild/*` kaydı vardı. Önemli olan şu:

| Komut | Davranış |
|---|---|
| `npm ci` | Doğrular, tutarsızlığı görür, **reddeder** |
| `npm install` | Toleranslı, sessizce **"up to date" der** |

Bu yüzden sorun yerelde de vardı ve kimse görmedi: `tsx` ve `esbuild` hiç
kurulu değildi. Lockfile elle düzeltilmez — npm ile sıfırdan üretilir.

**Daha büyük ders — CI iş dallarında çalışmıyor.** Workflow yalnızca
`main` push'unda ve PR'da tetikleniyor (`.github/workflows/ci.yml`). Doğrudan
bir iş dalına çalışıp main'e geçmeden CI'a hiç girmiyorsunuz: bu sefer
**25 commit doğrulanmadan birikti** ve hata ancak main'e push edilince çıktı.
Uzun süren bir dalda ara ara `npm ci`'yi elle çalıştırın ya da PR açın.

**Bir şeyin yayında olduğunu varsaymayın.** Aynı gün dört hukuki sayfanın
(`/mesafeli-satis`, `/on-bilgilendirme`, `/iptal-iade`, `/teslimat`) canlıda
**404 döndüğü** görüldü: sayfalar yazılmış, test edilmiş, commit edilmişti —
ama dalda duruyordu. Yazılmış olmak yayında olmak değil; `curl` ile bakmak
on saniye sürüyor.

## İçerik "üretilemedi" demez (19 Ekim 2026)

**Ürün sahibi:** "Kullanıcı podcast istediyse üretilsin; 'üretilemedi / oluşturulamadı' gibi bir şey
olmasın. İstek karşılansın." Canlı kayıt (`/admin/ders-hatalari`, 18 Ekim): iki podcast **tek bir**
"bu konu sınavda ağırlıklı" cümlesi ve tutmayan bir eşitlik yüzünden tümden düşmüş, öğrenci
"Podcast şu anda oluşturulamadı" görmüştü. Kalite kapısı kalkmadı; kapıdan geçmeyen **parça** düşer,
**istek** düşmez.

| Katman | Kural | Nerede |
|---|---|---|
| Podcast | Düzeltme turlarından sonra kalan sorunlu satır çıkarılır (`salvagePodcast`: denetçinin `chapters[i].lines[j]`'si, satır içi tutmayan hesap, kaynak notu, tekrar; soru giderse cevabı da); satıra bağlanamayan sorun kaldıysa **ikinci taslak**; model çağrısı düşerse döngü bir kez baştan. Bölüm sayısı / şablon başlık gibi biçim sorunları yayını durdurmaz. Kayıt: `teacher_podcast` → `salvaged`, `unverified` | `teacher-podcast.ts`, `teacher-podcast-run.ts` |
| Ders | İlk kavram da düşerse ders yine yazılır (kavram atılır, bitişte adıyla söylenir); hiçbir kavram geçmezse ders bir kez baştan yazılır (`teacher_lesson_rewrite_all`) | `teacher-lesson-run.ts` yayıncı |
| Test | Asgari sorunun altında kalınca ikinci taslak, yeni sorular eklenir; iki geçişten sonra bile 2'nin altındaysa test yok (`MIN_DELIVERABLE_QUESTIONS`) | `teacher-quiz-run.ts` |
| Kartlar, doğru/yanlış, sözlü (ortak kabuk) | İlk geçiş düşerse (model hatası ya da geçen öğe yok) iş bir kez baştan koşar (`*_retry`) | `teacher-engine-run.ts` |
| Ses | Satır sesi 3 kez denenir (400 / 1200 ms), yükleme 2 kez; aynı ses başka istekte üretiliyorsa beklenir | `audio-cache.ts` |
| Oynatıcı | Ses isteği düşünce 2,5 ve 5 sn sonra kendiliğinden yeniden; sonra "Ses bu sefer gelmedi" + **Sesi yeniden dene** düğmesi | `exam-podcast-player.tsx` |
| Ekran | `generation_failed`, `content_verification_failed`, `invalid_ai_response`, `podcast_script_rejected` kodlarında hazırlanıyor ekranı kapanmadan bir kez kendiliğinden yeniden (`AUTO_RETRY_CODES`); mesaj ancak ikinci deneme de düşünce ("bu sefer tamamlanamadı; iki kez denedik") | `exam-node-session.tsx`, `generation-failure.ts` |
| Öbür içerik ekranları | Hazırlığın podcast sayfası (artık bekleme ekranıyla), Araçlar stüdyoları, video ders, yazılı deneme kurulumu, zor sorular: hepsi `postJsonWithRetry` ile bir kez kendiliğinden yeniden ister (her denemede yeni istek kimliği); kalan mesajlar "bu sefer tamamlanamadı" diye yazılır, "üretilemedi" yazılmaz | `generation-retry.ts` |

Hak, paket, kaynak-yok ve "üretim hâlâ sürüyor" kodları yeniden denenmez: yeniden denemek ya hiçbir
şeyi değiştirmez ya da ikinci bir üretim başlatır. Kod yine cümle yazmaz; yalnız siler ve yeniden
ister. Bekçi: `teacher-podcast.test.ts` ("kurtarma"), `teacher-quiz-second-pass.test.ts`,
`lesson-stream-pipeline.test.ts` ("hiçbir kavram geçmezse"), `audio-credits.test.ts` ("yeniden
denenir"), `podcast-audio-once.test.tsx` ("kendiliğinden yeniden").

## Astra ekran turu (19 Ekim 2026) — kapanan kararlar

Ürün sahibi: "sırayla hallet, belirlediğin ölçüleri koy". Bulgular ve ölçüler:
`docs/delivery/ASTRA-TUR-19-EKIM.md`. Yeniden açmayın:

| Konu | Karar |
|---|---|
| Okulum'da hazırlık paylaşımı | **İsteğe bağlı kalır** (Astra'da varsayılan açık); belgeden çıkan hazırlık okul listesine kendiliğinden düşmez |
| Konu sayısı (#247, "her sayfa tek konuya") | **Gevşetilmez.** KPSS 30 sayfa → 16 konu (Astra 6); bütün bölümler yolda, ilk ders Cortex 88 / Astra 78 |
| "Beceri ağacı" görünümü | **Eklenmez**: İlerleme'deki konu listesi aynı bilgiyi veriyor |
| Ruh hali kartı | Günde bir kez (#340) — derste art arda iki onay kartı da kalktı |

## Üretim yuvaları (19 Ekim 2026, Faz 3.2) — aynı anda en çok N üretim

Ders, test, podcast ve ortak motor kabuğu (`runTeacherLesson`, `runTeacherQuiz`, `runTeacherPodcast`,
`runWithTeacherModel`) bir üretim yuvasıyla çalışır (`src/lib/ai/generation-slots.ts`): Upstash'te süreli kira
kaydı, sınır `GENERATION_SLOTS` (varsayılan 40). Yuva **kredi ayrılmadan önce** alınır.

| Durum | Davranış |
|---|---|
| Öğrenci isteği, yuva dolu | Sunucu 25 sn yer bekler; yine doluysa `generation_busy` (503). Ekran hata göstermez: hazırlanıyor ekranında "Şu an yoğunluk var; sıradasın" ve ~3 dk kendiliğinden yeniden (`BUSY_*`, `postJsonWithRetry`) |
| Önceden yazım | Yuvaların yalnız %70'i; beklemez — öğrenciye yer kalsın |
| Redis'e ulaşılamıyor | Kapı kapanmaz (ders yarıda kalmasın); Redis hiç yoksa sayaç sunucu belleğinde |
| İşlev çöktü | Kira 6 dk sonra düşer |

Yeni bir model zinciri eklerken bu dört kabuktan birini kullanın ya da `withGenerationSlot` ile sarın. k6 yük testi
ürün sahibinin kararıyla lansmana kaldı. Bekçi: `generation-slots.test.ts`. Runbook: `docs/ops/openai-kota.md`.

## Maliyet kararları (19 Ekim 2026) — hızlı işlem yalnız Plus, ses 15 kredi

Ölçüm: `docs/delivery/MALIYET-MODELI.md` (17-19 Ekim, bugünkü motorlar). Ürün sahibinin kararları:

| Karar | Ayrıntı | Nerede |
|---|---|---|
| **Hızlı işlem yalnız Plus/Sigma ve kurucuya** | 18 Ekim'deki "öğrenci beklerken herkese" kararı daraldı: ders $0,016 tutuyordu, kredisi $0,006. Ücretsiz öğrencinin soğuk içeriği normal hızda; abonelik okunamazsa hızlı işlem yok | `fast-access.ts` (`fastAllowedFor`), dört motor kabuğu |
| **Seslendirme 15 kredi / 900 karakter** (önce 2) | Ölçülen maliyet ~$0,015 / 900 karakter; 5 dk podcast sesi ~60 kredi. Önbellekten gelen cümle yine bedava | göç `20261019130000`, `price-table.ts` |
| Test (4) ve mesaj (3) kredisi **kalır** (24 Ekim 2026: test 10'a çıktı, mesaj 3 kaldı — "Kredi v3") | Maliyetin ~1,5 katı eksik ama normal öğrencide marj ~%72; yoğun öğrenci azınlıkta varsayımı | — |

## Kapalı beta kodları (19 Ekim 2026) — tek kullanımlık, 14 gün Plus

Ürün sahibinin kararı: "2 hafta ücretsiz Plus kodu". Kodlar `/admin/promosyonlar` → "Beta kodları"
kartında toplu üretilir (`BETA-XXXX-XXXX`, karışan harf yok); kod ya da hazır bağlantı
(`/pay?kod=…`) olarak kopyalanır. Öğrenci kodu Abonelik sayfasındaki "Kodun var mı?" kutusuna girer.

| Kural | Nerede |
|---|---|
| Bütün kontrol ve yazım tek SQL fonksiyonunda: kod geçerli mi, kullanıldı mı, deneme daha önce alındı mı (hesap başına **bir** deneme), ücretli abonelik sürüyor mu; sonra abonelik, cüzdan, kayıt, bildirim | göç `20261019160000`, `redeem_promo_code` (yalnız `service_role`) |
| Deneme `plus-aylik` planıyla açılır, `trial_until = current_period_end`; hak gün sayısıyla orantılı (14 gün = 3.360), cüzdan dönemi denemeyle aynı gün biter → ertesi istekte ücretsiz günlük hak | aynı göç; `isTrialPeriod` |
| Deneme gelir değildir: ödeme kaydı yazılmaz, gelir raporları ödemelerden okunur | — |
| Hatırlatma ve kart "yenile" demez, "ücretsize dönersin, ücret alınmaz" der; öğrenci ödeme yaparsa PayTR dönemi uzatır, eşitlik bozulur, abonelik ücretli sayılır | `trialNotice`, `subscription-card.tsx`, `subscription-renewal` |
| Giriş yapmamış öğrencinin bağlantısı kodu kaybetmez: `next` sorguyu taşır. Kodlu bağlantı (`/pay?kod=…`) oturumsuz öğrenciyi **kayda** götürür (20 Ekim 2026; giriş "Tekrar hoş geldin" diyordu); kayıttaki "Giriş yap" ve girişteki "Kayıt ol" `next`i taşır | `middleware.ts`, `signup-premium-shell.tsx`, `giris-inner.tsx` |
| Uç sıkı sınırda (dakikada 5, günde 20): kodlar tahminle denenmesin | `/api/promo/redeem` |
| Eski kampanya kodları (hediye kredi) da aynı kutudan kullanılır; öğrenciye kredi sayısı değil iş söylenir | `promo-codes.ts` `redeemSuccessMessage` |

**Ortak kod (20 Ekim 2026, ürün sahibinin kararı):** beta öğrencisi sosyal medyadan gelir (Instagram,
WhatsApp / Telegram grubu); duyuruda **tek kod, tek bağlantı, ilk 50 kişi**. Aynı sayfada "Ortak beta kodu"
kartı (`createSharedBetaCode`; kod boşsa üretilir, 2–1.000 kişi, 1–90 gün). Aynı SQL fonksiyonu: kişi başına
bir kez; denemesini almış ya da ücretli abonesi olan reddedilir ve **kontenjandan yer yemez**; kod satırı
kilitlenerek sayılır (`FOR UPDATE`), aynı anda gelen 51. kişi taşmaz. Dolunca "Bu kodun kullanım hakkı doldu"
— eski "Her kod tek kişilik" ortak kodda yanlış söylüyordu.

Instagram'dan gelen öğrencinin iki engeli kapatıldı (aynı gün):

| Engel | Kural | Nerede |
|---|---|---|
| Google, uygulamanın kendi tarayıcısında girişi reddediyor ("disallowed_useragent"); öğrenci Google'ın hata sayfasını görüyordu | Instagram / Facebook / TikTok tarayıcısında Google düğmesi yerine "E-postanla devam et ya da sağ üstteki menüden sayfayı tarayıcıda aç" (giriş ve kayıt); WhatsApp ve Telegram gerçek tarayıcıda açar | `in-app-browser.ts`, `google-blocked-note.tsx` |
| Instagram'da kayıt olup onayı e-posta uygulamasından açınca onay başka tarayıcıda açılıyor; dönüş adresi (`/pay?kod=…`) yalnız ilk tarayıcının `localStorage`'ındaydı, kod kayboluyordu | Kayıt dönüş adresini hesaba da yazar (`signup_next`); tamamla sayfası yük bulamayınca kuruluma gönderir, kurulum sonunda oraya gidilir | `signup-wizard.tsx`, `onboarding/page.tsx` |

Bekçi: `beta-social-signup.test.tsx`, `beta-plus-codes.test.ts` (göçü PGlite'ta çalıştırır: açılış, tek kişilik kod, tek deneme,
ücretli Plus'ın ezilmemesi, deneme bitince günlük hakka dönüş, hediye kredi, ortak kodun kontenjanı).

## Haftalık kısa anket (19 Ekim 2026) — kapalı beta geri bildirimi

Ürün sahibinin kararı: "Uygulama içi haftalık kısa anket". Sınavlar sayfasında, listenin üstünde
kart; dört soru: yardım (1-5), önerme (0-10), en çok kullanılan, tek cümle öneri (isteğe bağlı).
Sonuçlar `/admin/anket`: hafta hafta cevap, "Şimdi değil", yardım ortalaması, tavsiye puanı
(9-10 eksi 0-6), en çok kullanılan; altta son öneriler, satır öğrencinin destek görünümüne gider.

| Kural | Nerede |
|---|---|
| Kime: o hafta en az bir etkinlik açan, hesabı iki günden eski öğrenci; haftada en çok bir kez (İstanbul saatiyle ISO hafta). Karar sunucuda; okuma düşerse kart görünmez | `weekly-survey-server.ts` `surveyEligibility` |
| "Şimdi değil" (ya da ×) da haftanın satırını yazar: aynı hafta yeniden sorulmaz | göç `20261019170000`, `UNIQUE (user_id, week_key)` |
| Hafta anahtarı istemciden alınmaz; cevabın yanına anlık plan yazılır (ücretsiz / Plus / Sigma / **beta**) | `/api/feedback/weekly` |
| Kapatma: Özellik anahtarları → `weekly_survey` (göç açık ekler) | `feature_flags` |
| Hesap silinince satırlar gider (aynı turda eksik bulunan `star_events`, `exam_wizard_drafts` da listeye girdi) | `account-deletion.ts` |

Destek görünümleri artık ham kod göstermiyor ("inactive", "basics", "lesson", "slow_generation"):
adlar öğrencinin gördüğü kaynaklardan (`support-labels.ts`). Bekçi: `weekly-survey.test.tsx`.

## Beta çıkış ölçütleri ve destek kutusu (19 Ekim 2026) — plan Faz 5.3

`/admin/beta` altı ölçütü son 7 ve 30 gün için gösterir: atılan kavram 0, soğuk ders ilk ekran
p95 < 20 sn, hazır ders p95 < 3 sn, ödeme başarısı > %95, destek cevabı < 24 saat, Sentry kritik 0
(bu satır elle: anahtar ürün sahibinde). Hedefler ve ölçüm tek yerde: `beta-metrics.ts`.

| Kural | Nerede |
|---|---|
| Ders açılış süresi yalnız 3 günlük Vercel günlüğündeydi; artık her açılış `open_timings`e yazılır (`ready` önceden yazılmış, `adopted` yazımı süren devralındı, `cold` ilk ekran yazımdan). Süre sunucunun (istek başından yanıta), ağ hariç; yazım `after()` içinde, yanıtı beklemez | `node/route.ts` (üç günlük satırının yanı), göç `20261019180000` |
| Destek talebini görecek ya da kapatacak ekran yoktu; günlük özetin "24 saati geçti" sayısı yalnız büyüyebilirdi. `/admin/destek` talepleri listeler; cevap e-postayla gittikten sonra "Cevaplandı" `answered_at` yazar (bir kez), öğrenci `/destek`te "Cevaplandı · e-postana bak" görür | `support-actions.ts`, `support_requests.answered_at` |
| Ödeme başarısı: başarılı (iade edilen dahil) / (başarılı + başarısız); bekleyen sayılmaz | `collectBetaMetrics` |

Bekçi: `beta-exit-metrics.test.ts`.

## Misafire gösterilen her söz bugün çalışıyor (19 Ekim 2026)

Ürün sahibi: "misafire sistemimizde olmayan bir şey gösteriyor muyuz, yalan vaat var mı?" Vardı ve
kaldırıldı: saatli günlük plan ("09:00 Matematik"), "Net 28.4" deneme analizi, Plus'ta "gelişmiş
model" ve "öncelikli destek", okul lisansı ve okul raporları (`/yaratici-program` → `/iletisim`),
veliden ödeme isteği (alıcısı emekli veli paneliydi), "her işlem öncesi kredi gösterilir", Limitler'de
hiç verilmeyen "zor soruda güçlü model", ücretsiz zor soruda "Plus'ta güçlü model" satışı.

| Kural | Nerede |
|---|---|
| Ana sayfanın bütün cümleleri tek dosyada; ders sahnesi gerçek bir dersten (Çocuk Sağlığı). Rakip adı geçmez | `src/lib/marketing/landing-content.ts`, `components/landing/landing-page.tsx` |
| **Her plan aynı modeli kullanır** (`model-router.ts`). Planların gerçek farkı: hak, günlük haktan büyük işler, video ders, hazır içerik yokken hızlı yazım. "Gelişmiş/güçlü model" yazmayın | `tier-presentation.ts` (model satırı yok, hız satırı var) |
| Ücretsiz hesap (24 Ekim 2026'dan beri sayaçla): haftada 3 ders (testleri ve kartlarıyla), günde 3 mesaj, günde 1 fotoğraftan çözüm; **podcast, sözlü, yazılı deneme, video Plus'ta** — pazarlamada bunlar "Plus" etiketli (açık liste `PLUS_ONLY_ACTIONS`) | `FEATURES.plusOnly`, `FREE_TIER_SENTENCE` |
| Pazarlama başlıkları da Figtree (tırnaklı DM Serif kalktı); birincil eylem mavi, altın yalnız marka ve Plus | `cinematic-home.css`, `landing.css` |
| Fiyatlar veritabanından okunur | `src/app/page.tsx` |

Bekçi: `marketing-claims.test.ts` (yasak cümleler, Plus etiketi ↔ kredi tablosu, hak sayıları).

## Araçlar ve belgeyle sohbet: özellik özellik denetim (19 Ekim 2026)

Ürün sahibi: "her özelliği farklı belgeyle tek tek dene; istediği sayıda ve dakikada üretebiliyor mu".
Bulgular, neden ve düzeltme: `docs/delivery/OZELLIK-DENETIMI-19-EKIM.md`; belgeler `tests/fixtures/feature-audit/`.

| Kural | Nerede |
|---|---|
| "Genel sohbet" katı mod göndermez; sunucu "yalnızca belgem"i ancak belge modu açıkken uygular. PDF eklenince mod belgeli sohbete geçer, belge hemen işlenir | `chat-panel.tsx`, `api/ai/chat/route.ts` |
| Ders etiketi ("[Matematik]") varsayılan boş; belgeyle konuşurken hiç eklenmez | `chat-panel.tsx` |
| Cevap kontrolünde alıntı **kelime kelime** aranır (Markdown ve PDF boşlukları yok sayılır; %85 ve bütün sayılar birebir). Birebir arama doğru cevapları reddediyordu; gevşetirken sayı kuralını kaldırmayın | `looselyContains` |
| "Belgenin tamamı" serbest yazımla tanınır; konu belgede yoksa istek düşmez, tamama genişler; tamamı her konudan sayfa (en çok 14) — bitişik 6 sayfaya kesmeyin | `isWholeDocumentRequest`, `wholeDocumentPages`, `studio-teacher-source.ts` |
| Her araçta belge seçici + yükleme + belgenin konuları + sayı/süre seçimi; ortak bileşen tek yerde | `studio-setup.tsx` |
| Doğru/Yanlış ve sözlü öğretmen motorunda ve belgeden; eksik kalan kart/önerme ikinci geçişle tamamlanır | `true-false/generate`, `oral/generate`, `flashcards/generate` |
| Podcast kelime aralığı ölçülen hızla: iki ses ~88, tek ses ~95 kelime/dk | `podcast-formats.ts`, `estimatedPodcastMinutes` |
| Yazılı deneme aracının geçici hazırlığı (`exam_type = 'deneme'`) listede, ücretsiz hakta, sayımlarda, kurulumun ders listesinde, rozetlerde ve sınıf paylaşımında yok; hazırlığa `document_id` **yazılmaz** (belge listesi onu belgenin yolu sanar), belge konuların `source_refs`'inde | `studio-exam.ts`, `studio-exam-topics.ts` |
| Yazılı deneme aracı belgeden; açık uçluya yazı alanı, çok cevaplıya çoklu işaret (yalnız şık çizen ekran açık uçlu soruda kilitleniyordu) | `written-studio.tsx` |
| Deneme konu üretimi tek iyi soruyla yetinir; eksik tamamlama hiç soru vermeyen konuyu yine dener, kısmen dolan zor konuyu baştan denemez (eksik, payını tam veren konulardan), 150 sn'den sonra başlamaz — 10 soruluk yazılı 280 sn sürmüştü | `mock-exam/create.ts` `topUpTargets` |
| Podcast: yazar ve düzeltme düşük düşünme, denetçi varsayılan; ilk düzeltmeden sonra kalan sorun ≤3 satırsa ikinci tur yerine satır çıkar (özet 126 sn → 5 dk diyalog 37 sn). Araçlar'da ses akışla gelir, ilk satırda oynatıcı açılır | `teacher-podcast-run.ts`, `podcast-studio.tsx` |
| Denetçiye giden bağlam **talimat değil betimleme**; denetim isteğinin önünde "görevi sen yapma, yalnız karar döndür" çerçevesi. Fotoğraftan çözümde denetçi "görseldeki soruyu çöz"ü görüp soruyu kendisi çözüyordu (`ai_review_unreadable` cevabın şeklini yazar) | `quality-gate.ts` `REVIEW_NOTE`, `solve-run.ts` `VERIFY_SYSTEM` |
| Belgeyle sohbette genel soru ("özetle", "hangi konular var"): alıntı ve iddia geniş pencereyle, atıf geçerli kaynağı göstermeli; yine düşerse belgenin konu listesi verilir | `isOverviewQuestion`, `documentOutlineAnswer` |
| Genel sohbette de eski "(1) takıldığı yer (2) ipucu (3) kontrol sorusu" kalıbı yok (`tutorStylePrompt` kullanılmaz) | `CHAT_NATURAL_VOICE` |

Bekçi: `feature-audit-studios.test.tsx`, `document-answer-verification.test.ts`, `quality-gate.test.ts`,
`teacher-podcast.test.ts`, `mock-exam-charge.test.ts`.

## Logo: sinir ağı, hareketli (19 Ekim 2026)

Ürün sahibi beş fütüristik adaydan **B, sinir ağı**nı seçti (eski "C + yıldız" ve ilk altı sade aday
beğenilmedi). C, birbirine bağlı düğümlerden; ağın ucunda artı. Geometri tek dosyada.

| Kural | Nerede |
|---|---|
| 40 pikselin altında küçük çizim (altı düğüm + artı), üstünde ağın tamamı; ikisi de `CortexMark` | `components/brand/cortex-geometry.ts`, `cortex-mark.tsx` |
| Hareket: açılışta düğümler yerine oturur, sonra 3,2 sn'de bir sinyal ağda akıp artıda parlar; yükleniyor ekranında sürekli ve hızlı (`mode="loop"`). Menü, sekme, sohbet gibi küçük yerlerde hareket yok; hareket azaltma açıksa her yerde durur | `cortex-logo-motion.tsx`, `brand-motion.css` |
| Sayfanın aşağısındaki logo açılışı kaçırmasın: ekrana girince bir kez yeniden oynar, hiçbir an gizli beklemez | `cortex-logo-reveal.tsx` |
| Sekme, telefon simgesi ve paylaşım görseli düz altın (satori'de gradyan yok), aynı geometriden | `cortex-icon-svg.tsx`, `icon.tsx`, `apple-icon.tsx`, `opengraph-image.tsx` |
| Pazarlama menüsünde kilit: işaret + geniş aralıklı "CORTEX PLUS" (metin büyük harfle yazılmaz, CSS ile; ekran okuyucu harf harf okumasın) | `parity-site-header.tsx` |

Ana sayfa aynı gün sinematik hale geldi (ürün sahibi: "fütüristik ama dozu kararında"): kahramanda ışık ve
ufka akan ızgara, nottan ders ekranına uzanan sahne (not sayfası → ders → yol + "+%X kazandın"), tek
çizgili adım akışı, özellik ızgarası, kenarında dönen altın ışıklı Plus kartı, ufuk çizgisiyle son çağrı.
Sahnedeki her ekran üründe var. Bekçi: `brand-neural-mark.test.tsx`, `marketing-claims.test.ts`.

## Öğrenci gibi kurulum turu (19 Ekim 2026) — bulunan ve kapanan hatalar

Ürün sahibi: "kullanıcıya sunduğumuz hizmetleri tek tek kontrol et". Canlıda kurucu hesabıyla, öğrenci
gibi uçtan uca kuruldu ("YKS biyoloji: hücre bölünmeleri", "YKS kimya: mol kavramı", belgesiz).

| Bulgu | Kural | Nerede |
|---|---|---|
| Belgesiz hazırlığın yolu kalıp şablondan çıkıyordu: beş konu için konusuz tek "Giriş Dersi" | Belgesiz hazırlık da konu konu kurulur (ders → test → tekrar, sonda deneme); geçici kimlik `topic:i` kayıttan sonra gerçek konu kimliğine çevrilir | `topic-only-schedule.ts`, `create/route.ts`, `intake/route.ts` |
| "Belgem yok" sohbeti sihirbazın ders, tarih, hedefini kaybediyor, tarihi yeniden soruyor, eski belgeleri listeliyordu | Seçimler sohbete taşınır; belgesiz kurulumda belge seçici yok; seçilen ders sunucunun taslağıyla ezilmez; kurulum bitince sihirbaz taslağı silinir | `exam-create-entry.tsx`, `exam-create-chat.tsx` |
| Ücretsiz öğrenci podcast/sözlü/deneme/fotoğrafta "hakkın doldu" + geri sayım görüyordu (iş günlük haktan büyük, beklemek çözmez) | Kapı iş kodunu alır: ücretsiz hakkı aşan işte "Plus'ta açık" der, geri sayım göstermez; araç seçici ve Araçlar'da ücretsizde "Plus" rozeti | `free-reach.ts`, `CreditGate action=`, `study-tools-hub.tsx`, `tools-hub.tsx` |
| Kayıttan sonra asıl değer (notundan yol) yalnız Sınavlar'daydı | Hazırlığı olmayan öğrenciye ana sayfada "İlk hazırlığını kur" kartı | `first-prep-card.tsx` |
| Araçlar'da test/kartlar belge seçemeyen eski sayfalara gidiyordu; Yanlışlarım menüde yoktu | Kartlar stüdyolara gider (`/studio/quiz`, `/studio/flashcard`, `/studio/dogru-yanlis`); "Daha fazla"da Yanlışlarım | `tools.ts`, `sor-shell.tsx` |

Bekçi: `topic-only-schedule.test.ts`, `topic-setup-handoff.test.tsx`, `free-reach.test.tsx`,
`home-first-prep.test.tsx`, `tools-studios.test.ts`.

## Sınav seti (19–20 Ekim 2026) — 7 dosya, 25 gün, Astra ile son karşılaştırma

Ürün sahibi: "5 fotoğraf, 65 sayfa PDF, 6 sayfa Word; 25 gün sonraki sınav; tam olarak Astra gibi kur,
karşılaştır, eksikleri tamamen hallet." Set `cortex-plus/tests/fixtures/sinav-seti/`, karşılaştırma
`cortex-plus/docs/delivery/SINAV-SETI-KARSILASTIRMA-20-EKIM.md`. Yeniden açmayın:

| Kural | Nerede |
|---|---|
| Kurulum konuları **sihirbazın gösterdiği kurs haritasından** okur (`loadOneshotIntakeTopics`), eski birleştirmeden değil; sıra öğrencinin listesi. Eski yol 29 konunun 9'unu sayfasız bırakıp yanlış sayfa veriyordu | `prep-schedule-topics.ts`, `create/route.ts` |
| Sınav ağırlığı, ölçülen zayıflık ve "zorlandığım" seçimi **sırayı değiştirmez** (süre ve ek test verir). `orderTopicsByPrerequisites` yalnız ön koşul + belge sırası; `buildExamScheduleV2` gelen sırayı hiç değiştirmez (çağıran sıralar). Eski `canPromoteForWeight` / `weaknessRank` / `keepOrder` silindi | `exam-schedule-v2.ts`, `topic-order.ts` |
| Çalışma günü sorulmadıysa **her gün**, günlük süre 45 dk: tek kaynak `DEFAULT_STUDY_DAYS` / `prepStudyDays` / `prepDailyMinutes`; boş kayıt da "her gün". Eski `[1, 2, 3, 4, 5]` ve "60 dk" varsayılanları (yeniden planlama, ayarlar, uyarlamalı plan, sohbetle kurulum) kalktı. Uyarlamalı oturumda Pazar hiç tanınmıyordu (`getDay()` 0) | `exam-schedule-v2.ts`, `session-engine.ts` |
| **Yeniden planlama** (tarih/ayar değişince, kaçırılan gün, uyarlamalı plan) konuları tek yükleyiciden alır: `loadPrepScheduleTopics` — sıra `exam_prep_topics.sort_order`, kaynaklar, dosya etiketi, kavram birimleri, sınav ağırlığı ve ölçülen seviye kayıttan; kimlik eski oturumlarla eşlenir. Dört yer konuları eski oturumlardan kendi kuruyordu: etiket ve çok dersli konular kayboluyor, "zorlandığım" konu başa sıçrıyordu | `prep-schedule-topics.ts`, `reschedule`, `settings`, `missed-day-reschedule.ts`, `adaptive/replan` |
| Takvim iki geçiş: önce her konunun dersi + ilk testi döneme yayılır (konu gün sayısını geçince kısalır), ek testler ve tekrarlar kalan süreye; her konunun en az bir testi olur. Sıra numarası konu konu yeniden verilir | `buildExamScheduleV2` |
| Kurs haritası konuyu tek dosyaya bağlar; **yardımcı kaynaklar** modelsiz eşlenir: küçük dosyanın (≤ 8 sayfa) yetim sayfası açık ara en yakın konuya, çok konulu sayfa (test) parça parça, ince kaynaklı konuya (< 900 karakter) başka dosyadan en yakın iki sayfa. Kayıt yazılmaz, her üretimde hesaplanır; motorlara "Ek kaynak · …" etiketiyle, yazar ve denetçiye aynı notla gider | `topic-support-pages.ts`, `topic-support-load.ts`, `teacher-lesson.ts` `sourceText` |
| "N kaynak" konuya bağlı etkinlikte konunun dosyalarını ve sayfalarını (ve yardımcıları "ek: parça 2") gösterir | `dugum/[nodeId]/page.tsx`, `node-sources.tsx` |
| Başlık büyütmede "pH", "mRNA", "DNA" korunur | `outline-clean.ts` `keepsOwnCasing` |
| "Kaldığın yer açılıyor" yalnız açık oturum varsa; yoksa sorgu ve ekran atlanır (yeni derste ~5 sn bekletiyordu) | `openAttempt`, `exam-node-session.tsx` |
| Çok dosyalı yükleme: ücretli hesapta en çok 3 dosya aynı anda (kredi ve taranmış sayfa hakkı atomik), ücretsizde sırayla (5 sayfalık sınır belge kaydından sayılıyor, atomik değil); bitince seçim sırası geri kurulur (ilk belge kursun belgesi). Bekleyen belge kaydı belge başına; temizleme belgeye/yüzeye göre (tek kayıt bir sekmenin temizliğiyle öbürünün kaydını da siliyordu) | `upload-batch.ts`, `pending-doc-process.ts`, `exam-create-wizard.tsx` |
| Kurulumun konu listesinde birden çok dosyadan beslenen konuya "N kaynak" (yardımcı dosyalar dahil, adları üzerine gelince); tek dosyalıda yazılmaz. Tek konulu ünitenin başlığı konunun adıyla aynıysa yazılmaz | `supportFilesForTopics`, `topicSourcesChip`, `redundantUnitHeader` |

Vercel Hobby'de günlük yayın sınırı var: önizlemeler de sayılır; sınıra takılan yayın kendiliğinden
yeniden denenmez, sonraki push ya da paneldeki "Redeploy" gerekir.

Bekçi: `exam-set-plan.test.ts`, `topic-support-pages.test.ts`, `node-open-no-resume-wait.test.tsx`,
`office-documents.test.ts`, `outline-grounding.test.ts`, `prep-schedule-reload.test.ts`, `upload-batch.test.ts`,
`wizard-topic-sources.test.ts`.

## Fotoğraf okuma: şık kendi harfiyle, işaret yazılır (20 Ekim 2026)

**Sınav setinin işaretli test fotoğrafı (Test-14) canlıda üç kez okundu, üçünde de harfler kaydı.**
Okuyucu (gpt-4o-mini) iki sütunlu şıkları sütun sütun okuyup A, B, C… diye yeniden harflendirdi, son
şıkları düşürdü ve bir şıkkın sözünü değiştirdi. Kâğıttaki "doğrusu C (~%70)" bikarbonat yerine
karbaminohemoglobine bağlandı: derse giden bilgi yanlışlandı. Öğrencinin işaretlediği şık hiç yazılmıyordu.
Bedel de tersmiş: mini yüksek ayrıntılı bir fotoğrafı ~25.500 girdi jetonu sayıyor (~$0,0038); luna'da
fotoğraflı istek ~1.050 jeton (~$0,0003, çıktı dahil).

| Yapmayın | Yapın |
|---|---|
| Fotoğrafı ya da taranmış sayfayı gpt-4o-mini ile okumak ("önce ucuz model") | Önce asıl model (luna, `reasoning_effort: "low"`), okuyamazsa gpt-4.1 (`imageReadLadder`) |
| Şıkları okuma sırasına göre yeniden harflendirmek, şık atlamak, kelime düzeltmek | Her şık kâğıttaki kendi harfiyle, harf sırasıyla; metin olduğu gibi (temizlik sonra) |
| Öğrencinin işaretini atlamak | İşaretli şıkkın sonuna `(işaretli)`, el yazısı düzeltme yerinde; yazar notu (`SUPPORT_SOURCE_NOTE`) aynı adı tanır ve yanılgıyı derste ele aldırır |
| Okumanın jetonunu tek modele yazmak | Her deneme kendi modeliyle kayda geçer (`usage`, `mergeUsage`); taranmış sayfanın ikinci denemesi de |

Kayıtlı eski okumalar kendiliğinden düzelmez; dosya yeniden yüklenince yeni kuralla okunur. Bekçi:
`photo-documents.test.ts`, `scanned-pdf.test.ts`.

## Denetim (20 Ekim 2026) — canlı kayıtlardan ve sayfa taramasından

Ürün sahibi: "gerçek sorunlar, kodlama hataları, çalışmayan özellikler". Kanıt: `/admin/beta`,
`/admin/ders-hatalari`, 14 günlük belge/kredi/önceden yazım kayıtları, 11 sayfada konsol ve ağ isteği.
Tümden çalışmayan özellik çıkmadı; bunlar çıktı:

| Bulgu | Kural | Nerede |
|---|---|---|
| Sohbetler sayfası React #418: "Bugün / Dün" sunucuda UTC gününe, tarayıcıda Türkiye gününe göre | Sunucuda da çizilen istemci bileşeninde gün `istanbul-day.ts` ile, "şimdi" sunucudan prop; `setHours` / `getDate` ile gün hesaplanmaz | `sohbetler-list.tsx` |
| Hazır ders p95 tek açılış yüzünden düşüyordu: sunucu süren yazımın bitmesini 10,7 sn bekledi, kayıt "hazır" dedi | Beklenen hazır içerik "devralınan" kaydedilir (`servedOpenPath`, ≥ 1 sn) | `beta-metrics.ts`, `node/route.ts` |
| Araçlar fotoğraf, sohbet Word/PowerPoint seçtirmiyordu; sohbet API'si Word'e "desteklenmiyor" diyordu | Seçiciler tek kaynaktan (`DOCUMENT_UPLOAD_ACCEPT`; sohbette `CHAT_UPLOAD_ACCEPT`, HEIC yok — görüntü modeli okumuyor); sohbet işlenmemiş Word/PowerPoint'i `extractOfficeText` ile modelsiz okur | `upload-accept.ts`, `api/ai/chat/route.ts` |
| Her sayfa açılışında 2-4 CSP raporu: PostHog'un `eu-assets` adresi listede yoktu, anket betiği boşuna yükleniyordu | `eu-assets.i.posthog.com` betik ve bağlantı listesinde; PostHog anketi kapalı (anket bizde, `/api/feedback/weekly`) | `csp.ts`, `analytics.tsx` |
| Fotoğraf okuma CO₂'yi LaTeX'e çeviriyordu | Kimyasal formül ve birim olduğu gibi yazılır | `extract-image-text.ts` |
| `/okulum` 404 | Kalıcı yönlendirme `/deneme-sinavlari/okulum` | `next.config.ts` |
| Odaklı pratik / tekrar sorusunda kök bozuluyordu: "katkısı nedir?" → "katkısı hangi addır?" (canlıda görüldü) | "nedir?" bir ad sormaz: "hangi addır?" ve "ne ile bilinir?" eşlemeleri kalktı; "ne denir?" → "hangi adla anılır?" kalır; kök değişmezse genel kök ("… için geçerli ifade hangisidir?") | `teacher-brain.ts` (`rephraseMultipleChoice`, `meaningfulRetryStem`) |
| Tablolu kaynakta ders tur dönüyordu: kavramlar aynı anda denetlenirken önceki kavramın tablo düzeltmesi derse işlenmeden sonraki kavram aynı tablo için geri çevriliyordu (İdrar dersi: aynı tablo üç kavramda, 3 tur / 11 çağrı / 54 sn; Nefroloji 18 Ekim'de hiç çıkmadı) | Tablo onu ilk anan kavramındır: önceki ekranlar tablonun satırlarını anıyorsa sonraki kavram aynı tablo için istenmez; tablo hiç verilmezse kapanıştaki ders düzeyi kural yakalar | `teacher-lesson.ts` `partStructureIssues` |

**Göç kayıt tablosu.** Göçler SQL ekranından (ve bir dönem panelin/MCP'nin uygulama anındaki zamanıyla)
uygulandığı için `supabase_migrations.schema_migrations` repoyla ayrışmıştı: 70 dosya kayıtta yoktu,
kayıtta hiçbir dosyaya karşılık gelmeyen 33 satır var. 20 Ekim'de 70 eksik sürüm yalnız eklenerek
yazıldı (şema değişmedi; uygulanmışlığın kanıtı `/admin/sistem` şema kontrolü). Yetim 33 satır silinmedi
(ürün sahibinin kararı, 20 Ekim: bırak):
`supabase db push` bu yüzden "remote versions not found" diyerek durur — bu bir emniyettir.
**`supabase db push` kullanmayın; yeni göçü SQL ekranında uygulayıp aynı anda kayıt satırını yazın**
(`insert into supabase_migrations.schema_migrations (version, name) values ('<dosya zamanı>', '<ad>')`).

Kendiliğinden düzelen: bir belgenin konu haritası "bekliyor"da kalmıştı; Belgelerim açılınca tamamlanıyor.
Bekçi: `audit-20-ekim.test.tsx`, `lesson-v3-zscore.test.tsx` ("akışlı derste aynı tablo"), `retry-stem-nedir.test.ts`.

## 2 adım ileri — yol (20 Ekim 2026, Aşama 1)

Ürün sahibi: "Astra mantığına geçelim: yolda ve derste bir sonraki 2'yi aça aça ilerleyelim; maliyeti
kısarız, kullanıcının durumuna göre ilerleriz." Kararlar ve Aşama 2 (ders tek parça kalır; ölçümle karar değişti, ders sonu uyarlaması zaten var):
`cortex-plus/docs/delivery/IKI-ADIM-ILERI-20-EKIM.md`. Yeniden açmayın:

| Kural | Nerede |
|---|---|
| Yolun tamamı görünür; şu anki + 2 adımdan sonrası **soluk**, ilkinde "Plan sonuçlarına göre değişebilir". Pencere kilidin açıldığı sırayla (sort_order) sayılır — yol aşamaya göre çiziliyor, çizim sırası sıradaki adımı göstermez | `study-path-window.ts`, `exam-prep-home.tsx` |
| ~~Önceden yazım yalnız pencere içi (sıradaki 2 adım; hazırlık sayfasında şu anki + 2)~~ **30 Ekim 2026 (ürün sahibi: "Podcast uzun sürüyorsa ve kısaltamıyorsak yolda 2 dersi önceden kuralım ki kullanıcı beklemesin")**: pencere içi (penceredeki ilk adım ve penceredeki podcast) **artı sıradaki iki ders**; dersler aradaki test/kart adımları sayılmadan bulunur (yolda bir konu ~6 adım: 2 adımlık pencere bir sonraki dersi ancak önceki konunun son adımında görüyordu) | `lesson-prefetch.ts` `PATH_LOOKAHEAD`, `LESSON_LOOKAHEAD`, `SLOW_PREFETCH_KINDS`, `prefetchTargets` |
| Sonuca göre yol, **kendiliğinden**: puanlı adımda (konu testi, doğru/yanlış, sözlü, soru-cevap; en az 3 soru) %50 altı → konunun odaklı pratiği bu adımın hemen arkasına girer (bekleyen varsa ikincisi eklenmez); %90 ve üstü → konunun kalan, denemesiz ek testleri yoldan çıkar (konunun en az bir testi bitmiş olmalı). Odaklı pratiğin kendisi tetiklemez | `path-change.ts`, `adaptive-path.ts` |
| Uyarlama tamamlama RPC'sinden **önce**: eklenen düğümü RPC sıradaki olarak açar. Kaydırma + ekleme tek SQL işleminde (`exam_path_insert_after`, yalnız `service_role`); düğüm başına güncelleme 90 düğümlük yolda saniyeler sürerdi | göç `20261020120000`, `node/route.ts` |
| Uyarlamalı odaklı pratik yalnız o konudan kurulur (kayıtlı yanlışlar ve ders soruları; yoksa o konu için üretim). ~~Hazırlık geneli odaklı pratik eskisi gibi bütün zayıf konulardan~~ **30 Ekim 2026 (Paket I #8): hazırlık geneli odaklı pratik de tek konuya** (`rankFinalStepTopics`) | `adaptiveFocusTopic`, `exam-local-session.ts` `focusTopic` |
| Öğrenciye sonuç ekranında tek satır ("Bu konuda zorlandın: sıradaki adım … için odaklı pratik." / "Bu konuyu iyi biliyorsun: … için N ek testi yoldan çıkardık.") | `pathChangeLine`, `exam-node-session.tsx` |

Takvim (Takvimim, hatırlatmalar, sınav günü tahmini) arka planda tam plan olarak kalır. `/admin/sistem` "Sonuca göre
yol" satırı fonksiyonu sorar. Bekçi: `study-path-window.test.tsx`, `adaptive-path.test.ts` (fonksiyonu PGlite'ta çalıştırır).

## Plus'ın bir ayı — misafire ve ücretsiz öğrenciye (20 Ekim 2026)

Ürün sahibi: "plus alan biri bütün bir plus hesabıyla neler yapabilir, kaç adet kullanabilir; misafir
ekranına ve kayıtlı ücretsiz kullanıcı ekranına dikkat çekici, en önemli nokta buymuş gibi; sinematik
ve fütüristik". Yeniden açmayın:

| Kural | Nerede |
|---|---|
| Her sayı **kredi tablosundan hesaplanır**, elle yazılmaz: Plus ayda (kredi v3, 24 Ekim 2026) 240 ders, 720 konu testi, 1.800 kart seti, 100 podcast (5 dk, **sesiyle**: senaryo + seslendirme), 1.200 sözlü deneme, 480 yazılı deneme, 1.800 fotoğraftan çözüm, 25 video ders, 2.400 soru; 1.440 sayfa not, ayda 300 fotoğraf/taranmış sayfa. "Her biri tek başına; hepsi aynı aylık haktan" her yüzeyde yazılı | `src/lib/billing/plan-value.ts` |
| "Ücretsizde kapalı" = `PLUS_ONLY_ACTIONS`: podcast, sözlü, yazılı deneme, video. Ücretsizde ders ayda ~12 (haftada 3), test ve kartlar "Derse dahil", mesaj 90, fotoğraf 30 (`free`, 24 Ekim 2026) | `PLAN_WORK[].plusOnly`, `free` |
| "Kendi ayını kur": öğrenci temposunu (günde ders/test/soru, haftada podcast/deneme, ayda video) seçer; hakkın yüzdesi, kalan pay ve aynı tempo ücretsizle kaç gün sürerdi görünür. Hazır tempolar Plus'a sığar (kredi v3: düzenli %45, sınav ayı %67, son sprint %72; en yoğunu %75'in altında). Öğrenci **kredi sayısı görmez**, yüzde görür | `TEMPO_PRESETS`, `tempoMix`, `mixShare`, `freeDaysFor` |
| Fiyat satırı: aylık fiyatın günlük karşılığı (yıllık plan 24 Ekim 2026'da kalktı), "Otomatik yenileme yok", "Kart bilgisi bize gelmez" — üçü de bugün doğru (`AUTO_RENEW_SUPPORTED = false`, PayTR iFrame). Sahte aciliyet, sahte yorum, indirim sayacı yok | `TrustLine` |
| Misafir: ana sayfada ikinci bölüm (güven çubuğunun hemen ardından). Ücretsiz öğrenci (`showsUpgradeChrome`): ana ekranda kart — hiç hazırlığı yoksa önce "İlk hazırlığını kur" (değeri yaşatmadan satış dönüşmüyor), hemen altında Plus kartı; ödeme sayfasında planların altında tam bölüm; yükseltme kapısında dört sayı. Plus/Sigma ve kurucu görmez | `landing-page.tsx`, `ogretmen/page.tsx`, `pay/page.tsx`, `upgrade-sheet.tsx` |
| Tasarım: koyu zemin, yavaş mavi-altın ışık, ufka uzanan ızgara, tarama ışığı, dönen altın kenarlı kart; altın yalnız Plus. `overflow: clip` (hidden değil): hidden kaydırılabilir kutu kuruyor, #plus-ay bağlantısıyla gelince içerik telefonda 461 px sola kaçıyordu. Sayılar sunucuda son değerle yazılır, ekrana girince sayar; hareket azaltmada durur | `plus-month.tsx`, `plus-month.css` |

Fiyatlar tek okuyucudan (`loadPlusPrices`). Bekçi: `plus-month.test.tsx`, `marketing-claims.test.ts`.

## Öğretim kalitesi (20 Ekim 2026) — kör kıyas ve beş düzeltme

Ürün sahibi: "en önemli nokta: belgedeki bilgiyi öğrenciye nasıl aktarıyoruz; bir öğrenci Cortex Astra'dan
iyi öğretiyor diyebilir mi?" Aynı belgelerden (KPSS anayasa, trigonometri, Pediatri) iki ürünün dersleri,
testleri ve podcast'i **kör** yan yana puanlandı (dört gözle: öğrenme bilimi, sınav koçu, öğrenci, kaynağa
sadakat; artı yalnız materyali okuyan "öğrenci" ajanlarına bağımsız sınav). Sonuç: **doğrulukta öndeyiz,
öğretmede değil.** Astra her derste daha çok soru soruyor, yanlışa hedefli ikinci soru veriyordu; bizim
podcast robotik ve çelişkiliydi; testimiz tablo satırlarını aynı kalıpla soruyordu. Yeniden ölçüm (3'er
örnek, aynı konuda podcast) yeni kurallarla **henüz koşulmadı** — "daha iyi öğretiyor" ancak o ölçümde her
çiftte kazanınca söylenir.

**Kör kıyasta bulunan ciddi hata — ikinci sorunun anahtarı.** Yanlıştan sonra sorulan ikinci soru yalnız
kök yazılıyor, kod ona ana sorunun anahtarını veriyordu; kök çoğu zaman başka şıkkı soruyordu. İncelenen üç
tekrarın üçünde öğrencinin **doğru** ikinci cevabı **yanlış** sayıldı ve yanlış anahtar yanılgı kayıtlarına
ve tekrar kartlarına da yazıldı.

### Ders motoru

| Yapmayın | Yapın |
|---|---|
| İkinci soruya yalnız kök yazdırmak ("şıklar aynı kalır") ya da yalnız kökü kabul etmek | Tam öğe: kendi şıkları, anahtarı, açıklaması (doğru/yanlışta `corrected`); çoktan seçmelide doğru şık ana sorununkiyle aynı metin. Yapı denetimi ve çalışma anı aynı listeye bakar (`reviewItemProblems`); yalnız-kök reddedilir, yedek zincir çalışır |
| Ders içi ikinci soruda kaynağın başka cümlesini sormak | `sameFactOnly`: `reviewGateQuestion` ve `lessonMissDrafts` aynı bayrakla; odaklı pratik bayraksız (20 Ekim "nedir" düzeltmesi orada) |
| Kaydırılan ya da yeni şıklı tekrarda ana sorunun `optionWhy`'ını bırakmak | `shiftOptions` gerekçeyi de kaydırır; yeni şık dizisinde gerekçe yok, ekran açıklamaya düşer |
| Her 3+ öğeli listede ezber kodu zorunlu tutmak (18 Ekim kararı **değişti**) | Kod yalnız sınavın sorduğu **ayrımı** kodlarsa (kategori ↔ ipucu: "Soyda Mon, zümrede Oli, din adamında Teo, toplumda Cum") ya da sınav bütün listeyi soruyorsa; yoksa kutu yok, "kod yok" sorun değil; ilk kavramda kötü kod tur açmadan çıkar |
| "Günlük hayattan" kutusu | "Örnek vaka: …": sonucu kavramın belirlediği somut durum; kaynakta olmayan sayı/kural/sonuç yok (eski başlık kabul edilmez) |

| Kural | Nerede |
|---|---|
| Her ekran tek soruyla biter (yalnız ilk ekranın sorusu başta); ara ekran sorusuzsa yüksek | `conceptStructureIssues` |
| 5+ satırlı tablo aynı kavramın 2-3 ekranına bölünür; kural yalnız kavramın kendi tablo bloklarına bakar ("aynı tablo" döngüsü kurulmasın); ilk kavramda düşük | `denseTableIssues` |
| İlk kavram tek ekran (önce dene + kısa anlatım); bölünen tablo/hesap ikinci kavramdan (soğuk ilk ekran p95 < 20 sn) | `TEACHER_SYSTEM` AKIŞ 2 |
| En fazla 9 ekran (önce 7) ve 5 kavram; ikisi de **düşük** — kapanışta denetlenen sınırı son kavram düzeltemiyor, baştan yazılıp atılıyordu | `lessonLevelStructureIssues` |
| Öğretim ölçütü (ekranlar arası tekrar yok, kaynağın kısaltması açıklanır, terim ilk geçtiğinde açıklanır, boş cümle yok, döngüsel tanım yok, soru üstündeki cümleyi geri sormaz) yazar + düzeltici + denetçide **aynı metin** | `teaching-rubric.ts` `TEACHING_RUBRIC` |
| Yeni önem `medium`: ilk kavramda tur açmaz; sonraki kavramda en çok bir kavram içi tur, gerilerse önceki ekranlar kalır; asla atma ya da baştan yazma. Yalnız ders denetimi okur; kayıtta `[öğretim]` | `teacher-lesson-run.ts`, `TEACHING_TAG` |
| Kaynak kuralının dar istisnası: kaynaktaki iki bilgiyi bağlayan neden cümlesi ve yabancı terimin birebir Türkçe karşılığı yeni bilgi değil; dışarıdan tanım yine yalnız "Genel bilgi" kutusunda | `SOURCE_LINK_EXEMPTION` (yazar + denetçi A) |
| Şık sırası dedektörü büyük "İ"yi, "ilk iki ifade"yi, "sırayla"yı yakalar; "madde" şık değil ("Anayasanın ilk üç maddesi"), "ışık" şık değil; ders **ve test** denetçisi kuralı yazarla aynı cümleyle okur | `option-reference.ts` |
| Şemadan kopyalanan yer tutucu başlık ("X ile Y farkı", "<karıştırılan kavram>", "…", "kardeş kavram") yüksek; "Hepatit A ile B farkı" gerçek ad | `placeholderTitle` |

Kayıtlı derslerdeki yalnız-kök ikinci sorular yayından sonra kod yedeğine düşer (doğru anahtarla aynı olgu).
Bekçi: `lesson-teaching-quality.test.ts`, `retry-key.test.ts`, `option-order-detector.test.ts`,
`lesson-stream-pipeline.test.ts` ("öğretim ölçütü turu"), `lesson-v3-zscore.test.tsx`.

### Konu testi (yalnız yoldaki konu testi, `scope: "topic_test"`)

Pediatri solunum testimiz kaynak tablosunun dört satırını "En olası tanı hangisidir?" kalıbıyla sordu; uyarı
ve tedavi cümlelerini hiç sormadı; KPSS testinde 5 sorudan 4'ü aynı bloktandı. Denetçi soruları tek tek
doğru buldu; teste bütün olarak bakan yoktu. Motoru paylaşan öbür yüzeyler (zayıf nokta, test aracı,
soru-cevap, odaklı pratik, son kontrol, yazılı deneme, düello, tanı, tanışma) bugünkü istemi alır.

| Kural | Nerede |
|---|---|
| Yazar, düzeltici ve denetçi aynı `TOPIC_TEST_RULE` metnini okur: her soru bir SINAVDA SORULUR maddesi (`point` alanı, maddeler numaralı); sorulmamış madde varken tekrar yok; aynı tablodan en çok 2, aynı kök kalıbı en çok 2 soruda; tablo satırı soru değildir; en az bir soru uyarı/yasak/yönetim cümlesini yoklar; dersin sorusu tekrar edilmez, dersin terimi kullanılır | `teacher-quiz.ts` |
| **Vaka** = kaynaktaki bilginin somut hâli (kaynak "küçük bebek" → "5 aylık bebek"); tablo satırını kopyalamak vaka değil; vakaya kaynakta olmayan bulgu/eşik/sayı eklenmez. Tanım yalnız bu kuralda, öbür yüzeyler değişmedi | `TOPIC_TEST_RULE`, `topicTestVerify` |
| Denetçi aynası H (tablo/cümle tekrarı), I (kalıp ya da madde tekrarı), J (kapsam), K (dersle tekrar), harfli `code`; kod da teste bütün bakar ve yalnız işaretler (`stemFrame`, `quizSetIssues`). Tablo satırı tekrarı kodda kapı değil, yalnız ölçüm (`lookupLike`) | `parseQuizIssues`, `quizSetIssues` |
| **H-K yumuşak**: düzeltilir ya da yedekle değişir (3 yedek); düzelmeyen soru sayıyı tamamlamak için **geri konur**; A-G / yapı / harfsiz sorunlu soru asla geri konmaz; düzeltme düşse de test düşmez. Teslim edilen sayı bugünkünden düşmez. J bir tur açar (yalnız öğrenciye gidecek sorularda) | `teacherQuizLoop`, `deliveryWindow` |
| Kapsam sırası: önce dersin işlediği maddeler ("(derste işlendi)"), sonra konunun öbürleri; ders yoksa hepsi | `topicTestPoints`, `pointTaught` |
| Test konunun kaydedilmiş dersini bilir (en çok 4 ders; sorular ≤12, koyu terimler ≤25, kaynaktan önce) | `lesson-quiz-context.ts` |
| Çok cevaplı soruda yanlış şıklar aynı bağlamdan; başka hastalığın tipik bulgusu çeldirici değil (yazar + denetçi G) | `MULTI_DISTRACTOR_RULE` |
| **Önceden yazılan test dersin parmak iziyle anahtarlanır** (`quiz:orta:L…`); dersten önce yazılan test açılışta verilmez; ders kaydedilince (devralınan, hazır, soğuk) sıradaki bu konunun testiyse eski silinir, yenisi derse göre istenir. Yazım sahiplendiği satıra anahtarını yazar; satır başkasınınsa ya da ders değiştiyse saklamaz | `prefetchVariant`, `topic-test-prefetch.ts` |
| Bedel: soğuk/devralınan ders yolunda konu testi iki kez önceden yazılır (ikisi de `CONTENT_PREFETCH`) | — |
| Ölçüm: `teacher_quiz` günlüğü `scope`, `softKept`, `forced`, `codes`, `lessonAware`, `lookupLike`; geri konan soru `/admin/ders-hatalari`'nda `pedagogy_salvaged` | `teacher-quiz-run.ts` |

Bekçi: `topic-test-rules.test.ts`, `topic-test-loop.test.ts` (P4 soruları birebir), `lesson-quiz-context.test.ts`,
`topic-test-prefetch.test.ts`.

### Podcast — kaynağa gönderme yok, konuşma kuralı, dinleme kontrolü

Podcast'imiz robot gibiydi: Kerem doğru cevabı verip "yanlış sanmışım" dedi; sorular cevapsız kaldı;
"Notlarındaki örnekte" dört kez geçti — **kodun kendi talimatıydı** (`podcastGroundingBrief` yazara
`"notlarındaki örnek" de` diyordu); 21 hücrelik tablo satır satır okundu; sonda soru yoktu.

| Yapmayın | Yapın |
|---|---|
| Yazara kaynağı andıran kalıp söyletmek | Örnek "kaynağı anmadan" anlatılır; YAZMA listesinde `notlarında/notlarındaki/belgende yazan`; etiketli genel bilgi yasağın dışında. Kod tek **satırsız** sorun yazar ("Kaynağa gönderme var"): düzeltme turuna gider, cümle silinmez |
| Yazara ve denetçiye ayrı kural | `DUO_TURN_RULE` (soru sonraki sırada cevaplanır; itiraf yalnız doğru söylenmeden önce; kimse kendisiyle çelişmez), `TABLE_RULE` (sıra başına ≤3 öğe, tablo 2-3 karşılaştırmaya), `REPEAT_RULE` (aynı nokta en çok iki kez) ikisinde **aynen**; `CHAPTER_RULE` yalnız yazarda |
| Denetçinin G/H/I'sını A-F gibi işlemek | `rule` harfi (`parsePodcastIssues`); kurtarmada G/H satırı çıkar, I (tablo okuma) **silinmez**; satırsız G/H bölüm düşürmez; G/H/I asla ikinci taslak sebebi değil |

**Dinleme kontrolü** (ürün sahibinin kararı): senaryo denetimden geçince test motoru (`teacherQuizLoop`,
kip "document", kaynak senaryonun kendisi) üç soru yazar; aynı `ask` ve aynı kredi (PODCAST_GENERATE 12
kalır; soğuk podcast'e +20-35 sn kabul). Kontrol podcast'i **hiçbir zaman düşürmez**; 1 dakikalık özette
yok. Oynatıcı bitince gösterilir, "Şimdi değil" ile atlanır (o zaman 1/1, puansız, kanıtsız). Cevaplanınca
"2/3" ve **kanıt** (`source_kind 'podcast'`); yol uyarlanmaz; düzey önerisi podcast'i saymaz; **yıldız sabit
20**; önbellekten yeniden dinlenen (`reused`) podcast aynı kontrolü yeniden kanıt yazmaz. Yalnız hazırlığın
podcast'inde (stüdyo ve ders podcast'i kontrolsüz). Denetçi de kontrolün kurallarını görür (`İSTEK`).
Önceden yazılmış podcast **açılıp ücreti alındıktan sonra** önbelleğe girer (önce girmiyordu, "Yeniden dinle"
ikinci kez 12 kredi alıyordu). Göç `20261020150000` (`listening_check jsonb`); okuma `select("*")`, yazma
sütun yoksa bir kez sütunsuz dener — kod göçten önce yayına çıkabilir.
Bekçi: `teacher-podcast.test.ts`, `podcast-check.test.ts`, `podcast-listening-check.test.tsx`, `podcast-episode.test.ts`.

### Günü gelen tekrar — yolun dışında, tarihe bağlı

Ürün sahibinin kararı: yanlışlar ve dersin sınav noktaları 1-3-7-14 gün sonra (sınavdan önceye sınırlı)
kendiliğinden yeniden sorulur; hazırlık sayfasında "Bugün N tekrar"; **yolu kilitlemez**. Yoldaki "Kartlarla
tekrar" düğümü (eski adı "Aralıklı tekrar") aynı oturumdaki kart destesi olarak kalır.

| Kural | Nerede |
|---|---|
| Öğe, yazarın yazıp denetçinin geçirdiği sorunun **kopyası**; model çağrısı yok, metin yeniden yazılmaz, kök kodla kurulmaz; sunarken yalnız şık sırası karışır. Yazarın tam ikinci sorusu varyant olur (çift soruluşta), yalnız-kök olmaz; varyant kendi açıklamasını gösterir | `review-items.ts` |
| Anahtar yalnız özet (`prompt_key` 16 hex): okunur kök öneki `.in()` süzgecinde tırnak/ters bölü/parantezle bozuluyor, yeniden kaçan soru 1. güne dönmüyordu | `reviewPromptKey` |
| Merdiven İstanbul günüyle 1/3/7/14; yanlış 1. güne döner, 14. günde doğru → öğrenildi; yanlış 1 günden, doğru cevaplanmış sınav noktası 3 günden başlar | `reviewDueOn`, `nextReviewStep` |
| Kaynaklar: ders sorusu (mcq/doğru-yanlış, **ilk cevap** sayılır), test/odaklı/boşluk (`reused` hariç), doğru/yanlış, sözlü, kartta "Hayır"; doğru cevaplanan `==…==` / Sınav ipucu ekranı → sınav noktası (ders başına ≤3); etkinlik başına ≤20. Yazılı deneme yanlışları v1'de girmez | `reviewDraftsFromAttempt` |
| Düğüm değil: yol sırası, `PATH_LOOKAHEAD`, önceden yazım, `complete_exam_prep_node` değişmez; kayıt yalnız bitirilen etkinlikten, RPC'den sonra, hata 0 döner | `scheduleReviewsAfterComplete`, node rotası |
| "Bugün N tekrar" yalnız o hazırlığın sayfasında; oturum `/deneme-sinavlari/[prepId]/tekrar` (tek çıkış ×, bir seferde bir soru, en çok 12 — bitişte "Bu tur bitti"; hepsi bitince "Bugünkü tekrar bitti"); `force-dynamic`, Suspense yok | `prep-review-session.tsx` |
| Not **sunucuda** (anahtar istemciye gitmez); aynı gün ikinci tıklama yazmaz; kredi, model, yıldız yok; cevap hâkimiyete yazılmaz (v1); Yanlışlarım ile ayrı | `/api/learning/exam-prep/review`, `answerReviewItem` |
| Hatırlatma: yeni cron yok; 19:00'daki tek bildirim "N tekrar bekliyor" (sıra: sınav yaklaşması > tekrar > seri > boş gün) | `study-reminder.ts` |
| Tablo `exam_prep_review_items`: satır güvenliği açık, **politika yok** (yalnız service_role); hesap silinince `purgeUserData` siler; kapatma `spaced_review` anahtarı; ölçü `/admin/beta` "Aralıklı tekrar" kartı (7 günde yeniden sorulma payı, hedef ≥ %80) | göç `20261020160000`, `review-metrics.ts` |

**Canlıya geçiş sırası: önce göç, sonra kod.** `account-deletion.ts` tabloyu siler; tablo yoksa her hesap
silme isteği `purge_exam_prep_review_items` adımında düşer.
Bekçi: `prep-review-items.test.ts` (göçü PGlite'ta), `prep-review-answer.test.ts`, `prep-review-session.test.tsx`,
`study-reminder.test.ts`, `review-metrics.test.ts`.

### Öğrenme döngüsü — yanılgı kapanır, deneme yolu bitirir, "Hazırsın" ulaşılabilir

Yanılgı satırı yazılıyor ama hiç kapanmıyordu; eğitmenle çözülen soru bağımsız doğru sayılıyordu;
notlanan yazılı deneme yoldaki düğümü hiç bitirmiyordu (sonraki "Kartlarla son tekrar", "Son kontrol",
"Hazırsın" sırayla hiç açılmıyordu); hazırlık geneli düğümler 1. konunun sayfalarından yazılıyordu; tek bir
eski yanlış "Hazırsın"ı ömür boyu kapatıyordu.

| Kural | Nerede |
|---|---|
| **Yanılgı çözülür**: aynı konu, yanılgıdan sonra, iki ayrı Türkiye gününde yardımsız doğru → `resolved_at`; eşleşme konu anahtarıyla; yanılgıyı yazan denemenin doğruları sayılmaz. Konuya bağlanmayan yanılgı (sohbet) herhangi bir konunun iki günlük doğrusuyla çözülür | `misconception-resolution.ts` |
| Her okuyucu **yalnız açık** yanılgıyı okur; çözülmüş satır yeniden yazımı engellemez. Göçsüz yayın güvenli: süzgeçli sorgu düşerse süzgeçsiz koşar, **hepsi açık** sayılır — asla "0 açık" sanılmaz | `misconception-store.ts` |
| **"Hazırsın"** = her planlı konu ölçülmüş ve sağlam (%85+, ≥3 öğe), açık yanılgı 0, yazılı deneme hedefte ya da üstünde (**zorunlu**), kapsam %100. `!anyWrong` ve `measuredSuccessPct >= 100` kalktı: düzelmiş hata kapatmaz. Yüzde dürüst kalır, iddia yoksa en çok 99 | `computeExamReadiness`, `readiness-screen.ts` |
| Eğitmen yardımı cevap **kilitlenmeden önce** gelirse soru ipuçlu (bağımsız başarı sayılmaz); kilit testte "Kontrol et" | `hintsUsedRef`, `markHint`, `onUsed`, `onReveal` |
| Ek testlerin adı dürüst: "İkinci test" / "Üçüncü test" (karışık/zor test **kurulmaz**); yoldaki adım "Kartlarla tekrar" | `practiceActivity`, `PLAN_NODE_META.spaced`, göç `20261020171000` (yalnız UPDATE) |
| **Notlanan tam deneme** yoldaki "Yazılı deneme" düğümünü tamamlar (`mock:<kayıt>` ile tek kayıt), her soru kendi konusuna kanıt; **30 Ekim 2026 (Paket I #8): yalnız düğüm açıksa** (sırası gelmiş ya da öğrenci seçip açmış); kilitli düğümde çözülen deneme adımı bitirmez, kanıt yine yazılır; takvim yeniden kurulmadan önce; bitmiş deneme varken ikinci deneme konmaz; sonucu soru incelemesine gider | `prep-writeback.ts`, `grade-exam.ts`, `sonuc/page.tsx` |
| "Devam et" yalnız yolun penceresinde; sınav günü türleri sırası gelince | `preferNextNodeForTracking` |
| Hazırlık geneli düğüm **en zayıf konuya** yönelir (içerik `testedTopic` taşır); `?konu=` o konunun kaydını okur; son kart destesi konu değişince yeniden yazılır; sırası gelen "Bilgi boşlukları" boşluk yokken kilitli dönmez | `prep-wide-target.ts`, `isPathTurn` |

Göçler: `20261020170000` (`resolved_at`) ve `20261020171000` (başlıklar). Bekçi: `misconception-resolution.test.ts`,
`learning-loop-store.test.ts`, `learning-loop-readiness.test.ts`, `learning-loop-path.test.ts`, `exam-node-hints.test.tsx`,
`mock-exam-prep-writeback.test.ts`, `prep-wide-target.test.ts`.

### Dört göç, kod yayınından önce, SQL ekranında (sırayla)

| Göç | Ne | Kod göçsüz? |
|---|---|---|
| `20261020150000_podcast_listening_check` | `exam_prep_podcasts.listening_check jsonb` | Güvenli (önbellekteki podcast kontrolsüz) |
| `20261020160000_prep_review_items` | yeni tablo + `spaced_review` anahtarı | **Değil**: hesap silme düşer |
| `20261020170000_misconception_resolution` | `exam_prep_misconceptions.resolved_at` + dizin | Güvenli (hepsi açık sayılır) |
| `20261020171000_path_labels` | yalnız `UPDATE` (başlıklar) | Güvenli (eski adlar kalır) |

Her biri için aynı oturumda `insert into supabase_migrations.schema_migrations (version, name) values ('<zaman>', '<ad>')`.
`DROP POLICY` yok, `supabase db push` yok. Doğrulama: `/admin/sistem` → "Dinleme kontrolü önbelleği",
"Aralıklı tekrar kaydı", "Yanılgı çözümü" yeşil.

### İnceleme 22 Ekim 2026 — beş boyut, kapanan bulgular

Öğretim kalitesi dalı (PR #387) beş ayrı inceleyiciyle (ikinci soru notlandırma, ders döngüsü, deneme yazımı,
hedefleme/ipucu/yanılgı, test-podcast-tekrar kuralları) yeniden okundu. Anahtar hatası yok; kapananlar:

| Bulgu | Kural | Nerede |
|---|---|---|
| **Aynı deneme ikinci kez notlanıyordu** (sonuçtan "geri" + "Bitir", zaman aşımı sonrası ikinci gönderim): yol düğümü iki kez bitiyor, kanıt ve hâkimiyet iki kez yazılıyordu | Notlanmış kayıt varsa aynı sonuç döner, hiçbir şey yeniden yazılmaz; düğüm kaydının anahtarı denemenin kimliği (`mock:<examId>`) | `grade-exam.ts`, `prep-node-link.ts` |
| Erken çözülen deneme + zorunlu yeniden planlama → sıradaki adım bitince "sonraki düğüm" bitmiş deneme çıkıyor, yol kilitli kalıyordu; deneme sonrakini ("Kartlarla son tekrar") sırası gelmeden açıyordu | Sıradaki = ilk **kilitli** düğüm (bitmiş atlanır); önünde bitmemiş adım varken biten düğüm sonrakini açmaz; dönen nextId bitmişi atlar | göç `20261022120000_complete_node_in_order.sql` (yalnız fonksiyon gövdesi) |
| Değerlendirme düğümü deneme puanını son 40 etkinlikte arıyordu | Bitmiş written_exam düğümünün son kaydından; açık yanılgı toplamı bütün satırlardan (/degerlendirme ile aynı) | `exam-local-session.ts` |
| Açık yanılgı sayısı iki okumada da düşünce 0 sayılıyordu; boşluk/değerlendirme okuma hatasında "boşluk yok" diye adım bitiyordu | `countOpenMisconceptions` → `null` (bilinmiyor) → "Hazırsın" kapalı, tavan %85; gaps/readiness okuma hatasında istek düşer (ekran bir kez yeniden dener) | `misconception-store.ts`, `openMisconceptionsKnown` |
| İpucuyla doğru cevaplanan ilk deneme konuyu "sağlam" yapıyordu (bağımsız kanıt yokken ilk deneme oranına düşüyordu) | İpuculu cevap ilk denemenin toplamında, doğrusunda değil | `foldTopicMastery` |
| Hazır sorularla açılan odaklı pratik/son kontrol yanılgıyı düğümün devraldığı 1. konuya yazıyordu; tekrar satırı `testedTopic`'i okumuyordu | Yanılgı sorunun kendi konusuna (`question.topic`); tekrar satırı `testedTopic` | `extractMisconceptions`, `reviewDraftsFromAttempt` |
| "En zayıf konu" satır sırasıydı; `?konu=` hazır soru varken yok sayılıyordu | Zayıflar güvene göre sıralı; seçilen konu önce hazır sorulardan (`focusTopic`) | `collectWeakTopics`, node rotası |
| Önbellekten gelen podcast ilk dinleyişte de `reused` taşıyor, kontrolün ilk cevabı kanıtsız kalıyordu | Kanıt: `reused` değilse **ya da** düğümün ilk kaydıysa | `extractAnswerEvidence` |
| Yazarın tam ikinci sorusu yeni şıklarla gelince ana sorunun whyWrong/hint'i gösteriliyordu; "ne olur / ne sağlar / kim" kökleri bozuk sayılıyordu; aynı doğruyu taşıyan tam öğenin "Doğrusu"su gizleniyordu | Şık kümesi aynıysa ana metinler kalır, değilse tekrarın açıklaması; yalın "ne" ve "kim" soru sözcüğü; rota `corrected`'ı olduğu gibi verir | `resolveCheckForGrade`, `asksQuestion`, grade-check |
| Ders denetçisi aynı belirtiyi hem C (high) hem J (medium) diye okuyordu; ilk kavrama "2-3 ekrana böl" yapı kuralı gidiyordu; iki küçük tablonun satırları toplanıyordu; her "…" ve "a<b" yer tutucu sayılıyordu; öğretim turuna düşük yapı kuralları gidiyor, ekran düşüren düzeltme yayımlanıyordu | Kavramı bilmeden çözülen soru yalnız J; bölme cümlesi ilk kavramda yok; en büyük tablo sayılır; "…" yalnız ≤3 kelimelik değerde, `<…>` harfe yapışık değilse; öğretim turuna yalnız medium (+ yapı dışı low), ekran düşerse önceki hâl | `teacher-lesson.ts`, `teacher-lesson-run.ts` |
| Hedef puan girilmemişse karar %70'e göreydi ama ekran söylemiyordu; inceleme sayfası notlanmamış taslağı açabiliyordu | `DEFAULT_TARGET_SCORE` ekranda da; yalnız `completed_at` dolu kayıt | `readiness-screen.ts`, `incele/page.tsx` |

Düzeltilmeyen (kozmetik, kabul): "Yanlış yaptığın N soru yarın yeniden sorulacak" sayısı eş zamanlı çift
tamamlamada fazla sayabilir. Bekçi: `complete-node-in-order.test.ts` (PGlite), `retry-key.test.ts`,
`lesson-teaching-quality.test.ts`, `lesson-stream-pipeline.test.ts` ("ekran düşürmez"), `learning-tracking.test.ts`,
`learning-loop-readiness.test.ts`, `focused-practice.test.ts`, `mock-exam-prep-writeback.test.ts`.

### İkinci kör ölçüm (22–23 Ekim 2026) — doğrulukta öndeyiz, öğrencinin gözünde değil

Ayrıntı ve sayılar: `cortex-plus/docs/delivery/OGRETIM-KALITESI-OLCUM-2-22-EKIM.md`. 80 yargının (10 çift × 2 sıra × 4 göz)
sadakatte 20'si, sınav gözünde 18'i bizden yana; öğrenci gözünde 12'si, podcast'te üç göz Astra'dan yana. Ortak
eleştiri: "kaynağın tekrarı gibi okunuyor". Yeniden açmayın:

| Yapmayın | Yapın |
|---|---|
| Aynı paragrafı ya da tabloyu ikinci ekranda yeniden vermek | Kod işaretler (öğretim önemi, `repetitionIssues`); ölçütün 1. maddesi |
| Kuralı "Bir kişi …" diye yeniden söyleyen "Örnek vaka" | Kim, ne oldu, kavram yüzünden sonuç; kod sözcüklerin %80'i anlatılmışsa işaretler; ölçütün 10. maddesi |
| "Genel oy için verilen bilgi 1934 yılıdır", "Notlarda … belirtiliyor" | Bilgiyi doğrudan söyle (`sourceFrameIssue`, ölçütün 9. maddesi); genel bilgi kutusu hariç |
| İkinci soruda ana sorunun kökünü ya da "Doğrusu" cümlesini yeniden sormak | `nearSameQuestion` (sayılar aynı + içerik sözcüklerinin %85'i): yapı denetimi ve çalışma anı reddeder. Sayıları değişen hesap sorusu yeni sorudur |
| Podcast'te "Evet;/Hayır;" açılışı, yalnız soru soran Kerem, bağlamsız "Bu konu sınavda ağırlıklı." | `DUO_TURN_RULE` (yazar + denetçi); kod 3+ evet/hayır satırını ve diyalogda Kerem'in %60+ soru sırasını işaretler (yayını durdurmaz); sınav ağırlığı "hangi noktası soruluyor"la söylenir |

Bekçi: `teaching-quality-round2.test.ts`. Sıradaki: yayından sonra aynı on çiftle üçüncü tur.

### Üçüncü–altıncı kör ölçüm (23 Ekim 2026) — "Neden böyle?", öğrenci ölçüleri, podcast

Ayrıntı: `cortex-plus/docs/delivery/OGRETIM-KALITESI-OLCUM-3-23-EKIM.md`, `ASTRA-KARSILASTIRMA-23-EKIM.md`
(özellik özellik puanlı rapor), `PODCAST-OLCUM-23-EKIM.md`. Derslerde öğrenci gözü 4/18'den 13-15/18'e çıktı;
öğrenme, sınav ve sadakat gözü 18/18 bizde; yalnız materyali okuyan öğrenci ajanının sınavı Cortex 61/75,
Astra 31/75. Podcast'te Astra hâlâ önde (aşağıda). Yeniden açmayın:

| Konu | Kural | Nerede |
|---|---|---|
| Kapanış kısmı olmayan kavram (#389) | Denetçi "Bu kısım dersin son kısmı DEĞİL" notunu görür; ders düzeyi kuralı (özet, tekrar) ara kavramda istenmez. Düzleşmiş tablo ilk kavramda düşük; yalnız ikinci soru sorunu kaldıysa ikinci sorular çıkar, kavram yayımlanır (`stripReviews`) | `teacher-lesson.ts`, `teacher-lesson-run.ts` |
| "Neden böyle?" kutusu (#390, ürün sahibinin kararı) | Belgeli derste en az bir tane: `note`, tone `general`, başlık "Neden böyle…"; kaynaktaki iki bilgiyi bağlayan neden ya da etiketli ders kitabı nedeni (`WHY_NOTE_RULE`, yazar + denetçi H). Döngüsel kutu ("çünkü farklıdır") denetçide medium, **çıkarılır ve yenisi istenmez** (`whyDropped`) | `teaching-rubric.ts`, `isWhyNote`, `isCircularWhyIssue` |
| Öğretim puanı (#390) | Denetçi her kavrama `teaching:{score,reason}` (1-5) yazar; **3'ün altı** ilk kavram dışında bir öğretim turu açar (≤3 denendi: yazım yavaşladı, kazanç yok) | `TEACHING_SCORE_RULE`, `parseTeachingScore` |
| Kapanışta tablo kuralı son kavramı düşürüyordu | Düzleşmiş/yoğun tablo sorunu bir turdan sonra kabul edilir (`isLayoutIssue`) | `teacher-lesson-run.ts` |
| Gerçek öğrenci ölçüleri (#391) | Üç kart `/admin/beta`'da: tekrar cevaplarının basamağa göre doğruluğu (`exam_prep_review_answers`), ders sonu puanı, günlük kalite örneği (`lesson_quality_samples`: her ders açılışında denetçinin puanı; günlük cron'da 3 dersi bağımsız yargıç 0-100 puanlar). Yeni cron yok: örnek `subscription-renewal` içinde, özetten sonra (`maxDuration=300`). Satırlara belge metni yazılmaz | göç `20261023120000_learning_signals.sql` (canlıda), `learning-signals.ts`, `lesson-quality-judge.ts` |
| Podcast (ürün sahibinin kararı: "konuşma önce, denetim yalnız doğruluk") | Yazar bölüm planını (sahne, neden, benzetme) satırlardan önce yazar. Akış kuralları (tekrar, cevapsız soru, ikinci itiraf, evet/hayır, bağlamsız sınav satırı) **satır sildirmez, düzeltme turu açmaz**, yalnız kayda geçer (`podcastFlowNotes`); denetçide A-F yüksek, G-J düşük. Etiketli genel bilgi en çok üç yerde | `teacher-podcast.ts` |
| Dinleme kontrolü | 5 soru, sonuncusu çok cevaplı (önce 3). Test motoruna **kontrolün kendi saati** verilir (en çok 120 sn geri): podcast'in saatiyle 150 sn'yi geçen podcast'te düzeltme turu kalmıyor, 5 sorudan 2'si geliyordu | `podcast-check.ts`, `teacher-podcast-run.ts` `CHECK_LOOP_HEADROOM_MS` |
| Kök cevabı ele veriyor | Tek rakam da sayılır ("6 aylıkken … hangi yaş?" → "6 ay") | `teacher-quiz.ts` `answerOnlyWordInStem` |

**Podcast: ders kitabı nedeni (ürün sahibinin kararı, 23 Ekim 2026: "Astra seviyesine taşımak için ne gerekiyorsa").**
Sayı, eşik, yaş, tanı, tedavi ve sınıflandırma yine yalnız kaynaktan. Kaynak nedeni vermiyorsa ders kitabının nedeni üç
açılıştan biriyle (en çok 5 cümle); açılış ekranda kalır, seste okunmaz. **Aynı gece etiket tümden kalktı (aşağıda).**
Kaynaktaki kuralın tipik vakası etiketsiz örnek olabilir; denetçi F ikisinin de doğruluğuna bakar. Kapsam kalır,
derinlik seçilir (`FOCUS_RULE`). 21. ölçüm (Cortex / Astra): öğrenme 57 / 58, sınav 73 / 65, öğrenci 58 / 73,
sadakat 84 / 63 (6. ölçümde 44 / 62 / 48 / 78).

| Yeniden denemeyin | Ölçülen sonuç |
|---|---|
| "3-5 nokta seç, gerisini sayma" | Gelişim tablosu ve alarm bulguları atıldı; sınav gözü 62 → 45-49 |
| Daha büyük yazar (gpt-6-sol) ya da "orta" düşünme | Öğrenci gözü değişmedi (50-57); sol podcast başına ~$0,07-0,12, kredisi $0,012 |
| Yazımdan önce ayrı "öğretmen notu" çağrısı | Puan aynı; podcast 20-30 sn uzadı, dinleme kontrolü 170 sn sınırına takılıp çıkmadı |
| Başka konudan biçim örneği, "basamakları tek tek sordur" | Podcast kısaldı; öğrenci ve öğrenme gözü düştü |

**23 Ekim 2026 gecesi, ürün sahibinin kararı: podcast'te ders kitabı bilgisi etiketsiz.** Neden, mekanizma, tipik
vaka, benzetme ve terim açıklaması etiket koymadan; sayı, eşik, yaş sınırı, doz, tanı ölçütü ve sınıflandırma yine
yalnız kaynaktan, kaynakla çelişen ya da aciliyeti yükselten cümle yok (`RULE_DOCUMENT`, denetçi A/B/F). Yalnız
podcast; ders, test, sohbet değişmedi. Eski etiketler kayıtlı podcast'lerde duruyor, `podcast-textbook.ts` onları
tanır (kontrol sormaz, ses okumaz). 22. ölçüm: öğrenme 54 / 55, sınav 70 / 63, öğrenci 60 / 74, sadakat 85 / 60.
Ana sayfa ve güven kartı buna göre ("notuna dayanır", "podcast ders kitabı bilgisiyle açar"). Dinleme kontrolü 210.
sn'ye kadar başlar, düzeltme turları 255. sn'de biter (`checkLoopClock`; önce 170. sn'den sonra hiç başlamıyordu).

**Senarist yazar (23 Ekim 2026 gecesi; ürün sahibi: "öğrenci en az 70 olacak, ne varsa yap").** İki sesli türler
(diyalog, soru-cevap) kısa bir senarist istemiyle **düz senaryo** yazar (`## Bölüm`, `Ada: …`, `Kerem: …`); kod bölümlere
ayırır (`podcast-script-writer.ts`, `scriptToDraft`). Neden: 8.000 karakterlik kural listesi ve satır satır JSON şeması
yazarı "tablo okuyan" bir forma itiyordu (22 turda öğrenci gözü 60'ı geçmedi). Senarist luna ile, orta düşünmeyle.
**Yalnız luna (ürün sahibinin kararı, 23 Ekim 2026):** gpt-6-sol denendi (28-29. tur öğrenci 64,6 / 69, podcast başına
~$0,07, kredi $0,012) ve bırakıldı; başka model kullanılmaz. Luna ile 25. tur öğrenci 65 / 72. Düzeltme turu 150. sn'den
sonra açılmaz. **70 hedefi tutmadı.**

| Yeniden denemeyin | Ölçülen sonuç |
|---|---|
| Taslaktan sonra "kulak düzeltmesi" (uzun sıraları bölen ikinci çağrı) | Öğrenci 49, sadakat 72: "Peki 9 ayda?" dolguları konuşmayı kopardı |
| "Her satırdan yalnız ayırt edici bilgi" | Model uymadı; öğrenci 63 |
| Senarist luna "düşük" | Öğrenci 62-63,5; "orta" 65 |

Kalan açık (öğrenci gözü): Astra basamakların bir kısmını atlayıp kaynakta olmayan iddialarla rahat bir sohbet
kuruyor; bizimki bütün satırları doğru taşıyor. Ayrıntı: `PODCAST-OLCUM-23-EKIM.md`. Ölçüm betiği notu: yargıca giden
döküm oynatıcının yaptığını gösterir (aynı konuşmacının cümleleri tek sıra, "Dur ve düşün" rozet + 4 sn ara,
ders kitabı açılışı okunmaz).

Bekçi: `teaching-quality-round2.test.ts`, `learning-signals.test.ts` (göçü PGlite'ta), `podcast-check.test.ts`,
`teacher-podcast.test.ts`, `teacher-quiz.test.ts` ("tek rakamlı cevap"), `podcast-textbook.test.ts`, `marketing-claims.test.ts`, `podcast-script-writer.test.ts`.

## Soru çözücü (23 Ekim 2026) — fotoğraf ya da yazılı soru, her ders, ≤15 sn

Ürün sahibi: "Astra'da en çok kullanılan özellik … yüzde 100 doğruluk … maksimum 15 sn … en basit dille … kendi
belgesinde olmayan soru da olabilir … kendi tasarım dilimizi kullan". Astra'da 10 dersten 10 soru çözüldü (10/10;
sözel 3–10 sn, işlemli 17–27 sn). Ayrıntı ve ölçümler: `cortex-plus/docs/delivery/SORU-COZUCU-23-EKIM.md`.

| Kural | Nerede |
|---|---|
| İki **bağımsız** luna çağrısı aynı anda (tam çözüm + yalnız cevap); kod cevabı şıklarla eşler ve her adımın eşitlik zincirini yeniden hesaplar (`eval` yok; sayıya bitişik tek harf değişkendir: "2x" birim sayılmaz); uyuşmazsa uzlaştırma, emin değilse "Emin değiliz" | `src/lib/solve/question-solver.ts`, `step-arithmetic.ts`, `solve-run.ts` |
| İlk çözüm ekranda, gpt-4.1 denetimi arkada; "doğrulandı" yalnız denetçi **açıkça** onaylayınca (`verified.confirmed`); itiraz + farklı cevap → çözüm değişir ve söylenir | `solve-run.ts`, `solve-client.ts` |
| Ücretsizde fotoğraf günde **1** (24 Ekim 2026'dan beri SQL sayacı; önce Redis'te günde 3), yazılı soru günde 3 mesajdan; Plus `IMAGE_SOLUTION` (4); okunmayan fotoğraf iade, hak geri döner | `solve-run.ts`, `credit_reserve_metered` |
| Sohbetteki fotoğraf da bu motora gider, aynı kart sohbette çizilir; çözüm sohbete metin olarak **ilk çözümle** kaydedilir (denetimi beklemez, düzeltilirse metin de düzelir). Görsel **yalnız eklendiği mesajla** gider: eskiden `activeDocumentId`'de kalıp sonraki her mesajı fotoğraf fiyatından ücretliyordu | `chat-panel.tsx` `solvePhoto`, `api/ai/solve/route.ts`, `solve-chat-save.ts` |
| Hazırlık sayfası üst çubuğunda kamera → `/soru-coz?hazirlik=…`; şıklı soru "Tekrar listeme ekle" ile o hazırlığın günü gelen tekrarına girer ("Çözdüğün soru"). Soru ve cevap **imzalı belirteçten** (HMAC, 6 saat), tarayıcıdan değil | `solve-review.ts`, `/api/learning/exam-prep/review/solved` |
| Eski `/api/ai/solve-image` ve `image-solver.tsx` silindi; "yüzde 100" ya da "her zaman doğru" yazılmaz | — |

Ölçüm (tam motor, 10 ders): Plus ilk çözüm 2,9–5,1 sn, onay ≤7,2 sn; ücretsiz ilk çözüm 5,6–9,5 sn, onay ≤10,7 sn;
iki turda 10/10 doğru ve hepsi denetçi onaylı; soru başına ~0,003 $. Bekçi: `question-solver.test.ts`.

## Sohbette tek model çağrısı (24 Ekim 2026) — denetim yalnız belgeye dayanan cevapta

Ürün sahibinin kararı, maliyet ölçümünden sonra (`cortex-plus/docs/delivery/MALIYET-VERGI-24-EKIM.md`): normal bir
öğrencinin model giderinin %56'sı sohbet mesajıydı ve her mesaj en az iki çağrı yapıyordu (cevap + denetim).
"Bütün içerik model denetiminden geçer" kuralının **tek istisnası** sohbetteki genel bilgi cevabıdır.

| Cevap | Denetim |
|---|---|
| Genel sohbet; belge modunda kanıt bulunamadı; "belgede yok" diye etiketlenmiş dış cevap; hazırlık sohbetinde soru belgede yok (`decision` "out"/"unknown") ya da mod "Genel sohbet" | Yok, tek çağrı |
| Belgeye dayanan cevap (kanıt var / `decision` "in"), "Yalnızca belgem" modu, görsel ekli soru, sesli ders | Bugünkü gibi (denetim + belge denetimi) |

Ders, test, podcast, kartlar ve öteki içerik motorları değişmedi. Ana sayfa "Dersler notuna karşı denetlenir" der,
"her içerik" demez. Bekçi: `chat-single-call.test.ts` (`chatAnswerNeedsReview`, `runTeacherTutor({ verify })`).

Sohbet denetimi de 24 Ekim 2026'dan beri **luna** (ürün sahibinin kararı: "Denetimi luna'ya al, mesaj 3 kredi
kalsın"): `verifyEducationalContent` ve `verifyDocumentAnswer` `model` alır; görselli soruda gören model (gpt-4.1)
kalır. Belge ekli eski sohbet mesajı gpt-4.1 denetimiyle ~$0,026 tutuyordu.

## Kredi v3 ve sayaçlı ücretsiz katman (24 Ekim 2026) — haftada 3 ders, günde 3 mesaj, 1 fotoğraf

Ürün sahibinin kararları, maliyet ve vergi hesabından sonra (`cortex-plus/docs/delivery/MALIYET-VERGI-24-EKIM.md`;
gerekçe ve tablo `docs/delivery/KREDI-SISTEMI.md` başı). v2'de ders, test ve mesaj ölçülen maliyetin 2-5 katı
altındaydı; Plus'ın tamamını kullanan öğrenci ve ücretsiz katman zarar ettiriyordu. Yukarıdaki v2 bölümünün
fiyatları, "Ücretsiz katman (3 Ekim)" bölümünün günlük hakkı ve "Plus'ın bir ayı" sayıları bununla değişti.

| Kural | Nerede |
|---|---|
| Fiyat v3 (1 kredi ≈ $0,001 gerçek maliyet): ders **30**, test **10**, kart **4**, sayfa **5**, fotoğraf **4**, sözlü **6**; mesaj **3 kalır**; Plus ayda 7.200 / haftada 2.700 aynı → ayda 240 ders ya da 2.400 mesaj | göç `20261024120000`, `price-table.ts` |
| Ücretsiz hesabın günlük kredisi **0** (yeni cüzdanın varsayılanı da 0); ders haftada 3 (Pazartesi 00:00 İstanbul, `2026-W43`), mesaj günde 3, fotoğraf günde 1 — sayaç `free_usage`, tek giriş `credit_reserve_metered` | sayaçlar göç `20261024121000`, günlük 0 göç `20261024123000`, `free-meters.ts` |
| **Derse dahil olanlar sayılmaz, Araçlar dersten düşer:** ders içi yardım (koç, açıklama, geri bildirim, tanışma, tanı) ve yolda dersi açılmış konunun test/kartları `included` (günde 40, görünmez); Araçlar'daki test/kart/doğru-yanlış ve dersi açılmamış konunun testi ders hakkından; "Farklı anlat" yeni ders | `node-free-meter.ts` `nodeMeterFor`, çağıranlarda `freeMeter` |
| Plus'ta (ücretsizde açılmaz): podcast, sözlü, yazılı deneme, video, sesli tur, **ses** — açık liste, fiyattan türetilmez (fiyat değişince kapı ters dönüyordu) | `PLUS_ONLY_ACTIONS` = SQL `plus_only_action`, `PLUS_ONLY_NODE_KINDS` |
| Ret kodları 402: `free_lesson_limit`, `free_chat_limit`, `free_photo_limit`, `free_included_limit`, `premium_required`; kapı sayacın saatini gösterir, Plus işinde "doldu" ve geri sayım yok | `refusalCode`, `credit-gate.tsx`, `guards.ts` |
| Sayaç dolunca hediye bakiyesi yetiyorsa iş onunla; iade aynı dönemde sayacı geri verir | `credit_reserve_metered`, `credit_refund` |
| Davet: doğrulanmış davetli ilk işinde (ücretsiz, Plus ya da denemede) **iki tarafa bir kez 90 kredi** (3 ders), davet eden en çok 3 davetten; iki cüzdan ilk hediyeden önce kimlik sırasıyla birlikte kilitlenir (sınır aşılmaz, karşılıklı davet birbirini kilitlemez); çarpan kalktı | `grant_referral_gift`, `referral.ts` |
| Yıllık planlar satıştan kalktı (`active = false`); elinde olan dönem sonuna kadar Plus, planını okur (`plans_held_by_user`). `20260906130000_subscription_billing.sql` yeniden uygulanmaz | göç `20261024122000`, `plan-prices.ts` |
| **Yayın sırası** (hiçbir ara durum ücretsizi düşürmez): (a) `20261024121000` **koddan önce** (yalnız ekleme; eski kod v2 gibi çalışır, `free_usage` silme için hazır), **push'tan önce** `select to_regprocedure('public.credit_reserve_metered(uuid,text,text,integer,text)') is not null` `true` dönmeli (ya da `node cortex-plus/scripts/acilis-kapisi.mjs --db`); (b) kod yayına; (c) **tek SQL çalıştırmasında** `20261024120000` + `20261024123000` ve iki kayıt satırı; (d) `20261024122000` kod yayındayken herhangi bir an; (e) `/admin/sistem` yeşil (ders 30, `free_usage` ve `unverified_allowance()` 0 birlikte), sonra "Ücretsiz gibi gör". (c) ayrı ayrı çalıştırılmaz: yalnız fiyat göçüyle ders (30) v2 günlük hakkına (6) sığmaz. Kayıt satırları her yerde `on conflict (version) do nothing` ile (geri almadan sonra v3'e dönerken satırlar zaten var; düz insert duplicate key ile düşer, iki göç de uygulanmaz). PGRST202 düşüşü (`credit/service.ts`) yalnız emniyet: (a) atlanırsa ücretsiz fotoğraf v2 günlük hakkına sığmaz, tek iz `console.warn` | `KREDI-SISTEMI.md` "Canlıya geçiş" (kayıt satırları SQL olarak orada) |
| **Kodu geri almak (c)'den sonra önce SQL ister:** `supabase/rollback/20261024_kredi_v3_geri_al.sql` (göç değil; v2 fiyatları, v2 `credit_reserve`, günlük 6, eski varsayılanlar; hiçbir şey silmez, sonuç (a)+(b) durumu), sonra Instant Rollback. Dosyasız geri alma ücretsiz katmanı kapatır: eski kod `credit_reserve`'ü doğrudan çağırır. **Kabul edilen boşluk:** (c) ile geri alma arasında yenilenen abone dönemi davet çarpansız kalır (davetli Plus 21.600 yerine 7.200), çarpan sonraki yenilemede döner; tamamlama bilerek yok — 24 Ekim 2026'da etkin ücretli abonelik ve artı bakiyeli cüzdan yoktu | `docs/ops/yayin-geri-alma.md` C |
| "Ücretsiz gibi gör" ücretsiz sayaçlarla çalışır (açılınca sıfırlanır), önizlemeye abonelikten önce bakılır (aboneliği olan kurucu da sayaca girer), sayaç dolunca kurucunun cüzdanına düşmez; (c)'den önce açılmaz | `free-preview-actions.ts`, `credit_reserve_metered` |

Eski `image-quota.ts` (Redis'te günde 3 fotoğraf) silindi; fotoğraf sayacı SQL'de. Öğrenci kredi sayısı görmez,
sayaç "Bu haftaki ders 2/3" diye `/krediler`'de görünür. Bekçi: `free-tier-counts.test.ts` (göçleri yayın sırasıyla ve
geri alma dosyasını PGlite'ta çalıştırır), `free-meters.test.ts`, `free-reach.test.tsx`, `plus-month.test.tsx`, `marketing-claims.test.ts`,
`schema-probe.test.ts` ("Kredi v3 ve ücretsiz sayaçlar" kritik).

## Lansman testi (24 Ekim 2026) — ücretsiz yol, tek test yazımı, ders denetçisi

Ürün sahibi: "yarın lansman; fotoğraf, 4-5 belgeden yol, her özellik tek tek tam çalışıyor mu". Canlıda ücretsiz
önizleme ve Plus ile (5 $ bütçe) gezildi; bulgular ve düzeltmeler PR #398. Yeniden açmayın:

| Bulgu | Kural | Nerede |
|---|---|---|
| **Ücretsiz öğrencinin yolu 2. adımda kilitleniyordu**: şablon ilk dersin arkasına podcast ve sözlü koyuyor, ikisi Plus'ta; "önünde bitmemiş adım" kuralı gerisini açmıyordu (beta denemesi bitince de aynı) | Ücretsiz hesapta (`credit_reserve_metered` ile aynı karar: önizlemedeki kurucu ücretsiz) Plus adımı bitmemiş sayılmaz, açılırsa arkasındaki adım da açılır, `nextId` onu atlar. "Sıradaki", "Devam et" ve önceden yazım penceresi Plus adımını saymaz (`pathSkipKinds`). Düzeltmeden önce takılan yol hazırlık sayfasında bir kez açılır (`freePathUnblockIds`) | göç `20261024130000` (canlıda), `node-free-meter.ts`, `learning-tracking.ts` |
| Konu testi üç kez yazılıyordu (dersten önce, ders kaydından sonra, soğuk istek): 150-230 sn | İstek aynı seçimle süren önceden yazımı 100 sn'ye kadar bekler; öğrenci beklerken yalnız pedagojik tur açılmaz (`urgent`); konunun dersi yazılırken test önceden yazılmaz | `waitForPrefetchReady`, `teacherQuizLoop`, `topicLessonInFlight` |
| Ders 257 sn sürdü, ana üç kavram atıldı: ilk kavramın adı konunun kendisiydi, denetçi bütün "Sınavda sorulur" maddelerini tek ekranlık ilk kavramda eksik saydı | Eksik madde `medium`, yanlış aktarılan madde `high`; doğru/yanlışın ikinci sorusunun cevabı ana sorudan farklı olabilir; `….check.check.review` de ikinci soru sorunu | `exam-points.ts`, `teacher-lesson.ts` |
| Çok sorulu fotoğraf ~90 sn sonra "tamamlanamadı" | Tek soru çözülür (nottaki numara, yoksa ilk soru); öbürleri adıyla söylenir | `ONE_QUESTION_RULE`, `otherQuestionsLine` |
| Hazırlık adı ilk üç sistemden ("Sinir, Endokrin ve Duyu Sistemleri"): istem 32 konunun ilk 15'ini taşıyordu | Ünite adları + listeye yayılan 15 konu | `spreadTopics`, `prepTitleUserPrompt` |
| Ünitesiz ilk konu kurulum listesinde "Diğer" altında en sonda | Liste yolun sırasıyla (`listSegments`) | `exam-wizard-copy.ts` |
| Fotoğraflar notun konularını "…Eşleştirme Kartı", "…Şeması" diye ikinci kez açtı | Başlık içeriği adlandırır; tekrar eden dosya ayrı konu açmaz (yardımcı kaynak olarak bağlanır) | `outline-oneshot.ts` |

Bekçi: `free-path-plus-skip.test.ts`, `complete-node-in-order.test.ts` (PGlite: ücretsiz, Plus, kurucu, önizleme),
`launch-latency.test.ts`, `lesson-exam-point-severity.test.ts`, `lesson-prefetch.test.ts`, `prep-title.test.ts`.

**İkinci tur (aynı gün, #398 yayındayken; PR #399):**

| Bulgu | Kural | Nerede |
|---|---|---|
| **Video ders canlıda hiç çalışmıyordu**: `400 The model 'gpt-image-1' does not exist` (canlı anahtarın projesi bu modeli görmüyor, yerel anahtar görüyor) | Resim adımı yalnız "model yok" hatasında sıradakini dener (ayarlı model → `gpt-image-1.5` → `gpt-image-1-mini` → `gpt-image-2`), çalışanı hatırlar, kullanımı gerçek modelle yazar. Yedek modellerin fiyat satırı yok: `/admin/maliyetler` onları saymaz | `video-run.ts` `imageModelLadder` |
| Ders açılışı süren ısınmayı 20 sn bekleyip **aynı dersi ikinci kez** yazıyordu (ilk ekran 52 sn) | 55 sn'den yeni başlamış yazımın ilk kavramı beklenir (tavan 45 sn) | `peekBuildingPrefetch` |
| Konunun sınav maddeleri başka belgenin analizinden geldi; ders PDF'in 1. sayfasından yazılırken denetçi "kaynakta yok" diye tur açtı | Belgeli derse yalnız kendi sayfalarında geçen maddeler | `examPointsInSource` |
| Kodun ikinci soru kuralı başka sorunla birlikte her turda geri geliyordu | Yapı kuralına takılan ikinci soru hemen çıkar, yedek doğru anahtarla kurulur | `teacher-lesson-run.ts` |
| Ücretsiz yolda dersin arkasındaki Soru-Cevap önceden yazılmıyordu (48 sn); 5 sorunun 5'i aynı kalıp | Soru-cevap da önceden yazılır (kredisiz); istem kalıbı en çok iki soruda | `PREFETCH_KINDS`, `QA_TEACHER_PROMPT` |
| Araçlar: 10 soru istendi 9 geldi; yazılı denemede 5 soruda açık uçlu/çok cevaplı yok, sonuçta soru incelemesi yok; "Anlatarak öğren" belgeden çalışmıyordu | Yedek soru sayıyla orantılı; tür yerleri seçilen sayıya göre; "Cevaplarını incele"; anlatım belgeye göre değerlendirilir | `quizSpareCount`, `mock-exam/create.ts`, `written-studio.tsx`, `explain/route.ts` |
| Çok sorulu fotoğrafta iki çözücü farklı soruyu seçti; kart "aynı sonucu verdi" derken altında "ikinci çözümdeki C yanlış" yazıyordu | Notta numara yoksa her zaman 1. soru; uzlaştırılan çözüm "karşılaştırıldı" der; uzlaştırıcı iç süreci yazmaz | `ONE_QUESTION_RULE`, `agreed` |

Canlıda doğrulanan (#398 sonrası): ücretsiz yolda dersten sonra sıradaki Soru-Cevap (podcast atlandı), %20 sonuçta odaklı pratik
eklendi, konu testi önceden yazılmış olarak 2 sn'de açıldı (önce 150-230 sn), aynı derste atılan kavram 3 → 0. Açık kalan:
konuya yalnız kapak/özet sayfası bağlanınca (Homeostazi, PDF s.1) konu testi 5 yerine 3 soru çıkıyor.

**Üçüncü tur (aynı gün akşam; PR #400):**

| Bulgu | Kural | Nerede |
|---|---|---|
| Kursta ünite her dosyaya ayrı yazılıyor; konuları başka dosyada olan ünitenin kopyası çocuksuz ve sayfasız. Okuma onu **sayfasız bir konu** saydı: listenin başına ("Diğer") düştü, dersi PDF'in 1. sayfasından kaynaksız yazıldı, konu testi 3 soru kaldı | Kurs okumasında sayfası olmayan üst düğüm konu değildir | `intake-outline.ts` `loadOneshotIntakeTopics` |
| Canlı anahtar `gpt-image-1` görmüyor | Varsayılan `gpt-image-1.5` (merdiven duruyor); fiyat satırı 13/1.000 resim (göç `20261024140000`, canlıda) | `env.ts`, `ai_model_prices` |
| Isınmayı uzun beklemek Plus açılışını yavaşlattı (35 sn bekleyip yine soğuk yazdı; hızlı soğuk yazım ilk kavramı 14 sn'de yayımlıyor) | Uzun bekleme yalnız hızlı işlemi olmayan öğrenciye; hızlı işlemli açılış 8 sn bakar, sonra soğuk | `peekBuildingPrefetch` `extendForBuild`, `fastAllowedFor` |
| Ödeme tablosunda "günde 1 fotoğraf" ile "Fotoğraf / taranmış sayfa (ayda): 2" çelişir gibi okunuyordu | Satır belgeye yüklenen resim sayfalarını anlatır | `tier-presentation.ts` |

Ölçülen (canlı): normal hızda ilk kavramın denetimi ~44 sn, hızlı işlemde ~4 sn. Ücretsiz öğrenci sıra dışı bir konu seçip
hazır ders yokken açarsa ilk ekran ~50 sn; yolda sıradaki ders önceden yazılmış olduğu için normalde 2-3 sn. Ücretsizde
ilk kavrama hızlı işlem verilmez (ürün sahibinin kararı, 24 Ekim 2026: "böyle kalsın"; 19 Ekim kararı aynen). Ücretsiz hesapta
"Hazırsın" yazılı deneme (Plus) şartı yüzünden çıkmaz, en çok %99 — bu da bilerek böyle kalır (aynı gün, ürün sahibinin kararı).

## Ders-bağımsız beş P0 (25 Ekim 2026)

Ürün sahibi: "çözümler ders-bağımsız olmalı; tek derse özel sabit kelime yok". Beşi de yalnız ölçüyle karar verir.

| Konu | Kural | Nerede |
|---|---|---|
| Geniş ünite tek konuya sıkışıyor | Dosyanın %15'inden fazlasını (≥8 sayfa) tutan, aralığında ≥2 yabancı bölüm başlığı ya da ≥4 alt bölüm olan ya da kardeşlerinin ortancasının 2 katından geniş konu kabul edilmez; **kod bölmez**, modelden 2-4 konuya ayıran onarım ister | `outline-oversize.ts`, `outline-oneshot.ts` |
| Ders alt başlıkları atlıyor, test anlatılmayanı soruyor | Omurga = konunun kendi sayfalarındaki başlık satırları; yazara "her biri en az bir ekranda", kapanışta kapsanmayan başlık öğretim turu; ders içi soru tekrarı yok | `lesson-backbone.ts`, `teacher-lesson*.ts`, `lesson-quiz-context.ts` |
| `/ilerleme` canlıda çöküyordu | Sebep: sunucu sayfası `"use client"` dosyasından fonksiyon çağırıyordu (yayında digest'li hata). Kopya metin `streak-freeze-copy.ts`'te; sayfanın 10 veri kaynağı `settle()` ile ayrı ayrı düşer; grafikler NaN çizmez. `/fiyatlar` → `/fiyatlandirma`. **Sunucu sayfasında istemci modülünden fonksiyon çağırmayın** — bekçi tarar | `ilerleme/page.tsx`, `chart-safe.ts`, `ilerleme-resilience.test.ts` |
| "Hazırsın" deneme hedefi geçtiği hâlde çıkmıyordu | Tek kural `readyForTarget`: deneme ≥ hedef **ya da** (bütün konular ölçülmüşse) genel skor ≥ hedef. Konu ≥ hedef "✅ Sağlam", altı "Çalışılacak"; Hazırsın ekranı görülünce düğüm tamamlanır | `learning-tracking.ts`, `readiness-screen.ts`, `exam-node-session.tsx` |
| Sözlüde ilk cevaptaki yanlış, takipte düzeltilince tam puan alıyordu; ekran ve yol farklı yüzde | İlk cevap `ilk:<i>` anahtarında ayrıca saklanır ve hakem **ilk cevabı** notlar (takipte düzeltme noktayı geri kazandırmaz). ~~Kodun %50 tavanı ve "İlk yanıtta «X» yanlış" satırı~~ **29 Ekim 2026'da kaldırıldı** — canlıda 8 doğru cevaba 6,5/8 verdi; bkz. "Paket H". Kayıt `oralAttemptScore` (= raporun yüzdesi, x/100); yol kararı soru sayısıyla | `oral-first-answer.ts`, `oral-exam.ts`, `oral-review.ts`, node rotası |

Bekçi: `outline-oversize.test.ts`, `lesson-coverage.test.ts`, `ilerleme-resilience.test.ts`, `ready-for-target.test.tsx`,
`oral-first-answer.test.tsx`.

## Paket A (28 Ekim 2026) — sınav, podcast ve doğruluk kusurları

Canlıda beş kusur: lise/YKS/Tıp öğrencisine 4 şık; deneme kurulumu 3+3+3+3+2+2+2+2 deyip K1'e 5, K2'ye 1 soru
verdi; çok cevaplı soruda yalnız ilk doğru etiketli; Diyalog podcast'i düzeltmede 0:50'ye çöktü, ses 7 dk'da zaman
aşımına düştü; notun "8-12 mm"si genel bilgiyle "düzeltildi", OCR köşe notunu attı. Yeniden açmayın:

| Kural | Nerede |
|---|---|
| **Şık sayısı sınavın biçimi**: 5-8. sınıf ve LGS 4 (A-D); lise, YKS, KPSS, ALES, TUS, üniversite ve bilgi yoksa 5 (A-E). Hazırlığın adı bir sınav söylüyorsa o geçerli. Yazar "tam N şık", kod tam N ister; motor kabuğu öğrencinin sayısını okur (`studentOptionCount`), dinleme kontrolü de | `student-pedagogy.ts` `resolveOptionCount`, `teacher-quiz.ts` `optionCountIssue`, `teacher-podcast-run.ts` |
| **Denemenin sözü = teslim**: dağılım yalnız sınav ağırlığından (yoksa eşit); konu metninin uzunluğu girmez. ~~Konu sayısı seçilen sayıyı aşarsa her konu 1 soru, toplam büyür~~ **30 Ekim 2026 (Paket I #4): toplam her zaman seçilen sayı**, konu fazlaysa ağırlıklı konular önce, kalanlar yayılarak seçilir ve kurulum bunu söyler. Üretim konu başına sabit: başka konunun sorusu boşluğu doldurmaz (`sameTopic` önce `topicId`), eksik konuya kendi gevşek isteği | `mock-exam/allocate.ts` `promisedAllocation`, `deliverable.ts`, `mock-exam/create.ts` (`EXAM_BUILD_VERSION = 3`) |
| **Çok cevaplı inceleme**: bütün doğrular `correct_answers`'tan, her biri "Doğru Yanıt"; öğrencinin işaretlediği doğru kırmızı olmaz | `exam-question-review-client.tsx` `correctOptionSet` |
| **Eşdeğer şık yasağı** (resesif = çekinik; tersi fonksiyon = birebir ve örten): yazar ve denetçi aynı metni okur, kod çifti yakalar | `EQUIVALENT_OPTIONS_RULE`, `option-equivalence.ts` |
| **Podcast uzunluğu konuya göre** (ürün sahibi: "illa şu kadar olacak diye bir şey yok; konu çok detaysa 10 dk bile olur"): her türde taban (~4 dk, özet 1 dk) ve tavan (~10 dk), sabit bant yok. "Metin kısa" düzeltme turu açmaz; tabanın altına inip metnin %15'inden fazlasını atan düzeltme reddedilir; kısa metni **tamamlama turu** kapatır (yalnız ek bölüm, son tekrar bölümünden önce, aynı denetçi) | `podcast-formats.ts`, `teacher-podcast-run.ts` (`FIX_SHRINK_LIMIT`, `completePodcast`) |
| **Roller karışmaz**: Kerem payı yalnız **bütün konuşma sırası** taşınarak dengelenir (bağlaçla başlayan, soru/cevap, adıyla seslenen sıra taşınmaz); ayraçsız övgü kuyruğu silinmez (yarım cümle kalmasın) | `podcast-episode.ts` `balanceKerem`, `podcast-formats.ts` `spokenSentence` |
| **Ses bölüm bölüm**: oynatıcı her bölümü ayrı ister (önce ilki, sonra 2'şer), yarım akış bölüm başına yeniden denenir; gelmeyen bölüm atlanır ve "Sesi yeniden dene" kalır. TTS satırı 30 sn zaman aşımı, SDK yeniden denemesi kapalı, eşzamanlılık 10 | `exam-podcast-player.tsx`, `speech.ts`, `PODCAST_TTS_CONCURRENCY` |
| **Kaynak sayı önceliği**: `SOURCE_NUMBER_PRIORITY` ders, test, deneme, doğru/yanlış ve sözlüde yazar ve denetçide **aynı metin**; OCR ve sayfa temizliği kısa başlık, yer adı ve köşe notunu ("Amfi 2", "Taksi: 40 TL + 25 TL/km") atmaz | `teaching-rubric.ts`, `teacher-lesson.ts`, `teacher-quiz.ts`, `teacher-practice.ts`, `extract-image-text.ts`, `clean-pages.ts` |

Bekçi: `paket-a-exam-podcast.test.ts`, `p2-mock-exam.test.ts`, `deneme-publish-cap.test.ts`, `p1-podcast.test.ts`,
`teacher-podcast.test.ts`, `podcast-audio-once.test.tsx`.

## Paket B (28 Ekim 2026) — hız, sayaç, doğru/yanlış, takvim, telefona kurulum

Ölçülerek karar verildi. Yeniden açmayın:

| Kural | Nerede |
|---|---|
| **Taranmış sayfa: OCR zaten paralel** (havuz 12'den başlar, 24'e çıkar, 429'da yarıya iner). Darboğaz tek çekirdekte sayfa çizimi: 20 sayfalık taramada sırayla 12,4 sn, 4 ya da 8 eşzamanlı çizimle 12,2 sn (yerel ölçüm; Hobby işlevi 1 vCPU). "Sayfaları 8'li gruplarla çiz" kazandırmaz, yazmayın. Kazanç OCR görüntüsünde: **JPEG** (q 88) — kodlama sayfa başına 89 ms → 16 ms, dosya 620 KB → 170 KB. PNG yalnız boş sayfa sınaması gerekince çizilir | `render-pdf-pages.ts` `OCR_JPEG_QUALITY`, `pdf-ingestion.ts`, `rag/pipeline.ts` |
| **100+ sayfa: konu haritası sayfa dizini okur**, ham metni değil: her sayfa için yoğunluk (karakter), başlıklar, ilk ve son cümle (`SAYFA DİZİNİ` başlığıyla). Temellendirme yine sayfaların **tam metnine** bakar; onarım turu alıntılanan sayfaların tam metni 280 bin karakteri geçince dizini okur. Kayıtta `indexed` | `outline-page-index.ts`, `outline-oneshot.ts` `prepareOutlineMaterial`, `pdf-learning-v2.ts` |
| **Ders sayacı sıçramaz** — **29 Ekim 2026'da yeniden** (canlıda 1/6→2/7 ve 3/7→4/9 zıpladı: plan "sık yapılan hata" adımını saymıyor, yazar planı aşıyor): yazım sürerken payda **hiç gösterilmez** ("Adım N", çubuk belirsiz, "~N dk" yok); ders mühürlenince payda yazılan adımdır ve oturum boyunca **kilitlenir** (sonradan onarım/tazeleme ekran ekleyse de "/ N" sabit). `plannedScreens` yalnız kayıt amaçlı taşınır, sayaç okumaz | `lessonStepCounter` (`activity-duration.ts`), `exam-lesson-steps.tsx` `lockedTotal` |
| **Deneme süresi gerçek**: canlıda başlangıç doğruydu (son 15 deneme 70–140 sn), kusur dakikaya yuvarlamaydı (82 sn "1 dk") ve süre hiç kaydedilmiyordu. Notlandırma `duration_seconds = gönderim − practice_exams.started_at` yazar (sunucu saati; başlangıç yoksa istemcinin ölçümü, 12 saat tavan). Ekran "6 dk 24 sn"; sonuç ve inceleme sayfası önce kayıtlı saniyeyi okur. Geçersiz istemci ölçümü notlandırmayı durdurmaz | `time-limit.ts`, `grade-exam.ts`, `exam/grade/route.ts`, `exam-runner.tsx`, `sonuc`, `incele` |
| **Doğru/yanlışta çift yok**: aynı alt bilgiyi ya da yanılgıyı yoklayan ikinci önerme (olumsuzlukla ters çevrilmiş aynı cümle, yanlışın doğru hâli olan doğru önerme, en az üç sözcüklü aynı yanılgı etiketi) kabul edilmez; motor eksik kadar yenisini ister, ek turlar da aynı denetimle birleşir. Kod önermeyi yeniden yazmaz | `true-false-quality.ts` `sameTrueFalseFact`, `teacherTrueFalseLoop`, node rotası, `true-false/generate` |
| Yanlış önermenin açıklaması **"✏️ Doğrusu: …"** ile başlar (yazarın `correctedStatement`'ı; biçim, yeni bilgi değil); eski kayıtlar ekranda aynı biçimle gösterilir | `trueFalseExplanation` |
| Hazırlık yolunda doğru/yanlış **odak kartı**: geniş önerme, tek dokunuşla cevap; klavyede ← / D Doğru, → / Y Yanlış, cevaptan sonra Enter sonraki. Araçlar'daki stüdyo aynı tuşlarla | `true-false-focus-card.tsx`, `true-false-focus.css` |
| **Resmî tatil esnek gündür**: o günün bütçesi yarıya iner (yük komşu günlere kayar), son gün (deneme) tam kalır; oturum `holiday` taşır, yolda ve Takvimim'de "🇹🇷 Resmî Tatil (Esnek Gün)". Sabit tatiller her yıl; dinî bayramlar Diyanet takviminden **2027 sonuna kadar** (sonraki yıl açıklanınca tabloya eklenir) | `tr-calendar.ts`, `studyDayBudgets`, `exam-prep-home.tsx`, `calendar-view.tsx` |
| **Ara sınavdan bir gün önce "Ara Deneme / Kontrol"**: vize, ara sınav, quiz, kısa sınav tarihi belgenin aynı satırında ya da öğrencinin Takvimim etkinliğinde (başlıkta) geçerse. Adım bir odaklı pratik (`session_meta.checkpoint`), o güne kadar dersi işlenen son konunun ardında; Sınav Finali'ne taşınmaz, şablonun finaldeki odaklı pratiğinin yerini tutmaz. Kontrol noktaları takvim kaydında durur, yeniden planlama korur (bitirileni yeniden koymaz) | `tr-calendar.ts` `detectCheckpointDates`, `schedule-checkpoints.ts`, `exam-schedule-v2.ts`, `final-block.ts`, `exam-prep-plan.ts` |
| **Telefona kurulum**: manifest (`standalone`, 192/512 + maskeli), `apple-icon`, `appleWebApp` + `apple-mobile-web-app-capable`. `/mobil-uygulama` Android/Chrome'da "Uygulamayı kur" (`beforeinstallprompt`), iOS'ta Safari'nin "Ana Ekrana Ekle" adımları, Instagram tarayıcısında "önce tarayıcıda aç". Bildirim ve çevrimdışı çalışma sözü verilmez; servis çalışanı yok | `manifest.ts`, `layout.tsx`, `install-platform.ts`, `install-app.tsx`, `mobil-uygulama/page.tsx` |

Bekçi: `paket-b-speed-schedule-tf.test.ts`, `paket-b-true-false-card.test.tsx`, `scanned-pdf.test.ts`, `outline-oneshot.test.ts`, `lesson-building-ui.test.tsx`,
`p1-counters.test.ts`, `teacher-practice.test.ts`.

## Paket C (29 Ekim 2026) — ölçme ve ders: tek süzgeç, tek yüzde, şema etiketleri, sonuç kartı

29 Ekim'de gelen "10 mimari sütun" istemi ürün sahibine soruldu; cevaplar: **simülasyon laboratuvarı kapalı kalır**
(üçüncü kez), **palet Astra'yla birebir kalır** (yalnız kusurlar düzeltilir), **velime ödeme linki yapılacak**
(öğrenci-only kuralının tek istisnası; ayrı PR), sıra ölçme → genişlik → bot düello → veli ödeme. Zaten yayında
olduğu için yeniden yapılmayanlar: çizimli video 25 kredi, takvim tatil/ara sınav, D/Y odak kartı, sabit adım,
deneme süresi, eşdeğer şık, vaat = teslim, çoklu doğru rozeti, açık uçluda kısmi puan, bileşke/ters fonksiyon
denetimi, soru soru sözlü notu, veri silme (günlük cron'un içinde; **üçüncü cron asla**).

| Kural | Nerede |
|---|---|
| **Öğrenci metninin tek süzgeci**: `studentOutputText` / `studentOutputPayload`; eski `studentSafeText`, `sanitizeStudentCopy`, `studentSafePayload` adları buraya yönlendirir. Düğüm kaydı (node rotası), ders metni (`RichBody`), podcast satırı, sohbet cevabı (`studentFacing`) ve Araçlar çıktısı (`postStudio`) aynı yerden geçer. Yeni kurallar: satır başındaki konuşmacı adı ("Ada:", "Ece:", "ÖĞRETMEN:"), uydurma anı cümlesi ("geçen gün denemede…"); "İpucu:" ham öneki metnin ortasında da düşer (26 Ekim bekçisi) | `student-output-firewall.ts` |
| **Ders içi sorunun şık sayısı testle aynı kuraldan**: ortaokul/LGS 4, lise/YKS/KPSS/TUS/üniversite 5 (`resolveOptionCount`). Yazar `ŞIK SAYISI` satırını okur (düzeltme istemi de aynı satırı taşır), yapı denetimi o sayıyı ister; sayı yoksa 4 | `TeacherLessonInput.optionCount`, `lessonOptionCountLine`, node rotası `teacherLessonPayload` |
| **Çözüm adımı ↔ doğru şık**: son adımın (eşittirden sonraki) sayısı doğru şıkta yoksa ve BAŞKA bir şıkta varsa yapı sorunu; birim/ölçek farkı (başka şıkka düşmeyen) işaretlenmez | `stepsAnswerMismatch`, `quizStructureIssues` |
| **Şema etiketleri HTML'de**: çizgi, ok, eğri SVG; etiket yüzdeyle yerleşen rozet, kendi yazı boyutunda, satır sarar; yakın komşular `labelTiers` ile ayrı katlara. Genişlik tahmini telefon ölçüsünden (`CHAR_W` 12 birim/harf). `data-diagram` SVG'de durur (bekçi) | `diagram-card.tsx`, `exam-lesson-steps.css` `.als-diagram-stage` |
| **Belgedeki şema derse gömülü**: şekil okunmuş sayfa (`text_content` içinde `Şekilde işaretli değerler:`) adımın kaynağıysa "📌 Belgedeki Şema — Sayfa N" kartı ders içinde açılır (PDF sayfası canvas'ta, öbür türlerde metin); "Kaynak Sayfayı Gör" büyütür | `SourceDocRef.figurePages`, `isFigurePage`, `SourceFigureCard`, `dugum/[nodeId]/page.tsx` |
| **Tek yüzde kaynağı**: `topicMasteryView` → yüzde (`topicMasteryPercent`), durum (`ready` / `needs_work` / `unmeasured`), "Sağlam / Çalışılacak" etiketi, çözülen sayı. İlerleme satırı rozeti bundan; değerlendirme sayfasının ayrı `%70` eşiği kalktı (`go = claimFullyReady`) | `learning-tracking.ts`, `prep-progress-view.ts` `state`, `exam-prep-assessment.tsx` |
| **Asılı yazım 3 dk'da ölü**: `STALE_CREATING_MS` 10 dk → 3 dk. Ölçü: soğuk test tek yazımla ~100 sn, dersin ilk kavramı 55 sn'de yayımlanır ve her yayım `updated_at` tazeler. Ölü satır beklenmez (istek soğuk yazıma geçer; önceden yazım kredisizdi), sıradaki önceden yazım devralır. 90 sn istenmişti: normal işlemdeki testi öldürürdü | `lesson-prefetch.ts` |
| **Dört aşamalı sonuç**: (1) yıldız `prepStars` ile ödül kuralından + seri, (2) "+%X" tamamlama kaydındaki `topicGain`'den (rota kayda yazar), (3) açık yanılgı + çalışılacak/sağlam konu, (4) "⏭️ Sıradaki etkinliğe geç" / "📖 Tekrar incele". Okunamayan veri "okunamadı" yazar, sayfa düşmez. Sunucu sayfası istemci modülünden fonksiyon almaz | `result-stages.ts`, `sonuc/page.tsx`, `node-result.css` |

Bulunamayanlar (istemdeki örnekler bu kod tabanında yok): "YanlışÖğrenci" bitişik etiket, "[−3: | 5]" aralık; test
inceleme ekranı şık harfini zaten ✓ ile birlikte gösteriyor; `sonner` sabit konumlu, sayfayı kaydırmıyor; başlat/bitir
düğmeleri `finally` ile açılıyor (3 sn'lik zorla açma yazılmadı: 20 sn'lik üretim sürerken çift gönderime yol açar).

Bekçi: `paket-c-olcme-ders.test.tsx`.

## Paket D (29 Ekim 2026) — genişlik: metin yapıştır, bağlantı ekle, hazır müfredat

Öğrencinin elinde dosya yoksa da kurulum başlar. Üçü de sihirbazın materyal adımında; hiçbiri yeni bir işleme
yolu açmaz, bildiğimiz belge yolundan geçer (kota, sayfa sınırı, konu haritası aynı).

| Kural | Nerede |
|---|---|
| **Metin / konu listesi yapıştır**: metin istemcide `.txt` dosyası olur (`text/plain` zaten yükleniyor ve okunuyor), aynı `takeFiles` yolundan yüklenir. En az 80 karakter | `paste-text-panel.tsx` `pastedTextFile` |
| **Web / ders bağlantısı**: `POST /api/documents/from-url` sayfayı sunucuda okur, metni `.txt` (başlık + "Kaynak: URL" satırıyla) ya da bağlantının PDF'ini `storeUserDocument` ile yüklenmiş dosya gibi kaydeder; işleme telefon yüklemesiyle aynı (`processAndRemember`). **Dışarıya istek atan tek uç**: yalnız http(s), kimlik bilgisiz, 80/443; `localhost`, `.internal`, `.local`, bulut üst veri adresi ve özel ağa çözülen her ad reddedilir (IPv4 özel/ayrılmış bloklar, ::1, fc00::/7, fe80::/10, IPv4'e eşlenmiş IPv6); yönlendirme en çok 3 ve her adım yeniden denetlenir; gövde 15 MB, süre 20 sn; 401/403 "site kapatmış", 200 karakterden az metin "okunacak metin yok" (ikisi de "Metin yapıştır"a yönlendirir). Dakikada 4, günde 30. Sayfa metni `htmlToText`: `<article>`/`<main>` varsa yalnız o; script, style, nav, footer, header, aside, form düşer | `url-import.ts`, `from-url/route.ts`, `url-import-panel.tsx` |
| **Hazır müfredattan seç**: düzey (5–12. sınıf, LGS, TYT, AYT, KPSS, ALES, DGS, YDS, TUS, DUS, Üniversite) + ders → sohbetli kurulum dolu istemle açılır ve istem **kendiliğinden gönderilir** (`autoStart`); konu listesini kurulum çıkarır, öğrenci onaylar. **Kodda konu/ünite listesi yok** (İÇERİK EV STİLİ: konu listesi iddiası kaynağa bağlanır); yalnız sınav/düzey adları ve dersler | `exam-catalog.ts` `CURRICULUM_LEVELS`, `curriculumPick`; `curriculum-pick-panel.tsx`; `exam-create-chat.tsx` `autoStart` |

Yapılmayan: 15 ve 284 sayfalık belgelerde "ince başlık ayrı konu" istemi — konu haritası kuralları ölçümle değişir
(18, 19, 25 Ekim turları); canlı model çağrısına onay yok, istem körlemesine değiştirilmedi. Office içi resimler ve
PDF şekilleri zaten okunuyor; kota dolunca atlanan resim Belgelerim'de yazıyor ("N resim sayfası okunmadı").

Bekçi: `paket-d-genislik.test.tsx`.

## Paket E (29 Ekim 2026) — bot rakipli düello

Düello yalnız eşzamansızdı: arkadaş gelene kadar öğrenci tek başına oynuyordu. Şimdi aynı 7 soru, aynı
kurallar, karşıda bir bot.

| Kural | Nerede |
|---|---|
| **Botun turu sunucuda üretilir** (`POST /api/duels/[code]/bot` {level}); doğru cevaplar bilinerek, tohum rastgele (her başlatma yeni bot). İstemciye soru başına yalnız süre ve doğru/yanlış gider — hangi şık olduğu değil. **Kayıt yok**: bot sıralama tablosuna yazılmaz, yıldız almaz | `duel-bot.ts` `botRun`, `botTimeline`; `bot/route.ts` |
| Üç zorluk: Sınıf arkadaşı (%60, 6–15 sn), Derece öğrencisi (%80, 4–11 sn), Şampiyon (%93, 2,5–7,5 sn). Yanlışta botun seçimi doğru şıktan başka bir şık; puan kuralı öğrencininkiyle aynı (`questionPoints`) | `BOT_LEVELS` |
| Oyun sırasında üst çubuk: botun adı, o ana kadarki puanı, soru başına nokta (yeşil/kırmızı/yanıp sönen), "✓ bildi · 4,2 sn", seri ≥2'de "🔥 x3". Görünürlük kuralı: önceki sorular + bu soruda süresi geçtiyse | `botScoreUntil`, `botComboUntil`, `duel-play.tsx` |
| Sonuçta kafa kafaya: puan, doğru, ortalama süre, soru soru ✓/✗; "Kazandın! 🏆 / Berabere / Bu sefer bot önde"; "Botla yeniden" yeni bot getirir | `headToHead` |
| Hazırlıktaki Düellolar sayfasında ikinci düğme "🤖 AI rakiple hemen başla": düelloyu kurar, sayfayı `?bot=derece` ile açar; oturumlu öğrencide bot kendiliğinden başlar, misafir önce adını yazar | `new-duel-button.tsx`, `duello/[code]/page.tsx` `initialBot` |

Bekçi: `paket-e-duello-bot.test.tsx` (tohum, doğruluk aralığı 150 tohumda ±%8, sızıntı yok, canlı puan/seri, kafa kafaya, ekran akışı).

## Paket F (29 Ekim 2026) — velime ödeme linki

Ürün sahibi 29 Ekim'de "yapılsın" dedi (19 Ekim'de "alıcısı yok" diye siteden kaldırılan sözün karşılığı). Öğrenci-only
kuralının **tek istisnası**: veli hesap açmaz, panel görmez; yalnız öğrencinin adını ve seçilen planı görüp öder.

| Kural | Nerede |
|---|---|
| Öğrenci Abonelik sayfasında "👨‍👩‍👧 Kartım yanımda değil — velime ödeme linki gönder": `POST /api/payments/parent-link` {planId} → imzalı bağlantı (`veli.<öğrenci>.<plan>.<bitiş>.<nonce>.<HMAC>`, `APP_SECRET`, **3 gün**), WhatsApp metni ve kopyala. Dakikada 5, günde 20. Kayıt `parent_payment_requests` (student, plan, "link") | `parent-link.ts`, `parent-link/route.ts`, `parent-pay-link-button.tsx` |
| `/odeme/veli/[token]` **herkese açık**: imza ve süre doğrulanır; e-posta (yalnız PayTR makbuzu, bizde saklanmaz), ad (isteğe bağlı), sözleşme onayı (sunucu `legalAccepted` zorunlu tutar) → `POST /api/payments/parent-link/checkout` → PayTR iFrame aynı sayfada. Süresi dolan bağlantı 410 | `odeme/veli/[token]/page.tsx`, `parent-pay-form.tsx`, `parent-link/checkout/route.ts` |
| Ödeme satırı **öğrencinin adına** (`payments.user_id` = `beneficiary_user_id` = öğrenci); geri çağrı (`finalize_paytr_payment`) değişmedi, planı öğrencinin hesabına yazar. Veli yıldız almaz, hesap açılmaz. Dönüş sayfaları `/odeme/veli/tesekkurler` ve `/odeme/veli/basarisiz` (öğrenci sayfalarına yönlendirmez) | `checkout.ts` |
| PayTR oturumu ortak kabukta (`createPaytrCheckout`): ödeme satırı, token isteği, düşüşte `failed`, `payment.token.created` + `legal_consent` denetim kaydı (`via`: self / parent_account / parent_link). `create-token` rotası da bunu kullanır | `src/lib/payments/checkout.ts` |
| Sözleşme: "Taraflar"a alıcının başka bir kullanıcının (öğrencinin) hesabı için satın alabileceği, "İfa"ya hakkın o öğrencinin hesabına tanımlandığı eklendi | `legal/texts.ts` |

Yapılmayan: otomatik yenileme yine yok (`AUTO_RENEW_SUPPORTED = false`); bağlantı tek kullanımlık değil (3 gün içinde
ikinci ödeme ikinci dönem açar, bu bilinçli: aynı veli iki kez ödemez, öderse dönem uzar). Bekçi: `paket-f-veli-odeme.test.ts`.

## Paket G (29 Ekim 2026) — son cila: yutulan alt başlık, kısa doğru çözüm, çizimli video

Grok v6 raporunun kalan üç maddesi; ürün sahibi onayladı. Canlı model çağrısı yok, yalnız birim testleri.

| Kural | Nerede |
|---|---|
| **Yutulan alt başlık**: 15 sayfalık 10. sınıf matematik notunda "Parçalı Fonksiyon" iki sayfalık kendi bölümüyle dururken harita onu "Fonksiyonlar"ın içinde eritti ("Düşey Atış", "Taban Fiyat" aynı); geniş konu kapısı 8+ sayfa ya da 4+ alt bölüm arıyordu. Yeni sebep `subsection`, ölçü ders bağımsız: aralıktaki numaralı başlığın kendi gövdesi ≥ 450 karakter ve kendi sayfasında ≥ 120 (sayfa sonuna düşmüş etiket, adım listesi sayılmaz); gövde ya tam sayfa (≥ 1.200) ya da tanım/kural/formül/örnek/soru gibi **belge yapısı** işareti taşır; başlık haritada hiçbir konunun adı değil; aralığın **ilk** içerik başlığı üst adla kök paylaşıyorsa konunun kendisidir ("Fonksiyon" ~ "Fonksiyonlar ve Grafikleri"), sonraki "Parçalı Fonksiyon" aynı kökü taşısa da alt bölümdür; son sayfadaki BÖLÜM başlığı modelin sınır taşmasıdır (alt bölüm son sayfada da sayılır); yutulanlar dışında konunun ≥ 450 karakter kendi metni olmalı (yoksa model başlığı başka adla yazmıştır). Kod bölmez; onarım satırı "her birini AYRI konu olarak yaz (1-2 sayfa bile olsa)" der; yazar istemi aynı kuralı okur (`KISA ALT BÖLÜM DE KONUDUR`) | `outline-oversize.ts` `swallowedSubsections`, `oversizeRepairLines`, `OUTLINE_GRANULARITY_RULE` |
| **Kısa ama doğru çözüm tam puan** (Selin'in 18. sorusu: doğru sonuç + doğru bağıntı, 5/10 almıştı): sonuç doğru ve bağıntı/gerekçe var (örnek cevabın yöntem işareti tutuyor, "=" ya da işlem yazılmış ya da denetçi en az bir ölçütü alıntıyla karşılamış) → tam puan, not "Sonuç ve bağıntı doğru; çözümün kısa olması puan düşürmez". Kesinti yalnız: sonuç yanlış; hesap zinciri tutmuyor (`arithmeticSlips`, `step-arithmetic`); denetçi ölçütü **açıkça yanlış** işaretledi (`wrong: true` → `contradicted`; eksik bırakmak wrong değil); çıplak sayı (6/10 tavanı kalır); tarih çelişkisi. **Sonuç, örnek cevabın sonuç değişkeninin zinciridir** (`finalResults`: "Pmax = … = 10 W" sonuç, "Rth = 12 Ω" ara değer; "x = 3/2" 1,5; cümle ve bağlaç — çünkü, ise, ve — ayrı zincir). Eski kod cevaptaki **son sayıyı** okuyordu: parantezdeki kenar uzunluğu sonuç sanılıyor, kesir bölen olarak okunuyordu. Tam puanda eksik ölçüt listesi boşalır; puan notu inceleme sayfasında görünür | `mock-exam/grade.ts`, `open-grade.ts` (`OPEN_GRADE_SYSTEM` aynı kuralı söyler), `grade-exam.ts`, `incele/page.tsx` |
| **Çizimli 1 dk video 25 kredi**: 28 Ekim'den beri böyle (`SKETCH_VIDEO_GENERATE: 25`, göç `20261027193000`); tam video 280 kalır. Paket G'de yalnız doğrulandı | `price-table.ts`, `video-run.ts` |

Bekçi: `paket-g-son-cila.test.ts` (onarım turunu sahte modelle uçtan uca koşar; Zeynep/Selin notları).

## Paket H (29–30 Ekim 2026) — v7 canlı testinin altı sistemsel kusuru

`5b2cac22` canlıya çıktıktan sonra 12 sayfalık PDF + 5 slaytlık PPTX + 2 taranmış el notuyla sıfırdan hazırlık kurulup
yol baştan sona yürüdü (rapor yerelde, depoda değil). Ürün sahibinin şartı: **çözümler ders-bağımsız, sabit kelime/sayı yok.**
Her alan kendi worktree'inde yazıldı; kararların çoğu önceki bölümlerin kurallarını **bilerek** değiştiriyor — geri almayın.

| Kusur | Kural | Nerede |
|---|---|---|
| **Çizimli video canlıda 409 `invalid_action`**: `SKETCH_VIDEO_GENERATE` göçü (`20261027193000`) canlıya hiç uygulanmamıştı; bütün bekçiler göç DOSYASINI okuyordu | Göç 29 Ekim'de SQL ekranında uygulandı + kayıt satırı. Kod tarafı: `reserveCredits` / `getActionCost` `invalid_action` alınca kod `CREDIT_PRICE_TABLE`'daysa `credit_rules`'a **yalnız ekler** (`upsert … ignoreDuplicates`, var olan satır asla ezilmez; `description` "Koddan eklendi…"), `console.warn('credit_rule_seeded_from_code')`, RPC'yi **bir kez** yeniden dener. `/admin/sistem`: "Kredi kuralı satırları" (eksik/kapalı kod → **kritik**, `/api/health` kırmızı), bedel farkı / koddan eklenmiş satır / `plus_only_action` ayrışması → uyarı. Göç yine değişikliğin tek kaynağı: fiyat değişikliği kodla yapılmaz | `price-table.ts` (`ACTION_CODES`, `creditRuleSeed`), `credits/service.ts`, `schema-probe.ts` `probeCreditRules` |
| **Sözlü: 8 doğru cevaba 6,5/8** — `contradictsExpected` iki cümlede sayı kümesi farklıysa "çelişki" sayıyor, `oral-fact-check` kaynaktan alakasız cümleyi "doğrusu" diye basıyordu | **Kod hakemin puanını hiçbir koşulda düşürmez, "İlk yanıtta «X» yanlış" satırını üretmez.** `contradictsExpected`, `validFirstAnswerErrors`, `ORAL_FIRST_ERROR_CAP`, hollow tavanı, yedek yoldaki sayı tavanları ve `oral-fact-check.ts` tümüyle silindi (#405 ve 25 Ekim P0 tavanı geri alındı). Hakem soru başına **kapalı blok** (soru / beklenen noktalar / rubrik / örnek çözüm / ilk cevap / takip sorusu+cevabı; "Kaynak özeti" yok) ve tek kural sabiti `ORAL_JUDGE_RULES` (node rotası + Araçlar stüdyosu aynı metin): not **ilk cevaba**, çelişki varsa `firstAnswerIssue {wrong: ilk cevaptan birebir, correct}`; takipte düzeltme noktayı geri kazandırmaz. Kalanlar: hakemin alıntısının cevapta bulunması şartı (kanıt şartı) ve yükseltmeler. Takip sorusu `takip:<i>` anahtarında saklanır | `oral-first-answer.ts`, `oral-exam.ts`, `oral-review.ts`, node rotası, `oral/grade/route.ts`, `oral-exam-flow.tsx` |
| **Cevap anahtarı ↔ açıklama**: ders içi soruda açıklama 140 derken anahtar 160'taydı; çok cevaplıda açıklamanın çürüttüğü şık "doğru"ydu; deneme sorusu ekranda olmayan diyagrama atıf yapıyordu | `answer-consistency.ts`: `explanationFinalValue` (steps → optionWhy[anahtar] → whyRight → açıklamanın ilk sonuç cümlesi → hint; iki şık değeri taşıyan cümle ve olumsuzluk çevresi okunmaz) → `explanationAnswerMismatch`; `refutedCorrectOptions` / `affirmedWrongOptions` (şık hakkında yargı eki); `unresolvedVisualReference` (şekil/grafik/harita/tablo/şema atfı + kökte veri taşıyıcı yok + ekranda table/diagram/formula bloğu yok). **Derste** yayım kancası `settleCheckKeys`: tek eşleşmede `answerIndex` **hizalanır** (`lesson_check_key_realigned`; "kod metne dokunmaz"ın ürün sahibi kararıyla istisnası), görsel atıflı check çıkar; `gradeSectionCheck` kayıtlı eski dersleri de hizalı notlar. **Testte/denemede** soru düşer, anahtar değişmez. Yazar ve denetçi aynı üç kuralı okur (`SELF_CONTAINED_STEM_RULE`, `KEY_CONSISTENCY_RULE`, `MULTI_POLARITY_RULE`) | `answer-consistency.ts`, `result-values.ts` (grade.ts'in sayı okuyucuları taşındı), `teaching-rubric.ts`, `teacher-quiz.ts`, `item-validity.ts`, `teacher-lesson*.ts`, `lesson-play.ts`, `teacher-brain.ts` |
| Aynı derste 6. ve 7. ekranda aynı soru | `questionSignature` (sayı çok kümesi + sembolik atom + içerik kökü); `sameLessonQuestion` kısa-soru yolu: sayı VE atom kümesi eşitse tekrar, sayısı değişen hesap ("f(6)"→"f(3)") yeni soru; çözümlü örneğin sorusu da sayılır | `teacher-brain.ts`, `teacher-lesson.ts` |
| İki derste de `diagram_card` yoktu (27 Ekim "orta önem" denetçisiz kalmıştı) | Bütün kavramlar bitince kart yoksa **tek küçük tamamlama çağrısı** (`completeLessonDiagram`: dersin metni + kaynağın ilk 2.500 kr; tek `diagram_card` JSON; etiket/sayı yalnız derste ya da kaynakta geçenden; ilk kavrama konmaz; 25 sn tavan; düşerse ders aynen yayımlanır; `teacher_lesson_diagram {verdict}`). "Tek geçiş" kuralının bilinçli istisnası — eksik kart artık dört parça yeniden yazımını tetiklemez. Tür seçimi istemde **örnek** (kronoloji → timeline, süreç → process_network, büyüklük ilişkisi → function_curve, sayısal karşılaştırma → number_line/balance_scale), kural değil | `teacher-lesson.ts` `DIAGRAM_COMPLETION_SYSTEM`, `teacher-lesson-run.ts` |
| "📌 Belgedeki Şema — Sayfa 1" kartı şekli olmayan sayfada çıktı, şekilli 3. sayfada çıkmadı; PPTX slaydının resmi derse bağlanmadı | "Şekil sayfası" bilgisi görselden değil **ekin içeriğinden**: `figureTranscript(raw, {textLayer})` metin katmanını tekrar eden satırları düşürür (şekil istemi "sayfanın düz metnini tekrar yazma" der); sayfa ancak ekte **metinde geçmeyen ve veri taşıyan** (rakam, →, =, ≤, koordinat çifti, tablo ayracı) satır varsa şekil sayfasıdır (`figureHintsFromRows`; eski sahte ekler de elenir). Kart **ipucuyu anan ekranda** (`planFigureSources`: adımın `source`'u → ipucu parçası ekran metninde geçen ilk ekran → açılış dışındaki ilk boş ekran; sayfa başına bir kart); PDF önizleme, PPTX/DOCX/görselde ipucu satırları + "Kaynak Sayfayı Gör" (yeni resim ucu yok). Konuya bağlı düğümde yalnız konunun + yardımcı kaynağın sayfaları; anahtar `document_id`. Göç yok (`images_detected` eklenmedi); gerçek şekli olup eki hep metin tekrarı olan eski sayfa yeniden yüklenince düzelir | `figure-pages.ts`, `extract-image-text.ts`, `office-figures.ts`, `dugum/[nodeId]/page.tsx`, `source-preview.ts`, `source-page-drawer.tsx` |
| Adım sayacı 1/6→2/7, 3/7→4/9 | Yazım sürerken payda yok ("Adım N", `indeterminate`, `aria-busy`, "~N dk" yok); mühürde ilk toplam `lockedTotal` ile kilitli — bkz. Paket B satırının güncel hâli | `activity-duration.ts`, `exam-lesson-steps.tsx` |
| Yazılı deneme ekranı 5 dk+ "Hazırlanıyor…"da kaldı (üretim POST'u askıda; sunucu kâğıdı yazmıştı) | Salt okuyan `GET /api/learning/exam-prep/mock-exam/status?prepId&since[&resumeId|jobId]` (model/kira/ücret yok; `{state: published|running|failed|unknown, examId, leaseAlive…}`; `since` sunucuda 2 dk geri alınır). İstemci üretim POST'una **paralel** 4 sn'de bir yoklar; `published` gelince POST iptal, sınav ekranına geçer; `running && !leaseAlive` → kayıtlı gövdeyle **bir** devralma POST'u; `resumeId/jobId/startedAt/body` `sessionStorage`'da (`cp:mock-exam:<prepId>`, 15 dk) — sayfa yenilenince yoklama sürer. Kira/bütçe sistemi değişmedi (ölü kira yine 330 sn) | `mock-exam/status/route.ts`, `mock-exam/progress.ts` `pollMockExamStatus`, `mock-exam-setup.tsx` |
| Uydurma "kaynaklar çelişiyor": «f(x) = ax + b (a ≠ 0)» ile «f(x) = ax + b, a ≠ 0» | `mathNormalize` (Unicode işleçler **NFKC'den önce** ASCII'ye — `≠` NFKD'de `=`'e düşüyordu; ondalık virgül, `\frac`, üst simge, koşul ayracı) + `mathSegments`; `relateClaims` sırası: kutupluluk → aynı sol tarafta küme ne alt ne üst küme ise çelişki (d=m/V vs d=m/V·2 kalır) → kısa taraf uzunun içindeyse tamamlayıcı (`same`: birim, koşul notu, özel vaka) → parça ∧ sayı kümeleri eşit ∧ kök örtüşmesi ≥ %80 → `same`. Farklı sol taraflı formül ("F = m·a" / "a = F/m") artık otomatik çelişki değil, model adayı | `source-contradictions.ts` |
| Sayfa geçişlerinde `_rsc` 503 (kök neden Vercel günlüğünde ölçülemedi — oturum yok) | Middleware ve `requireUser`'daki hesap-aktif kontrolü hata verirse 300 ms sonra bir kez daha; yine hata → **geçir** (`console.warn('account_status_unavailable')`, başlık `x-account-check: skipped`); askı/silinme (`false`) aynen engeller; `profiles` okunamazsa kuruluma yönlendirmez. Çerez önbelleği yok | `active-account.ts` `accountActiveOrUnknown`, `supabase/middleware.ts`, `auth/session.ts` |
| Tahtada "A = {1, 2, 3}" → `A = {1` / `2:` / `3}` | Bütün bölücüler ayraç içine bakmaz: `bracket-spans.ts` (`()`, `[]`, `{}`, `⟨⟩`, `⌊⌋`, `⌈⌉`, `$…$`; `|` izlenmez; `[−1, 2)` için `()`/`[]` birbirini kapatır; 240 karakterden uzun çift opak sayılmaz). Virgül bölmesi yalnız iki yanı da bağıntı taşıyorsa ("1 kPa = 1000 Pa, 1 MPa = 1000 kPa" iki satır; "1 → a, 1 → b" tek); `\d:\d` oran/saat bölünmez; 1–3 harf + nokta + rakam kısaltması ("m. 27") cümle sonu değil; harfsiz parçaya ":" eklenmez | `src/lib/text/bracket-spans.ts`, `lesson-board.ts`, `math-text.ts` (`MATH_SPAN_RE` tek kaynak) |

Bekçi: `paket-h-kredi.test.ts`, `schema-probe.test.ts`, `paket-h-sozlu.test.ts`, `paket-h-anahtar.test.ts`,
`paket-h-tekrar-sema.test.ts`, `bracket-spans.test.ts`, `lesson-board-brackets.test.ts`, `paket-h-ders-tahtasi.test.ts`,
`paket-h-sema-sayac.test.tsx`, `paket-h-deneme-celiski.test.ts`. Canlı test kayıtları (hazırlık `c82cad3e…`, düello
`fjcfgjaq`, veli bağlantısı) silinmedi — kullanıcı "Daha fazla → Hazırlığı sil" ile siler.

## Paket I (30 Ekim 2026) — v7 stres testinin 12 kök nedeni

İki öğrenci (2 gün sonra Muhasebe vizesi; 7,5 ay sonra Veri Yapıları finali) sıfırdan kuruldu; Grok raporu 12 kök
neden çıkardı. Ürün sahibi: "genel çaplı, tüm derslere göre; Astra kalitesini geçelim". Her çözüm ders-bağımsız; bekçi
testlerin örnekleri farklı derslerden. Yeniden açmayın:

| Kusur | Kural | Nerede |
|---|---|---|
| **#1 Sözlü/test bitişi takıldı, cevaplar kayboldu** (kayıt isteğinde zaman aşımı ve yeniden deneme yoktu, cevap yalnız bellekte, sözlü notu yanıtı bekletiyordu) | Her kayıt denemesinde zaman aşımı; ağ hatası, zaman aşımı ve 5xx'te 1-3-8 sn arayla üç yeniden deneme (4xx denenmez); aynı anda tek istek, arada gelen cevaplar bekleyen işe katlanır. Cevaplar tarayıcı taslağında (`cp:attempt:<id>`), sunucu onaylayınca silinir; açılışta yeni olan birleşir. Bitirme 60 sn tavan, gelmezse "Değerlendiriliyor…" ve yoklama (`resume` + `attemptId`, salt okuma); × ve "Sınavı bitir" hiç kilitlenmez. Bitirme kaydı `complete_request_id` ile sahiplenir: ikinci bitirme notlamaz (`grading:true`), ölü sahiplik 6 dk sonra devralınır. Sözlü notu `gradingAsync: true` gelince `after()` içinde; eski sekme eskisi gibi yanıtta alır. Göç yok | `retry-fetch.ts`, `attempt-draft.ts`, `exam-node-session.tsx`, node rotası (`completedAttemptBody`) |
| **#2 Harita konu yutuyor ve kararsız** (Muhasebe'de Mizan / Tekdüzen Hesap Planı ayrı konu değildi; Veri Yapıları aynı belgelerden 14 ya da 22 konu; "finalde yok" denen konu girdi) | Kodda doğrulanan: sayfa kapsamı (`MIN_MINI_COVERAGE`) yalnız mini yolunda bakılıyordu, 27 Ekim'den beri her belge güçlü modelle haritalandığı için **hiç** ölçülmüyordu; `extractTocUnits` "3.2 Mizan" gibi alt bölümleri okumuyordu. **Belge iskeleti** (`outline-skeleton.ts`, modelsiz): içindekiler (alt bölümler dahil, `extractTocEntries`), numaralı / Markdown / kalın / büyük harf başlıklar, slayt ve bölüm sayfaları; koşan başlık, "Soru 3" / "Şekil 2", ön/arka madde ve alt başlığı olan üst başlık ölçülmez. Kendi öğretimi olan (`carriesOwnTeaching`) başlık haritada ayrı konu, bir konu/ünite adı ya da `sourceTitles` birleştirmesi değilse **yutulmuş**: `runOutlineStep` `patch` aşaması modelden yalnız o bölümlerin sayfalarını okutur (en çok 12 başlık), dönen konular `mergeOutlinePatch` ile eklenir, haritanın kalanı değişmez; çağrı düşerse doğrulanmış harita kalır. Kod konu bölmez, başlık uydurmaz. `outline_stage.headings` kaydı (ölçülen, temsil edilen, yutulan, kapsam dışı). **Kapsam dışı** ("finalde yok", "vizede sorulmayacak") tek okuyucu `exclusionPhrases`: konu belge haritasında kalır, hazırlık listesine girmez, kurulumda "kapsam dışı" notuyla görünür (`topic-scope.ts`), yutulmuş sayılmaz. **Kararlılık**: kurs sırası koddan (`orderOutlineByPosition`: dosya içinde belge sırası, önkoşul önce; dosyalar arası haritanınki); ortak kurs etiketi (`sharedCourseTag`) sayesinde **hangi belge** çıkarılırsa çıkarılsın kalanların haritası kullanılır (önce yalnız ilk belge çıkınca sıfırdan üretiliyordu). Eşikler canlıda ölçülmedi: `outline_stage.headings` izlenmeli | `outline-skeleton.ts`, `outline-oneshot.ts`, `outline-oversize.ts`, `intake-outline.ts`, `cross-material-topics.ts`, `topic-scope.ts`, `scope-exclusion-read.ts` |
| **#10 Belge sürümü ve konu dışı belge fark edilmiyordu** (%18 yazan eski kopya işaretlenmedi; alakasız bitki rehberi uyarısız haritayı 14'ten 22 konuya çıkardı) | `material-similarity.ts` (modelsiz): kelime 5'li dizilerinde Jaccard ≥ 0,45 ya da sayfaların ≥ %60'ı eşleşiyorsa "aynı belgenin iki sürümü", ≥ 0,97 "aynı belge iki kez yüklenmiş"; güncel olan önce metindeki dönem/tarihle (2025-2026, Güz 2025, "güncelleme: 2026"), yoksa yükleme zamanıyla. İlgisiz belge: sözcüklerinin %25'ten azı öbür belgelerde, ders adı belgede yok, en az 60 içerik sözcüğü; iki belgede hangisinin ilgisiz olduğuna yalnız ders adı karar verir; tek belgede denetim yok. Sihirbazın materyal adımında "Devam" `POST /api/learning/exam-prep/material-check` sorar; kart (`material-notes-card.tsx`): sürümde Yalnız A / Yalnız B / İkisini de kullan, ilgisiz belge varsayılan alınmaz ("Yine de dahil et"); karar yalnız bu kurulumun listesini değiştirir, dosya Belgelerim'de kalır. Sürüm çiftinden gelen çelişki "eski sürüm" diye anlatılır (`formatContradictions(..., { versions })`); Paket H'nin %20/%20 düzeltmesi doğrulandı. Açık: sohbet ve hazırlık sayfası sürümü bilmiyor (göçsüz kayıt yeri yok), sonradan belge ekleme (add-source) denetimsiz, not sayfa yenilenince yeniden sorulur | `material-similarity.ts`, `material-check-read.ts`, `material-check/route.ts`, `material-notes-card.tsx`, `source-contradictions.ts`, `exam-create-wizard.tsx` |
| **#3 Takvim**: 7,5 aylık planda konular ilk 120 güne yığıldı, son 15 hafta boştu, 23 Nisan / 1 Mayıs / Kurban Bayramı planda yoktu, 228 gün kalmışken "hedefe ~7 günde"; 2 günlük planda 8 konudan 7'si "Bugün"de ve "1. Hafta" yazıyordu; sınav saati yoktu; bitmiş adım "Yarın" etiketliydi | 120 gün sınırı kalktı (`buildExamScheduleV2`; eski `buildExamPlan` `pdf_learning_v2` kapalı yolda aynen). **Uzun plan (45+ gün)**: yeni konular dönemin ilk ~%55-63'ünde; her konu dersinden 21/45/90/150 gün sonra "Kartlarla tekrar", aylık "Aylık kontrol", boş haftaya bakım tekrarı; tarihli adımlar o güne kadar öğrenilen son konunun ardında, "🔁 Aralıklı Tekrar ve Kontrol" bölümünde (ara sınav kontrolü de bu gruba geçti). Günü gelen soru tekrarı (`review-items.ts` 1/3/7/14) **değişmedi**; yol tekrarı onun bittiği yerden başlar. Tatil yine **esnek gün** (Paket B kararı); bölüm başlığı kendi aralığındaki tatilleri yazar (adım düşmese de). "Hedefe ~N günde" planın tarihli derslerinden (yetmiyorsa gün yazılmaz; günde birin altındaysa "haftada N"). **Kısa plan (<7 gün)**: konular günlere süre ve bütçeyle paylaştırılır, sıra değişmez; 1-2 çalışma gününde son gün de ders alır; etiket "Bugün / Yarın / Cum 30 Eki", hafta yok. Bitmiş adım "Tamamlandı · 29 Eki". Sınav saati ve yeri sihirbazda isteğe bağlı, **göçsüz** `learning_preferences.examTime/examPlace` (`parseLearningPreferences` korur); yolun sonunda, seçenekler kartında ve Takvimim'de. Kurulum ara sınav tarihlerini artık `schedule_v2`'ye yazar (yeniden planlama kontrol adımını düşürüyordu). Var olan hazırlıklar ilk yeniden planlamaya kadar eski adımlarla kalır; görünüm düzeltmeleri hemen geçerli | `exam-schedule-v2.ts`, `path-dates.ts`, `path-sections.ts`, `day-label.ts`, `exam-time.ts`, `prep-progress-view.ts`, `tr-calendar.ts`, `exam-prep-home.tsx`, `calendar-view.tsx`, `exam-create-wizard.tsx` |
| **#4 Deneme soru sayısı ve dağılımı sınavı yansıtmıyordu** (22 konulu hazırlıkta Kısa da Standart da 22 soru; gerçek sınav 25 soru / 60 dk iken seçenek 10 ve 20; tahtadaki "Yevmiye %35" denemeye %15 girdi) | **Toplam her zaman seçilen sayı** (28 Ekim Paket A "konu fazlaysa toplam büyür" kuralı bilerek değişti): konu fazlaysa `pickTopicsForCount` — `examHeavy`, sonra `weightPercent` büyükten küçüğe, kalan yerler ağırlıksız konulara baştan sona eşit aralıkla; kurulum "22 konudan 10 tanesi soruluyor …" der (`skippedTopics`). "Kendi sınavım": 5–40 soru (`MOCK_CUSTOM_MIN/MAX`), süre önerisi soru başı 2 dk, uç `questionCount` alır. Kayıtta ağırlık yoksa belgedeki yüzde konuya eşlenir (`topicWeightsFromText`): satırda ya da üstündeki üç satırda sınav/ağırlık/soru/vize/final ipucu şart ("KDV oranı %20" eşlenmez), adı tümüyle geçen konu önce, eşitlikte hiçbiri, toplam %120'yi aşarsa hiçbiri. Sözlü "Tüm sınav" aynı seçim işlevini kullanır (ağırlıksızda eski eşit aralık aynen). Yapılmadı: belgeden çıkmış soru bankası ve soru türü oranı ("klasik %40") | `mock-exam/allocate.ts`, `weights-from-text.ts`, `create.ts` `loadMockExamSetup`, `mock-exam/route.ts`, `mock-exam-setup.tsx`, `oral-scope.ts` |
| **#5 Öğrenciye istem dili sızdı** ("Turuncu işaretli yerler sınavda çıkar", "… bu anlatımda ele alınmıyor", "(Alıştırma 11.5)", "Dönem: 2026–2027", uydurma kişi adları) | Kaynak kapandı: yazar istemi ekranın renk anahtarını söylemez (`EMPHASIS_RULE`); `STUDENT_LEAK_BAN` renk, kapsam notu, uydurma ad ve alıştırma numarasını da sayar (podcast senarist istemi kısa kalsın diye kısa yazıldı; sınır 5.500). Süzgeç (yalnız siler): renk anahtarı cümlesi (yalnız "turuncu işaret/vurgu"; "turuncu renk" kalır), olumsuz kapsam meta cümlesi (`işlen-` ve geniş zaman yok: "Bu bölümdeki suçlar taksirle işlenmez" hukuk kuralıdır), kaynak alıştırma numarası, tek başına dönem satırı, "Şekilde işaretli değerler:" / "SINAVDA SORULUR" etiketleri. Video alt yazısı ve kilit bilgi de süzgeçten geçer | `teaching-rubric.ts`, `teacher-lesson.ts`, `student-output-firewall.ts`, `video-lesson.tsx` |
| **#6 Soru doğrulaması eksikti** (ders içi soruda iki şık aynı ve hiçbir şık doğru değil; denemede kök "hangisidir", anahtarda iki doğru; "dört işlev" deyip beş öğe) | Tek modül `question-integrity.ts`: yazım farkını yok sayan aynı şık (`optionKey`: ok, boşluk, büyük harf, son nokta), hesapla çelişen anahtar, **hiçbir şıkkın tutmaması** (`mathNoOptionMatches`), iki şıkkın aynı değeri, eşdeğer şık, "N öğe diyor M sayıyor" (iki noktadan sonraki kısa liste ya da kökteki I-II-III maddeleri; parantez içi atlanır). Kök ile doğru sayısı: çok doğrulu soruda kök tek cevap istiyorsa ("hangisidir", "nedir", "kaçtır") ya da "hangi ikisi" deyip başka sayı varsa sorun; "Hangileri doğrudur? A) I ve II" tek doğrulu Türkçe kalıp, sorun değil. Ders içi soru testle **aynı** listeyi alır (sayı tutarsızlığı derste düşük önem). Yeni üretimde model soruyu açıkça tek cevaplı bildirip iki doğru işaretlerse soru sessizce çok cevaplıya dönmez (`normalizeGeneratedQuizQuestion`); kayıtlı soruları okuyan `normalizeQuizQuestion` tek argümanlı ve eski davranışta (`.map(normalizeQuizQuestion)` dizini ikinci argüman geçirir) | `question-integrity.ts`, `math-key.ts`, `exam-quiz.ts`, `teacher-quiz.ts`, `teacher-lesson.ts` `checkIssues` |
| **#7 (sayım) Yanlış sayısı sonuçta 13, incelemede 14-15** (notlandırma kısmen doğruyu, inceleme boşu yanlışa katıyordu) | Doğru / kısmen / yanlış / boş tek işlevden (`verdictCounts`, `rowVerdict`, `rowVerdictCounts`); dördünün toplamı soru sayısı. Notlandırma (`scoreFromItems`, kayıtlı sonuç), sonuç sayfası ve inceleme ekranı aynı sayıyı gösterir; inceleme boşu ayrı yazar, süzgeç düğmesi "Doğru olmayanlar (N)" | `mock-exam/verdict-counts.ts`, `grade.ts`, `grade-exam.ts`, `sonuc/page.tsx`, `exam-question-review-client.tsx` |
| **#7 Rakamlar birbirini tutmuyordu** (hazırlık yüzdesi emek verdikçe düşüyordu, aynı ekranda "45 ders" / "20 ders", 1/22 konu ölçülmüşken "Konu hâkimiyeti %78", hiç çalışılmamış konu %33, kart puanı 6.6/8, Hazırsın en zayıf konuyu önermiyordu) | Tek kaynak `prep-metrics.ts`: "Hazırlık" (başarı, düşebilir), "N ders tamamlandı", "Tamamlama %X" ayrı adla; Hazırsın ekranı düğümü tamamlar ama ders/adım sayısına girmez; değerlendirmedeki "Program ilerlemesi" artık "Tamamlama", `readinessScore` ekranlarda okunmuyor. Konu **en az 3 cevapla ölçülmüş** sayılır (`isMeasuredTopic`), altında "Ölçülmedi" yazar, %33 öncülü kalktı; hâkimiyet "x/N konu ölçüldü" kapsamıyla. Doğru / kısmen / yanlış / boş her etkinlikte `answer-tally.ts`'ten (deneme için `verdict-counts.ts`). **Kart puanı tam sayı** (Bildim / kart; "Zorlandım" ayrı satırda; eski 0,6 kısmi kredi kalktı: 5 Bildim + 3 Zorlandım %85 → 5/8). Son kontrolde sunucu kırpılmış şıklarla notluyordu, istemci ham şıkları görüyordu: karşılaştırma boşluğu yok sayar, istemciye notlandırmanın okuduğu biçim gider (kök neden hipotezi, canlıda doğrulanmadı). Hazırsın önerisi en düşük ölçülen başarılı konu (`?konu=`). Boş cevap yanılgı açmaz; tek başına şık olan cevap ("Doğru", "(boş)", "B") önizleme olmaz; kaçırılan sorunun konusu önce sorunun kendisinden | `prep-metrics.ts`, `answer-tally.ts`, `learning-tracking.ts`, `readiness-screen.ts`, `exam-prep-home.tsx`, `exam-prep-progress.tsx`, `exam-prep-assessment.tsx`, `exam-quiz.ts` |
| **#8 Final adımları etiketteki konuyu hedeflemiyordu** (zayıf nokta "konu 1" etiketli ama sorular konu 5-6'dan, son kontrolün 5 sorusu iki konudan, sözlü sonuç başlığı soru olmayan "Diziler", erken çözülen deneme final adımını bitirdi, aynı 3-4 bilgi beş etkinlikte soruldu) | Tek seçici `rankFinalStepTopics`: önce en düşük ölçülen başarı, sonra en çok açık yanlış; ölçülmemiş ve yanlışı olmayan konu zayıf sayılmaz. Zayıf nokta, odaklı pratik ve son kartlar tek konuya; etiket, sorular, yol kartı, oturum, sonuç başlığı ve kanıt aynı konu. Son kontrol "Tüm konular": hazır sorular her konuyu kapsamıyorsa eksik konulara konu başına bir soru yazılır (model çağrısı artık daha sık). Sözlü "Tüm sınav" başlığı "Tüm konular", tek konuya kanıt yazmaz. Yazılı deneme adımı yalnız açık düğümde biter. **Etkinlikler arası tekrar dışı** (`collectAskedItems`): test, doğru/yanlış, kart, sözlü ve dinleme kontrolü aynı konunun önceki köklerini, yoklanan bölümleri, önermeleri ve kartları görür; doğru/yanlış ve sözlü yazarına da yasak listesi | `prep-wide-target.ts`, `previous-items.ts`, `prep-writeback.ts`, `exam-local-session.ts`, node rotası, `exam-node-session.tsx`, `oral-exam-flow.tsx`, `teacher-practice.ts` |
| **#9 Ders sonu "Şimdi dinle" 9 denemede 0** (ayrı hat: kaynak sayfasız, önbelleksiz, hata yalnız konsolda; aynı konunun hazırlık podcast'i çalışıyordu) | `lesson-podcast` artık hazırlık podcast ucunu aynı çerezle çağırır: aynı konu sayfaları + ders, aynı önbellek (varsa anında), `maxDuration = 300`. Ders sonu yolu `listeningCheck: false` gönderir (20 Ekim kararı korunur); **kontrolsüz bölüm önbelleğe yazılmaz** (yoldaki podcast adımı kontrolünü kaybetmesin). Hazırlık podcast düşüşü `lesson_generation_failures`'a yazılır. Ekran `postJsonWithRetry` ile bir kez kendiliğinden yeniden ister, beklerken ne olduğunu söyler | `lesson-podcast/route.ts`, `podcast/route.ts`, `exam-node-session.tsx` |
| **#11 Öğretmen el notundaki ve şekildeki bilgiyi bulamadı** ("AVL 15, 10, 5, 20, 25", "T(n)=3T(n/4)+n", "SMMM 95.000" için "notlarda yok"; kök araması 4 harften kısa kelimeyi ve sayıyı aramıyordu, bağlam sabit 4 parçaydı) | Kesin belirteçler (`exactSearchTokens`): kısaltma (2-6 büyük harf, kelime içinde aranmaz), binlik ayraçlı/3+ basamaklı sayı (ayraçsız biçim de), sayı dizisi (sırayla, ayraç esnek), rakam taşıyan parantezli formül ("T(n)" gibi her sayfadaki yazım aranmaz). `lexicalPageHit` kök yoksa da bu belirteçlerle sayfa bulur. Bağlam karakter bütçesiyle (`CHAT_PASSAGE_BUDGET` 7.200; anlam araması %60, kelime araması %30 en çok 4 sayfa). Soru şekil/tablo/el notu/grafik/harita soruyorsa (`asksAboutFigure`) şekil eki taşıyan sayfaların ve fotoğraf belgelerinin **tamamı** (en çok 3, sayfa başına 2.400 kr) bağlama girer. Yapılmadı: şekli ikinci kez okuyup sayıları karşılaştırmak (sayfa başına ek model çağrısı; ölçümsüz açılmadı) | `prep-corpus.ts`, `prep-chat-grounding.ts` |
| **#12 Kurulum 400 "Gönderilen bilgiler geçersiz."** (43 karakterlik ders adı, sunucu `max(40)`), "Ders oluştur"da "Bu konuda yok", "Deneme sınavı oluştur" pencere açıyordu, okula bağlı olmayan hazırlıkta okul adı | Serbest metin sunucuda **kırpılır, reddedilmez** (`lenientText`, istemcide aynı `clampText`); gerçek doğrulama hatası alanın adını söyler (`invalidInputResponse`, `fields`). Pencerede düğümü olmayan etkinlik "Başka Bir Konu veya Etkinlik Seç" ile **aynı uçtan** kurulur (`activityCreatable` = uç kabul listesi; kuramadığı araç "Bu hazırlığın yolunda yok"); yazılı deneme ve "Deneme sınavı oluştur" doğrudan `mockExamSetupHref`. Okul adı yalnız okulla paylaşılan ya da okuldan katılınan hazırlıkta | `input-fields.ts`, `clamp-text.ts`, `create/route.ts`, `study-tools-hub.tsx`, `study-tools.ts`, `exam-prep-home.tsx`, hazırlık sayfası |

Bekçi: `paket-i-cevap-kaydi.test.tsx`, `paket-i-olcu.test.tsx`, `paket-i-final-hedef.test.ts`, `paket-i-harita.test.ts`, `paket-i-belge-surum.test.ts`, `paket-i-takvim.test.ts`, `paket-i-takvim-ui.test.tsx`, `paket-i-deneme-dagilim.test.ts`, `paket-i-sayim.test.ts`, `paket-i-sizinti.test.ts`, `paket-i-soru-dogrulama.test.ts`, `paket-i-sesli-tekrar.test.ts`,
`paket-i-sekil-arama.test.ts`, `paket-i-hata-yolu.test.tsx`.

## Canlı tur (30 Ekim 2026) — öğrenci gibi baştan sona, Astra'yı geçmek için

Ürün sahibi: "Astra'yı geç; yamalayarak değil, bütün özelliklerimizi bilerek; kullanıcı beklemesin, sıkılıp gitmesin".
Paket I yayına çıktıktan sonra Makroekonomi notuyla sıfırdan hazırlık kuruldu, yol, ders, test, podcast, video,
sohbet, soru çözücü, düello ve Araçlar tek tek denendi (iki tur: ben ve bir ajan; notlar yerel). Yeniden açmayın:

| Kusur | Kural | Nerede |
|---|---|---|
| **Ders sonu "Şimdi dinle" 9 denemede 0** (Paket I #9'dan sonra da): belgeli hazırlıkta düğümün `session_meta.topicId`'si belge konu düğümünün kimliği (`document_topic_nodes.id`), `exam_prep_topics.id` değil; canlıda konulu 1.851 adımın 1.830'u böyle. Uçlar `.eq("id", topicId)` ile konu satırını bulamıyordu | Konu kimliği alan her yer **iki kimliği de tanıyan** tek çözücüden geçer: `resolvePrepTopicRow` (`id` ya da `document_topic_node_id`); güncelleme bulunan satırın kendi `id`'siyle. Ders ekranı istemciye konunun gerçek kimliğini verir. Bekçi kaynak taraması: `exam_prep_topics`'te `.eq("id", <istekten gelen konu>)` yazılmaz | `prep-topic-lookup.ts`, podcast / topic / video uçları, `select-prep-topic.ts`, `lesson-source-resolver.ts`, `prep-topic-source.ts`, `dugum/[nodeId]/page.tsx` |
| Yeni hazırlığın ilk dersi soğuk açılıyordu (Plus öğrenci kurulumdan sonra 40+ sn bekledi) | Kurulumun ilk ders önceden yazımı **Plus'ta hızlı işlemle** (`firstLesson: true`, `fastAllowedFor` aynı karar); öteki önceden yazımlar 23 Ekim kararıyla normal işlemde kalır | `create/route.ts`, `lesson-prefetch.ts` `requestPrepPrefetch`, node rotası |
| Ders açılışında art arda iki kart (ruh hali, sonra öneri) | Ruh halinden sonra doğrudan kurulum (`stepAfterMood` → `setup`); ısınma isteği kurulum dışındaki her aşamada | `lesson-open.ts`, `exam-node-session.tsx` |
| "TÜFE ve Yİ-ÜFE" başlığı "Tüfe ve Yi̇-Üfe" oldu | Bağırma (tümü büyük harf) denetimi metinde tümü küçük bir kelime varsa atlanır: kısaltmalı başlık kısaltma kalır | `teacher-lesson.ts` `shouting`, `topic-title.ts`, `outline-clean.ts` |
| Ders altındaki renk anahtarı "Turuncu: sınavda çıkar" diye söz veriyordu | "Turuncu: sınavda sık sorulan kilit bilgi" | `exam-lesson-steps.tsx` |
| "Makroekonomi" dersinde Hukuk notu uyarısız kaldı (ders adı belgede tümüyle geçmiyor, "ekonomi" geçiyor) | Bileşik ders adı: 8+ harfli kelimenin 3. harften sonraki 5 harflik penceresi belgede en az iki kez geçerse ders adı belgede sayılır ("makroekonomi" → "ekono") | `material-similarity.ts` `compoundPartInDocument` |
| Hazırlığın podcast sayfası, yoldaki aynı konunun hazır podcast'ini görmeyip 90 sn'de baştan yazdı | Kontrollü podcast isteğinde yolda aynı konunun bitmemiş podcast adımı aynı süreyle hazırsa uç `openNode` döner, sayfa o adıma gider; hazır içerik ve ücret tek yerde (düğüm açılışı). Ders sonu "Şimdi dinle" yönlendirilmez | `path-podcast-ready.ts`, `podcast/route.ts`, `prep-podcast-session.tsx` |
| Kurulumda "Sınavda sık çıkar" rozeti bütün konularda | Rozet yalnız konuların azınlığını (en çok yarısını) ayırıyorsa görünür | `exam-wizard-copy.ts` `examHeavyBadgeVisible` |
| Sohbette "#### Genel bilgiden — kaynak gösterilmez" düz metin; aynı cevabın altında belge sayfa çipleri | Başlık her zaman kendi satırında (`isolateHeadings`); yalnız genel bilgiyle verilen cevapta (`generalOnlyAnswer`) belge çipi yok | `source-sections.ts`, `tutor-reply-view.tsx` |
| Deneme incelemesi "7 yanlışın deftere düştü" (1 yanlış + 6 boş) | Sayım `rowVerdictCounts`'tan: "7 soru tekrar defterine düştü (1 yanlış, 6 boş)" | `incele/page.tsx` |
| Bot düellosunda 1. sorunun süresi sorular gelir gelmez başlıyordu | Oyundan önce 3-2-1 geri sayım (`DUEL_COUNTDOWN_SECONDS`) | `duel-play.tsx`, `duel.css` |
| **Çizimli video**: formülde Türkçe yazı bozuk ("Genelfiyatdu¨zeyi"), süreç ağının kutuları boş ve etiketler altta bitişik ("DeflasyonDezenflasyonFiyatlar"), kilit bilgi "Dersi tamamla"ya ve sahne başlığına biniyor, ikinci formül alt yazının arkasında | TeX sözdizimi (`\`, `^`, `_`, `{}`) taşımayan adım **düz yazı** (`formulaStepHtml`); TeX'li adımdaki kelimeler `\text{}` (`textifyFormulaWords`; tek harfli değişken, iki harfli çarpım, komut ve sin/log dokunulmaz). Şema kuralları **bileşenin kendi dosyasında** (`diagram-card.css`): ders CSS'inde durunca videoda etiket katmanı konumsuz kalıyordu. Tahta bir ölçü kabı (`container-type: size`); içerik üst çubuğun **ölçülen** yüksekliğinden başlar (`--cp-top-h`, ResizeObserver; konu satırı iki satıra sarınca çubuk 137 px) ve alt yazının üstünde biter; çizimli sahnede alt yazı çerçevenin dibinde (`is-sketch`), şema kalan yüksekliğe göre daralır, formül satırları hiç esnemez (639 px yüksek pencerede 0 yüksekliğe eziliyordu); kilit bilgi çizimli sahnede tahtanın akışında, resimli sahnede üst kenarından yerleşir (`top: max(22%, 7.6rem)`); yatayda şema solda, metin sağda. Yazarın kelime hedefi 92-110 (denetim aralığı 72-110 aynı: alt sınır yükselirse düzeltme turu açılırdı); bekleme sözü "yaklaşık yarım dakika" (ölçülen 28-30 sn) | `math-text.ts`, `video-lesson.tsx`, `diagram-card.tsx`, `diagram-card.css`, `video-lesson.css`, `video-lesson.ts` `SKETCH_TARGET_WORDS` |
| Araçlar'da örnek konuya dokunmak üretimi hemen başlatıyordu (sayı/belge seçilmeden hak gidiyordu) | Dokunuş konuyu kutuya yazar ve düğmeye odaklanır; üretimi düğme başlatır | `studio-shared.tsx` `StudioEntry` |
| Tek sesli podcast özetinde "ADA / KEREM" | Yalnız konuşan sesler; tek seste satırlarda konuşmacı adı yok | `podcast-studio.tsx` |
| Yazılı denemede tanım sorusunun altında "Adım adım yaz; ara sonuçlarını göster"; "Klasik · 10 puan … 10 puan" | Yönerge kökten (`openAnswerHint`: sayı ya da hesap fiili varsa adım, yoksa "Kendi cümlelerinle, ana noktaları sırayla yaz"); puan bir kez | `mock-exam/labels.ts`, `exam-runner.tsx` |
| Doğru/yanlış: kurulum "Testi oluştur", stüdyo sonucu yalnız sayı | "Önermeleri hazırla"; sonuçta kaçırılan önermeler "Doğrusu" açıklamasıyla | `feedback-copy.ts`, `true-false-studio.tsx` |
| Kart adımının kurulum başlığı "Tekrar" (yolda "Kartlarla tekrar") | Aynı ad | `exam-prep-plan.ts`, `free-reach.ts` |
| **Sözlü seçilen konudan saptı ve başka adıma yazıldı** ("Enflasyon Türleri" seçildi; sorular üç konudan, kayıt ve odaklı pratik Para Politikası'nın adımına): pencere konunun kendi düğümü yoksa türün ilk bitmemiş düğümünü `?konu=` ile açıyordu; ad düğümün konusuyla tutmayınca kaynak hazırlık adıyla "genişletiliyordu"; içerik bir konuyu, bitirme düğümün konusunu okuyordu | **Tek konu eşleştiricisi** `topic-identity.ts`: kimlik önce (iki kimliği de tanır), ad yalnız kimlik bir tarafta yoksa; uzantı eşleşmesi tek satıra düşerse. Ders, test, D/Y, kartlar ve sözlüde pencere yalnız konunun **kendi** düğümünü açar, yoksa "Başka Bir Konu" ile aynı uçla kurar. İstemci seçilen konuları kimlikle gönderir (`oralTopicIds`): tek konu → o konunun kaydı ve sayfaları; birden çok → `scope: "topics"`, tek konuya kanıt yok. **Bitirme sorulan konuyu okur** (`testedTopicRow`): önerilen pratik, yol uyarlaması, tekrar, yanılgı ve Yanlışlar Defteri o konuya; kayıt açılan düğümde kalır. "Tüm sınav" ve çoklu konu tek konunun yolunu değiştirmez | `topic-identity.ts`, node rotası, `study-tools.ts`, `study-tools-hub.tsx`, `exam-node-session.tsx` |
| "Bilgi eksikleri" %88 alan sözlü cevabı eksik saydı, boş cevabı "Bilmiyorum" yazdı, öğrencinin ham cevabını başlık yaptı | Tek eşik `oral-sufficiency.ts` (%80 = sonuç ekranının "güçlü yanlar"ı); yanılgı, günü gelen tekrar ve kanıt aynı eşiği okur (kanıt önce yalnız %99+ doğru sayıyordu). Cevapsız soru yanılgı açmaz. Yeni satırın iddiası sorunun öğrenme hedefi; eski sözlü satırı ekranda soruyla başlık alır (`readableGap`) | `oral-sufficiency.ts`, `oral-exam.ts`, `learning-tracking.ts` |
| Kart sonucu oturumda "8/10 · %80", sonuç sayfasında "6/8 · %75" | Dersin kaçırılan soruları yalnız ekrana giden kopyaya ekleniyordu; not 8 kartlık listeyle. Not ve ekran aynı listeyi okur (`cardsAsShown`), liste kayda yazılınca donar (`freezeShownCards`); sunucu ekranla aynı sayımı kullanır (`answer-tally`); sonuçta "Bildiğin kartlar" | node rotası, `teaching-standards.ts`, `sonuc/page.tsx` |
| İlerleme ölçümle tutmuyordu ("Para Politikası 3 çözüldü" sözlü yanlış adımdaydı; Miktar Teorisi denemede çözülmüşken 0; "2 ders" yalnız 1 ders varken) | "N çözüldü", yüzde ve durum **kanıttan** (`masteryByPlannedTopic`; ad varyantları aynı konuya); etkinliğin konusu önce içeriğin sorduğu konudan, sonra kaydın konu satırından, en son düğümden. "x/N konu ölçüldü" İlerleme sekmesinde de. **"Ders" yalnız ders düğümü** (kartlarla tekrar, odaklı pratik, zayıf nokta sayılmaz; tempo ve "N ders daha" da) | `prep-progress-view.ts`, `prep-insights-load.ts`, `learning-tracking-persist.ts`, `exam-prep-progress.tsx` |
| Bitmiş dersin düz adresi "Ders oluştur" gösterip uyarısız yeni ders yazdırdı (ısınma da arkada yazım başlatıyordu) | Bitmiş dersin düz adresi kayıtlı dersi kredisiz açar (`opensSavedLesson`); yeni anlatım yalnız `?farkli=1` ("Farklı anlat", sonuç sayfası ve "kayıt bulunamadı" kartı) | `exam-prep-hrefs.ts`, `dugum/[nodeId]/page.tsx` |
| **"Tekrar incele" sonunda ders sonuç ekranı yerine 1. adımdan yeniden açıldı** ("Dersi tekrarla"da da aynı) | Ders bitince `router.refresh()` sunucu özelliklerini yeniliyor; `openAttempt` ve (bitmiş dersin düz adresinde) `reviewSaved` değişince açılış etkisi yeniden koşup `start({ review: true })` diyordu. **Açılış düğüm başına bir kez** (`openedForRef`); yarıda kesilen açılış yeniden koşabilir, tamamlanan koşmaz; özellik kapalı yol da aynı korumada. Yeni ders bitince sonuç ekranı kayıtlı derse dönmez | `exam-node-session.tsx` |
| **Yazılı deneme S4 kökü cevabı veriyordu** ("tarımsal verimsizlik sürerken …" → doğru şık "Tarımsal verimsizliğin … sürmesi"). Yapı kapısı soruyu yakalamıştı (tek sözcük 'ekonomideki'), ama `runTeacherQuiz` sayı eksik kalınca elenen soruları geri koyuyordu; geri konmayan tek sorun eşdeğer/aynı şıktı. Asıl ele verme çok sözcüklü öncüldü: tek sözcük denetimi "Tarımsal verimsizliğin azalması" çeldiricisi iki sözcüğü taşıdığı için susuyor, "sürerken"/"sürmesi" beş harflik kökte ayrı düşüyordu | Öncül ölçüsü `stemPhraseInAnswer`: kökte art arda üç içerik sözcüğü doğru şıkta aynı sırayla ve aynı kökle geçiyor, hiçbir çeldirici üçünü birden taşımıyor (tek genel sözcük dayanak değil; sıra şart). Kök `sameRoot`: ortak önek 5 harf, ya da kısa sözcük öneki, ya da 4 harf + uzun sözcük, ya da 3 harf + en çok 4 harflik ek. Kurtarma `salvageRejected`: cevabı kökte, anahtarı yanlış (hesap / açıklama / adımlar başka şıkka) ya da iki cevaplı (eşdeğer, aynı, ikiz eşik) soru **geri konmaz** (`UNSALVAGEABLE_PROBLEM`); tek sözcüklük ipucu eskisi gibi geri konabilir. **Son çare** (istek düşmez, 19 Ekim kararı): temiz adaylar ve ikinci geçiş sayıyı doldurmadıysa yalnız öncülü kökte olan soru geri konur (`lastResort`, günlükte `teacher_quiz.lastResort`); anahtarı yanlış, iki doğrulu ya da kökü doğru şıkkın kendisini içeren soru yine konmaz. Yazar ve denetçi E aynı `STEM_ECHO_RULE` | `lexical-overlap.ts`, `teacher-quiz.ts`, `teacher-quiz-run.ts` |
| Araçlar testinde S5'in cevabı S2/S4'ün doğru şıkkındaydı, S1 ile S3 aynı kalıpla aynı şeyi soruyordu: testin bütününe bakan kod (`quizSetIssues`) yalnız konu testinde (`scope: "topic_test"`) çalışıyordu | Bütün testlerde (Araçlar, düello, deneme, odaklı pratik …) `questionConflict`: neredeyse aynı kök; aynı kalıp + aynı konu (Jaccard ≥ 0,5); aynı doğru cevap **ve** aynı konu (aynı sınıfın iki ayrı durumu serbest); birinin doğru şıkkı (≥ 4 sözcük) öbürünün kök + cevabının %75'ini taşıyor. Konu testinde yumuşak, öbürlerinde elenir; ikinci geçiş ve kurtarma çakışanı almaz (`appendWithoutConflicts`). Yazar + denetçi `TEST_SET_RULE` | `teacher-quiz.ts`, `teacher-quiz-run.ts`, `teaching-rubric.ts` |
| Düelloda "aylık %50'yi aşması" kökünde "Aylık %50" ve "Aylık %50'nin üzeri" iki şıktı; "aralık uçları" kuralı yalnız tek aralığı söylüyordu, kod bakmıyordu | `thresholdTwinOptions`: aynı sayılar, aynı kalan sözcükler, biri yalın öbürü yönlü (ya da iki farklı yönlü söz: "en az" / "üzeri"); zıt yön ("üzeri"/"altı", "önce"/"sonra") ve simgeli eşitsizlik (`x > 5` / `x ≥ 5`) serbest. Ders içi soru ve testte aynı liste, geri konmaz. Yazar + denetçi `THRESHOLD_OPTIONS_RULE` | `question-integrity.ts`, `teaching-rubric.ts` |
| Ders içi soru endeks sorarken şıklarda "Dezenflasyon", "Stagflasyon": "sorulan kategoriden" kuralı yalnız test yazarında, `MULTI_DISTRACTOR_RULE` yalnız çok cevaplıda | `SAME_KIND_DISTRACTOR_RULE` ders ve test yazarında, iki denetçide aynı metin. Modelsiz işaret `offKindDistractors`: kökün sorduğu tür ("hangi X", "X hangisidir") ve şıkkın türü kaynağın tanım cümlesinden ("TÜFE, … bir endekstir"; virgüllü tanım, sıfat yüklem sayılmaz); yalnız doğru cevabın türü tutunca konuşur. Testte (belgeli) soru elenir, kurtarılabilir; derste 'medium' | `distractor-kind.ts`, `teacher-quiz.ts`, `teacher-lesson.ts` |
| Derste aynı bilgi bir ekranda beş biçimde (metin, tuzak kartı, çivi, tablo, kaydırma), soru üstteki cümlenin aynısı, aynı tanım iki kez: `repetitionIssues` yalnız ekranlar arasına bakıyordu. Ayrıca **tek geçişten (26 Ekim) beri canlı ders yolu yapı denetimini hiç çağırmıyor** (`partStructureIssues` yalnız testte; canlıda yalnız `dropRepeated*` ve `settleCheckKeys` iş görüyor) | Ekran içi ölçü (`screenEcho`, `screenTwinSentence`, `echoedCheck`): cümlenin içerik sözcüklerinin %85'i aynı kökle; bir cümle kendi bloğu dışında **iki** blokta daha (görsel kart tek tekrarı tasarım gereği serbest). 'medium' ve canlıda `teacher_lesson_teaching_flags` günlüğü (sayı; metne dokunulmaz). Ölçütün 1. maddesi: "bir bilgi ekranda en çok iki biçimde". Düşürme ya da yeniden isteme ürün sahibinin kararı | `teacher-lesson.ts`, `teacher-lesson-run.ts`, `teaching-rubric.ts` |
| Kartlarda 1, 2, 6 ve 3, 4 aynı bilgi; "MV = PY"nin her harfi ayrı kart: kart motorunda deste düzeyinde denetim yoktu, sondaki %70 süzgeci sayı eksilince kopyayı geri koyuyordu, ek tur yalnız ön yüz birebir aynıysa eliyordu | `sameCardFact` (ön + arka yüz sözcüklerinin %75'i aynı kökle — ters çevrilmiş kart dahil; ya da kısa cevap aynı ve ön yüzler aynı şeyden söz ediyor; sayısı farklı kart ayrı), `formulaLetterCard` (aynı formülün ikinci harf kartı). Döngüde eksik sayılır, ikinci taslak desteyi görür; ek tur `mergeDistinctCards`. Yazar + denetçi F `CARD_DISTINCT_RULE` | `teacher-cards.ts`, node rotası, `flashcards/generate` |
| D/Y'de "Deflasyon … düşmesidir" (D) ile "Deflasyon, enflasyon oranının düşmesidir" (Y) aynı sette: `sameTrueFalseFact` bütün cümlenin anahtarına bakıyordu (2/4 = 0,5; doğru hâli "Enflasyon oranının düşmesi dezenflasyondur" 1/4; eşik 0,75) | Aynı öznenin iki tanımı çifttir (`sameDefinedSubject`): virgülden önceki sözcükler (yoksa ilk sözcük; "normal", "ilk" gibi niteleyici özne değil), ikisinin yüklemi de tanım (eylem adı + ek-fiil "-mesidir/-masıdır/-medir/-ışıdır" ya da "bir … -dir"). İkinci taslak seti görür. Yazar + denetçi F `TRUE_FALSE_PAIR_RULE` | `true-false-quality.ts`, `teacher-practice.ts` |
| "Tekrar incele" ve "Dersi tekrarla" her bitişte yeni yıldız veriyordu (yıldız deneme kimliğiyle; tekrar her seferinde yeni deneme açıyor) | Kayıtlı içeriğin tekrarı (`reviewed` / `replayed`) düğüm başına **günde bir kez** yıldız (`prepStarRef`: `review:<düğüm>:<İstanbul günü>`); yeni yazılan içerik eskisi gibi deneme başına | `stars/rules.ts`, node rotası |
| #424 yayındayken canlı Araçlar testinde yine başka türden çeldirici: "hangi enflasyon maliyetidir?" şıklarında reeskont oranı, politika faizi; "Bu enflasyon hangi türdendir?" şıklarında deflasyon, dezenflasyon. Kod türü yalnız kaynağın tanım cümlesinden okuyordu ve kökün türünü ad öbeğinin İLK sözcüğünden alıyordu (test denetçisi 26 Ekim'den beri yok; kural yalnız yazarda) | Türkçede türü **son sözcük** söyler (`askedKind`: "hangi enflasyon maliyetidir" → maliyet; "Bu X hangi türdendir" → X). **Tür adı şıkta** yazıyorsa kaynak gerekmez: doğru cevap ve en az bir kardeşi tür adını taşıyorsa ("Menü maliyeti", "Ayakkabı eskitme maliyeti") taşımayan çeldirici işaretlenir; belgesiz testte de. Doğru cevap taşımıyorsa ya da kardeş yoksa susar | `distractor-kind.ts`, `teacher-quiz.ts` |
| #426 yayındayken yeniden üretilen Araçlar testinde yazar türden olmayan şıkları atınca kardeş **uydurdu**: "Açık piyasa maliyeti", "Reeskont maliyeti", "Politika faizi maliyeti" (kaynakta yalnız iki enflasyon maliyeti vardı) | Belgeli testte tür adını taşıyan ama bütün öbeği kaynakta geçmeyen çeldirici işaretlenir (`inventedKindSiblings`, sözcük kökleriyle; doğru cevap kaynakta geçmiyorsa susar); kurtarılabilir, A-G gibi kesin değil. `SAME_KIND_DISTRACTOR_RULE`: "Kardeş TERİM UYDURMA … kaynakta yeterli gerçek kardeş yoksa soruyu başka bir ayrım üzerine kur". "örneğidir" gibi yumuşamış genel sözcükler tür sayılmaz | `distractor-kind.ts`, `teacher-quiz.ts`, `teaching-rubric.ts` |
| **Soğuk podcast ~90 sn** (Astra 43). Ölçüm (canlı model, hızlı işlem, dört konu: makroekonomi, muhasebe, algoritmalar, kardiyoloji; kayıtlar `ai_usage_events`'le aynı biçim): hat tamamen sıralı — senarist taslağı 11-17 sn, denetim 21-38 sn, varsa düzeltme 6-12 sn + ikinci **tam** denetim 24-29 sn, dinleme kontrolü 13-15 sn; yayım 37-93 sn, kontrolle 50-107 sn | **Kontrol yayımdan sonra** (öğrenci beklerken): podcast `checkPending: true` ile yayımlanır, kontrol yanıttan sonra normal işlemde yazılır, açık kayda ve önbelleğe girer (`fillPodcastCheckLater`); oynatıcı bitince `progress` ile alır (en çok 4 × 2,5 sn), gelmezse podcast kontrolsüz biter. Önceden yazımda kontrol bugünkü gibi birlikte; kontrolsüz bölüm önbelleğe yazılmaz kuralı korunur. **Düzeltmeden sonraki denetim yalnız değişen satırlara** (`podcastFocusNote`; aynı sistem istemi, bütün podcast bağlam): A/B'de enjekte hata 4/4 ikisinde de yakalandı, süre 17-29 sn → 2,7-10,4 sn. Yalnız öğrenci beklerken (`urgent`); önceden yazımda bütün podcast yeniden denetlenir (tam denetim değişmemiş satırlarda da yeni bulgu çıkarabiliyor: bilinçli bedel). **Bandın 5 puan içindeki konuşma payı** ("Kerem %51") tek başına tur açmaz, `balanceKerem` dengeler (ölçümde böyle bir tur 10 + 12 sn sürdü, düzeltici satırların çoğunu yeniden yazdı); uzak sapma ve doğruluk sorunu yine açar. Sonrası aynı dört konu, iki koşu: yayım 32-66 sn (önce 37-93 + kontrol), ilk ses buna ek ilk bölümün sesi (~3-5 sn). Asıl çözüm önceden yazım (aşağıdaki satır) | `teacher-podcast-run.ts` (`deferListeningCheck`, `focusedReviewLines`, `roundOpeningProblems`), `podcast-check-later.ts`, `podcast-check.ts` `awaitPodcastCheck`, node rotası `schedulePodcastCheck`, `podcast/route.ts` |
| Bir sonraki ders ancak önceki konunun son adımında, yoldaki podcast öğrenci ona varınca önceden yazılmaya başlıyordu (2 adımlık pencerede yalnız ilk hazırlanabilir adım yazılıyordu; podcast hep ikinci sırada) | Ürün sahibinin kararı: yolda **iki ders önceden**. `prefetchTargets`: penceredeki ilk adım + penceredeki podcast (`SLOW_PREFETCH_KINDS`) + sıradaki iki ders (aradaki adımlar sayılmadan); istekler aynı anda. Ücretsizde Plus adımı seçilmez, ücretsiz haftalık ders hakkı biterse rota ders yazmaz; kuşak/aşinalık ve konu testinin ders anahtarı kuralları değişmedi. Bedel kayıtlardan (27-30 Ekim, normal işlem): önceden yazılan ders ~$0,007-0,008, podcast senaryosu ~$0,010; hiç açılmayan iki ders terk edilen hazırlık başına en çok ~$0,016. Bugün bekleyen ve 2 günden eski açılmamış önceden yazım: 12 podcast, 7 ders, 16 test | `lesson-prefetch.ts` (`LESSON_LOOKAHEAD`, `requestNextPrefetch`, `requestPrepPrefetch`) |
| **Roller karışıyordu**: Kerem "Neden …?" diye sorup ardından "Çünkü …" diye kendisi cevaplıyordu; podcast tanımla açılıyordu ("Enflasyon, … artmasıdır"). Senarist `DUO_TURN_RULE`'u okumuyordu (kısa bir özeti vardı); açılış kancası eski yazarda tek satırdı, senaristte hiç yoktu; "Kerem bir merakla açar" ile "konuşmayı Ada açar" çelişiyordu. `balanceKerem` ve `scriptToDraft` suçsuz (soru biten sırayı taşımıyor, satırları yeniden atamıyor) | `DUO_TURN_RULE` senaristte **aynen** (+ "Soru, sıranın son cümlesidir; ardından 'Çünkü …' gelmez"); `OPENING_HOOK_RULE` senarist + eski yazar + denetçi J. Kod ölçer, metne dokunmaz, tur açmaz: `turnShapeProblems` (kendi sorusunu cevaplayan, bir sırada iki soru), `definitionOpening`; `teacher_podcast` günlüğünde `flow` sayıları. Canlıdaki 31 podcast'te: 2 kendi-cevap, 2 tanımla açılış, 1 çift soru. Senarist istemi 5.400 → 6.460 karakter (bekçi tavanı 6.600) | `podcast-formats.ts`, `podcast-script-writer.ts`, `teacher-podcast.ts` |
| "4 büyük kare" ekranda "4 büyük²" oldu (EKG podcast'i): gösterim çevirici tek harf tabanı sözcüğün son harfinden alıyordu; denetçi bozuk yazım (E) dedi, düzeltme reddedilince kurtarma beş satırı sildi | Taban bütün sözcük; sayıdan sonra tek "kare/küp" yalnız işlem içindeyse üs ("3 kare artı 4 kare"), "64 kare vardır" ad kalır; "x kare", "10 kare küp" yine simge | `speech-normalizer.ts` `recoverSmashedPowers` |
| Araçlar "Enflasyon Türleri" özetinin üç bölümünden ikisi aynı sayfadaki "kimler kazanır" ve "maliyetler" kısmıydı: sayfa doğru seçiliyordu (konu haritası sayfanın bir kısmını konuya bağlıyor), yazar sayfanın tamamını anlatıyordu. Ayrıca dosya adı isteği içerince ("Ekonomi-Enflasyon-ve-Para-Politikasi.pdf" + "Para Politikası") belgede aynı adlı konu varken belgenin tamamı gidiyordu | Konu istendiyse yazara kapsam satırı (`topicScopeLine`, `KAPSAM:`): başka başlıklar bölüm olmaz, kapsama kuralı yalnız konunun kısımları için. Dosya adı ancak istek belgenin bir konusuna uymuyorsa "tamamı" | `generation-context.ts`, `studio-teacher-source.ts`, `podcast/generate/route.ts` |
| **Akan testte cevap başka soruya notlanıyordu** (#429 yayındayken canlı "İkinci test": ekran 0/5, sunucu 1/5): ekran yeni kökleri kendi listesinin sonuna ekliyor, cevaplar soru numarasıyla kaydediliyor; sunucunun son listesi ise taslak sırasıyla, çok cevaplı sonda, bazı sorular elenmiş | Son liste öğrenciye **gösterilen sırayla ve gösterilen hâliyle** başlar (`alignToPublished`); gösterilen soru sonradan elense de yerinde kalır, kalanlar son listenin sırasıyla arkadan. Test motoru gönderdiklerini kaydeder (`published`) | `quiz-delivery.ts`, `teacher-quiz-run.ts` |
| Aynı canlı testte 5 sorudan 4'ünün doğru cevabı "Enflasyon": çift çift bakan denetim "aynı sınıfın iki ayrı durumu" diye geçiriyordu (yazar kuralı "iki soru aynı cevaba çıkmaz" diyordu) | Aynı doğru cevap bir testte **en çok iki soruda** (`MAX_SAME_ANSWER`; `quizSetIssues` I, ikinci geçiş ve kurtarma `appendWithoutConflicts`); son çarede sınır yok (istek düşmez). Yazar kuralı cevabı dağıtmayı söyler (ölçüsü, nedeni, sonucu, karıştırılan kardeşi) | `teacher-quiz.ts`, `teaching-rubric.ts` |
| #428 yayındayken soğuk yol podcast'i "Miktar Teorisi" konusunda aynı sayfadaki tahvil işlemleri, reel faiz ve Phillips eğrisini de bölüm yaptı: kapsam satırı yalnız Araçlar podcast'indeydi | Yoldaki ve hazırlık sayfasındaki **belgeli** podcast de kapsam satırını alır (`prepTopicScopeLine`; "Tüm konular" adımı hariç) | `generation-context.ts`, `node/podcast.ts`, `exam-prep/podcast/route.ts` |

Değişmeyen (bilerek): Araçlar'daki "İnteraktif Simülasyonlar" sekmesi onaylı 12 araçtan üçü (birim çember, parabol,
hücre); kapalı tutulan /lab ile çelişmez.

Bekçi: `konu-kimligi.test.ts`, `canli-tur-30-ekim.test.ts`, `podcast-hazir-yol.test.ts`, `duello-geri-sayim.test.tsx`,
`video-tahta-30-ekim.test.tsx`, `arayuz-30-ekim.test.tsx`, `olcum-konu-bagi.test.tsx`, `acilis-bir-kez.test.tsx`,
`uydurma-kardes.test.ts`, `podcast-hiz-30-ekim.test.ts`, `akan-test-sirasi.test.ts`, `ayni-cevap-siniri.test.ts`, `yol-podcast-kapsam.test.ts`.

Açık (göçsüz): eski sözlü yanılgı satırları eski konu adıyla duruyor; hazırlık yüzdesi (`buildLearningIndicators`) ad varyantlı eski kanıtı birleştirmiyor (yeni kanıt doğru adla yazılır).

## Yol etkinliği hattının düzeni (30 Ekim 2026) — etkinlik başına modül, tek yaşam döngüsü

Ürün sahibi: "yamalayarak değil; bir yeri yapıyoruz öbür yer bozuluyor". Rota (`exam-prep/node/route.ts`, 4.833 satır)
ve oturum ekranı (`exam-node-session.tsx`, 2.901 satır) her paketin yamasını taşıyordu. Davranış değiştirmeden bölündü:
rota 46, ekran 53 satır. **Kurallar bundan sonra modülde durur; ana dosyaya geri yazmayın.**

| Yer | Ne | Dosya |
|---|---|---|
| Rota | Yalnız `POST` (imzalı önceden yazım isteği `after` ile) + `maxDuration = 300` | `route.ts` |
| Ortak kabuk | Gövde, hazırlık ve düğüm okuma, kilit, `choose`, konu, seçimler; dönen bağlam her eyleme | `node/context.ts` |
| Yönlendirici | Eyleme göre tek modül (`switch`); yeni eylem = yeni `case` + yeni modül | `node/handler.ts` |
| Eylemler | warm, review, grade-check, progress, resume, save | `node/actions/*.ts` |
| Bitirme | Notlandırma → yol → RPC → yanılgı → iz → defter → tekrar → yıldız; sahiplik ve saklı sonuç ayrı | `node/complete.ts`, `node/completion.ts` |
| Açılış | Sıra `start.ts`'te; aşamalar: yerel oturum → tekrarla/incele → süren ders → hazır içerik → kaynak → kayıt+kredi → üretim | `node/start.ts`, `local-session`, `replay`, `lesson-adopt`, `prefetched`, `source`, `reserve`, `generation` |
| Türün üretimi | `generateNodePayload` türe göre motora | `node/generate.ts` → `lesson`, `quiz`, `cards`, `true-false`, `podcast`, `oral` |
| Ortak | kredi kodu, hata sınıfı, `after` sarmalayıcıları; öğrenciye giden gövde; puan | `node/shared.ts`, `payload.ts`, `score.ts` |
| Ekran | Yaşam döngüsü tek kancada; her tür kendi çizim bileşeninde, eski kardeş sırasıyla | `exam-node/use-node-lifecycle.ts`, `exam-node/*.tsx` |

**Bir etkinliğe dokunurken:** ders → `node/lesson.ts`, `lesson-adopt.ts`, `actions/grade-check.ts`, `exam-node/lesson.tsx`;
test → `node/quiz.ts`, `exam-node/quiz.tsx`; kartlar → `node/cards.ts`, `exam-node/cards.tsx`; doğru/yanlış →
`node/true-false.ts`, `exam-node/true-false.tsx`; podcast → `node/podcast.ts`, `exam-node/podcast.tsx`; sözlü →
`node/oral.ts` (+ hakem `complete.ts`'te), `exam-node/oral.tsx`; odaklı pratik / son kontrol / hazır olma / boşluk →
`node/local-session.ts`, `exam-node/local-session.tsx`; yazılı deneme → `node/written-review.ts`, `actions/review.ts`.

| Kural | Neden |
|---|---|
| Aşama, kayıt kimlikleri, cevap kuyruğu ve **bütün istekler** kancada; çizim bileşeni durum tutmaz, istek atmaz | Açılış etkisi `router.refresh()` sonrası yeniden koşup "Tekrar incele"yi başa sarıyordu: açılışın tek yeri olsun (`openedForRef`, düğüm başına bir kez) |
| Açılış aşaması erken yanıt için `Response`, yoksa ürettiği değerleri döndürür; sıralayıcı aynı yerel değişkenlere yazar | Aşamalar arası değer akışı tek yerde okunur; bir aşama öbürünün yerelini değiştiremez |
| Rota dosyası yalnız `POST`, `maxDuration` dışa aktarır; `NODE_MAX_DURATION_SECONDS` aynı 300 | Next.js başka adı reddeder; bitirme sahipliği bu süreden bayatlar |

Sözleşme testleri: `node-route-contract.test.ts` (eylem × tür: yanıt, veritabanı çağrılarının sırası ve alanları, RPC,
motor girdileri, `after` işleri, günlük satırları — anlık görüntü; değişirse sözleşme değişmiştir, `-u` ancak bilerek),
`node-session-lifecycle.test.tsx` (açılış bir kez, yenilemede aşama, bitir → sonuç, bekleme ve yoklama, tekrarla),
`node-modules-layout.test.ts` (düzen). Kaynak okuyan bekçiler `tests/unit/helpers/node-sources.ts` → `readSource` ile
okur: `route.ts` ya da `exam-node-session.tsx` istenince dosya ve modül klasörü birlikte döner.
