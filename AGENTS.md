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

## Ürün öğrenci-only — veli ve öğretmen paneli yok

**`3e666f6` (29 Ağustos 2026)** veli ve öğretmen arayüzünü tümüyle emekli
etti: `/ogretmen-paneli/*`, `/odevlerim/*`, `/onboarding/veli`,
`/onboarding/ogretmen` silindi, kayıt sihirbazından veli/öğretmen adımları
çıkarıldı, `/ogretmenler-ve-profesorler-icin` `/kayit`'e yönlendirmeye
dönüştü. "Veli tarafını düzeltelim" denince önce bu satır okunmalı.

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
oldu. Gönderilecek talep hazır: `cortex-plus/docs/delivery/PAYTR-DESTEK-TALEBI.md`
— dört soru ve her cevabın ne değiştireceği yazılı. Yazılı cevap gelmeden
Direkt API'ye geçilmiyor ve sözleşme metnine dokunulmuyor.

## Satıcı bilgileri: iki alan bilerek yayınlanmıyor

Vergi levhasından girildi (`src/lib/legal/seller.ts`): **Mukadder Önder**,
şahıs işletmesi, Bafra / Samsun, vergi dairesi **Bafra**, iletişim
`cortexplus@cortexplus.app`.

**Yayınlanmayanlar — ürün sahibinin kararı, eksiklik değil:**

| Alan | Neden |
|---|---|
| Vergi kimlik numarası | Şahıs işletmesinde bu numara T.C. kimlik numarası; herkese açık olması gerçek bir gizlilik riski. Vergi dairesi gösteriliyor. |
| Telefon | Kişisel numara yayınlanmak istenmedi; iletişim e-posta üzerinden. |

İkisi de `ACCEPTED_OMISSIONS` altında gerekçesiyle duruyor ve
`missingSellerFields()` bunları eksik saymıyor — saysaydı hukuki sayfaların
başında sürekli kırmızı uyarı dururdu ve uyarı anlamını yitirirdi. Kabul
edilen risk: bir denetimde eksik sayılabilir. "Neden telefon yok" diye
sorulduğunda cevap bu satırdır.

---

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

---

## Mobil düzen: dört kural ve bir ölçüm aleti

**17 Eylül 2026.** Ürün sahibi telefonda "üst üste binmeler, eksik parçalar,
sol tarafa sıfır olmuş yazılar" bildirdi. 360/390/430px genişliklerde gerçek
tarayıcıda ölçüldü; dördü de tek tek bulundu ve kaynağından kapatıldı.

**1. Grid kolonu `minmax(0, 1fr)` olmak zorunda.** `.cp-page` grid'inin örtük
`auto` kolonunun tabanı `min-content`. İçerikte kırılamayan uzun bir dizi
varsa (belge adı, bağlantı, konu başlığı) kolon o dizinin genişliğine
zorlanıyor: 360px ekranda kolon 438px çıkıyordu ve sayfadaki 33 öğe ekranın
dışına taşıyordu. Aynı tuzak flex çocuklarında `min-width: auto` olarak var.

**2. Dokunmatikte metin girdileri 16px'in altına düşemez.** iOS Safari,
16px'ten küçük yazı tipli bir girdiye dokunulduğunda sayfayı kendiliğinden
yakınlaştırıyor — düzen büyüyor, öğeler üst üste biniyor, odak kalkınca sayfa
yana kaymış kalıyor. Ölçümde dokuz girdi 13-15px arasındaydı, sohbetin ana
yazma alanı dahil. Kural `src/app/globals.css` → `@media (pointer: coarse)`
içinde ve `!important` ile yazılmış olmak **zorunda**: sınıf seçicileri eleman
seçicisini yeniyor, yoksa `.tool-input { font-size: 0.9375rem }` kazanır ve
hata sessizce geri gelir.

**3. Dokunma hedefi asgarisi 44px.** Ölçümde paylaşılan `Button` 32px,
`Input` 32px, kabuğun tüm üst gezinmesi 34px, "Daha fazla" 20px çıktı. Kural
aynı `pointer: coarse` bloğunda; kabuğa özgü olanlar `parity-shell.css` ve
`learning-studio.css` içinde. Masaüstünde değişmiyor.

**4. Uzun dizi her yerde kırılabilir olmalı.** `overflow-wrap: anywhere`
(`break-word` değil — yalnızca `anywhere` min-content tabanını da düşürür).
Sohbette bu eksikti: mesaj listesi 360px ekranda 417px'e ulaşıp yatay
kaydırılabilir hâle geliyordu, ekranda ise kelime ortadan kesik görünüyordu.

**Ölçüm aleti: `cortex-plus/scripts/mobile-audit.mjs`.** Üç genişlikte yatay
taşmayı, kenardan taşan ve kesilen öğeleri, kenara yapışan yazıyı, üst üste
binmeyi ve küçük dokunma hedeflerini sayıyla veriyor. Kullanımı:

```bash
npx next dev -p 3005 &
node scripts/mobile-audit.mjs / /fiyatlandirma /mobil-onizleme
```

> **Aletin kendisi üç kez yanlış ölçtü; üçü de kodda yazılı.** Bir denetim
> aracının en tehlikeli hâli sessizce yanlış olmasıdır: (a) görünürlük elle
> hesaplanınca kaydırmayla açılan bölümler "üst üste binmiş" sanıldı —
> `checkVisibility` ve önce sayfayı kaydırmak gerekiyor; (b) Playwright'ın
> `isMobile` ayarıyla `window.innerWidth` 360 yerine 459 bildiriyor, ölçüm
> 99px fazla toleranslı çalışıyordu — doğru değer
> `documentElement.clientWidth`; (c) `overflow-y: auto` verilen her liste
> `overflow-x: auto` da oluyor, "kasıtlı yatay kaydırma" sanılıp içindeki
> gerçek kesilme atlanıyordu — gerçekten kaydırıyor mu diye bakmak gerekiyor
> (`scrollWidth > clientWidth`).

**Oturumlu ekranları ölçmek için `(dev)/mobil-onizleme`.** 55 ekran oturum
istiyor ve oturumsuz denetimde hepsi `/giris`'e yönlüyor. Bu rota gerçek
kabuğu, yedi stüdyo ekranını ve Sor ekranını sahte veriyle çiziyor; üretimde
`notFound()`. Kimlik doğrulama yoluna **bilerek dokunulmadı** — ölçüm
kolaylığı için auth'a dev bayrağı eklemek ödeme alan bir uygulamada alınacak
bir risk değil.

Bekçi testler: `tests/unit/mobile-layout.test.ts` ve
`tests/e2e/responsive-a11y.spec.ts` → "mobil dokunma kuralları" (dokunmatik
bağlam kuran ayrı blok; kurallar `pointer: coarse` altında olduğu için
masaüstü projesinde sınanamıyor).
