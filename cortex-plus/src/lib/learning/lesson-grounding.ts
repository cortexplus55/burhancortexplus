/**
 * Öğrencinin gördüğü her alan kaynak sayfasına ve tanım denetimine girer.
 *
 * Canlı ders "kJ/kg toplam enerji, kJ özgül enerji" cümlesini geçirdi.
 * Bu cümle matematik iddiası değildi, nicelik taraması birim sözcüğüne
 * bakmıyordu, doğrulayıcı notu üslup sayıldı. Cümle burada kesilir;
 * dersin geri kalanı ilk denemede açılır.
 */

import { foldTr } from "@/lib/documents/page-analysis";
import { quantityClaimGrounded, unsupportedQuantities } from "@/lib/learning/teacher-brain";
import { retainAnchoredSentences } from "@/lib/learning/lesson-coherence";
import {
  definitionalInversionIssues,
} from "@/lib/learning/unit-inversions";

type Alien = { label: string; pattern: RegExp };

const ALIEN_TOKENS: Alien[] = [
  { label: "kJ/kg", pattern: /k(?:j|cal)\s*\/\s*kg/i },
  { label: "kJ", pattern: /(?<![\w/])(?:kj|kcal|mj)(?!\s*\/)/i },
  { label: "kW", pattern: /(?<![\w/])(?:kw|mw)(?![\w/])/i },
  { label: "kg/s", pattern: /kg\s*\/\s*s/i },
  { label: "m3/kg", pattern: /m[³3]\s*\/\s*kg/i },
  { label: "entalpi", pattern: /entalpi|enthalpy/i },
  { label: "özgül enerji", pattern: /özgül\s+enerji|ozgul\s+enerji|specific\s+energy/i },
  { label: "özgül hacim", pattern: /özgül\s+hacim|ozgul\s+hacim|specific\s+volume/i },
];

function sentencesOf(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ“"])/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function sourceHas(source: string, pattern: RegExp): boolean {
  const folded = foldTr(source);
  pattern.lastIndex = 0;
  if (pattern.test(folded)) return true;
  pattern.lastIndex = 0;
  return pattern.test(source);
}

function truncated(source: string): boolean {
  return source.includes("kısaltıldı");
}

function alienHit(text: string, source: string): string | null {
  if (!source.trim() || truncated(source)) return null;
  const folded = foldTr(text);
  for (const alien of ALIEN_TOKENS) {
    alien.pattern.lastIndex = 0;
    if (!alien.pattern.test(folded)) continue;
    if (!sourceHas(source, alien.pattern)) return alien.label;
  }
  return null;
}

function sentenceReason(sentence: string, source: string): string | null {
  if (definitionalInversionIssues(sentence).length) return "definition_inversion";
  const alien = alienHit(sentence, source);
  if (alien) return `off_topic:${alien}`;
  if (
    source.trim() &&
    !truncated(source) &&
    unsupportedQuantities(sentence, source).length &&
    !quantityClaimGrounded(sentence, source)
  ) {
    return "unsupported_quantity";
  }
  return null;
}

function cleanProse(text: string, source: string, removed: string[], field: string): string {
  const kept = sentencesOf(text).filter((sentence) => {
    const reason = sentenceReason(sentence, source);
    if (!reason) return true;
    removed.push(`${field}:${reason}`);
    return false;
  });
  // Silinen cümlenin göndereni gidince "Bu sayı" / "Böylece" de düşer.
  const anchored = retainAnchoredSentences(kept);
  if (anchored.length < kept.length) removed.push(`${field}:dangling`);
  return anchored.join(" ").replace(/\s+/g, " ").trim();
}

/**
 * Öğrenciye giden tek metin. Ters tanım, kaynakta olmayan birim ve sayı düşer.
 * Kalan cümle yoksa null. Kaynak boşsa yalnız tanım denetimi çalışır.
 */
export function groundLearnerText(text: string, source: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return null;
  const removed: string[] = [];
  const cleaned = cleanProse(trimmed, source, removed, "text");
  if (!removed.length) return trimmed;
  return cleaned.length >= 8 ? cleaned : null;
}

function hasFiniteVerb(folded: string): boolean {
  return folded.split(/[^a-z0-9]+/).some(
    (word) => word.length >= 5 && /(?:ir|ur|ar|er|yor|dir|dur|tir|tur|mis|mus)$/.test(word),
  );
}

