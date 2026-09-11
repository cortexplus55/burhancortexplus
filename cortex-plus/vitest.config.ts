import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "path";

export default defineConfig({
  // @vitejs/plugin-react bağımlılıklarda duruyordu ama yapılandırmaya
  // bağlı değildi: JSX içeren bir test dosyası ayrıştırılamıyordu.
  plugins: [react()],
  test: {
    environment: "node",
    // Bileşen testleri .tsx; ortam dosya başında @vitest-environment ile seçilir.
    include: ["tests/unit/**/*.test.ts", "tests/unit/**/*.test.tsx"],
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
