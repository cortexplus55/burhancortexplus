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
| `/admin/ogretmen-basvurulari` | Duruyor ama **yeni başvuru gelmiyor** — form ve API kaldırıldı. Karardan önce gelmiş 1 bekleyen kayıt var. |
| `parent_payment_requests` | Yaşıyor ve öğrenci tarafı: "veliden ödeme iste". Astra'da bu yok, bizde çalışıyor — bilerek duruyor. |
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
| Günlük hak **6 kredi** (8 Ekim'den beri; önce 2) = bir ders ya da iki sohbet mesajı; her şey aynı haktan | `credit_reserve` (göç `20261008120000`), `period.ts` |
| **Bir** sınav hazırlığı ("Hedef puan" kaydı sayılmaz); ders seçilince kapı | `free-prep-limit.ts`, sihirbaz + sohbet + okul kopyası |
| Hesap başına **toplam 5 sayfa** belge işleme (silinenler dahil); fazlası işlenmez, "ilk N sayfa işlendi" yazar | `free-pages.ts`, `pdf-ingestion.ts`, `pipeline.ts`, `documents.source_page_count` |
| Resim sayfası hakkı dolunca belge **reddedilmez**; o sayfalar atlanır | `scan_pages_skipped` |
| Konu haritası, kurulum sohbeti ve ücretsizde belge işleme **ders hakkından yemez** | `generateJson({ chargeCredits: false })` |
| Kapıda geri sayım + "neden ücretsiz değil" | `upgrade-sheet.tsx` |

Sayılar tek yerde: `src/lib/billing/free-tier-copy.ts`. Kampanya bandı kurulmadı
(karar: şimdilik değil; `/admin/promosyonlar` hazır). Bekçi: `free-tier.test.ts`.

**Ücretsiz akışı denemek için test hesabı açmayın:** `/admin` → "Ücretsiz gibi gör"
(8 Ekim 2026). Kurucu hesabı o an ücretsiz öğrenci gibi sınırlanır: günde 6 kredi
(kredi sistemi v2'den beri; önce 2) ayrı bir tabloda düşer (cüzdana dokunmaz), belge ve hazırlık sınırı yalnız önizleme
başladıktan sonra eklenenleri sayar. Kapatma düğmesi öğrenci ekranlarının üstündeki
şeritte. Yeni bir yönetici muafiyeti eklerken `isAdminUser` değil `billingExempt`
kullanın, yoksa önizleme o noktada sınırı atlar. Bekçi: `free-preview.test.ts`.

## Kredi sistemi v2 (8 Ekim 2026) — 1 kredi = $0,001, Plus ayda 7.200

Ürün sahibinin kararı: tek sayaç, **Astra'dan fazla kullanım**, yoğun öğrencide
**%50 kâr**. Astra Plus canlıda ölçüldü (1 mesaj aylık hakkın %0,05'i → ≈2.000 mesaj;
1 ders %0,26–0,45 → 220–380 ders); bizde Plus ayda 2.400 mesaj ya da 1.200 ders.
Hesap, tablo ve kararlar: `docs/delivery/KREDI-SISTEMI.md`.

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
sahibinin kararları: ders ~10 sn'de açılsın, kalite düşmesin; **hızlı işlem (Fast mode) öğrenci
beklerken herkese** (önce yalnız Plus'tı; canlıda ücretsiz öğrencinin ilk ekranı 18 sn çıkınca aynı
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
| Her açılış yoldaki sıradaki hazırlanabilir etkinliği yazdırır (ders, test, doğru/yanlış, kartlar, podcast, sözlü; en çok 3 adım ileri). Zayıf nokta, odaklı pratik, son kontrol, aralıklı tekrar kayıtlardan anında kurulur — önceden yazılmaz | `PREFETCH_KINDS`, `requestNextPrefetch` (rotada tek tetik) |
| Hazırlık kurulunca ve hazırlık sayfası her açıldığında "Sıradaki" hazır değilse yazılır | `requestPrepPrefetch` |
| Önceden yazım kredisiz (`charge: false`, kullanım `LESSON_PREFETCH` / `CONTENT_PREFETCH`); kredi açılınca düşer | ders, test, kart, podcast, sözlü kabukları |
| Hazır içerik yalnız seçim anahtarı tutarsa verilir (zorluk; podcast süresi; sözlü soru sayısı, konu, öğretmen tipi); tutmazsa atılır, yeniden yazılır | `prefetchVariant` |
| Aşinalık kurulumda bir kez sorulur, bütün konulara yazılır; açılışta sorulmaz ("Düzey: … · Değiştir"). Ruh hali **günde bir kez** sorulur (19 Ekim 2026; bugün verildiyse kart atlanır, `todayMood`), yalnız kaydedilir — içerik üretimine nötr gider (sözlüde öğretmen tipi kalır) | `exam-create-wizard`, `exam-create-chat`, `create/route.ts` |
| "Dersi tekrarla" aynı dersi yeni kayıtta açar (anında, kredisiz, şıklar başka sırayla); "Farklı anlat" yeniden yazdırır | `lesson-replay.ts`, `?tekrar=1` |
| Önceden yazılan podcast önbelleğe girmez (açılmadan ücretsiz dinlenmesin) | `writePodcastCache` koşulu |
| **Isınma (19 Ekim 2026):** öğrenci ders düğümünü açıp ruh hali / aşinalık ekranına gelince istemci bir kez `action: "warm"` ister; sunucu yazımı hemen, **hızlı işlemle** ve kredisiz başlatır (bitmiş düğüm de — "Farklı anlat"; yalnız süren kayıt ya da hazır/taze yazım varsa atlar); "Ders oluştur" yazımı süren dersi devralır. Ölçüm: soğuk ilk ekran 13-15 sn'nin ~2,8 sn'si rota, 7,8 sn'si motor (ilk jeton 3,8), kalanı yanıt/çizim; kartlarda geçen 5-10 sn yazıma kazandırılır | `requestNodePrefetch(…, { warm: true })`, `nodeHasOpenAttempt`, `exam-node-session.tsx` ısınma etkisi |

Takılı yazım: 120 sn ilerlemezse ders olduğu kadarıyla kapanır, kredi iade (`lesson-build.ts`).
Hızlı işlem kullanımı `gpt-6-luna-fast` adıyla kayda geçer (göç `20261018120000`). Bekçi:
`lesson-stream-pipeline.test.ts`, `lesson-building-ui.test.tsx`, `lesson-prefetch.test.ts`.

**Astra ile yan yana, 18 Ekim 2026 (aynı Pediatri hazırlığında ölçüldü):** Astra'da soğuk ders
43,5 sn (tamamı birden), ders sonu testi 0,3 sn (dersle birlikte yazılıyor), podcast 43 sn; "Sıradaki"
ders önceden yazılmıyor. Bizde hazır ders 3 sn, hazır test 1,3 sn, soğuk dersin ilk ekranı 15-19 sn.
Ürün sahibi: "Astra'ya bakarak bütün düzeltmeleri ona göre yap".

| Kural | Nerede |
|---|---|
| **Yol sırayla açılır** (#107'deki "kilit bir öneridir" kararı geri alındı): kilitli adım yoldan tıklanınca açılmaz, alt kart "Bu adım, öncekileri bitirince açılır" der; adresi açılırsa hazırlık sayfasına seçili döner; uç `node_locked` verir. Yalnız önceden yazım kilitli adımı yazar | `studyNodeOpenable`, düğüm sayfası, `exam-prep-home.tsx` |
| Başka etkinlik "Başka birini seç" / "+" ile: seçim kilidi kaldırır (`action: "choose"`). Sözlüden sonraki önerilen pratik, konu seçimi ve tanı da seçili adımı açar. Yazılı deneme her zaman açık | `chooseStudyNode`, `study-tools-hub.tsx` |
| Sıradaki kartta türden başka başlık yoksa konunun adı; biten adımda yüzde ("%40 · Konu testi") | `nodeHeading`, `nodeScores` |
| Son iki puanlı sonuç %50 altı → "Bu hazırlık sana fazla zor gelebilir", ikisi %90+ → "kolay gelebilir"; seçim bütün konuların aşinalığını bir basamak kaydırır, hazır bekleyen içerik atılıp yeni düzeyde yazılır | `prep-level.ts`, `/api/learning/exam-prep/level` |
| Hazır içerik yokken test, kart, podcast, sözlü, doğru/yanlış da hızlı işlemde (soğuk podcast 85 sn idi); önceden yazım ve yazılı denemenin parçaları normal. Test taslağı ve düzeltmesi `reasoning_effort: low` (19 Ekim 2026; soğuk test 30 sn, Astra ~15), soruyu kendisi çözen denetçi varsayılan | `teacher-tier.ts` |
| **Öğretmen gözü**: belge yüklenince (ve hazırlık kurulunca eksikse) öğretmen analizi çalışır, her konuya 3-6 "Sınavda sorulur" maddesi çıkarır (belgenin SINAV İPUCU / AKILDA TUT / ALARM kutuları, tablolar, eşikler; her sayı kaynakta olmalı). Ders, test, podcast, kartlar, doğru/yanlış ve sözlü aynı maddeleri okur; ders denetçisi kavramına ait madde eksikse ya da yanlış aktarıldıysa `high` yazar. Analiz öğrenciden kredi düşmez. 7 Ekim'den (#146) beri yeni hazırlıklarda çalışmıyordu, motorlar 2-3 Ekim'den beri okumuyordu | `exam-points.ts`, `teacher-brain.ts` `examPoints`, `ensureTeacherAnalyses` |
| **Renkli vurgu ve ezber kodu**: sınavda soru olacak kesin bilgi `==…==` (turuncu işaret, ekran başına en çok 2; kod 3'ten fazlasını yapı kuralı sayar); terimler yine `**koyu**` (renksiz — paragraf alacalı olmasın). Belgenin kutuları derste kendi rengiyle: "Sınav ipucu" (`tone: exam`, turuncu), "Akılda tut" (`remember`, yeşil), "Alarm bulguları" (`warn`). Ezber kodu `tone: mnemonic` (mor), kavram başına en çok bir, yalnız kaynaktaki öğelerden; denetçi I maddesi. `==` içi boşlukla başlayamaz ("a == b" vurgu değil); düz metne çevrilirken `stripEmphasis` | `EMPHASIS_RULE`, `lesson-board.ts`, `lesson-chrome.ts`, `exam-lesson-steps.css` |
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