function truncatedEnding(text: string): boolean {
  const trimmed = text.trim();
  if (/[,:]\s*$/.test(trimmed)) return true;
  const folded = foldTr(trimmed).replace(/[.?!]+\s*$/g, "");
  return /\b(cunku|ve|ile|veya)\s*$/.test(folded);
}

function hasCopula(folded: string): boolean {
  return folded.split(/[^a-z0-9]+/).some(
    (word) => word.length >= 5 && /(?:dir|dur|tir|tur|yor|mistir|mustur)$/.test(word),
  );
}

/** Virgülle dizilmiş başlık. Eşitlik ve yüklem yoksa cümle değildir. */
function bareTitle(text: string): boolean {
  if (/[=≤≥]/.test(text)) return false;
  const folded = foldTr(text);
  if (hasCopula(folded)) return false;
  const words = text.replace(/[.,:;!?()]/g, " ").split(/\s+/).filter((word) => word.length > 2);
  const capped = words.filter((word) => /^[A-ZÇĞİÖŞÜ]/.test(word));
  if (capped.length >= 3) return true;
  return !/[.!?]\s*$/.test(text) && !hasFiniteVerb(folded);
}

/**
 * Özet satırı bir olgu cümlesi değilse nedeni.
 * Başlık, öğrenme hedefi, etiket zinciri, kesik cümle ve beş sözcükten
 * kısa parça yayımlanmaz. Tek iki nokta üst üste, formülün önünde durabilir.
 */
export function summaryLineProblem(
  text: string,
): "fragment" | "heading" | "objective" | "flashcard" | "truncated" | "vague" | null {
  const folded = foldTr(text);
  if (/^\s*soru\s*:/i.test(text) || /\bcevap\s*:/i.test(text) || /\?:/.test(text)) return "flashcard";
  if (
    /ifade\s+(dogru|yanlis)/.test(folded) ||
    /dogru cevap/.test(folded) ||
    /secenek/.test(folded) ||
    /digerleri/.test(folded) ||
    /diger secenek/.test(folded) ||
    /\byanlis\b/.test(folded)
  ) {
    return "flashcard";
  }
  if (/\bornek\s*:/i.test(text) && !/=\s*\d/.test(text)) return "fragment";
  if (/gibi parametrelerle belirlenen|belirlenen sistemlerdir/.test(folded)) return "vague";
  if (/\b(ogren|ogrenin|kavra|kavrayin)\b/.test(folded)) return "objective";
  if (/(gerceklestirme|uygulayabilmek|gorsellestirme|ogrenmek|anlayabilmek|kullanabilmek)\s*\.?$/.test(folded)) {
    return "objective";
  }
  if (/(?:me|ma|mek|mak)\s*\.?$/.test(folded) && !hasFiniteVerb(folded)) return "objective";
  if (truncatedEnding(text)) return "truncated";
  if ((text.match(/:/g) ?? []).length >= 2) return "heading";
  if (/\s[-–—]\s/.test(text) && !hasFiniteVerb(folded) && !/[=≤≥]/.test(text)) return "heading";
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length < 5 && !/[=≤≥]/.test(text)) return "fragment";
  if (bareTitle(text)) return "heading";
  return null;
}

/** Konu sırasında bu başlıktan sonrakiler. Eşleşme yoksa null. */
export function upcomingTopicsAfter(
  currentTitle: string,
  titles: string[],
  limit = 3,
): string[] | null {
  const current = foldTr(currentTitle).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
  if (!current) return null;
  const folded = titles.map((title) => ({
    title: title.trim(),
    key: foldTr(title).replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim(),
  }));
  let index = folded.findIndex((row) => row.key === current);
  if (index < 0) {
    let bestLen = 0;
    folded.forEach((row, rowIndex) => {
      if (row.key.length < 8) return;
      const hit = row.key.includes(current) || current.includes(row.key);
      if (!hit || row.key.length <= bestLen) return;
      index = rowIndex;
      bestLen = row.key.length;
    });
  }
  if (index < 0) return null;
  const seen = new Set<string>();
  const next: string[] = [];
  for (const row of folded.slice(index + 1)) {
    if (row.title.length < 2 || !row.key || seen.has(row.key)) continue;
    seen.add(row.key);
    next.push(row.title.slice(0, 200));
    if (next.length >= limit) break;
  }
  return next;
}
