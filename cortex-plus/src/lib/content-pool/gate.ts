import { duplicateOptionPair } from "@/lib/learning/question-integrity";
import { fluencyIssues, repairTurkishSurface } from "@/lib/learning/learner-fluency";
import { turkishFold } from "@/lib/text/turkish";
import { DIFFICULTIES, type PoolItem } from "@/lib/content-pool/schema";

/*
  Sıfır maliyetli kapı (model çağrısından önce). Kural ihlali modeli hiç görmez; onarılabilen yazım yerinde onarılır.
  Model yalnız cevap anahtarını ve bilimsel/kazanım uyumunu onaylar (generate.ts verifyPrompt).
*/

export type GateOutcome = { code: string; outcomeId: string; limitations: string[] };
export type GateUnit = { unitId: string; outcomes: GateOutcome[]; choices: number };
export type GatedItem = PoolItem & { unit_id: string; outcome_id: string };
export type GateRejection = { code: string; difficulty: string; reason: string };

export const STEM_LEN = { min: 20, max: 1200 } as const;
export const EXPLANATION_LEN = { min: 20, max: 1500 } as const;
export const CHOICE_MAX = 300;

/** Yapışık ya da bozuk metin: kodlama bozulması, küçük harfe yapışık büyük harf, boşluksuz uzun dizi, kırık parantez. */
export function garbledReason(text: string): string | null {
  if (/\uFFFD|Ã.|Ä.|Å./u.test(text)) return "bozuk karakter kodlaması";
  if (/\p{Ll}{2}\p{Lu}\p{Ll}{2}/u.test(text)) return "yapışık kelime";
  if (/[^\s]{45,}/u.test(text.replace(/https?:\/\/\S+/g, ""))) return "boşluksuz uzun dizi";
  if (/(.)\1{5,}/u.test(text)) return "tekrarlanan karakter";
  const issues = fluencyIssues(text).filter((i) => i === "unbalanced" || i === "spliced");
  return issues.length ? "kırık cümle yapısı" : null;
}

const NEGATION = /(girilmez|değinilmez|verilmez|yer verilmez|ele alınmaz|kapsam dışı|ayrıntısına girilmeden)/u;

/**
 * Sınırlama cümlesinde açıkça dışlanan terimler: yalnız olumsuz hükümlü cümledeki parantez içi listeler
 * ("... (a, b, c) girilmez"). Serbest metinden terim uydurulmaz; daha ince kapsam denetimi modelde.
 */
export function excludedTerms(limitations: string[]): string[] {
  const out: string[] = [];
  for (const line of limitations) {
    if (!NEGATION.test(line)) continue;
    for (const match of line.matchAll(/\(([^()]{3,200})\)/g)) {
      for (const term of match[1]!.split(/[,;]| ve /)) {
        const t = term.trim();
        if (t.length >= 4 && !/^(örneğin|ör\.|vb\.?|gibi)$/iu.test(t)) out.push(turkishFold(t));
      }
    }
  }
  return out;
}

function lengthReason(label: string, text: string, range: { min: number; max: number }): string | null {
  const n = text.trim().length;
  return n < range.min ? `${label} çok kısa` : n > range.max ? `${label} çok uzun` : null;
}

/** Tek soru: onarılmış soru ya da ret gerekçesi. */
export function gateItem(item: PoolItem, unit: GateUnit): { item: GatedItem } | { reason: string } {
  const code = item.outcome_code.trim();
  const outcome = unit.outcomes.find((o) => o.code === code);
  if (!outcome) return { reason: "kayıtta olmayan kazanım" };
  if (!outcome.outcomeId || !unit.unitId) return { reason: "unit_id/outcome_id yok" };
  if (!DIFFICULTIES.includes(item.difficulty)) return { reason: "bilinmeyen zorluk" };
  const stem = repairTurkishSurface(item.stem.trim());
  const explanation = repairTurkishSurface(item.explanation.trim());
  const choices = item.choices.map((c) => repairTurkishSurface(c.trim().replace(/^[A-Ea-e][).]\s+/, "")));
  if (choices.length !== unit.choices) return { reason: `seçenek sayısı ${choices.length} (beklenen ${unit.choices})` };
  if (!Number.isInteger(item.answer) || item.answer < 0 || item.answer >= choices.length) return { reason: "cevap seçeneklerin dışında" };
  if (choices.some((c) => !c)) return { reason: "boş seçenek" };
  if (choices.some((c) => c.length > CHOICE_MAX)) return { reason: "seçenek çok uzun" };
  if (duplicateOptionPair(choices)) return { reason: "aynı seçenek iki kez" };
  const length = lengthReason("kök", stem, STEM_LEN) ?? lengthReason("açıklama", explanation, EXPLANATION_LEN);
  if (length) return { reason: length };
  for (const text of [stem, explanation, ...choices]) {
    const garbled = garbledReason(text);
    if (garbled) return { reason: garbled };
  }
  const folded = turkishFold(`${stem} ${choices.join(" ")}`);
  const excluded = excludedTerms(outcome.limitations).find((t) => folded.includes(t));
  if (excluded) return { reason: `kazanım sınırı dışında (${excluded})` };
  return { item: { ...item, outcome_code: code, stem, explanation, choices, unit_id: unit.unitId, outcome_id: outcome.outcomeId } };
}

/**
 * Soru seti: her soru kapıdan geçer; aynı kazanım × zorluk çifti bir kez kalır (zorluk dağılımı: kazanım başına
 * kolay/orta/zor birer soru). `distribution` raporlanır.
 */
export function gateItems(items: PoolItem[], unit: GateUnit): {
  passed: GatedItem[];
  rejected: GateRejection[];
  distribution: Record<(typeof DIFFICULTIES)[number], number>;
} {
  const passed: GatedItem[] = [];
  const rejected: GateRejection[] = [];
  const seen = new Set<string>();
  for (const raw of items) {
    const result = gateItem(raw, unit);
    if ("reason" in result) {
      rejected.push({ code: raw.outcome_code, difficulty: raw.difficulty, reason: result.reason });
      continue;
    }
    const key = `${result.item.outcome_code}|${result.item.difficulty}`;
    if (seen.has(key)) {
      rejected.push({ code: raw.outcome_code, difficulty: raw.difficulty, reason: "aynı kazanım × zorluk ikinci kez" });
      continue;
    }
    seen.add(key);
    passed.push(result.item);
  }
  const distribution = { easy: 0, medium: 0, hard: 0 };
  for (const item of passed) distribution[item.difficulty] += 1;
  return { passed, rejected, distribution };
}
