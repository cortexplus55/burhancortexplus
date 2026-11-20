import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import path from "path";
import { CONSENT_COOKIE } from "./tests/e2e/consent-cookie";

/*
  `.env.local` içindeki gerçek Supabase anahtarları process.env'e yüklenir.
  Authenticated E2E (oturum + /ogretmen) bunlara ihtiyaç duyar. Anahtar yoksa
  aşağıdaki sahte değerler yalnızca public/smoke için bekçiyi susturur.
*/
loadEnvConfig(process.cwd());

const AUTH_FILE = path.join(__dirname, "playwright/.auth/user.json");

/*
  Canlı duman testi (8 Kasım 2026, `.github/workflows/canli-duman.yml`): `E2E_BASE_URL` verilirse yerel sunucu
  kalkmaz, testler o adrese (cortexplus.app) karşı koşar. Yalnız `chromium-authenticated` projesiyle çalıştırılır;
  örnek ekranlar (/e2e/*) canlıda yok.
*/
const LIVE_BASE_URL = process.env.E2E_BASE_URL?.trim() || "";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  /*
    Yalnız CI'da bir yeniden deneme (15 Kasım 2026): yük altındaki geliştirme sunucusunda tek tük zaman aşımı işi
    kırmızıya çeviriyordu. Yeniden denemede geçen test "flaky" sayılır ve gizlenmez: `tests/e2e/flaky-reporter.ts`
    onu `test-results/flaky.md` dosyasına ve GitHub iş özetine yazar. Yerelde yeniden deneme yok.
  */
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [["dot"], ["./tests/e2e/flaky-reporter.ts"]] : [["list"]],
  use: {
    baseURL: LIVE_BASE_URL || "http://127.0.0.1:3005",
    trace: "on-first-retry",
  },
  webServer: LIVE_BASE_URL ? undefined : {
    /*
      CI'da üretim derlemesi (20 Kasım 2026): geliştirme sunucusu her rotayı istek anında derliyor ve bellekte
      tutuyordu; 12 GB'a izin verilen sunucu, iki Chromium işçisiyle 16 GB'lık makineyi boğdu ve #714'ten sonra
      üç koşu üst üste "The hosted runner lost communication with the server" ile düştü (test değil, makine).
      `next build` + `next start` derlemeyi bir kez yapar, sayfaları anında sunar ve birkaç yüz MB ile çalışır.
      Fikstür sayfaları `E2E_FIXTURE`'ı okuduğu için derleme de aşağıdaki ortamla yapılır. Yerelde geliştirme
      sunucusu aynen (sıcak yeniden yükleme).
    */
    command: process.env.CI ? "npx next build && npx next start -p 3005" : "npx next dev -p 3005",
    url: "http://127.0.0.1:3005",
    reuseExistingServer: !process.env.CI,
    timeout: process.env.CI ? 900000 : 120000,
    /*
      Sunucu, yapılandırma bekçisini geçen bir ortamla kalkıyor.

      `supabaseConfigIssue()` anahtarda "placeholder" görürse ya da URL beklenen
      projeyi göstermezse hata döndürüyor; kayıt formu da ilk iş onu kontrol
      edip duruyor. Sonuç: yer tutucu anahtarla çalıştırılan E2E'de form hiçbir
      şey yapmıyordu ve "zayıf şifre engelleniyor" testi, üründe bir sorun
      olmadığı hâlde kalıcı olarak düşüyordu. Bunu kimse görmedi çünkü CI E2E'yi
      çalıştırmıyordu.

      Buradaki değerler gerçek bir Supabase'e bağlanmıyor ve bağlanmamalı —
      dışarıdan / `.env.local`'den gelen değer yoksa. Authenticated setup gerçek
      anahtar + `E2E_USER_*` ister. Tek işleri bekçiyi yanlış alarmdan kurtarmak.
    */
    // `||`, `??` değil: CI'da tanımsız sır boş dize olarak gelir (`${{ secrets.X }}`);
    // boş anahtar yer tutucuya düşmeli, yoksa sunucu anahtarsız kalkar ve kayıt
    // formu bekçisi public testleri düşürür.
    env: {
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ||
        "https://dgjfyewgrukglsehyntc.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || "sb-e2e-local-only",
      E2E_FIXTURE: "1",
      /*
        CI'da yığın sınırı yalnız derleme için (`next build` ~5 GB ister). Geliştirme sunucusunun 12 GB sınırı
        (13–14 Kasım 2026) üretim sunucusuna geçince kalktı: makinenin yarısını sunucuya bırakmak, Chromium
        işçileriyle birlikte belleği tüketiyordu.
      */
      ...(process.env.CI ? { NODE_OPTIONS: "--max-old-space-size=6144" } : {}),
    },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      // Çerez tercihi verilmiş tarayıcı: bant tıklamalara binmesin (bandın kendi testi temiz başlar).
      use: { ...devices["Desktop Chrome"], storageState: { cookies: [CONSENT_COOKIE], origins: [] } },
      testIgnore: [/auth\.setup\.ts/, /authenticated\.spec\.ts/],
    },
    {
      name: "chromium-authenticated",
      use: {
        ...devices["Desktop Chrome"],
        storageState: AUTH_FILE,
      },
      dependencies: ["setup"],
      testMatch: /authenticated\.spec\.ts/,
    },
  ],
});
