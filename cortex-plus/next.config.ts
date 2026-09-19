import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";
import { cspHeaderName, cspHeaderValue } from "./src/lib/security/csp";

/**
 * CSP zorunlu mu, yalnızca rapor mu.
 *
 * Rapor kipinde başlıyoruz ve bir hafta gerçek ihlal raporu topladıktan sonra
 * false'a çekiyoruz. Erken zorunlu kipe geçmek, gözden kaçan tek bir kaynak
 * yüzünden ödeme ya da giriş sayfasını bozabilir.
 */
const REPORT_ONLY = true;

const nextConfig: NextConfig = {
  /*
    Yerel ikili taşıyan paketler webpack'e girmemeli.

    `@napi-rs/canvas` bir `.node` dosyası yüklüyor ve webpack onu ayrıştırmaya
    çalışıp derlemeyi düşürüyordu ("Unexpected character"). Dışarıda
    bırakılınca çalışma anında `require` ediliyor. `outputFileTracingIncludes`
    zaten ikiliyi dağıtıma kopyalıyor.
  */
  serverExternalPackages: ["pdfjs-dist", "@napi-rs/canvas"],
  outputFileTracingIncludes: {
    "/api/documents/process": ["./node_modules/pdfjs-dist/**/*", "./node_modules/@napi-rs/canvas*/**/*"],
    "/api/ai/chat": ["./node_modules/pdfjs-dist/**/*", "./node_modules/@napi-rs/canvas*/**/*"],
  },
  /*
    `/.well-known/assetlinks.json` bir uç noktadan geliyor.

    Android TWA açılırken bu adresi okuyup uygulamanın imza parmak izini
    arıyor; bulamazsa uygulamayı adres çubuğuyla gösteriyor. Dosya statik
    değil çünkü parmak izi Play tarafında üretiliyor ve değişebiliyor —
    gerekçe `src/app/api/assetlinks/route.ts` içinde.

    Nokta ile başlayan bir klasör App Router'da yol olmuyor, o yüzden
    yönlendirme.
  */
  async rewrites() {
    return [
      {
        source: "/.well-known/assetlinks.json",
        destination: "/api/assetlinks",
      },
    ];
  },
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
          {
            /*
              İçerik Güvenlik Politikası — RAPOR KİPİNDE.

              Hiçbir şeyi engellemiyor; tarayıcı yalnızca politikayı ihlal
              edecek bir şey gördüğünde `/api/csp-report`'a bildiriyor.
              Listeler koddan okunarak yazıldı (bkz. `lib/security/csp.ts`)
              ama gerçek trafikte gözden kaçmış bir kaynak olabilir ve zorunlu
              kipte o, bozuk bir sayfa demek. Bir hafta rapor toplandıktan
              sonra `REPORT_ONLY` false'a çekilir.
            */
            key: cspHeaderName(REPORT_ONLY),
            value: cspHeaderValue({
              allowEval: process.env.NODE_ENV !== "production",
              reportUri: "/api/csp-report",
            }),
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
