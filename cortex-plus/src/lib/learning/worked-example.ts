/**
 * Çözümlü örnek kapısı. Konu adı ve madde adı taşımaz.
 *
 * Sayısal örnek: {verilen, istenen, adımlar, sonuç}. Çözümdeki her sayı
 * verilenlerde ya da önceki bir adımın sonucundadır. Değişkenin adı ile
 * birimi aynı büyüklüktedir. Son adım bir sonuçtur; sarkan atama yoktur.
 * Sayısal olmayan örnek: kaynaktaki olay ya da metin üzerinde adım adım
 * analiz; her iddia kaynakta durur.
 */

import { foldTr } from "@/lib/documents/page-analysis";
import { evaluateArithmetic } from "@/lib/learning/tutor-quant";

export type WorkedGiven = { name: string; value: string; unit: string };
export type WorkedStep = { operation: string; reason: string };
export type WorkedResult = { value: string; unit: string };

const AMOUNT = /^(n|mol|amount|miktar)$/i;
const MASS = /^(m|mass|kutle|kütle|g)$/i;
const VOLUME = /^(v|hacim|volume|vol)$/i;
const PERCENT = /^(verim|yield|yuzde|yüzde|percent|eta|η)$/i;
const PRESSURE = /^(p|basinc|basınç|pressure)$/i;
const TEMPERATURE = /^(t|sicaklik|sıcaklık|temp|temperature)$/i;

const UNIT_AMOUNT = /^(mol|mmol|kmol)$/i;
const UNIT_MASS = /^(g|kg|mg|t)$/i;
const UNIT_VOLUME = /^(l|ml|m3|m³|cm3|cm³)$/i;
const UNIT_PERCENT = /^(%|yüzde|yuzde|percent)$/i;
const UNIT_PRESSURE = /^(atm|pa|kpa|bar|mmhg)$/i;
const UNIT_TEMPERATURE = /^(°c|c|k|°k)$/i;

function familyOfName(name: string): string | null {
  if (AMOUNT.test(name)) return "amount";
  if (MASS.test(name)) return "mass";
  if (VOLUME.test(name)) return "volume";
  if (PERCENT.test(name)) return "percent";
  if (PRESSURE.test(name)) return "pressure";
  if (TEMPERATURE.test(name)) return "temperature";
  return null;
}

function familyOfUnit(unit: string): string | null {
  const bare = unit.replace(/\s+/g, "");
  if (UNIT_AMOUNT.test(bare)) return "amount";
  if (UNIT_MASS.test(bare)) return "mass";
  if (UNIT_VOLUME.test(bare)) return "volume";
  if (UNIT_PERCENT.test(bare)) return "percent";
  if (UNIT_PRESSURE.test(bare)) return "pressure";
  if (UNIT_TEMPERATURE.test(bare)) return "temperature";
  return null;
}

/** Ad ile birim ayrı büyüklükteyse gerekçe döner. Bilinmeyen ad serbesttir. */
export function variableUnitIssue(name: string, unit: string): string | null {
  const left = familyOfName(name.trim());
  const bare = unit.trim();
  if (!left || !bare) return null;
  if (/[/\u00b7]/.test(bare)) {
    if (left === "mass") return null;
    return `${name.trim()} ${left} büyüklüğüdür; birim ${bare} ona uymaz.`;
  }
  const right = familyOfUnit(bare);
  if (!right || left === right) return null;
  return `${name.trim()} ${left} büyüklüğüdür; birim ${bare} ona uymaz.`;
}

function readNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

function numberKeys(text: string): number[] {
  return [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((match) => readNumber(match[0]));
}

function closeEnough(actual: number, stated: number): boolean {
  return Math.abs(actual - stated) <= Math.max(0.02, Math.abs(actual) * 0.02);
}

function knownHas(known: number[], value: number): boolean {
  return known.some((item) => closeEnough(item, value));
}

const LABEL = /^(verilen|istenen|bağlantı|baginti|bağıntı|yerine|sonuç|sonuc|adım|adim|step|given|find|therefore)\b/i;

function narrativeSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ“"0-9])/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter((part) => part.length >= 8 && !LABEL.test(part));
}

function stems(text: string): Set<string> {
  const out = new Set<string>();
  for (const word of foldTr(text).split(/[^a-z0-9]+/)) {
    if (word.length < 4) continue;
    out.add(word.slice(0, 6));
  }
  return out;
}

function overlaps(left: string, right: string): boolean {
  const a = stems(left);
  const b = stems(right);
  let count = 0;
  for (const item of a) if (b.has(item)) count += 1;
  return count >= 2 || (left.length >= 24 && foldTr(right).includes(foldTr(left).slice(0, 24)));
}

/**
 * Çözümdeki her sayının verilen ya da önceki sonuç olduğunu,
 * ad-birim uyumunu, sonuç satırını ve sarkan atamayı denetler.
 */
