import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));

/*
  19 Ekim 2026, ürün sahibinin kararları (maliyet modeli, `docs/delivery/MALIYET-MODELI.md`):
  - Hızlı işlem (OpenAI Fast, jeton 2 kat) yalnız Plus/Sigma ve kurucuya; ücretsiz öğrencinin soğuk içeriği
    normal hızda. Ders $0,016 tutuyordu, kredisi $0,006.
  - Seslendirme 900 karakter için 2 → 15 kredi (ölçülen maliyet ~$0,015).
*/
const premium = vi.hoisted(() => ({ value: false, exempt: false, throws: false }));
vi.mock("@/lib/billing/entitlements", () => ({
  isPremiumUser: async () => {
    if (premium.throws) throw new Error("db");
    return premium.value;
  },
}));
vi.mock("@/lib/billing/free-preview", () => ({ billingExempt: async () => premium.exempt }));

const { fastAllowedFor } = await import("@/lib/learning/fast-access");

describe("hızlı işlem yalnız Plus'a", () => {
  it("Plus ya da kurucu evet; ücretsiz hayır; abonelik okunamazsa hayır", async () => {
    premium.value = true;
    expect(await fastAllowedFor({} as never, "u")).toBe(true);
    premium.value = false;
    premium.exempt = true;
    expect(await fastAllowedFor({} as never, "u")).toBe(true);
    premium.exempt = false;
    expect(await fastAllowedFor({} as never, "u")).toBe(false);
    premium.throws = true;
    expect(await fastAllowedFor({} as never, "u")).toBe(false);
  });

  it("dört motor hızlı işlemi bu koşula bağlar", () => {
    const read = (file: string) => readFileSync(`src/lib/learning/${file}.ts`, "utf8");
    expect(read("teacher-lesson-run")).toContain("Boolean(input.fast) && (await fastAllowedFor(service, input.userId))");
    expect(read("teacher-quiz-run")).toContain("fastTier(!free && !held && (await fastAllowedFor(service, input.userId)))");
    expect(read("teacher-podcast-run")).toContain("fastTier(!free && (await fastAllowedFor(service, input.userId)))");
    expect(read("teacher-engine-run")).toContain("fastTier(!free && !held && (await fastAllowedFor(service, options.userId)))");
  });
});

describe("seslendirme 15 kredi / 900 karakter", () => {
  it("göç fiyat satırını değiştirir, veri silmez; fiyat tablosu aynı sayıyı söyler", async () => {
    const sql = readFileSync("supabase/migrations/20261019130000_audio_credit_15.sql", "utf8").replace(/^--.*$/gm, "");
    expect(sql).toMatch(/SET credit_cost = 15/);
    expect(sql).toContain("WHERE action_code = 'AUDIO_SYNTHESIZE'");
    expect(sql).not.toMatch(/\b(DROP|DELETE|TRUNCATE)\b/);
    const { CREDIT_PRICE_TABLE } = await import("@/lib/credits/price-table");
    expect(CREDIT_PRICE_TABLE.AUDIO_SYNTHESIZE.credits).toBe(15);
  });
});
