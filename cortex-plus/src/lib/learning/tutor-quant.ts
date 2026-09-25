/**
 * Sohbet yanıtındaki sayısal iddia ve çözümlü örnek denetimi.
 *
 * Önce deterministik aritmetik (mol/katsayı, eşitlik, tarih yılı).
 * Ayrıştırılamayan çözümlü örnek için küçük model ikinci kez türetir;
 * o çağrı bu dosyada yok — rota `needsQuantModelCheck` görünce yapar.
 * Kimya, fizik, iktisat ve tarih aynı kapıdan geçer.
 */

import { foldTr } from "@/lib/documents/page-analysis";
import { MEASURE } from "@/lib/learning/lesson-claims";

const SUB: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};

export type QuantIssue = {
  kind: "limiting" | "arithmetic" | "date" | "identity" | "wording" | "absolute";
  detail: string;
  /** Yanlış cümlenin yerine konacak kısa düzeltme. */
  repair: string;
  /** Birebir değiştirilecek parça. Yoksa cümle aranır. */
  span?: string;
};

export type QuantAudit = {
  ok: boolean;
  /** En az bir iddia deterministik kontrol edildi. */
  checked: boolean;
  issues: QuantIssue[];
};

export type ClaimVerdict = "dogru" | "kismen" | "yanlis";

export type GradedClaim = {
  verdict: ClaimVerdict;
  /** Öğrenciye gösterilecek hüküm satırı. */
  verdictLine: string;
  rightParts: string[];
  wrongParts: string[];
  conclusion: string;
  wrongType: string;
  topicLabel: string;
};

type Reactant = { species: string; display: string; coefficient: number };

function normFormula(raw: string): string {
  const stripped = raw.replace(/[₀-₉]/g, (ch) => SUB[ch] ?? ch);
  return foldTr(stripped).replace(/[^a-z0-9]/g, "");
}

function parseNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

function formatTr(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded).replace(".", ",");
}

const SUP_DIGIT = "⁰¹²³⁴⁵⁶⁷⁸⁹";
const SUP_VALUE: Record<string, string> = {
  "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4",
  "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9", "⁻": "-",
};

function readSuperscript(raw: string): number | null {
  const digits = [...raw].map((ch) => SUP_VALUE[ch] ?? "").join("");
  if (!/^-?\d+$/.test(digits)) return null;
  return Number(digits);
}

function toSuperscript(exp: number): string {
  return [...String(exp)].map((ch) => (ch === "-" ? "⁻" : SUP_DIGIT[Number(ch)] ?? ch)).join("");
}

