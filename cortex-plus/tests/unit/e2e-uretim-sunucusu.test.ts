import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 20 Kasım 2026: #714'ten sonra CI'daki e2e işi üç koşu üst üste "The hosted runner lost communication with the
 * server" ile düştü. Sebep test değil makineydi: 12 GB belleğe izin verilen geliştirme sunucusu iki Chromium
 * işçisiyle 16 GB'lık makineyi boğuyordu. CI'da e2e artık üretim derlemesine karşı koşar.
 */
describe("e2e sunucusu", () => {
  const config = readFileSync("playwright.config.ts", "utf8");

  it("CI'da üretim derlemesi (next build + next start), yerelde geliştirme sunucusu", () => {
    expect(config).toContain('command: process.env.CI ? "npx next build && npx next start -p 3005" : "npx next dev -p 3005"');
  });

  it("derlemeye yeter süre ve bellek; geliştirme sunucusunun 12 GB sınırı yok", () => {
    expect(config).toContain("timeout: process.env.CI ? 900000 : 120000,");
    expect(config).toContain('NODE_OPTIONS: "--max-old-space-size=6144"');
    expect(config).not.toContain("--max-old-space-size=12288");
  });

  it("fikstür sayfaları derlemede de açık (E2E_FIXTURE webServer ortamında)", () => {
    expect(config).toMatch(/env:\s*\{[\s\S]*E2E_FIXTURE: "1"/);
  });
});
