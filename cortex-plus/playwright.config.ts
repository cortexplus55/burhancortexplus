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
  use: {
    baseURL: LIVE_BASE_URL || "http://127.0.0.1:3005",
    trace: "on-first-retry",
  },
  webServer: LIVE_BASE_URL ? undefined : {
    command: "npx next dev -p 3005",
    url: "http://127.0.0.1:3005",
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
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
        Geliştirme sunucusu bellek sınırına yaklaşınca kendini yeniden başlatıyor ("Server is approaching the used
        memory threshold, restarting..."); yeniden başlarken gelen istek ERR_CONNECTION_REFUSED alıyordu. CI'da
        (13 Kasım 2026) 220 testin sonuna denk gelen /admin rotaları bu yüzden düşüyordu. Sınır, üretim derlemesiyle
        aynı (package.json "build"); GitHub koşucusunda 16 GB var.
      */
      NODE_OPTIONS: [process.env.NODE_OPTIONS, "--max-old-space-size=6144"].filter(Boolean).join(" "),
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
