/**
 * Adım adım kısmi puan (bütün dersler).
 *
 * Plan, öğeyle birlikte üretilir. Doğru yöntem ve son adımda kayma kısmi puandır.
 * Yöntem yanlışsa 0. Son değer işlemsiz yazıldıysa çoktan seçmelide tam, açık
 * uçluda pay. Ders adı ya da terim listesi yok.
 */

import { evaluate } from "@/lib/solve/step-arithmetic";
import { parseMeasures } from "@/lib/learning/unit-expect";

export type SolutionStep = {
  order: number;
  formula: string;
  value: number;
  unit: string | null;
  weight: number;
};

export type SolutionPlan = {
  steps: SolutionStep[];
  /** İşlem göstermeden yalnız son değer. Açık uçluda bu pay; çoktan seçmelide tam. */
  finalOnlyShare: number;
};

export type GradeMode = "mcq" | "open" | "numeric";

const YEAR = /\b(?:1[0-9]{3}|20[0-9]{2})\b/;

export function evaluateExpression(raw: string): number | null {
  const text = raw
    .trim()
    .replace(/[·×∙]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\s+/g, "");
  if (!text || /[a-zA-ZçğıöşüÇĞİÖŞÜ_]/u.test(text)) return null;
  return evaluate(text);
}

export function valuesClose(left: number, right: number): boolean {
  const scale = Math.max(Math.abs(left), Math.abs(right), 1);
  return Math.abs(left - right) <= Math.max(1e-6, scale * 0.02);
}

export function validSolutionPlan(plan: unknown): plan is SolutionPlan {
  if (!plan || typeof plan !== "object") return false;
  const row = plan as SolutionPlan;
  if (!Array.isArray(row.steps) || row.steps.length < 1 || row.steps.length > 8) return false;
  const share = row.finalOnlyShare;
  if (typeof share !== "number" || share <= 0 || share > 1) return false;
  const orders = new Set<number>();
  for (const step of row.steps) {
    if (!step || typeof step.formula !== "string" || !step.formula.trim()) return false;
    if (typeof step.value !== "number" || !Number.isFinite(step.value)) return false;
    if (typeof step.weight !== "number" || step.weight <= 0) return false;
    if (!Number.isInteger(step.order) || orders.has(step.order)) return false;
    orders.add(step.order);
    const got = evaluateExpression(step.formula);
    if (got == null || !valuesClose(got, step.value)) return false;
  }
  return true;
}

type FoundNumber = { value: number; quantity: string | null; sentence: number };

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}

function numbersInSentence(sentence: string, sentenceIndex: number): FoundNumber[] {
  if (YEAR.test(sentence) && (sentence.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/g) ?? []).length >= 1) {
    const years = new Set(sentence.match(/\b(?:1[0-9]{3}|20[0-9]{2})\b/g) ?? []);
    const rest = sentence.replace(/\b(?:1[0-9]{3}|20[0-9]{2})\b/g, " ");
    if (!/\d/.test(rest)) return [];
    return collect(rest, sentenceIndex).filter((item) => !years.has(String(item.value)));
  }
  return collect(sentence, sentenceIndex);
}

function collect(sentence: string, sentenceIndex: number): FoundNumber[] {
  const measures = parseMeasures(sentence);
  if (measures.length) {
    return measures.map((item) => ({ value: item.value, quantity: item.quantity, sentence: sentenceIndex }));
  }
  const out: FoundNumber[] = [];
  const masked = sentence.replace(/\b(?:1[0-9]{3}|20[0-9]{2})\b/g, " ");
  for (const match of masked.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const value = Number(match[0].replace(",", "."));
    if (!Number.isFinite(value)) continue;
    out.push({ value, quantity: null, sentence: sentenceIndex });
  }
  return out;
}

export type DerivedQuestion = {
  prompt: string;
  modelAnswer: string;
  plan: SolutionPlan;
  value: number;
  unit: string | null;
};

/**
 * Kaynakta aynı birimle kapanan bir çarpım varsa açık uçlu hesap sorusu.
 * Cümleler arası yalnız çarpım; çıkarma tesadüfî kapanışı soru yapmaz.
 */
export function derivationQuestion(block: string, language: "tr" | "en" | "unknown"): DerivedQuestion | null {
  const sentences = splitSentences(block);
  const found: FoundNumber[] = [];
  sentences.forEach((sentence, index) => {
    if ((sentence.match(YEAR) ?? []).length >= 2) return;
    found.push(...numbersInSentence(sentence, index));
  });
  for (let i = 0; i < found.length; i += 1) {
    for (let j = i + 1; j < found.length; j += 1) {
      const a = found[i]!;
      const b = found[j]!;
      if (a.quantity !== b.quantity) continue;
      const product = a.value * b.value;
      const hit = found.find(
        (item, index) =>
          index !== i &&
          index !== j &&
          item.quantity === a.quantity &&
          valuesClose(item.value, product) &&
          (item.sentence === a.sentence || a.quantity != null),
      );
      if (!hit) continue;
      const left = trimNumber(a.value);
      const right = trimNumber(b.value);
      const formula = `${left}*${right}`;
      const value = product;
      const unit = a.quantity;
      const shown = `${left} × ${right}`;
      const prompt =
        language === "en"
          ? `Write the result of ${shown} and show the steps.`
          : `${shown} işleminin sonucunu adımlarıyla yaz.`;
      const modelAnswer = `${shown} = ${trimNumber(value)}`;
      const plan: SolutionPlan = {
        steps: [{ order: 1, formula, value, unit, weight: 1 }],
        finalOnlyShare: 0.5,
      };
      if (!validSolutionPlan(plan)) continue;
      return { prompt, modelAnswer, plan, value, unit };
    }
  }
  return null;
}