export function workedExampleIssues(
  prompt: string,
  solution: string,
  source: string,
  quantitative: boolean,
): string[] {
  const issues: string[] = [];
  const blob = `${prompt}\n${solution}`.trim();
  if (!blob) return ["empty"];
  if (!quantitative) {
    if (/\d+(?:[.,]\d+)?(?:\s*[×xX*/+\-−])\s*\d+(?:[.,]\d+)?\s*[=≈]/.test(blob)) {
      issues.push("numeric_in_narrative");
    }
    const corpus = source.trim() || blob;
    for (const sentence of narrativeSentences(blob)) {
      if (!overlaps(sentence, corpus)) issues.push("ungrounded_claim");
    }
    if (!narrativeSentences(solution).length) issues.push("no_result");
    return issues;
  }

  const assignments = [
    ...blob.matchAll(
      /(?:^|[\s,(])([A-Za-zΔδ][A-Za-z0-9Δδ]*)\s*=\s*(\d+(?:[.,]\d+)?)\s*([A-Za-z°µ%³²/]+)?/g,
    ),
  ];
  for (const match of assignments) {
    const name = match[1] ?? "";
    const unit = match[3] ?? "";
    if (!/^[A-Za-z°µ%]/.test(unit)) continue;
    const clash = variableUnitIssue(name, unit);
    if (clash) issues.push(clash);
  }

  const known = numberKeys(prompt);
  const arithmetic = [
    ...solution.matchAll(
      /(\d+(?:[.,]\d+)?(?:\s*[×xX*/+\-−]\s*\d+(?:[.,]\d+)?)+)\s*[=≈]\s*(\d+(?:[.,]\d+)?)/g,
    ),
  ];
  let cursor = 0;
  for (const match of arithmetic) {
    const start = match.index ?? 0;
    known.push(...numberKeys(solution.slice(cursor, start)));
    const expr = match[1] ?? "";
    const stated = readNumber(match[2] ?? "");
    for (const operand of numberKeys(expr)) {
      if (knownHas(known, operand)) continue;
      if (Number.isInteger(operand) && operand >= 1 && operand <= 3) continue;
      issues.push("unknown_operand");
    }
    const actual = evaluateArithmetic(expr.replace(/×/g, "*").replace(/−/g, "-"));
    if (actual != null && closeEnough(actual, stated)) known.push(stated);
    cursor = start + match[0].length;
  }
  const sawResult =
    arithmetic.length > 0 ||
    /sonuç\s*:|result\s*:/i.test(solution) ||
    /[=≈]\s*\d/.test(solution);
  if (!sawResult) issues.push("no_result");

  const tail = solution.trim().match(/(?:^|[.]\s+)([A-Za-z])\s*=\s*(\d+(?:[.,]\d+)?)\s*[A-Za-z°µ%³²/]*\s*$/);
  if (tail && arithmetic.length) {
    const value = readNumber(tail[2] ?? "");
    const computed = arithmetic.map((match) => readNumber(match[2] ?? ""));
    if (!computed.some((item) => closeEnough(item, value))) issues.push("dangling");
  }
  return issues;
}

const CALCULATION =
  /(\d+(?:[.,]\d+)?(?:\s*[×xX*/+\-−]\s*\d+(?:[.,]\d+)?)+)\s*[=≈]\s*\d+(?:[.,]\d+)?/;

function operandNumbers(sentence: string): number[] {
  const match = sentence.match(CALCULATION);
  if (!match) return [];
  return numberKeys(match[1] ?? "");
}

function splitSentences(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ“"0-9])/)
    .map((part) => part.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Metindeki hesabın verisi daha önce söylenmemişse kaynak cümlesini
 * öne alır. Kaynakta da yoksa hesabı çıkarır.
 */
export function groundProseCalculations(text: string, source: string): string {
  const parts = splitSentences(text);
  if (!parts.length) return text;
  const sourceParts = splitSentences(source);
  const known: number[] = [];
  const out: string[] = [];
  for (const part of parts) {
    if (!CALCULATION.test(part)) {
      known.push(...numberKeys(part));
      out.push(part);
      continue;
    }
    const missing = operandNumbers(part).filter(
      (value) => !knownHas(known, value) && !(Number.isInteger(value) && value >= 1 && value <= 3),
    );
    if (!missing.length) {
      known.push(...numberKeys(part));
      out.push(part);
      continue;
    }
    const setup = sourceParts
      .filter((sentence) => missing.every((value) => knownHas(numberKeys(sentence), value)))
      .sort((left, right) => left.length - right.length)[0];
    if (!setup) continue;
    if (!out.some((line) => foldTr(line) === foldTr(setup))) out.push(setup);
    known.push(...numberKeys(setup), ...numberKeys(part));
    out.push(part);
  }
  return out.join(" ").replace(/\s+/g, " ").trim();
}
