import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            /*
              Mikrofon kendi sitemize açık.

              Eskiden `microphone=()` yazıyordu; bu "hiçbir siteye izin verme"
              demek ve kendi sitemizi de kapsıyor. Sonuç: yazı kutusundaki
              mikrofon düğmesi ve Sözlü stüdyosu tarayıcı iznini hiç
              sormadan reddediliyordu. Kullanıcı izin kutusunu görmediği için
              hata da almıyordu, düğme sadece çalışmıyordu.

              Kamera kapalı kalıyor: fotoğrafı `<input capture>` ile alıyoruz,
              o dosya seçici olduğu için bu başlıktan etkilenmiyor.
            */
            key: "Permissions-Policy",
            value: "camera=(), microphone=(self), geolocation=()",
          },
        ],
      },
    ];
  },
};

/*
  Sentry yalnızca adres girildiğinde devreye giriyor.

  Sarmalayıcı derleme adımına kaynak harita yükleme işi ekliyor. Adres yokken
  bunu hiç çalıştırmıyoruz ki derleme bugünküyle aynı hızda kalsın ve anahtar
  girilene kadar hiçbir davranış değişmesin.

  Kaynak haritalar (yani hata satırının okunabilir olması) ayrıca
  SENTRY_AUTH_TOKEN, SENTRY_ORG ve SENTRY_PROJECT ister. Onlar yoksa derleme
  yine başarılı oluyor, sadece hata izleri sıkıştırılmış görünüyor.
*/
const sentryDsn =
  process.env.NEXT_PUBLIC_SENTRY_DSN || process.env.SENTRY_DSN || "";

export default sentryDsn
  ? withSentryConfig(nextConfig, {
      silent: true,
      // Tarayıcı paketindeki tüm dosyaların haritasını yükle: hata satırı
      // "chunk-4f2a.js:1" değil, gerçek dosya adıyla görünsün.
      widenClientFileUpload: true,
      webpack: {
        // Sentry'nin kendi konsol çıktısını yayın paketinden çıkarıyor.
        treeshake: { removeDebugLogging: true },
        // Vercel'in cron izlemesini kendiliğinden bağlamasın; cron'umuz yok.
        automaticVercelMonitors: false,
      },
    })
  : nextConfig;
