/**
 * Ders iddialarını ve konu başlığının kapsamını kaynağa bağlar.
 *
 * Model çağrısı burada yok. Doğrulayıcı ve onarım bu saf kontrolleri
 * kullanır; uymayan kart ve cümle düşer, eksik kavram uydurulmaz.
 */

import { foldTr } from "@/lib/documents/page-analysis";
import { scoreLessonFromAnswers } from "@/lib/learning/lesson-play";

const GENERIC = new Set([
  "kavram",
  "kavrami",
  "kavramlar",
  "kavramlari",
  "giris",
  "temel",
  "konu",
  "konular",
  "ders",
  "dersi",
  "ve",
  "ile",
  "icin",
  "veya",
]);

/**
 * En uzun kavram eşlenen sayfalarda duruyorsa kısa kalan sözcük
 * başka bölümü içeri almaz. Uzun kavram eksikse o kavramın sayfası eklenir.
 */
export function conceptsWorthWidening(title: string, mappedText: string): string[] {
  const concepts = titleConcepts(title);
  if (!concepts.length) return [];
  const longest = concepts.reduce((best, item) => (item.length > best.length ? item : best));
  if (conceptInText(longest, mappedText)) return [];
  return concepts.filter((concept) => !conceptInText(concept, mappedText));
}

/** Sayıdan sonra gelen ölçü birimi. Uzun birim, kısa birimden önce durur. */
export const MEASURE =
  "(?:kJ\\s*\\/\\s*\\(\\s*kg\\s*·\\s*K\\s*\\)|kJ\\/\\(kg·K\\)|kJ\\/kg·K|kJ\\/kg|kJ\\/mol|g\\/mol|mol\\/L|m³\\/kg|m3\\/kg|kJ|kcal|kPa|MPa|Pa|kg|mol|°C|K|m³|m3|mL|L|g|%)";

/** "İç Enerji, Entalpi ve Özgül Isılar" → iç enerji, entalpi, özgül ısılar. */
export function titleConcepts(title: string): string[] {
  const parts = title.split(/\s*(?:,| ve )\s*/i);
  const out: string[] = [];
  for (const part of parts) {
    const words = part
      .split(/\s+/)
      .map((word) => word.trim())
      .filter((word) => word.length >= 2 && !GENERIC.has(foldTr(word)));
    const phrase = words.join(" ").trim();
    if (phrase.length < 3) continue;
    if (out.some((item) => foldTr(item) === foldTr(phrase))) continue;
    out.push(phrase);
  }
  return out;
}

/** Kaynakta kavramın kendisi ya da ayırt edici kökü geçiyor mu. */
export function conceptInText(concept: string, text: string): boolean {
  const folded = foldTr(text);
  const phrase = foldTr(concept).replace(/\s+/g, " ").trim();
  if (!phrase) return false;
  if (folded.includes(phrase)) return true;
  const stem = phrase.replace(/(lar|ler)$/, "").trim();
  return stem.length >= 4 && folded.includes(stem);
}

/**
 * Ders skoru ilk denemedeki kontrol sorularıdır.
 * Tekrar doğru olsa bile kaçan soru doğruya yazılmaz.
 * `lessonAnswers` varsa sunucu notlar; eski `lessonMisses` yedeği kalır.
 */
export function scoreLessonChecks(
  lesson: { sections?: { check?: unknown }[] } | null | undefined,
  answers: Record<string, unknown>,
): { score: number; total: number; retried: number } {
  return scoreLessonFromAnswers(lesson, answers);
}