function trimNumber(value: number): string {
  const rounded = Math.round(value * 1000) / 1000;
  return String(rounded);
}

function normalizeWork(text: string): string {
  return text
    .replace(/[·×∙]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–]/g, "-")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\s+/g, "");
}

function showsFormula(answer: string, formula: string): boolean {
  const work = normalizeWork(answer);
  const target = normalizeWork(formula);
  if (target && work.includes(target)) return true;
  const match = formula.match(/(-?\d+(?:[.,]\d+)?)\s*([*/+\-×÷·])\s*(-?\d+(?:[.,]\d+)?)/);
  if (!match) return false;
  const op = match[2] === "×" || match[2] === "·" ? "*" : match[2] === "÷" ? "/" : match[2];
  const left = match[1]!.replace(",", ".");
  const right = match[3]!.replace(",", ".");
  const pattern = new RegExp(`${left.replace(".", "\\.")}\\${op}${right.replace(".", "\\.")}`);
  return pattern.test(work);
}

function statedResult(answer: string): number | null {
  const equalities = [...answer.matchAll(/=\s*(-?\d+(?:[.,]\d+)?)/g)];
  if (equalities.length) {
    const last = equalities[equalities.length - 1]?.[1];
    if (!last) return null;
    const value = Number(last.replace(",", "."));
    return Number.isFinite(value) ? value : null;
  }
  if (/[-+*/×÷·]/.test(answer)) return null;
  const nums = [...answer.matchAll(/-?\d+(?:[.,]\d+)?/g)];
  if (nums.length !== 1) return null;
  const value = Number(nums[0]![0].replace(",", "."));
  return Number.isFinite(value) ? value : null;
}

function roundPoints(value: number): number {
  return Math.round(value * 1000) / 1000;
}

/** Kısmi puan (0, max) içinde kalır. Oran 0,6 ile 0,8 arasındadır. */
export function partialShare(max: number): number {
  const ratio = 0.7;
  const earned = roundPoints(max * ratio);
  if (earned <= 0) return roundPoints(max * 0.6);
  if (earned >= max) return roundPoints(max * 0.8);
  return earned;
}

export function gradeSolution(
  answer: string,
  plan: SolutionPlan,
  max: number,
  mode: GradeMode,
): { earned: number; verdict: "dogru" | "kismen" | "yanlis" | "bos" } {
  const text = answer.trim();
  if (!text) return { earned: 0, verdict: "bos" };
  const steps = [...plan.steps].sort((a, b) => a.order - b.order);
  const last = steps[steps.length - 1];
  if (!last || max <= 0) return { earned: 0, verdict: "yanlis" };
  const stated = statedResult(text);
  const finalClose = stated != null && valuesClose(stated, last.value);
  const lastMethod = showsFormula(text, last.formula);
  const priorOk = steps.slice(0, -1).every((step) => showsFormula(text, step.formula));
  const hasOperator = /[-+*/×÷·]/.test(text);

  if (lastMethod && priorOk && finalClose) return { earned: max, verdict: "dogru" };
  if ((lastMethod || (priorOk && steps.length > 1)) && priorOk && stated != null && !finalClose) {
    return { earned: partialShare(max), verdict: "kismen" };
  }
  if (!hasOperator && finalClose) {
    if (mode === "mcq" || mode === "numeric") return { earned: max, verdict: "dogru" };
    const earned = roundPoints(max * plan.finalOnlyShare);
    if (earned <= 0) return { earned: 0, verdict: "yanlis" };
    if (earned >= max) return { earned: max, verdict: "dogru" };
    return { earned, verdict: "kismen" };
  }
  return { earned: 0, verdict: "yanlis" };
}

/** Sütun yoksa plan, örnek cevaptaki eşitlikten okunur. */
export function planFromModelAnswer(modelAnswer: string | null | undefined): SolutionPlan | null {
  const text = modelAnswer?.trim() ?? "";
  const match = text.match(/(-?\d+(?:[.,]\d+)?(?:\s*[-+*/×÷·]\s*-?\d+(?:[.,]\d+)?)+)\s*=\s*(-?\d+(?:[.,]\d+)?)/);
  if (!match) return null;
  const formula = match[1]!.replace(/\s+/g, "").replace(/[×·]/g, "*").replace(/÷/g, "/").replace(/[−–]/g, "-").replace(/(\d),(\d)/g, "$1.$2");
  const value = evaluateExpression(formula);
  const stated = Number(match[2]!.replace(",", "."));
  if (value == null || !Number.isFinite(stated) || !valuesClose(value, stated)) return null;
  const plan: SolutionPlan = {
    steps: [{ order: 1, formula, value, unit: null, weight: 1 }],
    finalOnlyShare: 0.5,
  };
  return validSolutionPlan(plan) ? plan : null;
}