/** `6,02 × 10²³` tek sayıya iner. Düz `10 × 4` burada durur. */
function expandPowersOfTen(expr: string): string {
  return expr.replace(
    /(\d+(?:[.,]\d+)?)\s*[×x·]\s*10(?:\^\s*([+-]?\d+)|([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+))/g,
    (full, base: string, ascii: string | undefined, sup: string | undefined) => {
      const exp = ascii ? Number(ascii) : readSuperscript(sup ?? "");
      if (exp == null || !Number.isFinite(exp)) return full;
      const value = parseNumber(base) * 10 ** exp;
      return Number.isFinite(value) ? value.toExponential(12) : full;
    },
  );
}

function stripMeasureUnits(expr: string): string {
  return expr.replace(
    new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*${MEASURE}(?![A-Za-zÇĞİÖŞÜçğıöşü])`, "gi"),
    "$1",
  );
}

const POW10 = String.raw`(?:\s*[×x·]\s*10(?:\^\s*[+-]?\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+))`;
/** `g·mol⁻¹` gibi bileşik birim. Çarpı işareti buraya girmez; birim ölçünün ardından gelir. */
const COMPOUND_UNIT = String.raw`(?:\s*[·∙]\s*[A-Za-z]+(?:[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+|[⁻\-]\d+)?)?`;
const ARITH_OP = String.raw`(?:[+÷*/\-−–]|[×x·](?!\s*10(?:\^\s*[+-]?\d+|[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+)))`;

/**
 * Ölçü birimi ders modülü bitmeden okunursa `undefined` kalır.
 * Desen ilk denetimde kurulur; o sırada birim listesi hazırdır.
 * #112 sağ tarafı tek sayı sanıyordu: `14 g + 4 g = 17 g + 18 g` içinde
 * yalnızca `= 17 g` denetleniyor, `17 + 18` hiç toplanmıyordu.
 */
function arithNum(): string {
  return String.raw`\d+(?:[.,]\d+)?(?:\s*${MEASURE}(?![A-Za-zÇĞİÖŞÜçğıöşü]))?${COMPOUND_UNIT}(?:${POW10})?`;
}

function arithRegex(): RegExp {
  const num = arithNum();
  const expr = String.raw`(?:${num}(?:\s*${ARITH_OP}\s*${num})+)`;
  return new RegExp(`(${expr})\\s*(≈|~|=)\\s*(${expr}|${num})`, "g");
}

/** Sonuç `× 10ⁿ` ise onarım da aynı üsle yazılır. */
function formatLike(n: number, sample: string): string {
  const sci = sample.match(/[×x·]\s*10(?:\^\s*([+-]?\d+)|([⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+))/);
  if (!sci) return formatTr(n);
  const exp = sci[1] ? Number(sci[1]) : readSuperscript(sci[2] ?? "");
  if (exp == null || !Number.isFinite(exp) || !Number.isFinite(n)) return formatTr(n);
  const mantissa = n / 10 ** exp;
  if (!Number.isFinite(mantissa)) return formatTr(n);
  const written = formatTr(mantissa);
  return sci[2] ? `${written} × 10${toSuperscript(exp)}` : `${written} × 10^${exp}`;
}

function readAuditedNumber(raw: string): number {
  const expanded = expandPowersOfTen(stripMeasureUnits(raw));
  if (/[×x·*/÷+\-−–]/.test(expanded.replace(/e[+-]/gi, ""))) {
    return evalArith(expanded) ?? Number.NaN;
  }
  const token = expanded.match(/\d+(?:[.,]\d+)?(?:e[+-]?\d+)?/i);
  return token ? parseNumber(token[0]) : Number.NaN;
}

const COEFF_SRC = String.raw`(?:\d+\s*/\s*\d+|\d+(?:[.,]\d+)?)`;
const SPECIES_SRC = String.raw`[A-Za-z][A-Za-z0-9₀-₉]*`;
const TERM_SRC = String.raw`(?:${COEFF_SRC}\s*)?${SPECIES_SRC}`;
const REACTION_RE = new RegExp(String.raw`(${TERM_SRC}(?:\s*\+\s*${TERM_SRC})+)\s*(?:→|->|=>)`, "g");

/** ½ ve 1⁄2 aynı sayıya iner. Denklem seçimi bundan sonra yapılır. */
function normalizeFractions(text: string): string {
  return text
    .replace(/½/g, "1/2")
    .replace(/⅓/g, "1/3")
    .replace(/⅔/g, "2/3")
    .replace(/¼/g, "1/4")
    .replace(/¾/g, "3/4")
    .replace(/⅛/g, "1/8")
    .replace(/⅜/g, "3/8")
    .replace(/⅝/g, "5/8")
    .replace(/⅞/g, "7/8")
    .replace(/(\d)\s*⁄\s*(\d)/g, "$1/$2");
}

function parseCoeff(raw: string | undefined): number {
  if (!raw) return 1;
  const slash = raw.match(/^(\d+)\s*\/\s*(\d+)$/);
  if (slash) {
    const den = Number(slash[2]);
    if (!den) return Number.NaN;
    return Number(slash[1]) / den;
  }
  return parseNumber(raw);
}

function cleanEquationSide(side: string): string {
  return side
    .replace(/\((?:g|s|l|aq|k)\)/gi, "")
    .replace(/[↑↓]/g, "")
    .trim();
}

function parseSide(side: string): Reactant[] {
  const out: Reactant[] = [];
  const tokenRe = new RegExp(`^(${COEFF_SRC})?\\s*(${SPECIES_SRC})$`);
  for (const part of cleanEquationSide(side).split(/\s*\+\s*/)) {
    const token = part.trim();
    const match = token.match(tokenRe);
    if (!match) continue;
    const coefficient = parseCoeff(match[1]);
    if (!(coefficient > 0)) continue;
    out.push({ species: normFormula(match[2]), display: match[2], coefficient });
  }
  return out;
}

/** Metindeki her tepkime. İlki her zaman öğrencinin maddesi olmayabilir. */
export function parseReactions(text: string): Reactant[][] {
  const cleaned = normalizeFractions(text).replace(/\((?:g|s|l|aq|k)\)/gi, "");
  const out: Reactant[][] = [];
  for (const match of cleaned.matchAll(REACTION_RE)) {
    const reactants = parseSide(match[1]);
    if (reactants.length >= 2) out.push(reactants);
  }
  return out;
}

export function parseReaction(text: string): Reactant[] | null {
  return parseReactions(text)[0] ?? null;
}

function acceptSpecies(raw: string): boolean {
  const key = normFormula(raw);
  if (!key || /^(ve|ile|icin|olan|bir|bu|var|de|da|the|and|mol|elimizde|varsa|icin|g|kg)$/.test(key)) return false;
  if (key.length > 6 && !/\d/.test(key)) return false;
  return /\d/.test(key) || /^[a-z]{1,4}$/.test(key);
}

function parseAmounts(text: string): Map<string, number> {
  const amounts = new Map<string, number>();
  const forward = /(\d+(?:[.,]\d+)?)\s*mol\s+([A-Za-z][A-Za-z0-9₀-₉]*)/gi;
  const reverse = /([A-Za-z][A-Za-z0-9₀-₉]*)\s+(\d+(?:[.,]\d+)?)\s*mol/gi;
  for (const match of text.matchAll(forward)) {
    if (!acceptSpecies(match[2])) continue;
    amounts.set(normFormula(match[2]), parseNumber(match[1]));
  }
  for (const match of text.matchAll(reverse)) {
    if (!acceptSpecies(match[1])) continue;
    const key = normFormula(match[1]);
    if (!amounts.has(key)) amounts.set(key, parseNumber(match[2]));
  }
  return amounts;
}

function claimedLimiter(text: string, reactants: Reactant[]): { kind: "none" | "species"; species?: string; display?: string } | null {
  const folded = foldTr(text);
  // "tamamen tükenen" tanımın kendisidir; "hiçbiri sınırlayıcı değil" değildir.
  // `tamamen tuken` öneki "tükenen"i de yutuyordu ve doğru N₂ hükmünü
  // "hiçbiri sınırlayıcı değil" diye bozuyordu.
  if (
    /hicbiri sinirlayici|ikisi de tamamen tuken|neither is limiting|both fully/.test(folded) &&
    /(sinirlay|limiting|tuken)/.test(folded)
  ) {
    return { kind: "none" };
  }
  const re = /([A-Za-z][A-Za-z0-9₀-₉]*)\s*,?\s*(?:sınırlayıcı(?:d[ıi]r|dır)?|limiting)(?!\s*değil)/gi;
  for (const match of text.matchAll(re)) {
    const species = normFormula(match[1]);
    const known = reactants.find((item) => item.species === species);
    if (!known) continue;
    return { kind: "species", species, display: known.display };
  }
  return null;
}

type RatioRow = Reactant & { moles: number; ratio: number };

function ratiosFor(reactants: Reactant[], amounts: Map<string, number>): RatioRow[] | null {
  const rows: RatioRow[] = [];
  for (const reactant of reactants) {
    const moles = amounts.get(reactant.species);
    if (moles == null || !(moles >= 0)) return null;
    rows.push({ ...reactant, moles, ratio: moles / reactant.coefficient });
  }
  return rows;
}

function limitingOf(rows: RatioRow[]): { none: boolean; species: RatioRow[] } {
  const min = Math.min(...rows.map((row) => row.ratio));
  const species = rows.filter((row) => Math.abs(row.ratio - min) <= 1e-6);
  return { none: species.length === rows.length, species };
}

function ratioSentence(rows: RatioRow[], result: { none: boolean; species: RatioRow[] }): string {
  const bits = rows.map((row) => `${row.display}: ${formatTr(row.moles)} / ${formatTr(row.coefficient)} = ${formatTr(row.ratio)}`);
  if (result.none) {
    return `Oranlar eşit (${bits.join("; ")}). Hiçbiri sınırlayıcı değil; ikisi de tamamen tükenir.`;
  }
  const name = result.species.map((row) => row.display).join(", ");
  return `Oranlar: ${bits.join("; ")}. Küçük oran ${name} için; sınırlayıcı ${name}.`;
}

function covers(reactants: Reactant[], amounts: Map<string, number>): boolean {
  if (reactants.length < 2) return false;
  return reactants.every((item) => amounts.has(item.species));
}

function limiterSignature(rows: RatioRow[]): string {
  const result = limitingOf(rows);
  if (result.none) return "none";
  return result.species.map((row) => row.species).sort().join("+");
}

/**
 * Öğrencinin saydığı maddeleri kapsayan tepkime.
 * Birden fazla aday varsa hepsi aynı sınırlayıcıyı vermeli; ilki kazanmaz.
 */
function chooseReaction(reactions: Reactant[][], amounts: Map<string, number>): Reactant[] | null {
  const viable = reactions.filter((reaction) => covers(reaction, amounts));
  if (!viable.length) return null;
  const signatures = new Set(viable.map((reaction) => {
    const rows = ratiosFor(reaction, amounts);
    return rows ? limiterSignature(rows) : "na";
  }));
  if (signatures.size !== 1 || signatures.has("na")) return null;
  const fractionPenalty = (reaction: Reactant[]) => reaction.some((item) => !Number.isInteger(item.coefficient)) ? 1 : 0;
  return [...viable].sort((a, b) => fractionPenalty(a) - fractionPenalty(b) || a.length - b.length)[0];
}

function limitingFrom(text: string, amounts: Map<string, number>): { rows: RatioRow[]; claim: NonNullable<ReturnType<typeof claimedLimiter>> } | null {
  const reactants = chooseReaction(parseReactions(text), amounts);
  if (!reactants) return null;
  const rows = ratiosFor(reactants, amounts);
  const claim = claimedLimiter(text, reactants);
  if (!rows || !claim) return null;
  return { rows, claim };
}

function limitingIssues(text: string): QuantIssue[] {
  const found = limitingFrom(text, parseAmounts(text));
  if (!found) return [];
  const result = limitingOf(found.rows);
  const repair = ratioSentence(found.rows, result);
  if (found.claim.kind === "none") {
    return result.none ? [] : [{ kind: "limiting", detail: repair, repair }];
  }
  const claimedIsLimiting = !result.none && result.species.some((row) => row.species === found.claim.species);
  if (result.none || !claimedIsLimiting) {
    return [{ kind: "limiting", detail: repair, repair }];
  }
  return [];
}

/** Soldaki ifadeyi hesaplar. İşlem sırası çarpma ve bölmeyi önce alır. */
export function evaluateArithmetic(expr: string): number | null {
  return evalArith(expr);
}

function evalArith(expr: string): number | null {
  let normalized = expandPowersOfTen(stripMeasureUnits(expr))
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–]/g, "-");
  for (let depth = 0; depth < 6; depth += 1) {
    const inner = normalized.match(/\(([^()]*)\)/);
    if (!inner) break;
    const value = evalFlat(inner[1] ?? "");
    if (value == null) return null;
    normalized = normalized.replace(inner[0], String(value));
  }
  return evalFlat(normalized);
}

function evalFlat(expr: string): number | null {
  const tokens = expr.match(/\d+(?:[.,]\d+)?(?:e[+-]?\d+)?|[+\-*/]/gi);
  if (!tokens || tokens.length < 3) return null;
  const values: number[] = [];
  const ops: string[] = [];
  for (const token of tokens) {
    if (/^[+\-*/]$/.test(token) && values.length > ops.length) ops.push(token);
    else if (/^\d/.test(token)) {
      const n = parseNumber(token);
      if (!Number.isFinite(n)) return null;
      values.push(n);
    }
  }
  if (values.length !== ops.length + 1 || values.length < 2) return null;
  const collapsed: number[] = [values[0]];
  const addOps: string[] = [];
  for (let i = 0; i < ops.length; i += 1) {
    const next = values[i + 1];
    if (ops[i] === "*" || ops[i] === "/") {
      const left = collapsed.pop();
      if (left == null || (ops[i] === "/" && next === 0)) return null;
      collapsed.push(ops[i] === "*" ? left * next : left / next);
    } else {
      addOps.push(ops[i]);
      collapsed.push(next);
    }
  }
  let acc = collapsed[0];
  for (let i = 0; i < addOps.length; i += 1) {
    acc = addOps[i] === "+" ? acc + collapsed[i + 1] : acc - collapsed[i + 1];
  }
  return acc;
}

function expandNumericParens(text: string): string {
  let next = text;
  for (let depth = 0; depth < 6; depth += 1) {
    const inner = next.match(/\(([^()]*)\)/);
    if (!inner) break;
    const value = evalArith(inner[1] ?? "");
    if (value == null) break;
    next = next.replace(inner[0], String(Math.round(value * 1000) / 1000));
  }
  return next;
}

function closeEnough(actual: number, stated: number, approx: boolean): boolean {
  const diff = Math.abs(actual - stated);
  const tol = approx ? Math.max(0.02, Math.abs(actual) * 0.02) : Math.max(0.005, Math.abs(actual) * 0.005);
  return diff <= tol;
}

function agreementSpan(text: string, match: RegExpMatchArray): string {
  const start = match.index ?? 0;
  const end = start + match[0].length;
  const tail = text.slice(end).match(/^\s*(?:uyuyor|tutuyor|doğru|sağlıyor)\b[.]?/i);
  return text.slice(start, end + (tail?.[0].length ?? 0));
}

function sharedUnit(expr: string): string {
  const units = [...expr.matchAll(new RegExp(`${MEASURE}(?![A-Za-zÇĞİÖŞÜçğıöşü])`, "gi"))].map((item) => item[0]);
  if (!units.length) return "";
  const key = (unit: string) => unit.replace(/\s+/g, "").toLocaleLowerCase("tr-TR");
  const first = key(units[0]);
  return units.every((unit) => key(unit) === first) ? units[0] : "";
}

function withUnit(value: number, unit: string): string {
  return `${formatTr(value)}${unit ? ` ${unit}` : ""}`;
}

function sideLabel(expr: string): string {
  const hasAdd = /[+−–-]/.test(expr);
  const hasMul = /[×x÷*/]/.test(expr);
  if (hasAdd && !hasMul) return "toplamı";
  return "değeri";
}

/** İki taraf da işlemse sonucu tek sayıya indirgeme; iki tarafı ayrı yaz. */
function bothSidesRepair(left: string, leftValue: number, right: string, rightValue: number): string {
  const leftText = withUnit(leftValue, sharedUnit(left));
  const rightText = withUnit(rightValue, sharedUnit(right));
  return `${left.replace(/\s+/g, " ").trim()} ${sideLabel(left)} ${leftText}; ${right.replace(/\s+/g, " ").trim()} ${sideLabel(right)} ${rightText}. İki taraf eşit değil.`;
}

const CONV_UNIT = "°C|°F|km|kg|mg|mL|min|m|g|L|K|s|h";
const CONV_RE = new RegExp(
  `(?<![+×÷*/\\-−–]\\s{0,4})(?<![\\d])(\\d+(?:[.,]\\d+)?)\\s*(${CONV_UNIT})(?![A-Za-zÇĞİÖŞÜçğıöşü/])\\s*(≈|~|=)\\s*(\\d+(?:[.,]\\d+)?)\\s*(${CONV_UNIT})(?![A-Za-zÇĞİÖŞÜçğıöşü/])`,
  "g",
);
const PERCENT_RE = /(?<![+×÷*/\-−–]\s{0,4})(?<![\d])(\d+(?:[.,]\d+)?)\s*%\s*(≈|~|=)\s*(\d+(?:[.,]\d+)?)(\s*%)?/g;

function canonUnit(raw: string): string {
  const unit = raw.replace(/\s+/g, "");
  if (unit === "°C") return "C";
  if (unit === "°F") return "F";
  if (unit.toLowerCase() === "ml") return "mL";
  return unit;
}

/** Yalnızca ölçülen tek sayı. `1 mol = 22,4 L` evrensel çevrim değildir. */
function convertUnit(value: number, from: string, to: string): number | null {
  const left = canonUnit(from);
  const right = canonUnit(to);
  if (left === right) return value;
  const table: Record<string, (n: number) => number> = {
    "C>K": (n) => n + 273.15,
    "K>C": (n) => n - 273.15,
    "C>F": (n) => (n * 9) / 5 + 32,
    "F>C": (n) => ((n - 32) * 5) / 9,
    "km>m": (n) => n * 1000,
    "m>km": (n) => n / 1000,
    "kg>g": (n) => n * 1000,
    "g>kg": (n) => n / 1000,
    "g>mg": (n) => n * 1000,
    "mg>g": (n) => n / 1000,
    "L>mL": (n) => n * 1000,
    "mL>L": (n) => n / 1000,
    "min>s": (n) => n * 60,
    "s>min": (n) => n / 60,
    "h>min": (n) => n * 60,
    "min>h": (n) => n / 60,
  };
  return table[`${left}>${right}`]?.(value) ?? null;
}

function overlaps(start: number, end: number, spans: { start: number; end: number }[]): boolean {
  return spans.some((span) => start < span.end && end > span.start);
}

/** Parantez açılınca değişen eşitliğin onarımı özgün cümleye yazılır. */
function spanForRepair(original: string, expanded: string, expandedSpan: string): string {
  if (original.includes(expandedSpan)) return expandedSpan;
  const pieces = original.split(/(?<=[.!?\n])\s*/);
  for (const piece of pieces) {
    const trimmed = piece.trim();
    if (!trimmed.includes("(")) continue;
    if (expandNumericParens(trimmed).includes(expandedSpan)) return trimmed;
  }
  return expanded === original ? expandedSpan : original.trim();
}

function arithmeticIssues(text: string): QuantIssue[] {
  const issues: QuantIssue[] = [];
  const covered: { start: number; end: number }[] = [];
  const expanded = expandNumericParens(text);
  const locate = (span: string) => spanForRepair(text, expanded, span);
  for (const match of expanded.matchAll(arithRegex())) {
    const start = match.index ?? 0;
    const leftValue = evalArith(match[1]);
    const rightValue = evalArith(match[3]);
    const stated = rightValue ?? readAuditedNumber(match[3]);
    if (leftValue == null || !Number.isFinite(stated)) continue;
    const span = locate(agreementSpan(expanded, match));
    covered.push({ start, end: start + agreementSpan(expanded, match).length });
    const approx = match[2] !== "=";
    if (closeEnough(leftValue, stated, approx)) continue;
    if (rightValue != null) {
      issues.push({
        kind: "arithmetic",
        detail: `İki taraf eşit değil: ${formatTr(leftValue)} ve ${formatTr(stated)}.`,
        repair: bothSidesRepair(match[1], leftValue, match[3], rightValue),
        span,
      });
      continue;
    }
    const unit = match[3].match(new RegExp(`${MEASURE}(?![A-Za-zÇĞİÖŞÜçğıöşü])`, "i"))?.[0] ?? "";
    const written = formatLike(leftValue, match[3]);
    const repair = `${match[1].replace(/\s+/g, " ")} = ${written}${unit ? ` ${unit}` : ""}`;
    issues.push({
      kind: "arithmetic",
      detail: `Yazılan sonuç ${match[3]}; hesap ${written}.`,
      repair,
      span,
    });
  }

  for (const match of expanded.matchAll(new RegExp(PERCENT_RE.source, "g"))) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlaps(start, end, covered)) continue;
    const left = parseNumber(match[1]);
    const right = parseNumber(match[3]);
    const bothPercent = Boolean(match[4]);
    const actual = bothPercent ? left : left / 100;
    const stated = bothPercent ? right : right;
    if (!Number.isFinite(actual) || !Number.isFinite(stated)) continue;
    covered.push({ start, end });
    if (closeEnough(actual, stated, match[2] !== "=")) continue;
    const repair = bothPercent
      ? `${formatTr(left)}% ile ${formatTr(right)}% eşit değil.`
      : `${formatTr(left)}% = ${formatTr(left / 100)}`;
    issues.push({
      kind: "arithmetic",
      detail: bothPercent
        ? `Yüzdeler eşit değil: ${formatTr(left)} ve ${formatTr(right)}.`
        : `Yüzde karşılığı ${formatTr(left / 100)}; yazılan ${formatTr(right)}.`,
      repair,
      span: locate(agreementSpan(expanded, match)),
    });
  }

  for (const match of expanded.matchAll(new RegExp(CONV_RE.source, "g"))) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlaps(start, end, covered)) continue;
    const left = parseNumber(match[1]);
    const right = parseNumber(match[4]);
    covered.push({ start, end });
    const actual = convertUnit(left, match[2], match[5]);
    if (actual == null || !Number.isFinite(right)) continue;
    if (closeEnough(actual, right, match[3] !== "=")) continue;
    const same = canonUnit(match[2]) === canonUnit(match[5]);
    const repair = same
      ? `${formatTr(left)} ${match[2]} ile ${formatTr(right)} ${match[5]} eşit değil.`
      : `${formatTr(left)} ${match[2]} = ${withUnit(actual, match[5])}`;
    issues.push({
      kind: "arithmetic",
      detail: `Çevrim tutmuyor: ${formatTr(left)} ${match[2]} → ${withUnit(actual, match[5])}.`,
      repair,
      span: locate(agreementSpan(expanded, match)),
    });
  }

  const singleEq = new RegExp(
    `(?<![+×÷*/\\-−–]\\s{0,4})(${arithNum()})\\s*(≈|~|=)\\s*(${arithNum()})(?!\\s*[+×÷*/\\-−–])`,
    "g",
  );
  for (const match of expanded.matchAll(singleEq)) {
    const start = match.index ?? 0;
    const end = start + match[0].length;
    if (overlaps(start, end, covered)) continue;
    if (/%/.test(match[0])) continue;
    const leftUnit = match[1].match(new RegExp(`${MEASURE}(?![A-Za-zÇĞİÖŞÜçğıöşü])`, "i"))?.[0] ?? "";
    const rightUnit = match[3].match(new RegExp(`${MEASURE}(?![A-Za-zÇĞİÖŞÜçğıöşü])`, "i"))?.[0] ?? "";
    const left = readAuditedNumber(match[1]);
    const right = readAuditedNumber(match[3]);
    if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
    let actual = left;
    if (leftUnit && rightUnit && canonUnit(leftUnit) !== canonUnit(rightUnit)) {
      const converted = convertUnit(left, leftUnit, rightUnit);
      if (converted == null) continue;
      actual = converted;
    } else if (Boolean(leftUnit) !== Boolean(rightUnit)) {
      continue;
    }
    if (closeEnough(actual, right, match[2] !== "=")) continue;
    const repair = leftUnit && rightUnit && canonUnit(leftUnit) !== canonUnit(rightUnit)
      ? `${formatTr(left)} ${leftUnit} = ${withUnit(actual, rightUnit)}`
      : `${match[1].trim()} ile ${match[3].trim()} eşit değil.`;
    issues.push({
      kind: "arithmetic",
      detail: `Yazılan eşitlik tutmuyor: ${formatTr(actual)} ve ${formatTr(right)}.`,
      repair,
      span: locate(agreementSpan(expanded, match)),
    });
  }
  return issues;
}

function sentencesOf(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+|\n+/)
    .map((part) => part.trim())
    .filter(Boolean);
}

function dateIssues(reply: string, source: string): QuantIssue[] {
  if (!source.trim()) return [];
  const issues: QuantIssue[] = [];
  const sourceSentences = sentencesOf(source);
  for (const sentence of sentencesOf(reply)) {
    const replyYears = [...sentence.matchAll(/\b(1[0-9]{3}|20[0-9]{2})\b/g)].map((item) => Number(item[1]));
    if (replyYears.length !== 1) continue;
    const tokens = foldTr(sentence)
      .replace(/[^\p{L}\p{N}\s]/gu, " ")
      .split(/\s+/)
      .filter((word) => word.length >= 5 && !/^\d+$/.test(word));
    if (!tokens.length) continue;
    for (const sourceSentence of sourceSentences) {
      const sourceYears = [...sourceSentence.matchAll(/\b(1[0-9]{3}|20[0-9]{2})\b/g)].map((item) => Number(item[1]));
      if (sourceYears.length !== 1 || sourceYears[0] === replyYears[0]) continue;
      const hay = foldTr(sourceSentence);
      const shared = tokens.some((token) => hay.includes(token.slice(0, Math.min(token.length, 6))));
      if (!shared) continue;
      issues.push({
        kind: "date",
        detail: `Kaynak ${sourceYears[0]} diyor; yanıt ${replyYears[0]} diyor.`,
        repair: `Kaynaktaki yıl ${sourceYears[0]}.`,
      });
      break;
    }
  }
  return issues;
}

const IDENTITY_PAIRS: { left: RegExp; right: RegExp; repair: string }[] = [
  {
    left: /mol kutles/,
    right: /atomik kutle|bagil atom kutle/,
    repair: "Mol kütlesi g/mol, atomik kütle akb (u) cinsindendir. Sayıları eşit olabilir; büyüklükler aynı değildir.",
  },
  {
    left: /\bkutle\b/,
    right: /\bagirlik\b/,
    repair: "Kütle kilogram, ağırlık newton cinsindendir. İkisi aynı büyüklük değildir.",
  },
  {
    left: /\bisi\b/,
    right: /sicakli[kg]/,
    repair: "Isı enerji aktarımıdır, sıcaklık bir ölçüdür. İkisi aynı büyüklük değildir.",
  },
  {
    left: /\bhiz\b/,
    right: /\bivme\b/,
    repair: "Hız m/s, ivme m/s² cinsindendir. İkisi aynı büyüklük değildir.",
  },
  {
    left: /\bguc\b/,
    right: /\benerji\b/,
    repair: "Güç watt, enerji joule cinsindendir. İkisi aynı büyüklük değildir.",
  },
  {
    left: /\bkuvvet\b/,
    right: /\bbasinc\b/,
    repair: "Kuvvet newton, basınç pascal cinsindendir. İkisi aynı büyüklük değildir.",
  },
  {
    left: /gerilim|potansiyel fark/,
    right: /\bakim\b/,
    repair: "Gerilim volt, akım amper cinsindendir. İkisi aynı büyüklük değildir.",
  },
];

function assertsIdentity(sentence: string): boolean {
  const folded = foldTr(sentence);
  if (/degil|sayisal|sayica|deger olarak|sayilari esit/.test(folded)) return false;
  return /ile ayni|aynidir|ayni seydir|aynisi|\besittir\b/.test(folded);
}

/** İki ayrı büyüklüğü "aynıdır" diye özdeşleyen cümle. Sayısal eşitlik ayrı kapıdadır. */
function identityIssues(text: string): QuantIssue[] {
  const issues: QuantIssue[] = [];
  for (const sentence of sentencesOf(text)) {
    if (!assertsIdentity(sentence)) continue;
    const folded = foldTr(sentence);
    for (const pair of IDENTITY_PAIRS) {
      if (!pair.left.test(folded) || !pair.right.test(folded)) continue;
      issues.push({
        kind: "identity",
        detail: "İki ayrı büyüklük aynı diye yazılmış.",
        repair: pair.repair,
        span: sentence,
      });
      break;
    }
  }
  return issues;
}

/**
 * Gram ya da mol kütlesi "ağırlık" diye adlandırılmışsa kütledir.
 * Sınav ağırlığı, newton cinsinden ağırlık ve "kütle ile ağırlık farklıdır" durur.
 */
function wordingIssues(text: string): QuantIssue[] {
  const issues: QuantIssue[] = [];
  for (const sentence of sentencesOf(text)) {
    const folded = foldTr(sentence);
    if (assertsIdentity(sentence)) continue;
    if (/agirlikli|agirlik ver|agirligi yuksek/.test(folded)) continue;
    if (/newton|yercekimi|yer cekim|kuvvet olarak/.test(folded)) continue;
    if (/kutle ile agirlik|agirlik ile kutle|ayni degil|farkli buyukluk|buyuklukler ayni degil/.test(folded)) continue;
    const massContext = /mol kutle|atom kutle|molekul kutle|formul kutle|gram cinsinden|g\/mol|\bkg\b|(?:^|[^a-z])g(?:[^a-z]|$)|kutles/.test(folded);
    if (!massContext) continue;
    const match = sentence.match(/ağırlığıdır|ağırlıktır|ağırlığı|ağırlık(?!l)/i);
    if (!match || match.index == null) continue;
    const token = match[0];
    const lower = token.toLocaleLowerCase("tr");
    const mapped =
      lower === "ağırlığıdır" ? "kütlesidir" :
      lower === "ağırlıktır" ? "kütledir" :
      lower === "ağırlığı" ? "kütlesi" :
      "kütle";
    const replacement = token[0] === token[0].toLocaleUpperCase("tr")
      ? mapped[0].toLocaleUpperCase("tr") + mapped.slice(1)
      : mapped;
    const repair = `${sentence.slice(0, match.index)}${replacement}${sentence.slice(match.index + token.length)}`;
    if (repair === sentence) continue;
    issues.push({
      kind: "wording",
      detail: "Kütle, gram cinsinden ağırlık diye yazılmış.",
      repair,
      span: sentence,
    });
  }
  return issues;
}

const LIMITING_EXCEPTION =
  "Reaktifler stokiyometrik orandaysa hepsi birlikte tükenir; hiçbiri fazla kalmaz. Oranlar eşit değilse küçük oran sınırlayıcıdır.";

/** "Tek bir madde" / "birden fazla olamaz" stokiyometri kuralıyla çelişir. */
function limitingUniqueness(sentence: string): boolean {
  const folded = foldTr(sentence);
  if (!/sinirlay/.test(folded)) return false;
  if (/stokiyometrik oran|birlikte tuken|hicbiri fazla/.test(folded)) return false;
  if (/tek bir madde|yalnizca bir madde|sadece bir madde/.test(folded)) return true;
  if (/birden fazla/.test(folded) && /yanlis|olamaz|sanma|zannet/.test(folded)) return true;
  if (/^hayir\b/.test(folded) && /\btek\b/.test(folded)) return true;
  return false;
}

function absoluteMarker(sentence: string): string | null {
  const folded = foldTr(sentence);
  if (/\bmutlaka\b/.test(folded) && !/her zaman|asla|hicbir zaman/.test(folded)) return null;
  const marker = folded.match(/\bher zaman\b|\basla\b|\bhicbir zaman\b/);
  return marker?.[0] ?? null;
}

function sourceStatesAbsolute(sentence: string, source: string): boolean {
  if (!source.trim()) return false;
  const marker = absoluteMarker(sentence);
  if (!marker) return false;
  const src = foldTr(source);
  if (!src.includes(marker)) return false;
  const skip = new Set(["zaman", "asla", "hicbir", "olur", "olmalidir", "vardir", "deildir"]);
  const tokens = foldTr(sentence)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 5 && !skip.has(word) && word !== marker.replace(/\s+/g, ""));
  return tokens.some((token) => src.includes(token));
}

function softenAbsolute(sentence: string): string {
  const next = sentence
    .replace(/\bher zaman\b/gi, "")
    .replace(/\bhiçbir zaman\b/gi, "")
    .replace(/\basla\b/gi, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([,.;:!?])/g, "$1")
    .trim();
  return next;
}

/**
 * Kaynağın söylemediği "her zaman / asla / yalnızca bir" hükmü.
 * Sınırlayıcı tekliği kaynak susunca da düzeltilir; diğerleri kaynak
 * verilmişse ve kaynakta yoksa yumuşatılır. `general` false ise
 * (quiz, kaynak yok) yalnızca sınırlayıcı tekliği kalır.
 */
function absoluteIssues(text: string, source: string, general: boolean): QuantIssue[] {
  const issues: QuantIssue[] = [];
  for (const sentence of sentencesOf(text)) {
    if (limitingUniqueness(sentence)) {
      issues.push({
        kind: "absolute",
        detail: "Sınırlayıcı her zaman tek madde değildir.",
        repair: LIMITING_EXCEPTION,
        span: sentence,
      });
      continue;
    }
    if (!general || !absoluteMarker(sentence) || sourceStatesAbsolute(sentence, source)) continue;
    if (assertsIdentity(sentence)) continue;
    const repair = softenAbsolute(sentence);
    if (!repair || repair === sentence) continue;
    issues.push({
      kind: "absolute",
      detail: "Kaynakta olmayan kesin hüküm yumuşatıldı.",
      repair,
      span: sentence,
    });
  }
  return issues;
}

/** Çözümlü örnek ve eşitlikleri kaynak metne karşı denetler. */
export function auditQuantitative(
  text: string,
  source = "",
  options?: { generalAbsolutes?: boolean },
): QuantAudit {
  const limiting = limitingIssues(text);
  const arithmetic = arithmeticIssues(text);
  const dates = dateIssues(text, source);
  const wording = wordingIssues(text);
  const identity = identityIssues(text);
  const absolute = absoluteIssues(text, source, options?.generalAbsolutes !== false);
  const issues = [...limiting, ...arithmetic, ...dates, ...wording, ...identity, ...absolute];
  const checked = limiting.length > 0 || arithmetic.length > 0 || dates.length > 0
    || absolute.length > 0
    || Boolean(parseReaction(text) && claimedLimiter(text, parseReaction(text) ?? []))
    || arithmeticPatternSeen(text)
    || (Boolean(source) && /\b(1[0-9]{3}|20[0-9]{2})\b/.test(text));
  return { ok: issues.length === 0, checked, issues };
}

const QUANT_KINDS = new Set<QuantIssue["kind"]>(["arithmetic", "absolute", "identity", "limiting"]);

/** Quiz kökü, doğru şık ve açıklama aynı sayı ve kesinlik kapısından geçer. */
export function quizClaimIssues(
  questions: { text?: string; explanation?: string; correct?: string[] }[],
  source = "",
): string[] {
  const issues: string[] = [];
  questions.forEach((question, index) => {
    const text = [question.text, question.explanation, ...(question.correct ?? [])].filter(Boolean).join("\n");
    const audit = auditQuantitative(text, source, { generalAbsolutes: Boolean(source.trim()) });
    for (const issue of audit.issues) {
      if (!QUANT_KINDS.has(issue.kind)) continue;
      issues.push(`Soru ${index + 1}: ${issue.detail}`);
    }
  });
  return issues;
}

function arithmeticPatternSeen(text: string): boolean {
  const expanded = expandNumericParens(text);
  return arithRegex().test(expanded) || arithRegex().test(text);
}

/**
 * Ayrıştırılmış hata varsa cümleyi düzeltir. Düzeltemezse örneği düşürür.
 * Küçük model ancak `needsQuantModelCheck` true ise çağrılır.
 */
export function repairQuantitative(text: string, audit: QuantAudit): string {
  if (audit.ok || !audit.issues.length) return text;
  let next = text;
  for (const issue of audit.issues) {
    if (issue.kind === "limiting") {
      next = replaceLimitingSentence(next, issue.repair);
    } else if (issue.kind === "arithmetic" && issue.span) {
      next = next.replace(issue.span, issue.repair);
    } else if (issue.kind === "arithmetic") {
      next = next.replace(new RegExp(arithRegex().source, "i"), issue.repair);
    } else if ((issue.kind === "identity" || issue.kind === "wording" || issue.kind === "absolute") && issue.span && next.includes(issue.span)) {
      next = next.replace(issue.span, issue.repair);
    } else if (issue.kind === "identity" || issue.kind === "wording" || issue.kind === "absolute") {
      continue;
    } else if (!next.includes(issue.repair)) {
      next = `${next.trim()}\n\n${issue.repair}`;
    }
  }
  return next;
}

function replaceLimitingSentence(text: string, repair: string): string {
  const lines = text.split("\n");
  let replaced = false;
  const next = lines.map((line) => {
    if (replaced) return line;
    const parts = line.split(/(?<=[.!?])\s+/);
    const rewritten = parts.map((part) => {
      if (replaced) return part;
      if (/(sınırlayıcı|sinirlayici|limiting)/i.test(part)) {
        replaced = true;
        return repair;
      }
      return part;
    });
    return rewritten.join(" ");
  });
  if (replaced) return next.join("\n").trim();
  return `${text.trim()}\n\n${repair}`;
}

/** Sayı var ama deterministik denetim iddiayı görmediyse küçük model bakmalı. */
export function needsQuantModelCheck(text: string, audit: QuantAudit): boolean {
  if (!audit.ok) return false;
  if (audit.checked && audit.issues.length === 0 && (parseReaction(text) || arithmeticPatternSeen(text))) {
    return false;
  }
  const numeric = /\d/.test(text);
  const worked = /→|->|≈|=/.test(text) && numeric;
  return worked && !audit.checked;
}

export function quantSelfCheckPrompt(reply: string): { system: string; user: string } {
  return {
    system:
      "Sayısal doğrulama. Yanıttaki her hesap, oran ve hükmü yeniden türet. " +
      "Yeni anlatım yazma. Türkçe ondalık virgül sayıdır. " +
      'JSON: {"ok":boolean,"note":string}. ok false yalnız sonuç aritmetikle çelişiyorsa. note en fazla 160 karakter.',
    user: reply.slice(0, 4000),
  };
}

export function parseQuantSelfCheck(raw: string): { ok: boolean; note: string } | null {
  try {
    const parsed = JSON.parse(raw) as { ok?: unknown; note?: unknown };
    if (typeof parsed.ok !== "boolean") return null;
    return { ok: parsed.ok, note: typeof parsed.note === "string" ? parsed.note.slice(0, 200) : "" };
  } catch {
    return null;
  }
}

/** Model "uyuşmuyor" derse çözümlü örneği düşür; uydurma sayı koyma. */
export function dropUnverifiedExample(text: string): string {
  const parts = text.split(/\n{2,}/);
  const kept = parts.filter((part) => !/(→|->)/.test(part) && !/\d\s*[+×÷*/\-]\s*\d\s*[=≈]/.test(part));
  if (kept.length === parts.length) {
    return `${text.trim()}\n\nBu örnekteki sonucu yeniden türetince tutmadı; örneği çıkardım.`;
  }
  if (!kept.length) {
    return "Bu örnekteki sayı tutmadığı için onu çıkardım. İstersen mol / katsayı oranını birlikte yeniden kuralım.";
  }
  return `${kept.join("\n\n").trim()}\n\nÖrnekteki sonuç tutmadığı için o örneği çıkardım.`;
}

const GRAM_RULE = /daha az gram|gramsa|az gram|kutle(?:si)? (?:kucuk|az)|kütle(?:si)? (?:küçük|az)|less mass|fewer grams|smaller mass/i;

function gramMisconception(text: string): boolean {
  const folded = foldTr(text);
  return GRAM_RULE.test(text) || /daha az gram|gramsa|az gram/.test(folded) || (/gram/.test(folded) && /sinirlay/.test(folded));
}

/** Öğrencinin kendi sayıları durur. Bağlam ancak ikiden az sayı varsa tamamlar. */
function amountsForClaim(student: string, context: string): Map<string, number> {
  const amounts = parseAmounts(student);
  if (amounts.size >= 2) return amounts;
  for (const [key, value] of parseAmounts(context)) {
    if (!amounts.has(key)) amounts.set(key, value);
  }
  return amounts;
}

function gradeLimiting(student: string, rows: RatioRow[], claim: NonNullable<ReturnType<typeof claimedLimiter>>): GradedClaim {
  const result = limitingOf(rows);
  const repair = ratioSentence(rows, result);
  const statedMoles = rows.map((row) => `${formatTr(row.moles)} mol ${row.display}`).join(", ");
  if (claim.kind === "none") {
    if (result.none) {
      return {
        verdict: "dogru",
        verdictLine: "Doğru: hiçbiri sınırlayıcı değil; ikisi de tamamen tükenir.",
        rightParts: ["Oranlar eşit.", `Mol sayıları: ${statedMoles}.`],
        wrongParts: [],
        conclusion: repair,
        wrongType: "",
        topicLabel: "Sınırlayıcı bileşen",
      };
    }
    return {
      verdict: "yanlis",
      verdictLine: `Yanlış: sınırlayıcı ${result.species.map((row) => row.display).join(", ")}.`,
      rightParts: [],
      wrongParts: ["Eşit oran yok; küçük oran sınırlayıcıyı verir."],
      conclusion: repair,
      wrongType: "sinirlayici_oran",
      topicLabel: "Sınırlayıcı bileşen",
    };
  }
  const rightSpecies = !result.none && result.species.some((row) => row.species === claim.species);
  if (result.none || !rightSpecies) {
    const line = result.none
      ? "Yanlış: hiçbiri sınırlayıcı değil; ikisi de tamamen tükenir."
      : `Yanlış: sınırlayıcı ${result.species.map((row) => row.display).join(", ")}.`;
    return {
      verdict: "yanlis",
      verdictLine: line,
      rightParts: [`Mol sayıları hesaba katıldı (${statedMoles}).`],
      wrongParts: result.none
        ? ["Az olan mol, sınırlayıcı demek değildir; katsayıya bölününce oranlar eşit."]
        : [`${claim.display ?? "Bu madde"} sınırlayıcı değil.`],
      conclusion: repair,
      wrongType: gramMisconception(student) ? "gram_karsilastirma" : "sinirlayici_oran",
      topicLabel: "Sınırlayıcı bileşen",
    };
  }
  if (gramMisconception(student)) {
    return {
      verdict: "kismen",
      verdictLine: `Kısmen doğru: sınırlayıcı ${claim.display}; gerekçe yanlış.`,
      rightParts: [`Sınırlayıcı madde ${claim.display}.`],
      wrongParts: ["Gramı az olan sınırlayıcı değildir. Karar mol / katsayı oranına bakar."],
      conclusion: repair,
      wrongType: "gram_karsilastirma",
      topicLabel: "Sınırlayıcı bileşen",
    };
  }
  return {
    verdict: "dogru",
    verdictLine: `Doğru: sınırlayıcı ${claim.display}.`,
    rightParts: [repair],
    wrongParts: [],
    conclusion: repair,
    wrongType: "",
    topicLabel: "Sınırlayıcı bileşen",
  };
}

/**
 * Öğrencinin iddiasını, önce doğru sonucu hesaplayarak hükümler.
 * Eşit oran "kısmen doğru" değildir: hüküm yanlış, sonuç "hiçbiri sınırlayıcı değil".
 */
export function gradeStudentClaim(input: { student: string; context?: string }): GradedClaim | null {
  const student = input.student.trim();
  if (!student) return null;
  const context = input.context ?? "";
  const amounts = amountsForClaim(student, context);
  const chosen = chooseReaction([...parseReactions(student), ...parseReactions(context)], amounts);
  if (chosen) {
    const rows = ratiosFor(chosen, amounts);
    const claim = claimedLimiter(student, chosen);
    if (rows && claim) return gradeLimiting(student, rows, claim);
  }

  if (gramMisconception(student) && /(sınırlayıcı|limiting)/i.test(student)) {
    return {
      verdict: "yanlis",
      verdictLine: "Yanlış: kütleyi (gramı) doğrudan kıyaslamak sınırlayıcıyı bulmaz.",
      rightParts: [],
      wrongParts: ["Az gram olan madde sınırlayıcı değildir."],
      conclusion: "Önce mollere çevir, sonra her maddeyi kendi katsayısına böl. Küçük oran sınırlayıcıdır.",
      wrongType: "gram_karsilastirma",
      topicLabel: "Sınırlayıcı bileşen",
    };
  }

  const arith = arithmeticIssues(student);
  if (arith.length) {
    return {
      verdict: "yanlis",
      verdictLine: `Yanlış: ${arith[0].detail}`,
      rightParts: [],
      wrongParts: arith.map((issue) => issue.detail),
      conclusion: arith[0].repair,
      wrongType: "aritmetik",
      topicLabel: "Hesap",
    };
  }

  return null;
}

const ERROR_WORD = /hata(?:\s+var|lı|sı|si)?|hatalı|yanlış\s+hesap|hesab\w{0,8}\s+(?:bir\s+)?hata|incorrect|mistake/i;
const SPECIES_WORD = /^(mol|icin|ile|var|olan|bir|bu|ve|sonra|kadar|icin|g|kg|the|and|for)$/;

type EqualityHit = { expr: string; value: number; stated: number; span: string; ok: boolean };

function equalityHits(text: string): EqualityHit[] {
  const out: EqualityHit[] = [];
  const pattern = /((?:\d+(?:[.,]\d+)?(?:\s*[+×÷*/\-−–]\s*\d+(?:[.,]\d+)?)+))\s*(≈|~|=)\s*(\d+(?:[.,]\d+)?)/g;
  for (const match of text.matchAll(pattern)) {
    const actual = evalArith(match[1]);
    const stated = parseNumber(match[3]);
    if (actual == null || !Number.isFinite(stated)) continue;
    const approx = match[2] !== "=";
    const tol = approx ? Math.max(0.02, Math.abs(actual) * 0.02) : Math.max(0.005, Math.abs(actual) * 0.005);
    out.push({
      expr: match[1].replace(/\s+/g, " "),
      value: actual,
      stated,
      span: match[0],
      ok: Math.abs(actual - stated) <= tol,
    });
  }
  return out;
}

function looksLikeSpecies(species: string): boolean {
  if (SPECIES_WORD.test(species) || /oran|kucuk|buyuk|madde|bilesen|hicbir|kisi/.test(species)) return false;
  return /\d/.test(species) || /^[a-z]{1,3}$/.test(species);
}

function computedMoles(text: string): Map<string, number> {
  const map = new Map<string, number>();
  const re = /n\s*\(\s*([A-Za-z][A-Za-z0-9₀-₉]*)\s*\)\s*=\s*([^,\n]{0,48}?)\s*=\s*(\d+(?:[.,]\d+)?)/gi;
  for (const match of text.matchAll(re)) {
    const actual = evalArith(match[2]);
    const stated = parseNumber(match[3]);
    const value = actual != null && Number.isFinite(stated) && Math.abs(actual - stated) <= Math.max(0.02, Math.abs(actual) * 0.02)
      ? actual
      : stated;
    if (Number.isFinite(value)) map.set(normFormula(match[1]), value);
  }
  for (const [key, value] of parseAmounts(text)) {
    if (!map.has(key)) map.set(key, value);
  }
  return map;
}

/** Taslak, öğrencinin doğru çıkan değerine "hata" diyorsa. */
function falseErrorTargets(student: string, draft: string): string[] {
  if (!ERROR_WORD.test(draft)) return [];
  const stated = parseAmounts(student);
  if (!stated.size) return [];
  const computed = computedMoles(draft);
  const sentences = draft.split(/(?<=[.!?])\s+|\n+/);
  const hit = new Set<string>();
  for (let i = 0; i < sentences.length; i += 1) {
    if (!ERROR_WORD.test(sentences[i])) continue;
    const window = `${sentences[i]} ${sentences[i + 1] ?? ""}`;
    const named = new Set([...window.matchAll(/[A-Za-z][A-Za-z0-9₀-₉]*/g)].map((item) => normFormula(item[0])));
    for (const [species, value] of stated) {
      if (!named.has(species)) continue;
      const got = computed.get(species);
      if (got != null && Math.abs(got - value) <= 1e-6) hit.add(species);
    }
  }
  return [...hit];
}

function mentionsInText(text: string): Array<{ species: string; coefficient: number }> {
  const normalized = normalizeFractions(text);
  const out: Array<{ species: string; coefficient: number }> = [];
  const speciesRe = /[A-Za-z][A-Za-z0-9₀-₉]*/g;
  for (const match of normalized.matchAll(speciesRe)) {
    const species = normFormula(match[0]);
    if (!looksLikeSpecies(species)) continue;
    const window = normalized.slice(match.index ?? 0, (match.index ?? 0) + 72);
    const after = window.match(/katsay[ıi][^\d/]{0,14}(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)/i);
    const before = window.match(/(\d+\s*\/\s*\d+|\d+(?:[.,]\d+)?)['’](?:nin|nın|nun|nün|in|ın|un|ün)\s+katsay/i);
    const raw = after?.[1] ?? before?.[1];
    if (!raw) continue;
    const coefficient = parseCoeff(raw);
    if (!(coefficient > 0)) continue;
    out.push({ species, coefficient });
  }
  return out;
}

function coefficientSets(text: string): Array<Map<string, number>> {
  const sets: Array<Map<string, number>> = parseReactions(text)
    .filter((reaction) => reaction.length >= 2)
    .map((reaction) => new Map(reaction.map((item) => [item.species, item.coefficient])));
  let current = new Map<string, number>();
  const flush = () => {
    if (current.size >= 2) sets.push(current);
    current = new Map();
  };
  for (const mention of mentionsInText(text)) {
    const prev = current.get(mention.species);
    if (prev != null && Math.abs(prev - mention.coefficient) > 1e-6) flush();
    current.set(mention.species, mention.coefficient);
  }
  flush();
  return sets;
}

function setsAreProportional(left: Map<string, number>, right: Map<string, number>): boolean {
  const shared = [...left.keys()].filter((key) => right.has(key));
  if (shared.length < 2) return true;
  const ratios = shared.map((key) => (left.get(key) as number) / (right.get(key) as number));
  if (ratios.some((ratio) => !Number.isFinite(ratio))) return false;
  return ratios.every((ratio) => Math.abs(ratio - ratios[0]) <= 1e-6 * Math.max(1, Math.abs(ratios[0])));
}

/** Aynı maddeler için orantılı olmayan iki katsayı kümesi. */
export function hasInconsistentCoefficients(text: string): boolean {
  const sets = coefficientSets(text);
  for (let i = 0; i < sets.length; i += 1) {
    for (let j = i + 1; j < sets.length; j += 1) {
      const shared = [...sets[i].keys()].filter((key) => sets[j].has(key));
      if (shared.length < 2) continue;
      if (!setsAreProportional(sets[i], sets[j])) return true;
    }
  }
  return false;
}

function saysNone(text: string): boolean {
  const folded = foldTr(text);
  return /hicbiri sinirlayici degil|ikisi de tamamen tuken/.test(folded);
}

function firstPositiveLimiter(text: string): string | null {
  const re = /([A-Za-z][A-Za-z0-9₀-₉]*)\s*,?\s*(?:sınırlayıcı(?:d[ıi]r|dır)?|limiting)(?!\s*değil)/gi;
  for (const match of text.matchAll(re)) {
    const species = normFormula(match[1]);
    if (looksLikeSpecies(species)) return species;
  }
  return null;
}

function affirmedEquality(student: string, draft: string): GradedClaim | null {
  if (!ERROR_WORD.test(draft)) return null;
  const studentOk = equalityHits(student).filter((item) => item.ok);
  const draftOk = equalityHits(draft).filter((item) => item.ok);
  const shared = studentOk.find((item) => draftOk.some((other) => other.expr === item.expr && Math.abs(other.value - item.value) <= 1e-6));
  if (!shared) return null;
  const shown = `${shared.expr} = ${formatTr(shared.value)}`;
  return {
    verdict: "dogru",
    verdictLine: `Doğru: ${shown}.`,
    rightParts: [`${shown}.`],
    wrongParts: ["Doğru çıkan sonuca hata denmiş."],
    conclusion: `${shown}.`,
    wrongType: "yanlis_hata",
    topicLabel: "Hesap",
  };
}

function draftConflicts(draft: string, grade: GradedClaim, student: string): boolean {
  if (falseErrorTargets(student, draft).length > 0) return true;
  if (hasInconsistentCoefficients(draft)) return true;
  if (grade.verdict === "dogru" && ERROR_WORD.test(draft)) return true;
  if (grade.wrongType === "aritmetik" && arithmeticIssues(draft).length > 0) return true;
  if (grade.topicLabel !== "Sınırlayıcı bileşen") return false;
  const gradeNone = /hiçbiri sınırlayıcı değil/i.test(grade.verdictLine);
  const named = firstPositiveLimiter(draft);
  if (gradeNone) {
    if (named && !saysNone(draft)) return true;
    if (!saysNone(draft) && /^\s*(?:\*\*)?kısmen doğru/i.test(draft)) return true;
    return false;
  }
  if (saysNone(draft)) return true;
  if (named && !foldTr(grade.verdictLine).includes(named)) return true;
  if (grade.verdict !== "kismen" && /^\s*(?:\*\*)?kısmen doğru/i.test(draft)) return true;
  if (grade.verdict === "dogru" && /^\s*(?:\*\*)?yanlış/i.test(draft)) return true;
  return false;
}

export function renderVerifiedAnswer(grade: GradedClaim): string {
  const lines = [grade.verdictLine];
  if (grade.rightParts.length) lines.push(`Doğru kısım: ${grade.rightParts.join(" ")}`);
  if (grade.wrongParts.length) lines.push(`Yanlış kısım: ${grade.wrongParts.join(" ")}`);
  const conclusionFold = grade.conclusion.toLocaleLowerCase("tr").slice(0, 18);
  if (grade.conclusion && !lines.join("\n").toLocaleLowerCase("tr").includes(conclusionFold)) {
    lines.push(grade.conclusion);
  }
  return lines.join("\n\n");
}

const SAFE_COEFFICIENT =
  "Bu yanıt aynı nicelik için birbiriyle orantılı olmayan iki katsayı kullanıyor. O yüzden buradan bir sonuç ilan etmiyorum. Her miktarı kendi katsayısına böl; küçük oran sınırlayıcıdır, oranlar eşitse hiçbiri sınırlayıcı değildir.";

function studentMakesNumericClaim(student: string): boolean {
  return /\d/.test(student) && /(sınırlay|limiting|=|mol|oran)/i.test(student);
}

/**
 * Taslağı gizlenmiş çözüme vurur.
 * Çözüm ile taslak çelişirse ya da taslak kendi içinde çelişirse
 * uzun metin düşer; yerine kısa, denetlenen hüküm gelir.
 */
export function settleQuantReply(input: {
  student: string;
  context: string;
  draft: string;
}): { text: string; grade: GradedClaim | null; replaced: boolean } {
  const grade = gradeStudentClaim({ student: input.student, context: input.context })
    ?? gradeStudentClaim({ student: input.student, context: input.draft })
    ?? affirmedEquality(input.student, input.draft);
  if (grade && draftConflicts(input.draft, grade, input.student)) {
    return { text: renderVerifiedAnswer(grade), grade, replaced: true };
  }
  if (!grade && studentMakesNumericClaim(input.student) && hasInconsistentCoefficients(input.draft)) {
    return { text: SAFE_COEFFICIENT, grade: null, replaced: true };
  }
  return { text: input.draft, grade, replaced: false };
}
