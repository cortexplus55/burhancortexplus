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
