# Hata takibi (Sentry) — sana kalan tek iş: bir satır yapıştırmak

Kod tarafı bitti. Uygulama şu an Sentry'yi **hiç başlatmıyor** çünkü adres boş.
Adresi girdiğin an, yayındaki her hata paneline düşmeye başlıyor. Adresi
silersen aynı şekilde susuyor. Arada başka bir şey yapman gerekmiyor.

## Neden lazım

Şu an bir öğrenci hata alırsa senin haberin olmuyor. Ekranda "bir şeyler ters
gitti" yazısını görüyor, sayfayı kapatıyor, sen de olan bitenden habersiz
kalıyorsun. Sentry bunu senin yerine yakalıyor: hangi sayfa, hangi satır, kaç
kişide olmuş.

## 1. Adresi al (5 dakika)

1. <https://sentry.io> — **`cortexplus@cortexplus.app`** ile giriş yap.
   (Hesap yoksa aynı adresle aç. Ücretsiz plan aylık 5.000 hata alıyor,
   bizim için fazlasıyla yeter.)
2. Yeni proje: platform olarak **Next.js** seç, adını `cortex-plus` koy.
3. Açılan sayfada uzun bir `https://...@...ingest.sentry.io/...` adresi
   göreceksin. **DSN** deniyor buna. Kopyala.
   Sonradan bulmak istersen: **Settings → Projects → cortex-plus → Client Keys (DSN)**.

> DSN gizli bir şifre değil, zaten tarayıcıya gönderilen bir adres. Yanlışlıkla
> birine göstermen sorun değil. Şifre gibi saklaman gereken tek şey aşağıdaki
> isteğe bağlı bölümdeki **auth token**.

## 2. Vercel'e yapıştır (2 dakika)

<https://vercel.com/cortexplus55/burhancortexplus-app/settings/environment-variables>

| Alan | Ne yazacaksın |
|------|----------------|
| Key | `NEXT_PUBLIC_SENTRY_DSN` |
| Value | 1. adımda kopyaladığın adres |
| Environments | Production, Preview, Development — üçü de işaretli |

**Save** de, sonra **Deployments** sekmesinden en üstteki dağıtımda
`⋯ → Redeploy`. Ortam değişkenleri yalnızca yeni dağıtımda okunuyor; kaydetmek
tek başına yetmiyor.

## 3. Çalıştığını gör (1 dakika)

Dağıtım bitince <https://cortexplus.app/bu-sayfa-yok> gibi olmayan bir adrese
git — bu 404 verir, hata değil. Gerçek testi Sentry kendisi sunuyor:
projenin **Getting Started** sayfasındaki "throw an error" düğmesi.
Panelde ilk kayıt göründüyse iş tamam.

## İsteğe bağlı: hata satırını okunabilir yapmak

Yukarıdaki tek satırla her şey çalışıyor, ama hata izleri sıkıştırılmış kod
üzerinden görünüyor (`chunk-4f2a.js:1:88213` gibi). Gerçek dosya adı ve satır
numarası istiyorsan Vercel'e üç değişken daha ekle:

| Key | Nereden |
|-----|---------|
| `SENTRY_ORG` | Sentry URL'indeki kısa ad (`sentry.io/organizations/**buradaki**/`) |
| `SENTRY_PROJECT` | `cortex-plus` |
| `SENTRY_AUTH_TOKEN` | Sentry → Settings → Auth Tokens → yeni token, yetki: `project:releases` |

Bu üçü eksikse derleme yine başarılı oluyor, sadece iz sıkıştırılmış kalıyor.
`SENTRY_AUTH_TOKEN` **gerçekten gizli** — kimseyle paylaşma.

## Ne toplanıyor, ne toplanmıyor

Burası bir eğitim uygulaması ve kullanıcıların bir kısmı çocuk. Bu yüzden
gönderilen veriyi elle kısıtladık:

| Gidiyor | Gitmiyor |
|---------|----------|
| Hata mesajı ve kod satırı | Öğrencinin yazdığı soru metni (istek gövdesi) |
| Hangi sayfada olduğu | E-posta adresi |
| Tarayıcı ve sürüm | IP adresi |
| Kullanıcı kimliği (numara) | Çerezler ve oturum anahtarları |

Ekran kaydı (session replay) da bilerek kapalı: öğrencinin ekranını kaydetmek,
yazdığı her şeyi kaydetmek demek.

Hız ölçümü (performance) kapalı — ücretsiz kotayı hatalar için saklıyoruz.
Açmak istersen `src/sentry.server.config.ts` içindeki `tracesSampleRate: 0`
değerini `0.1` yap.

## Dosyalar

| Dosya | İşi |
|-------|-----|
| `src/lib/observability/sentry-shared.ts` | Adres, ortam ve veri temizleme — tek kaynak |
| `src/sentry.server.config.ts` | Sunucu |
| `src/sentry.edge.config.ts` | `middleware.ts`'in çalıştığı ortam |
| `src/instrumentation-client.ts` | Tarayıcı |
| `src/instrumentation.ts` | Açılışta hangisinin yükleneceğini seçiyor |
| `src/app/global-error.tsx` | Kök şablon çöktüğünde görünen ekran |
| `next.config.ts` | Adres varsa Sentry sarmalayıcısını devreye alıyor |
