/**
 * Belgesiz sözlü sınav, havuzdan anında (3 Kasım 2026, t260u): doğrulanmış ünite dersinin bölümleri sözlü
 * sorusuna dönüşür. Model çağrısı yok (0 $, 0 kredi farkı yok); beklenen noktalar bölümün doğrulanmış ana
 * noktaları, örnek cevap bölüm anlatımının ilk cümleleri. Notlandırma bugünkü hakem yolundan geçer.
 */
import type { LessonBody } from "@/lib/content-pool/schema";
import type { OralQuestionDraft } from "@/lib/learning/oral-exam";

type Section = LessonBody["sections"][number];

function sentences(text: string, max: number): string {
  const parts = text.replace(/\s+/g, " ").trim().split(/(?<=[.!?])\s+/).filter(Boolean);
  return parts.slice(0, max).join(" ").slice(0, 900);
}

function promptFor(section: Section, variant: number): string {
  const heading = section.heading.replace(/[.:;]+$/, "").trim();
  if (variant % 3 === 1 && section.common_mistakes?.length) {
    return `«${heading}» konusunda öğrencilerin sık yaptığı bir hatayı söyle ve doğrusunu gerekçesiyle açıkla.`;
  }
  if (variant % 3 === 2 && section.worked_example?.trim()) {
    return `«${heading}» konusunu bir örnek üzerinden anlat: temel kuralı söyle ve örnekte nasıl uygulandığını açıkla.`;
  }
  return `«${heading}» konusunu açıkla: temel kavramları ve aralarındaki ilişkiyi kendi cümlelerinle anlat.`;
}

function draftFor(section: Section, variant: number): OralQuestionDraft | null {
  const prompt = promptFor(section, variant);
  const mistakeMode = prompt.includes("sık yaptığı");
  const points = (mistakeMode ? [...(section.common_mistakes ?? []), ...section.key_points] : section.key_points)
    .map((p) => p.trim())
    .filter((p) => p.length >= 2)
    .slice(0, 4);
  if (!points.length) return null;
  return {
    prompt,
    // İpucu cevabı vermez: ilk noktanın yalnız ilk birkaç kelimesi.
    hint: `${points[0]!.split(/\s+/).slice(0, 3).join(" ")}…`,
    learningObjective: section.heading,
    expectedPoints: points,
    modelAnswer: sentences(section.explanation, 4),
    rubricCriteria: points,
  };
}

/**
 * Konular sırayla dönerek (K1 b1, K2 b1, K1 b2…) en çok `count` soru. Aynı bölüm iki kez sorulmaz.
 * Dilimlerin hiçbirinde ana noktası olan bölüm yoksa boş dizi (çağıran bugünkü üretim yoluna düşer).
 */
export function oralDraftsFromPool(lessons: readonly LessonBody[], count: number): OralQuestionDraft[] {
  const queues = lessons.map((l) => [...l.sections]);
  const out: OralQuestionDraft[] = [];
  let variant = 0;
  while (out.length < count && queues.some((q) => q.length)) {
    for (const queue of queues) {
      if (out.length >= count) break;
      while (queue.length) {
        const draft = draftFor(queue.shift()!, variant);
        if (draft) {
          out.push(draft);
          variant += 1;
          break;
        }
      }
    }
  }
  return out;
}
