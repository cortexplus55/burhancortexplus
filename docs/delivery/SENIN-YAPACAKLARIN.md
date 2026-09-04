# Sende kalanlar — ajanın yapamadığı işler

Son güncelleme: 2026-09-04

Buradaki her madde ya **şifre girmeyi** ya **hesap açmayı** gerektiriyor; ikisi de
ajanın yapmayacağı işler. Sırayla gidin, her biri birkaç dakika.

---

## 1. Google ile giriş yayında mı? ⚠️ **en önemlisi**

**Neden önemli:** OAuth uygulaması "Testing" modundaysa, **elle eklediğiniz test
kullanıcıları dışında hiç kimse Google ile giriş yapamaz**. Öğrenci "erişim
engellendi" hatası alır. Lansmanda fark edilirse geç olur.

**Durum:** doğrulanamadı. `cortexplus-auth` projesi `cortexplus@cortexplus.app`
hesabına ait; o hesap tarayıcıda oturumlu ama Google Cloud Console şifre
doğrulaması istiyor.

**Yapılacak:**

1. Şu adrese gidin: <https://console.cloud.google.com/auth/audience?project=cortexplus-auth>
2. `cortexplus@cortexplus.app` ile devam edin (şifre isteyecek).
3. **Publishing status** satırına bakın:
   - **In production** → sorun yok, bu maddeyi kapatın.
   - **Testing** → **PUBLISH APP** düğmesine basın, çıkan uyarıyı onaylayın.

> `email` ve `profile` dışında hassas kapsam istemiyoruz, bu yüzden Google
> doğrulaması (verification) gerekmiyor; yayınlamak anında etkili olur.

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

**Yapılacak:** `/ogretmen` → yazı kutusundaki mikrofon simgesine basın.

- Chrome'da: konuşun, yazı kutusuna metin düşmeli.
- Metin **yazdığınızın üstüne yazmamalı**, sonuna eklenmeli.
- İkinci kez basınca dinleme durmalı.
- Safari/Firefox'ta: Plus hesabıyla çalışmalı; ücretsiz hesapta "Plus gerekiyor"
  mesajı çıkmalı (bu doğru davranış, hata değil).

---

## 5. Google arama kaydı (SEO) — acil değil

Site şu an Google Search Console'a kayıtlı değil; `GOOGLE_SITE_VERIFICATION`
boş, sayfada doğrulama etiketi yok.

**Yapılacak:**

1. <https://search.google.com/search-console> → `cortexplus.app` mülkünü ekleyin.
2. Doğrulama yöntemi: **HTML etiketi** → `content="..."` içindeki kodu kopyalayın.
3. Vercel → Environment Variables → `GOOGLE_SITE_VERIFICATION` = o kod → redeploy.
4. Search Console'a dönüp **Doğrula**'ya basın.

---

## 6. Hata takibi ve analitik — karar sizin

Şu an canlıda **hiçbir hata takibi yok**. Bir öğrencide site patlarsa haberiniz
olmuyor.

- **PostHog:** kodu hazır (`components/analytics.tsx`), sadece anahtar bekliyor.
  posthog.com'da proje açıp `NEXT_PUBLIC_POSTHOG_KEY`'i Vercel'e eklemek yeterli.
- **Sentry:** kodu **yok**, sadece admin panelinde adı geçiyor. Kurulması gereken
  gerçek bir iş; isterseniz yazarım, DSN'i siz verirsiniz.

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
