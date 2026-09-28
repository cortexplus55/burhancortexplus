import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Rota sözleşmeleri — canlıda kırılan davranışların metin bekçisi.
 * Davranış birim testleri ayrı dosyalarda; burası regressyon için anahtar satırlar.
 */
describe("ders kapısı rota sözleşmeleri", () => {
  const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");

  it("10) maxDraftAttempts depth'e bağlı (≥2); tek atış override yok", () => {
    expect(route).toContain("Math.max(2, depth.maxDraftAttempts)");
    expect(route).toContain("requestLesson(teacherNote, false, lessonDraftAttempts)");
    expect(route).toContain("deadlineAt:");
    expect(route).not.toMatch(/maxDraftAttempts:\s*1\b/);
  });

  it("11) ince nicelik kurtarma yayınlanmaz; öğrenci meta notu yok", () => {
    expect(route).not.toContain("quantity_salvage_note");
    expect(route).not.toContain("Bazı hesap adımları kaynakla doğrulanamadığı için çıkarıldı");
    expect(route).toContain("lesson_quantity_too_thin");
    expect(route).toContain("stripLessonVerificationChrome");
    expect(route).toContain("deadlineAt");
  });

  it("12) commitCredits sonrası kalite hattı dersi düşürmez", () => {
    expect(route).toContain("lesson_quality_pipeline_failed");
    expect(route).toContain("lesson_post_commit_error");
    expect(route).toMatch(/commitCredits[\s\S]*runLessonQualityPipeline/);
  });

  it("resolveLessonSource kullanılıyor; loadMergedTopicContext tabanı ölümcül değil", () => {
    expect(route).toContain("resolveLessonSource");
    const source = readFileSync("src/lib/learning/source-context.ts", "utf8");
    expect(source).toContain("baseContext");
    expect(source).toContain('mode === "tolerant"');
  });
});
