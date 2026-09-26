import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";
import path from "path";

/*
  `.env.local` içindeki gerçek Supabase anahtarları process.env'e yüklenir.
  Authenticated E2E (oturum + /ogretmen) bunlara ihtiyaç duyar. Anahtar yoksa
  aşağıdaki sahte değerler yalnızca public/smoke için bekçiyi susturur.
*/
loadEnvConfig(process.cwd());

const AUTH_FILE = path.join(__dirname, "playwright/.auth/user.json");

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: true,
  use: {
    baseURL: "http://127.0.0.1:3005",
    trace: "on-first-retry",
  },
  webServer: {
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
    env: {
      NEXT_PUBLIC_SUPABASE_URL:
        process.env.NEXT_PUBLIC_SUPABASE_URL ??
        "https://dgjfyewgrukglsehyntc.supabase.co",
      NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "sb-e2e-local-only",
    },
  },
  projects: [
    { name: "setup", testMatch: /auth\.setup\.ts/ },
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
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
