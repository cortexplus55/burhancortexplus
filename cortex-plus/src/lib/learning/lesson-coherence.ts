/**
 * Ders parçası cümle cümle silinince göndereni olmayan artık kalıyordu.
 *
 * "Bu sayı…", "Böylece…" ve "Örnek 2" tek başına yayına çıkıyordu; kontrol
 * sorusu da aynı artığın sonuna "Bu ifade doğru mudur?" eklenerek kuruluyordu.
 * Kapı öğretim birimine bakar: tanım, açıklama paragrafı ya da adımlı örnek.
 * Birim bozulursa kaynak metinden yeniden kurulur. Kaynak da yetmezse parça
 * düşer. Kırık cümle öğrenciye gitmez.
 */

import { foldTr } from "@/lib/documents/page-analysis";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

/** Bölümün ilk cümlesi bunlar ile başlıyorsa gönderen yoktur. */
const DANGLING =
  /^(?:bu\s+(?:sayi|ifade|kavram|ornek(?:lerle)?|formuller|yontem|islem|sonuc)|boylece|dolayisiyla|bu\s+yuzden|bu\s+nedenle|oysa|halbuki)\b/;

function opener(sentence: string): string {
  return foldTr(sentence).replace(/^[^a-z0-9]+/, "");
}

/** "Bu sayı", "Böylece", "Bu örneklerle" — önceki cümle yoksa artık. */
export function danglingOpener(sentence: string): boolean {
  return DANGLING.test(opener(sentence));
}

function priorSupports(sentence: string, prior: string): boolean {
  if (!prior.trim()) return false;
  const folded = opener(sentence);
  const hay = foldTr(prior);
  if (/^bu sayi\b/.test(folded)) return /\d|avogadro|\bsayi\b/.test(hay);
  if (/ornek/.test(folded)) return /ornek/.test(hay);
  return true;
}

/**
 * Doğrulama bir cümleyi silince arkada kalan gönderensiz cümle de gider.
 * Göndereni duran "Bu sayıya Avogadro sayısı denir" kalır.
 */
export function retainAnchoredSentences(sentences: string[]): string[] {
  const kept: string[] = [];
  for (const sentence of sentences) {
    if (!danglingOpener(sentence)) {
      kept.push(sentence);
      continue;
    }
    if (!priorSupports(sentence, kept.join(" "))) continue;
    kept.push(sentence);
  }
  return kept;
}

export function honestReadingMinutes(lesson: Pick<LessonV2, "overview" | "sections" | "example" | "summary" | "commonMistake" | "infoCheck">): number {
  const text = [
    lesson.overview ?? "",
    ...lesson.sections.map((section) => `${section.heading} ${section.body} ${section.check?.prompt ?? ""}`),
    lesson.example?.prompt ?? "",
    lesson.example?.solution ?? "",
    lesson.commonMistake?.correction ?? "",
    lesson.infoCheck?.prompt ?? "",
    ...(lesson.summary ?? []),
  ].join(" ");
  const words = text.split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.min(40, Math.round(words / 130)));
}

/** Plan 27 dk deyip metin 6 cümleyse yol etiketi okuma süresine iner. */
export function shouldReplacePlannedMinutes(planned: number, honest: number): boolean {
  if (!Number.isFinite(planned) || !Number.isFinite(honest)) return false;
  if (planned < 8 || honest < 1) return false;
  return honest * 2 < planned;
}
