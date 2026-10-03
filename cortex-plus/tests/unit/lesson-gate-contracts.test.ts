import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Rota sözleşmeleri — canlıda kırılan davranışların metin bekçisi.
 * Davranış birim testleri ayrı dosyalarda; burası regressyon için anahtar satırlar.
 */
describe("ders kapısı rota sözleşmeleri", () => {
  const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");

  it("resolveLessonSource kullanılıyor; loadMergedTopicContext tabanı ölümcül değil", () => {
    expect(route).toContain("resolveLessonSource");
    const source = readFileSync("src/lib/learning/source-context.ts", "utf8");
    expect(source).toContain("baseContext");
    expect(source).toContain('mode === "tolerant"');
  });
});
