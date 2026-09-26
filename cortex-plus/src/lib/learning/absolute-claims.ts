/**
 * Kaynağın açıkça kurmadığı kesin iddia.
 *
 * "sadece / yalnızca / her zaman / asla / hiçbir zaman / kesinlikle / mutlaka"
 * cümleyi evrensel kılar. Kaynakta aynı kısıtlama yoksa iddia düşer.
 * Yanlış yargı olarak sorulan (doğru cevabı "yanlış" olan) önerme burada
 * iddia sayılmaz — ölçülen yanılgının kendisidir.
 */

import { contentStems, stemsOverlap } from "@/lib/learning/learner-fluency";

const MARKER =
  /\b(hiçbir zaman|her zaman|yalnızca|sadece|kesinlikle|mutlaka|asla)\b/i;

/** Kaynağa bağlı olmadan doğru kabul edilmemesi gereken karşılaştırmalı mutlaklar. */
const COMPARATIVE_ABSOLUTE =
  /(?:yalnızca|sadece)\s+bir.{0,40}(?:olabilir|olmalıdır|vardır|mümkündür)|hepsi\s+birlikte\s+tüken|artan\s+(?:madde\s+)?yok|artan\s+madde\s+olmaz/i;

const FAMILY: Record<string, string[]> = {
  exclusive: ["sadece", "yalnızca", "yalnizca", "bir tek", "tek başına", "tek basina"],
  always: ["her zaman", "daima", "kesinlikle", "mutlaka"],
  never: ["asla", "hiçbir zaman", "hicbir zaman", "hiçbir", "hicbir"],
};

/**
 * "Yalnızca bir sınırlayıcı olabilir" / "hepsi birlikte tükenir, artan yok"
 * — kaynak aynı iddiayı kurmuyorsa doğru cevap sayılmaz.
 * Kaynak verilmezse (sözlü rubrik uzlaştırması) varsayılan: desteklenmiyor.
 */
export function isUnsupportedComparativeAbsolute(
  text: string,
  source?: string | null,
): boolean {
  if (!COMPARATIVE_ABSOLUTE.test(text)) return false;
  if (!source?.trim()) return true;
  return unsupportedAbsoluteClaims(text, source).length > 0;
}

function fold(text: string): string {
  return text.toLocaleLowerCase("tr-TR");
}

function familyOf(marker: string): keyof typeof FAMILY {
  const folded = fold(marker);
  if (folded === "sadece" || folded === "yalnızca" || folded === "yalnizca") return "exclusive";
  if (folded === "asla" || folded.includes("hiçbir") || folded.includes("hicbir")) return "never";
  return "always";
}

function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function isDenial(sentence: string, markerIndex: number): boolean {
  const after = sentence.slice(markerIndex, markerIndex + 32);
  return /\b(değil|değildir|yanlış|yanlıştır|gerekmez|olmayabilir|zorunda değil)\b/i.test(after);
}

/**
 * Kaynak cümlesi aynı kısıt ailesini ve aynı kökleri taşıyorsa iddia desteklidir.
 * Yönergedeki "yalnızca veri" gibi kalıplar kök örtüşmediği için destek sayılmaz.
 */
export function unsupportedAbsoluteClaims(text: string, source: string | undefined | null): string[] {
  if (!source?.trim()) return [];
  const issues: string[] = [];
  const sourceSentences = sentences(source);

  for (const sentence of sentences(text).flatMap((part) => part.split(/[,;]/))) {
    if (COMPARATIVE_ABSOLUTE.test(sentence)) {
      const foldedSource = fold(source);
      const supported =
        /(?:yalnızca|sadece)\s+bir/.test(foldedSource) ||
        /hepsi\s+birlikte\s+tüken/.test(foldedSource) ||
        /artan\s+(?:madde\s+)?yok/.test(foldedSource);
      if (!supported) {
        issues.push(`Kaynakta desteklenmeyen kesin iddia: ${sentence.slice(0, 140)}`);
      }
      continue;
    }
    const marker = sentence.match(MARKER);
    if (!marker || marker.index == null || isDenial(sentence, marker.index)) continue;
    const family = FAMILY[familyOf(marker[1])];
    const stems = contentStems(sentence).filter((stem) => !family.some((word) => fold(word).includes(stem)));
    const supported = sourceSentences.some((candidate) => {
      const folded = fold(candidate);
      if (!family.some((word) => folded.includes(fold(word)))) return false;
      if (!stems.length) return true;
      const overlap = contentStems(candidate);
      const shared = stems.filter((stem) => stemsOverlap([stem], overlap));
      return shared.length >= Math.min(2, stems.length);
    });
    if (!supported) {
      issues.push(`Kaynakta desteklenmeyen kesin iddia: ${sentence.slice(0, 140)}`);
    }
  }
  return issues;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/**
 * Öğrenciye doğru diye sunulan metinler.
 * Yanılgı iddiası, şıklar ve "yanlış" işaretli önerme dışarıda kalır.
 */
export function assertedFactTexts(value: unknown, key?: string): string[] {
  if (typeof value === "string") {
    if (key && ["claim", "options", "question", "faultyText", "prompt"].includes(key)) return [];
    return [value];
  }
  if (Array.isArray(value)) return value.flatMap((item) => assertedFactTexts(item));
  const row = asRecord(value);
  if (!row) return [];

  if (row.type === "trueFalse" && typeof row.prompt === "string" && Array.isArray(row.options)) {
    const answer = row.options[typeof row.answerIndex === "number" ? row.answerIndex : -1];
    const texts: string[] = [];
    if (typeof answer === "string" && fold(answer) === "doğru") texts.push(row.prompt);
    if (typeof row.explanation === "string") texts.push(row.explanation);
    return texts;
  }

  if (typeof row.correct === "boolean") {
    const texts: string[] = [];
    if (row.correct && typeof row.text === "string") texts.push(row.text);
    if (typeof row.explanation === "string") texts.push(row.explanation);
    if (typeof row.correctedStatement === "string") texts.push(row.correctedStatement);
    return texts;
  }

  return Object.entries(row).flatMap(([childKey, child]) => {
    if (["claim", "options", "question", "faultyText"].includes(childKey)) return [];
    if (childKey === "text" && Array.isArray(row.options)) return [];
    if (childKey === "prompt" && row.type !== "trueFalse") return [];
    return assertedFactTexts(child, childKey);
  });
}

export function absoluteClaimIssues(parsed: unknown, source: string | undefined | null): string[] {
  if (!source?.trim()) return [];
  const issues: string[] = [];
  for (const text of assertedFactTexts(parsed)) {
    issues.push(...unsupportedAbsoluteClaims(text, source));
  }
  return issues;
}
