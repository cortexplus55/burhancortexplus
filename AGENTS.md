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

## Öğretmen ders motoru (2 Ekim 2026) — eski onarım zinciri devre dışı

Belgeli sınav hazırlığı dersleri artık `LESSON_ENGINE=teacher` (varsayılan)
yolundan geliyor: temiz sayfa metni (`document_pages.clean_text`) → tek öğretmen
istemi (`teacher-lesson.ts`) → model denetimi → en fazla 2 düzeltme turu.
**Kod ders metnine hiçbir şey eklemez** — "Kaynak:" satırı, kalıp özet, dolgu
soru yok. Denetimde yüksek sorun kalırsa ders öğrenciye gitmez, kredi iade.
Gerekçe ve altın deneme sonuçları: `docs/delivery/ICERIK-KALITE-YOL-HARITASI.md`.

| Yapmayın | Yapın |
|---|---|
| Kötü bir dersi kodla "onarmak" | İstemi ya da denetimi düzeltin, sonra altın denemeyi (`tests/unit/_tmp/golden-lesson.test.ts`, yerel) yeniden koşun |
| Kaynaktaki bozuk cümleyi kopyalatmak | Yazar kaynağın kendi örnekleriyle tutarlı anlamı sessizce yazar; denetçi bunu sorun saymaz |
| Yazar ve denetçiye farklı kural vermek | Bir kural eklenince ikisine de eklenir — çelişirse düzeltme turu hiçbir şey değiştirmez |

Belgesiz hazırlık dersleri de aynı motordan (`mode: "topic"`): aynı akış, kaynak
kuralı yerine doğruluk kuralı, denetçi doğruluğa bakar. Hazırlık sohbeti de öğretmen
yolunda (`TUTOR_ENGINE=teacher`, `teacher-tutor.ts`), öğrencinin seçtiği moda göre.

**2 Ekim 2026: bütün içerik öğretmen motorlarında** (ürün sahibinin kararı). Hepsi
aynı kalıp: temiz çekirdek sayfalar (dersle aynı sayfalar) → tek öğretmen istemi →
öğeyi **önce kendisi çözen/cevaplayan** model denetimi → sorunlu öğenin düzeltilmesi
ya da elenmesi → yetmezse içerik gösterilmez, kredi iade. Kod metne dokunmaz; yalnız
biçim (başlık yazımı, gösterim/seslendirme) ve sıra (şık karıştırma, zor kart önce).

| İçerik | Bayrak | Dosya |
|---|---|---|
| Ders (belgeli + belgesiz) | `LESSON_ENGINE` | `teacher-lesson*.ts` |
| Hazırlık sohbeti | `TUTOR_ENGINE` | `teacher-tutor*.ts` |
| Konu testi, tuzak, yazılı deneme, son kontrol, odaklı pratik, soru-cevap, deneme sınavı, düello, tanışma, tanı, test aracı | `QUIZ_ENGINE` | `teacher-quiz*.ts`, `exam-quiz-generate.ts` başı |
| Podcast (5 tür) | `PODCAST_ENGINE` | `teacher-podcast*.ts` |
| Kartlar, aralıklı tekrar | `CARDS_ENGINE` | `teacher-cards.ts` |
| Doğru/yanlış, sözlü deneme | `PRACTICE_ENGINE` | `teacher-practice.ts` |
| Kavram birimi (büyük konu → 2–6 sayfalık dersler) | `TOPIC_UNITS_ENGINE` | `concept-units*.ts` |

Ortak parçalar: `teacher-item-loop.ts` (yedekli taslak, öğe öğe denetim, düzeltme),
`teacher-engine-run.ts` (kredi kabuğu). Çoktan seçmeli şıklar soru metnine bağlı
sabit sırayla karışır — model doğru cevabı neredeyse hep ilk şıkka yazıyordu.

Aşağıdaki bölüm **eski** (`legacy`) yol içindir; o yol yalnız `LESSON_ENGINE=legacy`
ve çekirdek sayfası bulunamayan belgeli derslerde çalışır. **Eski onarım katmanı
9 Ekim 2026'da silinecek** (ürün sahibinin kararı: bir haftalık canlı veriden sonra).

## Ders kalitesi: model yazıyor, zincir siliyor olabilir — önce ölç

**29 Eylül 2026'da belgesiz dersler hep "kurtarma" moduna düşüyordu**:
1–3 bölüm, ders cümlesinin kopyası "hep doğru" sorular, çözümlü örnek yok.
Model örneği, sayısal soruyu, formül kartını, şık gerekçesini **yazıyordu**;
yayına giden zincir (normalize → kapı → onarım → öğretim denetimi) yolda
siliyordu. Ayrıntı: #163, #165, #166, #167, #168.

| Yapmayın | Yapın |
|---|---|
| Ders kötü diye istemi değiştirmek | Canlı `lesson_shape` kaydına bakın: `draft` ile `published` karşılaştırması neyin nerede düştüğünü söyler |
| Kapıyı gevşetip bırakmak | Gevşeyen her kapıdan sonra cevap anahtarını **ekrandan çözerek** doğrulayın — #166 sonrası "(3⁴)² = 3¹²" anahtarı öğrenciye gitti, `exponent-key.ts` o yüzden var |
| Dolgu soru üretip sonra onu "kopya" diye cezalandırmak | Doldurma (`ensureThreeChecks`) ile kapı (`teachingFailures`) aynı kuralı paylaşmalı |

Taslak `gpt-4.1-mini`'den geliyor ve şemadan tutarlı biçimde sapıyor: örneği
bölümün içine yazıyor, çözümü `steps`'e koyuyor, "… Özet" / "Bilgi Kontrolü: …"
bölümleri açıyor, üssün üssünü `3²×³` diye yazıyor. Bunlar artık
`normalizeLessonShape` ve `coerceLessonCosmetics` içinde karşılanıyor; yeni
bir sapma görürseniz orada karşılayın, dersi düşürmeyin. Bekçi testler:
`lesson-draft-drift.test.ts`, `lesson-rich-fields.test.ts`, `exponent-key.test.ts`.

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
