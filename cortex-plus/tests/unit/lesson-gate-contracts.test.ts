import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { describe, expect, it } from "vitest";

/**
 * Rota sözleşmeleri — canlıda kırılan davranışların metin bekçisi.
 * Davranış birim testleri ayrı dosyalarda; burası regressyon için anahtar satırlar.
 */
describe("ders kapısı rota sözleşmeleri", () => {
  const route = readSource("src/app/api/learning/exam-prep/node/route.ts");

  it("resolveLessonSource kullanılıyor; loadMergedTopicContext tabanı ölümcül değil", () => {
    expect(route).toContain("resolveLessonSource");
    const source = readSource("src/lib/learning/source-context.ts");
    expect(source).toContain("baseContext");
    expect(source).toContain('mode === "tolerant"');
  });
});
