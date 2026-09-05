# Sende kalanlar — ajanın yapamadığı işler

Son güncelleme: 2026-09-05

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

## 6. Hata takibi — ✅ tamam

DSN 4 Eylül'de Vercel'e girildi (`NEXT_PUBLIC_SENTRY_DSN`, Config tipi, üç
ortam). Yeni dağıtımla birlikte devreye girdi.

Ne toplanıyor, ne toplanmıyor: `docs/delivery/SENTRY-HATA-TAKIBI.md`

**PostHog** hâlâ bekliyor: kodu hazır (`components/analytics.tsx`), posthog.com'da
proje açıp `NEXT_PUBLIC_POSTHOG_KEY`'i Vercel'e eklemek yeterli.

İsteğe bağlı: hata izinin sıkıştırılmış değil gerçek dosya adı ve satır
numarasıyla görünmesi için `SENTRY_ORG`, `SENTRY_PROJECT` ve
`SENTRY_AUTH_TOKEN` de eklenebilir. Bu üçü olmadan da her şey çalışıyor.

---

## 7. Veritabanı: tek komut

Göç geçmişi temizlendi. Eskiden yerel dosyalarla veritabanının kaydı birbirini
tutmuyordu (iki tarafta da 34'er kayıt eksikti) ve toplu uygulama mümkün
değildi. Artık 33 dosya "uygulandı" olarak eşleşiyor, karşılıksız kayıt yok.

**Bekleyen iki göç var:**

| Dosya | Ne için |
|-------|---------|
| `20260904120000_promo_campaigns.sql` | Ana ekrandaki duyuru bandı. Bu olmadan panelden bant kaydedilemiyor. |
| `20260904140000_message_feedback.sql` | Yanıt altındaki beğen/beğenme. Bu olmadan başparmak düğmeleri hiç görünmüyor. |

**2026-09-05'te doğrulandı: ikisi de gerçekten uygulanmamış.** Canlı veritabanına
atılan sorgu `promo_campaigns` tablosunun ve `messages.rating` kolonunun
olmadığını gösterdi; göç geçmişindeki son kayıt `20260904020000`.

**Yapılacak** — proje klasöründe tek komut:

```bash
cd cortex-plus && npx supabase db push
```

> Komut `Unauthorized (401)` derse önce `npx supabase login` gerekiyor —
> CLI bu makinede oturumsuz.

Ajan bu adımı yapamıyor: canlı veritabanına şema yazmak güvenlik katmanı
tarafından engelleniyor, CLI için gereken erişim jetonunu da giremez.

Komut satırı istemezsen SQL editöründen tek seferde olur —
<https://supabase.com/dashboard/project/dgjfyewgrukglsehyntc/sql/new> —
ajanın hazırladığı birleşik dosyayı yapıştırıp **Run** de. Dosya iki göçü de,
göç geçmişi kaydını da içeriyor ve tek işlem hâlinde: bir satır hata verirse
hiçbiri uygulanmıyor.

> Başparmak düğmeleri göç uygulanana kadar **hiç görünmüyor**; uygulandıktan
> sonra kendiliğinden açılıyor. Yani "basıyorum bir şey olmuyor" durumu yok.

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
