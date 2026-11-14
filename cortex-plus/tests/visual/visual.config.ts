import { defineConfig } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

/*
  Görsel taban çizgisi (Faz 0, 2.6). Ana yapılandırmanın (`playwright.config.ts`) aynı kurulumu; tek farkları:

  - Sunucu 3006'da ve **model anahtarı, SMTP ve Resend boş** başlar. Hazırlık sayfası açılınca sıradaki ders arka planda
    yazılıyor, ders düğümü açılınca ısınma çağrısı gidiyor; ikisi de ücretli model çağrısı. Boş `OPENAI_API_KEY`
    `.env.local` ile ezilmez (Next tanımlı değişkene dokunmaz) ve OpenAI istemcisi boş anahtarla istek göndermeden hata
    verir. Böylece görsel test hiçbir koşulda model ya da e-posta çağırmaz.
  - Sunucu bir üretim derlemesi (aşağıda). Aynı klasörde çalışan bir `next dev` (3005 ya da 3006) `.next`'i paylaşır:
    önce kapatın.
  - Taban görüntüleri git'te değil (ürün sahibinin kararı, 14 Kasım 2026); kaydı `baseline-manifest.json`. Giriş kapısı
    `npm run test:visual` (scripts/visual-baseline.mjs): görüntüler manifestle aynı değilse çalışmaz. Güncelleme yalnız
    bilinçli: `npm run test:visual:update`. CI'da koşmaz.

  Ön koşul: `npm run e2e:seed` ve `npm run e2e:login` (giriş durumları `tests/.auth/`, gitignore).
*/
loadEnvConfig(process.cwd());

const PORT = 3006;
const BASE = `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: ".",
  testMatch: /.*\.visual\.ts$/,
  globalSetup: "./global-setup.ts",
  snapshotPathTemplate: "{testDir}/__screenshots__/{projectName}/{arg}{ext}",
  fullyParallel: true,
  workers: process.env.CI ? 2 : 3,
  retries: 0,
  timeout: 180_000,
  // Eksik taban sessizce yazılmaz: yalnız `npm run test:visual:update` (--update-snapshots) yazar.
  updateSnapshots: "none",
  expect: {
    timeout: 20_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.002, animations: "disabled", caret: "hide", scale: "css" },
  },
  use: {
    baseURL: BASE,
    contextOptions: { reducedMotion: "reduce" },
    colorScheme: "dark",
    locale: "tr-TR",
    timezoneId: "Europe/Istanbul",
    trace: "off",
  },
  projects: [
    { name: "masaustu", use: { viewport: { width: 1280, height: 800 }, deviceScaleFactor: 1 } },
    { name: "tablet", use: { viewport: { width: 768, height: 1024 }, deviceScaleFactor: 1 } },
    {
      name: "telefon",
      use: { viewport: { width: 375, height: 812 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true },
    },
  ],
  /*
    Üretim derlemesi (14 Kasım 2026): `next dev` ile 207 ekran ~1 saat sürdü; sunucu bellek eşiğinde kendini yeniden başlattı
    (bağlantı kopması) ve erişim jetonunun süresi dolunca geç kalan testler oturumsuz kaldı. Derleme bir kez (~8 dk), sonrası
    hızlı ve kararlı. Derleme yalnız yerel testin: `E2E_FIXTURE=1` (fikstür sayfaları derlemede sabitlenebilir),
    `SENTRY_AUTH_TOKEN` boş (kaynak haritası yüklenmez). Çalışan bir 3006 sunucusu varsa yerelde yeniden kullanılır.
  */
  // CI'da görsel taban yok (görüntüler yalnız yerelde, Windows'ta): sunucu kalkmaz, testler atlanır.
  webServer: process.env.CI ? undefined : {
    command: `node scripts/copy-pdf-worker.mjs && npx next build && npx next start -p ${PORT}`,
    url: BASE,
    reuseExistingServer: !process.env.CI,
    timeout: 1_200_000,
    env: {
      E2E_FIXTURE: "1",
      OPENAI_API_KEY: "",
      SMTP_HOST: "",
      SMTP_USER: "",
      SMTP_PASS: "",
      RESEND_API_KEY: "",
      SENTRY_AUTH_TOKEN: "",
      NEXT_TELEMETRY_DISABLED: "1",
      NODE_OPTIONS: "--max-old-space-size=6144",
    },
  },
});
