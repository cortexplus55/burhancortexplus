# Sende kalanlar — ajanın yapamadığı işler

Son güncelleme: 2026-09-18

Buradaki her madde ya **şifre girmeyi** ya **hesap açmayı** gerektiriyor; ikisi de
ajanın yapmayacağı işler. Sırayla gidin, her biri birkaç dakika.

---

## 1. Google ile giriş — ✅ **kapandı (2026-09-05)**

Uygulama gerçekten **`Testing`** modundaymış: o ana kadar yalnızca elle
eklenmiş test kullanıcıları Google ile girebiliyordu, başka herkes "erişim
engellendi" alıyordu. Sahibi konsola giriş yaptıktan sonra ajan **Publish app →
Push to production → Confirm** adımlarını uyguladı; **Publishing status artık
In production**.

Hassas izin istemediğimiz için Google doğrulaması gerekmedi, yayın **anında**
etkili oldu. Zincirin tamamı doğrulandı: uygulama kodu → Supabase (sağlayıcı
açık, Client ID/Secret doğru, Site URL + 4 redirect adresi, "Allow new users to
sign up" açık) → Google (In production, doğru redirect URI, iki alan adı
kayıtlı) → geri dönüş. Ayrıntı: [GOOGLE-OAUTH.md](./GOOGLE-OAUTH.md).

**İki şeye dokunmayın:**

- **Logo yüklemeyin.** Artık `In production` olduğumuz için konsola logo
  eklemek uygulamayı doğrulama kuyruğuna sokar; haftalar sürer ve o süre
  boyunca giriş kısıtlanabilir.
- Onay ekranında "Cortex Plus" yerine `dgjfyewgrukglsehyntc.supabase.co`
  yazıyor. Kozmetik, girişi engellemiyor; düzeltmesi Supabase Pro
  (Custom Domain) gerektiriyor.

---

## 2. Uygulamanın kendi e-posta şifresi doğru mu?

**Durum:** Google uygulama şifresinin **çalıştığı** kanıtlandı (`SMTP_VERIFY_OK`),
ama bu bilgisayardaki kopyayla. Vercel'deki kopya gizli olduğu için okunamıyor;
ikisi farklı tarihlerde kaydedilmiş (Vercel 28 Ağu, yerel 3 Eyl).

**Yapılacak:** `cortexplus.app/admin/sistem` → **"Workspace SMTP bağlantısını
test et"**.

- Yeşil/OK → tamam.
- `535` hatası → Vercel'deki `SMTP_PASS` eski. Yeni uygulama şifresini
  Vercel → Settings → Environment Variables → `SMTP_PASS` altına yazıp redeploy edin.

> Not: kayıt ve doğrulama e-postaları buradan **gitmiyor**, onlar Supabase'in
> kendi SMTP'sinden gidiyor ve çalıştığı doğrulandı. Bu ayar sadece veli
> davet/istek e-postalarını etkiliyor.

---

## 3. Uçtan uca kayıt denemesi

**Yapılacak** (telefondan da olur):

1. `cortexplus.app/kayit` → daha önce kullanılmamış bir e-posta ile kaydolun.
2. `/email-dogrula` ekranına düşmeli.
3. Gelen kutusuna **Cortex Plus**'tan doğrulama e-postası gelmeli
   (gönderen: `cortexplus@cortexplus.app`).
4. Linke tıklayın → `/kayit/tamamla` açılmalı → sihirbazı bitirin.

Gelmezse önce spam klasörüne bakın.

---

## 4. Sesle sor (mikrofon)

Sohbetteki mikrofon bu oturumda baştan yazıldı ama **gerçek sesle denenmedi** —
giriş gerektiriyor.

> **Düzeltildi (4 Eylül):** mikrofon yayında zaten çalışmıyordu. Kendi güvenlik
> başlığımız `microphone=()` gönderiyordu, bu "kendi sitem dahil hiçbir yere izin
> verme" demek; tarayıcı izin kutusunu hiç göstermeden reddediyordu. Artık
> `microphone=(self)`. Aşağıdaki deneme bundan sonra anlamlı.

**Yapılacak:** `/ogretmen` → yazı kutusundaki mikrofon simgesine basın.

- Chrome'da: konuşun, yazı kutusuna metin düşmeli.
- Metin **yazdığınızın üstüne yazmamalı**, sonuna eklenmeli.
- İkinci kez basınca dinleme durmalı.
- Safari/Firefox'ta: Plus hesabıyla çalışmalı; ücretsiz hesapta "Plus gerekiyor"
  mesajı çıkmalı (bu doğru davranış, hata değil).

