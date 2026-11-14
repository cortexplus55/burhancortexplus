import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ cookies: async () => ({ get: () => undefined }) }));
vi.mock("@/lib/supabase/server", () => ({ createServiceClient: () => ({}) }));

/*
  Faz 12 (14 Kasım 2026): yönetim panelinin Özellik Anahtarları sayfası yalnız tanımlı anahtarları ve veritabanındaki
  satırları gösteriyor. `ui.v2.*` satırı canlıda yokken panelde görünmüyordu; kurucu bayrağı açamazdı. Kodu olan her
  yeni görünüm anahtarı panelde tanımlı olmalı (paylaşım: kodu yok, park).
*/
describe("yeni görünüm anahtarları panelde", () => {
  it("kodu olan her ui.v2 anahtarı Özellik Anahtarları'nda Türkçe adıyla", async () => {
    const { UI_V2_KEYS } = await import("@/lib/ui-v2/flags");
    const page = readFileSync("src/app/admin/feature-flags/page.tsx", "utf8");
    for (const key of UI_V2_KEYS.filter((k) => k !== "paylas")) {
      expect(page, key).toContain(`key: "ui.v2.${key}"`);
    }
    expect(page).not.toContain('key: "ui.v2.paylas"');
    expect(page).toMatch(/label: "Yeni görünüm · Abonelik sayfası"[\s\S]*ödeme çerçevesinin açıldığını doğrula/);
  });
});
