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

/** "X yapmak. Doğrusu: Y" → hata ve düzeltme; düzeltme yoksa hata metni tek başına. */
function splitMistake(text: string): { mistake: string; fix: string } {
  const clean = text.replace(/^[•\-–]\s*/, "").trim();
  const at = clean.search(/\s*Doğrusu\s*:\s*/i);
  if (at < 0) return { mistake: clean, fix: clean };
  const mistake = clean.slice(0, at).trim().replace(/[.;:]+$/, "");
  const fix = clean.slice(at).replace(/^\s*Doğrusu\s*:\s*/i, "").trim();
  return { mistake, fix: fix || clean };
}

/**
 * Soru ile rubrik aynı şeyi ister (4 Kasım 2026 canlı, Senaryo A): "bir hatayı söyle" sorusu bütün hataları ve
 * ana noktaları bekliyordu; doğru cevap %25 "yanlış" notlanıyordu. Hata sorusu artık hatayı adıyla verir ve
 * yalnız onun düzeltmesini bekler; örnek sorusu örneğin çözümünü örnek cevap yapar.
 */
function draftFor(section: Section, variant: number): OralQuestionDraft | null {
  const heading = section.heading.replace(/[.:;]+$/, "").trim();
  const keyPoints = section.key_points.map((p) => p.trim()).filter((p) => p.length >= 2);
  const mistakes = (section.common_mistakes ?? []).map((p) => p.trim()).filter((p) => p.length >= 2);
  let prompt: string;
  let points: string[];
  let modelAnswer: string;
  if (variant % 3 === 1 && mistakes.length) {
    const { mistake, fix } = splitMistake(mistakes[0]!);
    prompt = `«${heading}» konusunda sık yapılan şu hatayı açıkla: “${mistake}”. Neden yanlış, doğrusu ne? Gerekçesiyle anlat.`;
    points = [fix];
    modelAnswer = fix;
  } else if (variant % 3 === 2 && section.worked_example?.trim() && keyPoints.length) {
    prompt = `«${heading}» konusunu bir örnek üzerinden anlat: temel kuralı söyle ve örnekte nasıl uygulandığını açıkla.`;
    points = keyPoints.slice(0, 2);
    modelAnswer = sentences(section.worked_example, 4);
  } else {
    prompt = `«${heading}» konusunu açıkla: temel kavramları ve aralarındaki ilişkiyi kendi cümlelerinle anlat.`;
    points = keyPoints.slice(0, 3);
    modelAnswer = sentences(section.explanation, 4);
  }
  if (!points.length) return null;
  return {
    prompt,
    // İpucu cevabı vermez: ilk noktanın yalnız ilk birkaç kelimesi.
    hint: `${points[0]!.split(/\s+/).slice(0, 3).join(" ")}…`,
    learningObjective: section.heading,
    expectedPoints: points,
    modelAnswer,
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