---

## 5. Google arama kaydı (SEO) — ✅ **kapandı (2026-09-05)**

Search Console'da `https://cortexplus.app/` mülkü açıldı. **Sahiplik otomatik
doğrulandı** — alan adı `cortexplus@cortexplus.app` Workspace hesabına ait
olduğu için Google kendi tanıdı; HTML etiketi gerekmedi.

Bu yüzden **`GOOGLE_SITE_VERIFICATION` env değişkeni gereksiz.** Kodda desteği
duruyor (`layout.tsx`), yalnızca yedek doğrulama yöntemi istenirse kullanılır.

Site haritası gönderildi ve Google tarafından **okundu**: durum `Başarılı`,
**14 sayfa** keşfedildi. Arama sonuçlarına düşmesi birkaç gün sürer.

> Yanında bir hata çıktı ve düzeltildi: `robots.txt` hâlâ `/ogretmen-paneli`'ni
> engelliyordu, o bölüm `3e666f6` ile silinmişti (`203fa81`).

---

## 6. Hata takibi — ✅ tamam · PostHog — ✅ **kapandı (2026-09-17)**

DSN 4 Eylül'de Vercel'e girildi (`NEXT_PUBLIC_SENTRY_DSN`, Config tipi, üç
ortam). Yeni dağıtımla birlikte devreye girdi.

Ne toplanıyor, ne toplanmıyor: `docs/delivery/SENTRY-HATA-TAKIBI.md`

### PostHog (reklam ölçümü — zorunlu)

**17 Eylül 2026'da kuruldu ve canlıda doğrulandı.** Anahtar istemci paketine
gömülü (`phc_sEEho3…`) ve host `https://eu.i.posthog.com` — doğru bölge.
`NEXT_PUBLIC_POSTHOG_HOST` ayrıca tanımlanmadı, kod kendi EU varsayılanına
düşüyor.

> **Bölge tuzağı bir kurulum yedi.** İlk kayıt `posthog.com` üzerinden yapıldı
> ve US bulutuna düştü; PostHog'da EU ile US ayrı sistemler ve **proje ikisi
> arasında taşınmıyor**. Proje henüz boşken fark edildiği için
> `https://eu.posthog.com/signup` adresinden sıfırdan kuruldu, veri kaybı
> olmadı. Bir daha olursa: US'te ısrar edilecekse Vercel'e ayrıca
> `NEXT_PUBLIC_POSTHOG_HOST` girilmeli, yoksa ölçüm hiç düşmez.

> **Nasıl doğrulanır — ana sayfanın HTML'ine bakmak işe yaramaz.**
> `NEXT_PUBLIC_*` değişkenleri HTML'e değil JS paketine giriyor. Doğru yol:
> ana sayfadaki `/_next/static/**.js` dosyalarını indirip içlerinde `phc_` ara.
> Bu belgenin bir önceki sürümü HTML'de arayıp "PostHog yok" diyordu; sonuç o
> gün tesadüfen doğruydu ama yöntem yanlıştı ve yanlış yöntem yanlış güven
> verir.

6–17 Eylül arasında ölçüm toplanmadı; o pencere geriye dönük kurtarılamıyor.
5. `cortexplus.app` aç → PostHog → Activity'de `$pageview` görünmeli.
6. `/admin/sistem` → PostHog satırı **Tanımlı**.

İsteğe bağlı Sentry source maps: `SENTRY_ORG`, `SENTRY_PROJECT`, `SENTRY_AUTH_TOKEN`.
Bu üçü olmadan da hata takibi çalışıyor.

---

## 7. Veritabanı — ✅ **kapandı (2026-09-05)**

İki bekleyen veritabanı eklemesi sahibi tarafından SQL editöründen uygulandı.
Ajan uygulayamadı: canlı veritabanına şema yazmak güvenlik katmanınca
engelleniyor, CLI için gereken erişim jetonunu da giremiyor.

| Dosya | Ne için | Durum |
|-------|---------|-------|
| `20260904120000_promo_campaigns.sql` | Ana ekrandaki duyuru bandı | **uygulandı** |
| `20260904140000_message_feedback.sql` | Yanıt altındaki beğen/beğenme | **uygulandı** |

Göç geçmişi de işlendi — son kayıt `20260904140000`, karşılıksız kayıt yok.

**Uçtan uca doğrulandı (canlıda, elle):**

