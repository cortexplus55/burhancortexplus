/**
 * Kaynak araması yedeği (19 Kasım 2026, Faz 1-A §3.3) — ders bağımsız, saf modül.
 *
 * Belgeli hazırlığın Kolay / Orta konu testinde vektör ya da kaynak araması boş dönerse veya düşerse öğrenci
 * "Kaynak araması geçici olarak başarısız oldu" görmez: test konunun kayıtlı dersinden (`lesson_context`), o da
 * yetmezse ünite özetinden (`unit_summary`) yazılır. İleri test, ders ve öbür türler bugünkü gibi kapalı kalır
 * (belgesiz genel bilgiyle doldurma yok).
 */
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import type { LessonV2 } from "@/lib/learning/teaching-standards";
import { quizDifficulty } from "@/lib/learning/teacher-quiz";

export type SourceFallbackKind = "lesson_context" | "unit_summary";

export type SourceFallback = { kind: SourceFallbackKind; block: string; documentName: string };

/** Yedek kaynağın en az ve en çok uzunluğu (karakter). */
export const SOURCE_FALLBACK_LIMITS = { lessonMin: 400, summaryMin: 120, max: 12_000 } as const;

/** Yalnız konu testi (quiz) ve yalnız Kolay / Orta (seçilmemişse orta sayılır). */
export function sourceFallbackAllowed(kind: PlanNodeKind, difficulty: string | null | undefined): boolean {
  return kind === "quiz" && quizDifficulty(difficulty) !== "ileri";
}

function line(value: string | null | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/** Kayıtlı dersin bütün anlatımı: başlık, hedef, öz, bölümler, yanılgı, kapanış. */
export function lessonContextText(lesson: LessonV2): string {
  return [
    `Konu dersi: ${line(lesson.title)}`,
    lesson.objective ? `Hedef: ${line(lesson.objective)}` : "",
    lesson.overview ? `Özet: ${line(lesson.overview)}` : "",
    ...lesson.sections.map((section) => `${line(section.heading)}: ${line(section.body)}`),
    lesson.commonMistake ? `Sık yanılgı: ${line(lesson.commonMistake.claim)} Doğrusu: ${line(lesson.commonMistake.correction)}` : "",
    lesson.summary?.length ? `Kapanış: ${lesson.summary.map(line).join(" ")}` : "",
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, SOURCE_FALLBACK_LIMITS.max);
}

/** Ünite özeti: dersin özü ve kapanış maddeleri. */
export function unitSummaryText(lesson: LessonV2): string {
  return [
    `Ünite özeti: ${line(lesson.title)}`,
    lesson.overview ? line(lesson.overview) : "",
    ...(lesson.summary ?? []).map((item) => `- ${line(item)}`),
  ]
    .filter(Boolean)
    .join("\n")
    .slice(0, SOURCE_FALLBACK_LIMITS.max);
}

/** Önce ders bağlamı, yetmezse ünite özeti; ikisi de yetmezse null (bugünkü hata). */
export function lessonSourceFallback(lesson: LessonV2 | null | undefined): SourceFallback | null {
  if (!lesson) return null;
  const context = lessonContextText(lesson);
  if (context.length >= SOURCE_FALLBACK_LIMITS.lessonMin) {
    return { kind: "lesson_context", block: context, documentName: "Konu dersi" };
  }
  const summary = unitSummaryText(lesson);
  if (summary.length >= SOURCE_FALLBACK_LIMITS.summaryMin) {
    return { kind: "unit_summary", block: summary, documentName: "Ünite özeti" };
  }
  return null;
}
