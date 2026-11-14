import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  Playwright yeniden denemesi (15 Kasım 2026): yalnız CI'da bir kez; yeniden denemede geçen test gizlenmez,
  `tests/e2e/flaky-reporter.ts` onu `test-results/flaky.md` ve GitHub iş özetine yazar. Başka gevşetme yok.
*/
const config = readFileSync("playwright.config.ts", "utf8");

describe("Playwright yeniden denemesi", () => {
  it("yalnız CI'da bir yeniden deneme; yerelde yok", () => {
    expect(config).toContain("retries: process.env.CI ? 1 : 0,");
    expect(config.match(/retries:/g)).toHaveLength(1);
  });

  it("CI'da kararsız test raporlayıcısı açık; zaman aşımı ve beklentiler gevşetilmedi", () => {
    expect(config).toContain('["./tests/e2e/flaky-reporter.ts"]');
    expect(config).not.toMatch(/timeout:\s*(?:[6-9]\d{4}|\d{6,})\s*,\s*\n\s*expect/);
    const reporter = readFileSync("tests/e2e/flaky-reporter.ts", "utf8");
    expect(reporter).toContain('test.outcome() !== "flaky"');
    expect(reporter).toContain("GITHUB_STEP_SUMMARY");
  });
});