- `promo_campaigns` tablosu var; `messages` tablosunda üç oy kolonunun üçü de var
- `/admin/yanıt-oyları` artık uyarı yerine gerçek panoyu gösteriyor
- Sohbette başparmak düğmeleri **göründü**; bir yanıt beğenildi → panelde
  `1 oy · %100 olumlu` olarak belirdi → sayfa yenilendiğinde düğme
  "Beğeniyi geri al" olarak açıldı (yani veritabanına yazılmış) → geri alındı,
  sayaç `0`'a döndü. Test verisi bırakılmadı.

> Duyuru bandının **kaydedileceği yer** artık var ve panel formu açılıyor.
> Ajan gerçek bir bant açmadı: o, her ücretsiz kullanıcının ana ekranında
> görünen herkese açık bir duyuru olurdu — içeriği ve zamanı sahibinin kararı.

---

## 8. PayTR'ı canlıya al — 🔶 **yarısı bitti**

Ek mağaza onaylandı (16 Eylül), üç anahtar 17 Eylül'de Vercel'e girildi.
Canlıdan doğrulandı: `/fiyatlandirma`'daki "Yakında" düğmeleri **"Satın al"**
oldu ve haftalık paket (₺349) satışa açıldı.

**Ama bitmedi.** "Satın al" düğmesi, anahtarlar tanımlı olduğu an test
kipinde de canlı kipte de görünür — dışarıdan ikisi ayırt edilemiyor.
Kalan iki adım aşağıda.

**Adım adım rehber: [PAYTR-KURULUM.md](./PAYTR-KURULUM.md)** — menü yolları
PayTR'nin kendi dokümanından doğrulanmış, tuzaklar da yazılı. Burada
tekrarlamıyorum ki iki belge birbirinden ayrışmasın.

Kısayol: `npx vercel login` sonrası `.\scripts\setup-paytr.ps1` üç değeri
gizli sorup Vercel'e yazıyor ve dağıtımı kontrol ediyor.

### Kalan adım 1 — kipi doğrula

`/admin/sistem` → PayTR satırı. Rozet **"TEST kipinde"** diyorsa Vercel'de
`PAYTR_TEST_MODE=0` **ve** `PAYTR_DEBUG_ON=0` yapıp yeniden dağıt.

Aciliyeti şundan: test kipinde akış baştan sona çalışır — form açılır, ödeme
"başarılı" döner, abonelik açılır, kredi yüklenir. Yalnızca para gelmez. Satın
alma düğmesi şu anda herkese açık bir sayfada duruyor, yani kip yanlışsa ürün
sessizce bedava dağıtılır. Bunu görünür kılan `paytrMode()`; "Tanımlı" demek
"para geliyor" demek değil.

### Kalan adım 2 — gerçek kartla bir alım ve bir iade provası

**Test kipi canlı kipi kanıtlamaz**: farklı uç, farklı 3D akışı, farklı banka
cevabı. En ucuz paketi kendi kartınla al → kredinin yüklendiğini gör → PayTR
panelinden iade et → iadenin işlediğini gör.

Yan faydası: iadeyi panelde nereden yaptığını bir kez görmüş olursun.
`/iptal-iade` müşteriye "haklı durumda karta iade" sözü veriyor ve o sözü
tutacak olan sensin. Bu prova yapılmazsa ilk gerçek müşteri senin testin olur.

Bir de kurulumun tek kritik alanı: **Bildirim URL'i** tam olarak
`https://cortexplus.app/api/payments/paytr/callback` olmalı. Yanlışsa para
çekilir ama kredi yüklenmez.

**Otomatik yenileme bu kurulumla açılmıyor** — yetki meselesi değil, mimari:
kullandığımız iFrame API'nin kart saklama parametresi yok. Ayrıntı ve park
edilmiş karar `AGENTS.md` → "Ödeme: otomatik yenileme bugün açılamıyor".

---

## Ajanın kapattığı, sizin bakmanıza gerek olmayanlar

| Konu | Kanıt |
|---|---|
| Supabase e-posta zinciri | Confirm email açık, özel SMTP açık, Auth kayıtlarında 24 saatte sıfır hata |
| `www` → `cortexplus.app` | 308 yönlendirme çalışıyor |
| Site sağlığı | `/api/health` → `ok: true`, doğru Supabase projesi |
| Yasal sayfalar | `/gizlilik`, `/kvkk`, `/kullanim-kosullari` dolu ve yayında |
| Kırık link | Herkese açık sayfalar tarandı — kırık link yok |
| Sayfa başlık yapısı | Her sayfada tek ve doğru `h1` (38caff5) |
| Otomatik testler | Playwright 38/38, vitest 192/192 |
| Mikrofon izin başlığı | `microphone=(self)` yayında doğrulandı (`allowsFeature('microphone') === true`) |
