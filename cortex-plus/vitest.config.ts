import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // @vitejs/plugin-react bağımlılıklarda duruyordu ama yapılandırmaya
  // bağlı değildi: JSX içeren bir test dosyası ayrıştırılamıyordu.
  plugins: [react()],
  // Load cortex-plus/.env.local for live Jev (TYPESAFE_API_KEY) without printing secrets.
  envDir: path.resolve(__dirname),
  test: {
    environment: "node",
    // Bileşen testleri .tsx; ortam dosya başında @vitest-environment ile seçilir.
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
    // 5 Kasım 2026: tam paket (630+ dosya, 16 işçi) koşarken PGlite, pdf-lib/pdf.js ve gerçek HTTP kullanan
    // testler 5 sn'lik varsayılan süreyi yalnız makine yükü yüzünden aşıp kararsız düşüyordu
    // (`pencereli-yukleme`, `generate-stream-deadline`, `paket-j2`). Süre bir doğruluk ölçüsü değildir:
    // zamanlamayı denetleyen testler sahte zamanlayıcı kullanır; buradaki tavan yalnız takılı testi yakalar.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
  resolve: {
    alias: {
      // `server-only` throws outside the Next.js server graph; unit tests import
      // these modules directly, so it is stubbed out here.
      "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts"),
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
