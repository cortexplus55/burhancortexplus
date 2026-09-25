/**
 * Bozuk ders parçasını bir kez onarır; onarım da tutmazsa o parça düşer.
 *
 * Tüm ders yeniden yazılmaz. Çelişen cümle, eksik soru, yarım örnek,
 * zayıf özet ve eksik çizim bu kapıdan geçer.
 */

import { foldTr } from "@/lib/documents/page-analysis";
import { sliceNumberedSection } from "@/lib/documents/topic-title";
import {
  alignSymbolSubscripts,
  incompleteFormulaLine,
  preserveSubscriptLetters,
  repairGappedFrame,
  restoreMathNotation,
  separateRunOnFormulas,
} from "@/lib/learning/lesson-board";
import {
  ambiguousEnergyClaim,
  claimsFromVerify,
  claimVerifyPrompt,
  foreignToTopic,
  missingCoverage,
  missingFormulaCoverage,
  offTopicSection,
  overgeneralCorrection,
  MEASURE,
  realGasPrecisionIssue,
  statedRelations,
  rewriteSignFlip,
  signConventionFlip,
  summaryQuantityMismatch,
} from "@/lib/learning/lesson-claims";
import { diagramIssues, lessonDiagramSchema, needsDiagram } from "@/lib/learning/lesson-diagram";
import {
  announcesIncompleteExample,
  clippedContrastDefinition,
  conceptCheck,
  danglingOpener,
  publishCoherentLesson,
  retainAnchoredSentences,
} from "@/lib/learning/lesson-coherence";
import { groundLearnerLesson, normalizeSummaryText, summaryLineProblem } from "@/lib/learning/lesson-grounding";
import type { LessonDiagram } from "@/lib/learning/lesson-diagram";
import type { LessonV2, SectionCheck } from "@/lib/learning/teaching-standards";

export type LessonCheckCode =
  | "source_contradiction"
  | "stem_grammar"
  | "check_count"
  | "example_incomplete"
  | "summary_weak"
  | "vacuous"
  | "bound_mismatch"
  | "diagram_missing"
  | "diagram_unreadable"
  | "claim_wrong"
  | "coverage_gap";

export type LessonCheck = { code: LessonCheckCode; detail: string };

const NEGATION = /\b(olamaz|bulunamaz|gerceklesemez|imkansiz|mumkun degildir)\b/;

function polishCalculations(text: string, source: string): string {
  const parts = sentencesOf(text);
  const kept: string[] = [];
  const context = `${text}\n${source}`;
  for (let index = 0; index < parts.length; index += 1) {
    const current = parts[index] ?? "";
    const following = parts[index + 1] ?? "";
    const pair = following ? `${current} ${following}` : "";
    const currentLine = polishWorkedExample(current, context);
    const currentReady = Boolean(currentLine) && !workedExampleNeedsFormula(currentLine ?? "");
    if (
      pair &&
      !currentReady &&
      (workedExampleNeedsFormula(current) || bareNumericChain(current)) &&
      (workedExampleNeedsFormula(pair) || bareNumericChain(pair))
    ) {
      const line = polishWorkedExample(pair, context);
      if (line && !workedExampleNeedsFormula(line)) {
        kept.push(line);
        index += 1;
        continue;
      }
    }
    kept.push(currentReady && currentLine ? currentLine : current);
  }
  return kept.join(" ").replace(/\s+/g, " ").trim();
}

function sentencesOf(text: string): string[] {
  return text
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ“"])/)
    .map((part) => part.trim())
    .filter((part) => part.length >= 8);
}

function stems(text: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const word of foldTr(text).split(/[^a-z0-9]+/)) {
    if (word.length < 4) continue;
    if (/^(olan|olarak|birlikte|dengede|dengededir|olamaz|bulunamaz)$/.test(word)) continue;
    const stem = word.slice(0, 5);
    if (seen.has(stem)) continue;
    seen.add(stem);
    out.push(stem);
  }
  return out;
}

function affirmsCoexistence(sentence: string, wanted: string[]): boolean {
  const folded = foldTr(sentence);
  if (NEGATION.test(folded)) return false;
  if (!/(birlikte|dengede|bir arada|bulunur|yer alir)/.test(folded)) return false;
  const shared = wanted.filter((stem) => folded.includes(stem));
  return shared.length >= 2;
}

/** Kaynak bir arada duran şeyi ders "olamaz" diyorsa cümle yayımlanmaz. */
export function contradictorySentences(text: string, source: string): string[] {
  if (!source.trim()) return [];
  const sourceSentences = sentencesOf(source);
  const found: string[] = [];
  for (const sentence of sentencesOf(text)) {
    const folded = foldTr(sentence);
    if (!NEGATION.test(folded)) continue;
    const wanted = stems(sentence);
    if (wanted.length < 2) continue;
    if (sourceSentences.some((item) => affirmsCoexistence(item, wanted))) found.push(sentence);
  }
  return found;
}

/** "T-v diyagramında … değildir" gibi öznesiz yüklem. */
export function stemLacksSubject(prompt: string): boolean {
  const claim = prompt
    .replace(/aşağıdakilerden hangisi doğrudur\??/gi, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!claim) return true;
  const words = claim.replace(/[?.!]/g, "").split(/\s+/).filter(Boolean);
  if (words.length < 4) return true;
  const locative = words.findIndex((word) => /(ında|inde|unda|ünde|nda|nde)$/i.test(word));
  if (locative < 0 || locative > 2) return false;
  if (!/(değildir|olamaz|yoktur)\s*\.?$/i.test(claim)) return false;
  return !/\sve\s/i.test(claim);
}

export function vacuousSentence(text: string): boolean {
  const folded = foldTr(text);
  if (/\d/.test(text) || /=/.test(text)) return false;
  if (/belirgin bir yon/.test(folded)) return true;
  return /^sonuc[,:]/.test(folded) && folded.split(/\s+/).length < 14 && /goster/.test(folded);
}

function placeholderWork(text: string): boolean {
  const folded = foldTr(text);
  return /adim\s*\d+/.test(folded) && /sonucu hesapla/.test(folded);
}

function measureUnit(text: string, raw: string): string {
  const re = new RegExp(`(?<!\\d)${escapeReg(raw)}(?!\\d)\\s*(${MEASURE})`, "i");
  return text.match(re)?.[1] ?? "";
}

function readNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

function nearly(left: number, right: number, tolerance: number): boolean {
  return Number.isFinite(left) && Number.isFinite(right) && Math.abs(left - right) <= tolerance;
}

function hasSymbolicRelation(text: string): boolean {
  if (symbolicEquations(text).length > 0) return true;
  return /[A-Za-zΔδ][A-Za-z0-9_Δδ]*\s*=\s*[^0-9.;]{0,60}[A-Za-zΔδ∫]/.test(text);
}

/** Verilen, yerine koyma ve sayısal sonuç yoksa hesap yarım kalmıştır. */
export function exampleIsComplete(text: string): boolean {
  if (!text.trim() || placeholderWork(text)) return false;
  if (workedExampleNeedsFormula(text)) return false;
  const given = new RegExp(`\\d+(?:[.,]\\d+)?\\s*${MEASURE}`, "i").test(text);
  const substituted =
    /\d+(?:[.,]\d+)?(?:\s*[A-Za-z°µ/%³²·]+)?\s*[/×*·+\-−]\s*\d/.test(text) ||
    /\(\d+(?:[.,]\d+)?\s*[^)]+\)\s*\(/.test(text);
  const result = /(?:=|≈)\s*\d+(?:[.,]\d+)?\b/.test(text);
  return given && substituted && result;
}

function bareDifference(text: string): boolean {
  const compact = text.replace(/\s+/g, " ");
  if (/[×x*/]/.test(compact) || hasSymbolicRelation(text)) return false;
  return /=\s*\d+(?:[.,]\d+)?\s*[-−]\s*\d+(?:[.,]\d+)?\s*=\s*\d/.test(compact);
}

function bareQuotient(text: string): boolean {
  if (hasSymbolicRelation(text)) return false;
  return /\d+(?:[.,]\d+)?\s*\/\s*\d+(?:[.,]\d+)?\s*=\s*\d/.test(text);
}

function bareFunctionProduct(text: string): boolean {
  if (hasSymbolicRelation(text)) return false;
  if (!/(?:ln|log|exp)\s*\(?\s*\d/i.test(text)) return false;
  return /(?:≈|=)\s*\d+(?:[.,]\d+)?/.test(text);
}

function proseCombination(text: string): boolean {
  if (/[=≈]/.test(text) || hasSymbolicRelation(text)) return false;
  const amounts = [
    ...text.matchAll(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${MEASURE})`, "gi")),
  ].map((match) => readNumber(match[1]));
  if (amounts.length < 3) return false;
  const result = amounts[amounts.length - 1];
  const inputs = amounts.slice(0, -1);
  return inputs.some((left, index) =>
    inputs.slice(index + 1).some((right) =>
      nearly(left - right, result, 0.051) ||
      nearly(left + right, result, 0.051) ||
      (right !== 0 && nearly(left / right, result, 0.051)),
    ),
  );
}

/**
 * Sol taraf adlandırılmış, işlemdeki iki sayı da birimiyle duruyorsa
 * satır kendi sonucunu kurmuştur. Birimsiz sayı zinciri formül bekler.
 */
function namesItsCalculation(text: string): boolean {
  if (/(?:^|[^A-Za-zÇĞİÖŞÜçğıöşü])(sonuç|sonuc|cevap)(?:$|[^A-Za-zÇĞİÖŞÜçğıöşü])/i.test(text)) return false;
  const named =
    /[A-Za-zΔδ][A-Za-z0-9_Δδ]*\s*=\s*\d+(?:[.,]\d+)?\s*[/×*·+\-−]\s*\d+(?:[.,]\d+)?\s*(?:=|≈)\s*\d/.test(text);
  if (!named) return false;
  const ops = text.match(/(\d+(?:[.,]\d+)?)\s*[/×*·+\-−]\s*(\d+(?:[.,]\d+)?)/);
  if (!ops) return false;
  const withUnit = (raw: string) => new RegExp(`(?<!\\d)${escapeReg(raw)}(?!\\d)\\s*${MEASURE}`, "i").test(text);
  return withUnit(ops[1]) && withUnit(ops[2]);
}

/** Simge yazılmadan sayıların çarpıldığı, bölündüğü veya çıkarıldığı satır. */
function bareNumericChain(text: string): boolean {
  if (hasSymbolicRelation(text)) return false;
  return /\d+(?:[.,]\d+)?(?:\s*[A-Za-z°µ/%³²·()]+)?\s*[/×*·+\-−]\s*\d/.test(text) && /[=≈]/.test(text);
}

/** Sayısal hesap formülü yazmıyorsa tamamlanmalıdır. Adı ve sonucu duran zincir ayrıca yükseltilir. */
export function workedExampleNeedsFormula(text: string): boolean {
  if (hasSymbolicRelation(text) || namesItsCalculation(text)) return false;
  return bareDifference(text) || bareQuotient(text) || bareFunctionProduct(text) || proseCombination(text);
}

function formulasIn(context: string): string[] {
  const found: string[] = [];
  for (const sentence of sentencesOf(context)) {
    for (const equation of symbolicEquations(sentence)) {
      const key = foldTr(equation).replace(/\s+/g, "");
      if (found.some((item) => foldTr(item).replace(/\s+/g, "") === key)) continue;
      found.push(equation.replace(/\s+-\s+/g, " − ").replace(/\s+/g, " ").trim());
    }
  }
  return found;
}

function formulaLhs(formula: string): string {
  return formula.split("=")[0]?.trim() ?? "";
}

function formulaFitsCalculation(formula: string, text: string): boolean {
  const rhs = formula.split("=").slice(1).join("=");
  const product = /[×*·]/.test(text);
  const quotient = /\d+(?:[.,]\d+)?\s*\/\s*\d/.test(text);
  const difference = /\d+(?:[.,]\d+)?\s*[-−]\s*\d/.test(text);
  const formFn = /(?:ln|log|exp)/i.test(rhs);
  const formDiv = /\//.test(rhs);
  const formDiff = /[−–-]/.test(rhs);
  if (/(?:ln|log|exp)\s*\(?\s*\d/i.test(text)) return formFn;
  const parenDiff = /\([^)]*\d+(?:[.,]\d+)?\s*[-−]\s*\d+(?:[.,]\d+)?[^)]*\)/.test(text);
  if (product && difference && !parenDiff && !(formDiff && (formDiv || /[×*·]/.test(rhs)))) return false;
  if (difference && !product && !quotient) return formDiff && !formFn;
  if (quotient && !product) return formDiv;
  if (product || quotient) return formDiv || /[A-Za-zΔδ]\s*[A-Za-zΔδ]/.test(rhs);
  return true;
}

function sameFormula(formulas: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const formula of formulas) {
    const key = foldTr(formula).replace(/\s+/g, "").replace(/[−–]/g, "-");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(formula);
  }
  return out;
}

function pickFormula(text: string, context: string, formulas: string[]): string | null {
  const named = formulas.filter((formula) => {
    const lhs = formulaLhs(formula);
    if (!lhs) return false;
    return new RegExp(`(?:^|[^A-Za-zΔδ])${escapeReg(lhs)}(?:$|[^A-Za-zΔδ0-9_])`).test(text);
  });
  if (named.length === 1 && formulaFitsCalculation(named[0], text)) return named[0];
  const shapedNamed = sameFormula(named.filter((formula) => formulaFitsCalculation(formula, text)));
  if (shapedNamed.length === 1) return shapedNamed[0];
  const foldedText = foldTr(text);
  const byPhrase = formulas.filter((formula) => {
    const lhs = formulaLhs(formula);
    const at = context.indexOf(lhs);
    if (at < 0) return false;
    const phrase = context
      .slice(0, at)
      .trim()
      .split(/\s+/)
      .slice(-2)
      .join(" ");
    return phrase.length >= 3 && foldedText.includes(foldTr(phrase));
  });
  if (byPhrase.length === 1 && formulaFitsCalculation(byPhrase[0], text)) return byPhrase[0];
  const shaped = formulas.filter((formula) => formulaFitsCalculation(formula, text));
  return shaped.length === 1 ? shaped[0] : null;
}

function polishDifference(text: string, context: string, formula: string): string | null {
  const inline = text.match(
    /(\d+(?:[.,]\d+)?)\s*[-−]\s*(\d+(?:[.,]\d+)?)\s*=\s*(\d+(?:[.,]\d+)?)\s*([A-Za-zµ°%³/]+)?/,
  );
  let left = "";
  let right = "";
  let result = "";
  let unit = "";
  if (inline && !/[×x*/]/.test(text)) {
    left = inline[1];
    right = inline[2];
    result = inline[3];
    unit = inline[4] ?? measureUnit(text, result);
  } else if (proseCombination(text)) {
    const amounts = [...text.matchAll(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${MEASURE})`, "gi"))];
    const last = amounts[amounts.length - 1];
    const prior = amounts.slice(0, -1);
    const total = readNumber(last?.[1] ?? "");
    const pair = prior.find((item, index) =>
      prior.slice(index + 1).some((other) => nearly(readNumber(item[1]) - readNumber(other[1]), total, 0.051)),
    );
    const other = pair
      ? prior.find((item) => item !== pair && nearly(readNumber(pair[1]) - readNumber(item[1]), total, 0.051))
      : undefined;
    if (!pair || !other || !last) return null;
    left = pair[1];
    right = other[1];
    result = last[1];
    unit = last[2];
  } else {
    return null;
  }
  if (!nearly(readNumber(left) - readNumber(right), readNumber(result), 0.051)) return null;
  const dressed = unit ? ` ${unit}` : "";
  return `${formula} = ${left}${dressed} − ${right}${dressed} = ${result}${dressed}`.replace(/\s+/g, " ").trim();
}

function polishQuotient(text: string, context: string, formula: string): string | null {
  if (!/\//.test(formula.split("=").slice(1).join("="))) return null;
  const match = text.match(/(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*=\s*(\d+(?:[.,]\d+)?)/);
  if (!match || !nearly(readNumber(match[1]) / readNumber(match[2]), readNumber(match[3]), 0.051)) return null;
  const leftUnit = measureUnit(`${context}\n${text}`, match[1]);
  const rightUnit = measureUnit(`${context}\n${text}`, match[2]);
  const resultUnit = measureUnit(`${context}\n${text}`, match[3]);
  const dress = (raw: string, unit: string) => (unit ? `${raw} ${unit}` : raw);
  return `${formula} = ${dress(match[1], leftUnit)} / ${dress(match[2], rightUnit)} = ${dress(match[3], resultUnit)}`
    .replace(/\s+/g, " ")
    .trim();
}

function polishProduct(text: string, context: string, formula: string): string | null {
  if (!/(?:ln|log|exp)\s*\(?\s*\d/i.test(text)) return null;
  const marks = [...text.matchAll(/(≈|=)\s*(\d+(?:[.,]\d+)?)\s*([A-Za-zµ°%³/]+)?/g)];
  const claimed = marks[marks.length - 1];
  if (!claimed || claimed.index == null) return null;
  const head = text.slice(0, claimed.index).replace(/^[^×x*\d]*?(?:ln|log|exp|\d)/i, (token) => token);
  const body = head.replace(/^[^×x*\n]*?=\s*/, "");
  const tokens = body.split(/\s*[×x*]\s*/).map((token) => token.trim()).filter(Boolean);
  if (tokens.length < 2) return null;
  let value = 1;
  const rendered: string[] = [];
  for (const token of tokens) {
    const fn = token.match(/^(ln|log|exp)\s*\(?\s*(\d+(?:[.,]\d+)?)\s*\)?$/i);
    if (fn) {
      const argument = readNumber(fn[2]);
      const fnName = fn[1].toLowerCase();
      value *= fnName === "ln" ? Math.log(argument) : fnName === "log" ? Math.log10(argument) : Math.exp(argument);
      rendered.push(`${fnName} ${fn[2]}`);
      continue;
    }
    const num = token.match(/(\d+(?:[.,]\d+)?)/);
    if (!num) return null;
    value *= readNumber(num[1]);
    const unit = measureUnit(`${context}\n${text}`, num[1]);
    rendered.push(unit ? `(${num[1]} ${unit})` : num[1]);
  }
  if (!nearly(value, readNumber(claimed[2]), 0.15)) return null;
  const chain = rendered.join("").replace(/\)(?=(?:ln|log|exp)\b)/i, ") ");
  const mark = claimed[1] === "≈" ? "≈" : "=";
  const unit = claimed[3] ? ` ${claimed[3]}` : "";
  return `${formula} = ${chain} ${mark} ${claimed[2]}${unit}`.replace(/\s+/g, " ").trim();
}

function sameSymbol(left: string, right: string): boolean {
  const key = (value: string) => preserveSubscriptLetters(value).replace(/\s+/g, "");
  return key(left) === key(right);
}

function formulaUsesSymbol(formula: string, symbol: string): boolean {
  const rhs = preserveSubscriptLetters(formula.split("=").slice(1).join("="));
  const key = preserveSubscriptLetters(symbol);
  if (key.length > 1) return rhs.includes(key);
  return new RegExp(escapeReg(key)).test(rhs);
}

function unitOnToken(token: string, raw: string): string {
  const inline = token.match(new RegExp(`^${escapeReg(raw)}\\s*(${MEASURE})`, "i"));
  return inline?.[1] ?? "";
}

function unitForValue(context: string, raw: string, formula: string): string {
  const re = new RegExp(
    `(?<![A-Za-zΔδ0-9_])([A-Za-zΔδ](?:_[A-Za-z0-9]+|[₀-₉¹²³ᵤᵣₐₑₕᵢⱼₖₗₘₙₒₚₛₜᵥₓ])*)\\s*=\\s*${escapeReg(raw)}(?!\\d)\\s*(${MEASURE})`,
    "gi",
  );
  for (const match of context.matchAll(re)) {
    if (formulaUsesSymbol(formula, match[1])) return match[2] ?? "";
  }
  return "";
}

/** a × b / c gibi karışık sayı zinciri, formül ve birimle yazılır. */
function polishArithmetic(text: string, context: string, formula: string): string | null {
  const marks = [...text.matchAll(/(≈|=)\s*(\d+(?:[.,]\d+)?)\s*([^\n.;]{0,32})?/g)];
  const claimed = marks[marks.length - 1];
  if (!claimed || claimed.index == null) return null;
  const head = text.slice(0, claimed.index);
  const chain = head.match(
    new RegExp(
      `(\\d+(?:[.,]\\d+)?(?:\\s*${MEASURE})?(?:\\s*[/×*·+\\-−]\\s*\\d+(?:[.,]\\d+)?(?:\\s*${MEASURE})?){1,})`,
      "i",
    ),
  );
  if (!chain) return null;
  const pieces = chain[1].split(/\s*([/×*·+\-−])\s*/).map((part) => part.trim()).filter(Boolean);
  if (pieces.length < 3) return null;
  let value = Number.NaN;
  const rendered: string[] = [];
  for (const piece of pieces) {
    if (/^[/×*·+\-−]$/.test(piece)) {
      rendered.push(piece === "*" || piece === "·" ? "×" : piece === "-" ? "−" : piece);
      continue;
    }
    const num = piece.match(/(\d+(?:[.,]\d+)?)/);
    if (!num) return null;
    const next = readNumber(num[1]);
    const op = rendered[rendered.length - 1];
    if (!Number.isFinite(value)) value = next;
    else if (op === "×") value *= next;
    else if (op === "/") value /= next;
    else if (op === "+") value += next;
    else if (op === "−") value -= next;
    else return null;
    const unit = unitOnToken(piece, num[1]) || unitForValue(`${context}\n${text}`, num[1], formula);
    rendered.push(unit ? `(${num[1]} ${unit})` : num[1]);
  }
  const target = readNumber(claimed[2]);
  if (!nearly(value, target, Math.max(0.15, Math.abs(target) * 0.005))) return null;
  const resultUnit = (claimed[3] ?? "").match(new RegExp(MEASURE, "i"))?.[0] ?? "";
  const shown = rendered.join(" ").replace(/\s+/g, " ").trim();
  const mark = claimed[1] === "≈" ? "≈" : "=";
  return `${formula} = ${shown} ${mark} ${claimed[2]}${resultUnit ? ` ${resultUnit}` : ""}`.replace(/\s+/g, " ").trim();
}

function upgradeNamedCalculation(text: string, context: string): string {
  const formulas = formulasIn(context);
  const formula = formulas.length ? pickFormula(text, context, formulas) : null;
  if (!formula) return text;
  return (
    polishQuotient(text, context, formula) ??
    polishDifference(text, context, formula) ??
    polishArithmetic(text, context, formula) ??
    text
  );
}

function finishedNumericChain(text: string): boolean {
  return /(?:≈|=)\s*\d+(?:[.,]\d+)?\s*(?:[A-Za-zµ°%³]|kJ|kPa|mol)/.test(text);
}

/** Verilen ve sonuç duruyorsa satır, dersteki formülden kurulur. Formül yoksa satır düşer. */
export function polishWorkedExample(text: string, context: string): string | null {
  if (
    (namesItsCalculation(text) || (bareNumericChain(text) && !bareFunctionProduct(text))) &&
    !hasSymbolicRelation(text)
  ) {
    const upgraded = upgradeNamedCalculation(text, context);
    if (upgraded !== text) return upgraded;
    if (!workedExampleNeedsFormula(text) && (namesItsCalculation(text) || finishedNumericChain(text))) {
      return text;
    }
    if (!workedExampleNeedsFormula(text)) return null;
  } else if (!workedExampleNeedsFormula(text)) {
    return text;
  }
  const formulas = formulasIn(context);
  const formula = formulas.length ? pickFormula(text, context, formulas) : null;
  if (!formula) return null;
  return (
    polishProduct(text, context, formula) ??
    polishQuotient(text, context, formula) ??
    polishDifference(text, context, formula) ??
    polishArithmetic(text, context, formula)
  );
}

function escapeReg(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function completeDanglingFormula(sentence: string, context: string): string | null {
  if (!incompleteFormulaLine(sentence)) return sentence;
  const left = sentence.match(/((?:Δ|δ)?[A-Za-z][A-Za-z0-9_]*)\s*=\s*$/);
  if (!left) return null;
  const symbol = left[1];
  const re = new RegExp(`${escapeReg(symbol)}\\s*=\\s*([^\\n.;]{1,80})`, "gi");
  let found: RegExpExecArray | null;
  while ((found = re.exec(context))) {
    const right = found[1]
      .trim()
      .replace(
        /\s+(?:formülü|formulu|formülüne|formulune|bağıntısı|bagintisi|şeklinde|seklinde|ile|olarak)\b.*/i,
        "",
      )
      .trim();
    const formula = `${symbol} = ${right}`.replace(/\s+/g, " ").trim();
    if (!right || incompleteFormulaLine(formula) || signConventionFlip(formula)) continue;
    if (new RegExp(`^${escapeReg(symbol)}\\s*=\\s*$`).test(sentence.trim())) return formula;
    const replaced = sentence.replace(new RegExp(`${escapeReg(symbol)}\\s*=\\s*$`), formula);
    if (!incompleteFormulaLine(replaced) && !signConventionFlip(replaced)) return replaced;
  }
  return null;
}

/**
 * "30 kJ ısı alıyorsa ΔU = 30 kJ olur" verileni sonuç diye tekrar eder.
 * 25 °C = 298 K ve içinde işlem olan eşitlik burada yakalanmaz.
 */
export function restatedResult(text: string): boolean {
  if (exampleIsComplete(text)) return false;
  return sentencesOf(text).some((sentence) => {
    if (!/\bolur\b/i.test(sentence) || exampleIsComplete(sentence)) return false;
    const result = sentence.match(/=\s*(\d+(?:[.,]\d+)?)\s*(?:kJ|kPa|MPa|Pa|kg|°\s*C|K|m3\/kg)/i);
    if (!result) return false;
    const value = result[1];
    const mentioned = [
      ...sentence.matchAll(/(\d+(?:[.,]\d+)?)\s*(?:kJ|kPa|MPa|Pa|kg|°\s*C|K|m3\/kg)/gi),
    ].map((match) => match[1]);
    if (!mentioned.includes(value)) return false;
    return !/\d+(?:[.,]\d+)?(?:\s*[A-Za-z°µ/%³²]+)?\s*[/×*·+\-−]\s*\d/.test(sentence);
  });
}

function examplePool(lesson: LessonV2): string {
  return `${lesson.example?.prompt ?? ""}\n${lesson.example?.solution ?? ""}`;
}

/**
 * "Örnek:" bloğu ya da hesaplanıp bulunur denilen senaryo,
 * yerine koyma ve sonuç taşımıyorsa örnek değildir.
 */
export function isIncompleteExample(text: string): boolean {
  if (!text.trim() || exampleIsComplete(text)) return false;
  const folded = foldTr(text);
  if (/\bornek\s*:/.test(folded)) return true;
  return /hesaplanarak/.test(folded) && /\d/.test(text) && /\bbulunur\b/.test(folded);
}

function expectsCalculation(text: string): boolean {
  return (
    workedExampleNeedsFormula(text) ||
    isIncompleteExample(text) ||
    workedCalculation(text) ||
    /\d+(?:[.,]\d+)?\s*[/×*·+\-−]\s*\d/.test(text)
  );
}

function workedCalculation(text: string): boolean {
  return (
    /\d+(?:[.,]\d+)?(?:\s*[A-Za-z°µ/%³²]+)?\s*[/×*·+\-−]\s*\d/.test(text) &&
    /=\s*\d/.test(text)
  );
}

/** Kaynak sabiti birimiyle duruyorsa örnekte de birimiyle durur. */
function withConstantUnits(text: string, source: string): string {
  const normalizedSource = source.replace(/\bc\s*_?\s*([A-Za-z])\b/gi, "c_$1");
  let next = text;
  const defs = normalizedSource.matchAll(
    new RegExp(
      `([A-Za-zΔδ][A-Za-z0-9_Δδ]*)\\s*=\\s*(\\d+(?:[.,]\\d+)?)\\s*(${MEASURE})\\b`,
      "gi",
    ),
  );
  for (const match of defs) {
    const symbol = match[1];
    const value = match[2].replace(",", ".");
    const unit = match[3];
    if (!new RegExp(`(?<![A-Za-zΔδ0-9_])${escapeReg(symbol)}(?![A-Za-z0-9_])`).test(next)) continue;
    if (!next.includes(value) && !next.includes(value.replace(".", ","))) continue;
    if (new RegExp(`${escapeReg(symbol)}\\s*=\\s*${value.replace(".", "[.,]")}`, "i").test(next)) continue;
    if (new RegExp(`${value.replace(".", "[.,]")}\\s*${escapeReg(unit)}`, "i").test(next)) continue;
    next = `${next.replace(/[.\s]+$/g, "")}. ${symbol} = ${value} ${unit}.`;
  }
  return next.replace(/\s+/g, " ").trim();
}

/** Özet satırı kabul ediliyorsa alt simgeleri ve kapanış noktasını da taşır. */
function acceptSummaryLine(text: string, source: string, example = ""): string | null {
  const rewritten = rewriteSignFlip(text.trim());
  if (!rewritten) return null;
  let cleaned = alignBounds(normalizeSummaryText(rewritten), source);
  if (cleaned.length < 8 || cleaned.length > 240) return null;
  if (summaryLineProblem(cleaned) || vacuousSentence(cleaned) || signConventionFlip(cleaned)) return null;
  if (cleaned.includes("|") || foldTr(cleaned).includes("bu sayfadaki formuller")) return null;
  if (/[=+×*/\-−]\s*$/.test(cleaned)) return null;
  if (contradictorySentences(cleaned, source).length || placeholderWork(cleaned)) return null;
  if (ambiguousEnergyClaim(cleaned, source) || overgeneralCorrection(cleaned, source)) return null;
  if (summaryQuantityMismatch(cleaned, example, source)) return null;
  if (isIncompleteExample(cleaned) || workedCalculation(cleaned) || workedExampleNeedsFormula(cleaned)) return null;
  if (incompleteFormulaLine(cleaned)) return null;
  if (!/[.!?]\s*$/.test(cleaned) && !/[=≤≥]/.test(cleaned)) {
    cleaned = `${cleaned}.`;
    if (cleaned.length > 240) return null;
  }
  return cleaned;
}

function alignBounds(text: string, source: string): string {
  if (!/0\s*(?:≤|<=)\s*x\s*(?:≤|<=)\s*1/.test(source)) return text;
  return text.replace(/0\s*<\s*x\s*<\s*1/g, "0 ≤ x ≤ 1");
}

function checkCount(lesson: LessonV2): number {
  return lesson.sections.filter((section) => section.check).length;
}

function readableDiagram(lesson: LessonV2): boolean {
  return lesson.sections.some(
    (section) => section.diagram && diagramIssues(section.diagram).length === 0,
  );
}

export function auditLearnerLesson(
  lesson: LessonV2,
  input: { source: string; topicLabel: string },
): LessonCheck[] {
  const issues: LessonCheck[] = [];
  const blobs = [
    lesson.overview ?? "",
    ...lesson.sections.map((section) => section.body),
    lesson.example?.prompt ?? "",
    lesson.example?.solution ?? "",
    ...(lesson.summary ?? []),
  ];
  for (const text of blobs) {
    for (const sentence of contradictorySentences(text, input.source)) {
      issues.push({ code: "source_contradiction", detail: sentence.slice(0, 160) });
    }
    for (const sentence of sentencesOf(text)) {
      if (vacuousSentence(sentence)) issues.push({ code: "vacuous", detail: sentence.slice(0, 160) });
      if (signConventionFlip(sentence) || realGasPrecisionIssue(sentence, input.source)) {
        issues.push({ code: "claim_wrong", detail: sentence.slice(0, 160) });
      }
      if (incompleteFormulaLine(sentence) || workedExampleNeedsFormula(sentence)) {
        issues.push({ code: "example_incomplete", detail: sentence.slice(0, 160) });
      }
    }
    for (const line of text.split(/\n+/)) {
      const trimmed = line.trim();
      if (trimmed.length >= 2 && trimmed.length < 8 && incompleteFormulaLine(trimmed)) {
        issues.push({ code: "example_incomplete", detail: trimmed });
      }
    }
  }
  if (/0\s*<\s*x\s*<\s*1/.test(blobs.join("\n")) && /0\s*(?:≤|<=)\s*x\s*(?:≤|<=)\s*1/.test(input.source)) {
    issues.push({ code: "bound_mismatch", detail: "0 < x < 1" });
  }
  lesson.sections.forEach((section, index) => {
    if (!section.check) return;
    if (stemLacksSubject(section.check.prompt)) {
      issues.push({ code: "stem_grammar", detail: `section:${index}` });
    }
  });
  if (checkCount(lesson) < 3) {
    issues.push({ code: "check_count", detail: String(checkCount(lesson)) });
  }
  const exampleText = examplePool(lesson);
  const sectionExample = lesson.sections.map((section) => section.body).join("\n");
  const incompleteInSection = sentencesOf(sectionExample).some((sentence) => isIncompleteExample(sentence));
  if (
    (lesson.example && expectsCalculation(exampleText) && !exampleIsComplete(exampleText)) ||
    restatedResult(exampleText) ||
    restatedResult(sectionExample) ||
    incompleteInSection ||
    placeholderWork(sectionExample) ||
    (/veri\s*:/i.test(sectionExample) && /ad[ıi]m\s*\d+/i.test(sectionExample) && !exampleIsComplete(sectionExample))
  ) {
    issues.push({ code: "example_incomplete", detail: "example" });
  }
  const claim = foldTr(lesson.commonMistake?.claim ?? "");
  const claimTexts = [
    lesson.commonMistake?.correction ?? "",
    lesson.overview ?? "",
    ...lesson.sections.map((section) => section.body),
    ...lesson.sections.map((section) => section.check?.explanation ?? ""),
    ...(lesson.summary ?? []),
  ];
  for (const text of claimTexts) {
    if (text && text === lesson.commonMistake?.correction && overgeneralCorrection(text, input.source)) {
      issues.push({ code: "claim_wrong", detail: text.slice(0, 160) });
    }
    for (const sentence of sentencesOf(text)) {
      if (claim && foldTr(sentence) === claim) continue;
      if (
        ambiguousEnergyClaim(sentence, input.source) ||
        overgeneralCorrection(sentence, input.source) ||
        signConventionFlip(sentence) ||
        realGasPrecisionIssue(sentence, input.source)
      ) {
        issues.push({ code: "claim_wrong", detail: sentence.slice(0, 160) });
      }
    }
  }
  const covered = [
    lesson.overview ?? "",
    ...lesson.sections.map((section) => `${section.heading} ${section.body}`),
    exampleText,
  ].join("\n");
  for (const concept of missingCoverage(covered, input.source, input.topicLabel)) {
    issues.push({ code: "coverage_gap", detail: concept });
  }
  const summary = lesson.summary ?? [];
  const weak = summary.filter((line) => !acceptSummaryLine(line, input.source, exampleText));
  if (weak.length || summary.length < 3 || summary.length > 5) {
    issues.push({ code: "summary_weak", detail: String(weak.length || summary.length) });
  }
  if (needsDiagram(input.topicLabel)) {
    const drawn = lesson.sections.some((section) => section.diagram);
    if (!drawn) issues.push({ code: "diagram_missing", detail: "diagram" });
    else if (!readableDiagram(lesson)) issues.push({ code: "diagram_unreadable", detail: "diagram" });
  }
  return issues;
}

function quoteHits(sentence: string, quotes: string[]): boolean {
  const folded = foldTr(sentence);
  return quotes.some((quote) => {
    const needle = foldTr(quote);
    return needle.length >= 12 && (sentence.includes(quote) || folded.includes(needle));
  });
}

function publishSentence(sentence: string, source: string, quotes: string[], context: string): string | null {
  let next = rewriteSignFlip(sentence);
  if (!next || signConventionFlip(next)) return null;
  if (incompleteFormulaLine(next)) {
    const completed = completeDanglingFormula(next, context);
    if (!completed) return null;
    const fixed = rewriteSignFlip(completed);
    if (!fixed || signConventionFlip(fixed) || incompleteFormulaLine(fixed)) return null;
    next = fixed;
  }
  if (contradictorySentences(next, source).length) return null;
  if (vacuousSentence(next)) return null;
  if (placeholderWork(next) || restatedResult(next) || isIncompleteExample(next)) return null;
  if (ambiguousEnergyClaim(next, source) || overgeneralCorrection(next, source)) return null;
  if (realGasPrecisionIssue(next, source)) return null;
  const repairedGap = repairGappedFrame(next);
  if (!repairedGap) return null;
  next = repairedGap;
  if (quoteHits(next, quotes)) return null;
  if (/veri\s*:/i.test(next) && /ad[ıi]m\s*\d+/i.test(next) && !exampleIsComplete(next)) return null;
  if (workedExampleNeedsFormula(next)) {
    const polished = polishWorkedExample(next, context);
    if (!polished || workedExampleNeedsFormula(polished)) return null;
    next = polished;
  }
  if (incompleteFormulaLine(next) || signConventionFlip(next)) return null;
  return exampleIsComplete(next) ? withConstantUnits(next, source) : next;
}

function cleanSentences(text: string, source: string, quotes: string[] = [], context = text): string {
  const parts = sentencesOf(text);
  const kept: string[] = [];
  for (let index = 0; index < parts.length; index += 1) {
    const current = parts[index] ?? "";
    const following = parts[index + 1] ?? "";
    const pair = following ? `${current} ${following}` : "";
    const currentLine = polishWorkedExample(current, context);
    if (
      pair &&
      !currentLine &&
      /\d/.test(current) &&
      /\d/.test(following) &&
      workedExampleNeedsFormula(pair) &&
      !hasSymbolicRelation(current)
    ) {
      const line = polishWorkedExample(pair, context);
      if (line && !workedExampleNeedsFormula(line)) {
        kept.push(line);
        index += 1;
        continue;
      }
    }
    const published = publishSentence(current, source, quotes, context);
    if (published) kept.push(published);
  }
  return alignBounds(retainAnchoredSentences(kept).join(" "), source).replace(/\s+/g, " ").trim();
}

function validCheck(value: unknown): SectionCheck | null {
  if (!value || typeof value !== "object") return null;
  const row = value as SectionCheck;
  if (typeof row.prompt !== "string" || row.prompt.trim().length < 12) return null;
  if (!Array.isArray(row.options) || row.options.length < 2) return null;
  if (!Number.isInteger(row.answerIndex) || row.answerIndex < 0 || row.answerIndex >= row.options.length) {
    return null;
  }
  if (typeof row.explanation !== "string" || row.explanation.trim().length < 12) return null;
  if (stemLacksSubject(row.prompt)) return null;
  const options = row.options.map((option) => String(option).trim()).filter(Boolean);
  if (new Set(options.map((option) => option.toLocaleLowerCase("tr"))).size !== options.length) return null;
  const check: SectionCheck = {
    type: row.type === "trueFalse" ? "trueFalse" : "mcq",
    prompt: row.prompt.trim(),
    options,
    answerIndex: row.answerIndex,
    explanation: row.explanation.trim(),
  };
  if (typeof row.whyRight === "string" && row.whyRight.trim()) check.whyRight = row.whyRight.trim();
  if (typeof row.whyWrong === "string" && row.whyWrong.trim()) check.whyWrong = row.whyWrong.trim();
  if (typeof row.misconception === "string" && row.misconception.trim()) {
    check.misconception = row.misconception.trim();
  }
  if (typeof row.hint === "string" && row.hint.trim()) check.hint = row.hint.trim();
  if (Array.isArray(row.optionWhy) && row.optionWhy.length === options.length) {
    const notes = row.optionWhy.map((item) => String(item).trim());
    if (notes.every((item) => item.length >= 8 && item.length <= 200)) check.optionWhy = notes;
  }
  return check;
}

function validDiagram(value: unknown): LessonDiagram | null {
  const parsed = lessonDiagramSchema.safeParse(value);
  if (!parsed.success) return null;
  if (diagramIssues(parsed.data).length) return null;
  return parsed.data;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

/** Modelin yaması yalnızca istenen alanları değiştirir. */
export function mergeLessonRepair(lesson: LessonV2, patch: unknown, source: string): LessonV2 {
  const row = asRecord(patch);
  if (!row) return lesson;
  const next: LessonV2 = {
    ...lesson,
    sections: lesson.sections.map((section) => ({ ...section })),
  };
  const sections = Array.isArray(row.sections) ? row.sections : [];
  for (const item of sections) {
    const section = asRecord(item);
    if (!section || !Number.isInteger(section.index)) continue;
    const index = section.index as number;
    const target = next.sections[index];
    if (!target) continue;
    if (typeof section.body === "string" && section.body.trim().length >= 20) {
      target.body = alignBounds(section.body.trim(), source);
    }
    const check = validCheck(section.check);
    if (check) target.check = check;
    const diagram = validDiagram(section.diagram);
    if (diagram) target.diagram = diagram;
  }
  const added = Array.isArray(row.addedSections) ? row.addedSections : [];
  for (const item of added) {
    if (next.sections.length >= 8) break;
    const section = asRecord(item);
    if (!section) continue;
    const heading = typeof section.heading === "string" ? section.heading.trim() : "";
    const body = typeof section.body === "string" ? section.body.trim() : "";
    const check = validCheck(section.check);
    if (heading.length < 2 || body.length < 20 || !check) continue;
    next.sections.push({ heading, body: alignBounds(body, source), check });
  }
  if (row.example === null) {
    delete next.example;
  } else {
    const example = asRecord(row.example);
    const prompt = typeof example?.prompt === "string" ? example.prompt.trim() : "";
    const solution = typeof example?.solution === "string" ? example.solution.trim() : "";
    if (prompt.length >= 8 && exampleIsComplete(`${prompt}\n${solution}`)) {
      next.example = { prompt, solution: alignBounds(solution, source) };
    }
  }
  const mistake = asRecord(row.commonMistake);
  if (row.commonMistake === null) {
    delete next.commonMistake;
  } else if (mistake) {
    const claim = typeof mistake.claim === "string" ? mistake.claim.trim() : next.commonMistake?.claim ?? "";
    const correction = typeof mistake.correction === "string" ? mistake.correction.trim() : "";
    if (
      claim.length >= 8 &&
      correction.length >= 8 &&
      !overgeneralCorrection(correction, source) &&
      !ambiguousEnergyClaim(correction, source)
    ) {
      next.commonMistake = { claim, correction: alignBounds(correction, source) };
    }
  }
  if (Array.isArray(row.summary)) {
    const lines = row.summary
      .filter((item): item is string => typeof item === "string")
      .map((item) => acceptSummaryLine(item, source, examplePool(next)))
      .filter((item): item is string => Boolean(item));
    if (lines.length) next.summary = lines.slice(0, 5);
  }
  const diagram = validDiagram(row.diagram);
  if (diagram && !readableDiagram(next)) {
    const host = next.sections[0];
    if (host) host.diagram = diagram;
  }
  return next;
}

function meaningKey(text: string): string {
  return foldTr(text)
    .replace(/\*/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function stemWord(word: string): string {
  return word.replace(/(lar|ler|den|dan|dir|dır|dur|dür|nin|nın|nun|nün|in|ın|un|ün|si|sı|ne|na|ye|ya)$/g, "");
}

/** Aynı cümle, biri diğerinin içindeyse ya da kökleri büyük ölçüde ortaksı özet tekrarıdır. */
function sameMeaning(leftText: string, rightText: string): boolean {
  const left = meaningKey(leftText);
  const right = meaningKey(rightText);
  if (!left || !right) return false;
  if (left === right || left.includes(right) || right.includes(left)) return true;
  const words = (text: string) => [...new Set(text.split(" ").map(stemWord).filter((word) => word.length >= 4))];
  const leftWords = words(left);
  const rightWords = words(right);
  if (leftWords.length < 3 || rightWords.length < 3) return false;
  const rightSet = new Set(rightWords);
  const overlap = leftWords.filter((word) => rightSet.has(word)).length;
  return overlap / Math.min(leftWords.length, rightWords.length) >= 0.9;
}

function rememberLine(lines: string[], line: string): void {
  if (lines.some((item) => sameMeaning(item, line))) return;
  lines.push(line);
}

function filledSummary(lesson: LessonV2, source: string): string[] {
  const summary: string[] = [];
  const example = examplePool(lesson);
  for (const line of lesson.summary ?? []) {
    const cleaned = acceptSummaryLine(line, source, example);
    if (!cleaned) continue;
    rememberLine(summary, cleaned);
    if (summary.length >= 5) break;
  }
  for (const sentence of teachingSentences(lesson, source)) {
    if (summary.length >= 5) break;
    rememberLine(summary, sentence);
  }
  return publishSummary(summary, lesson.sections.map((section) => section.body));
}

/** Kartta duran cümlenin aynısı özette kalmaz. Üçten az satır kalacaksa tekrar durur. */
function publishSummary(lines: string[], bodies: string[]): string[] {
  const novel = lines.filter((line) => !bodies.some((body) => sameMeaning(line, body)));
  const chosen = novel.length >= 3 ? novel : lines;
  return chosen.slice(0, 5);
}

function teachingSentences(lesson: LessonV2, source: string): string[] {
  const pool = [
    lesson.overview ?? "",
    ...lesson.sections.map((section) => section.body),
    ...lesson.sections.map((section) => section.check?.explanation ?? ""),
    lesson.example?.solution ?? "",
  ];
  const seen = new Set<string>();
  const out: string[] = [];
  const example = examplePool(lesson);
  for (const text of pool) {
    for (const sentence of sentencesOf(text)) {
      const cleaned = acceptSummaryLine(sentence, source, example);
      if (!cleaned) continue;
      const key = foldTr(cleaned);
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(cleaned);
      if (out.length >= 5) return out;
    }
  }
  return out;
}

/** Onarımdan sonra hâlâ bozuk olan parça düşer. Eksik soru ayrıca tamamlanır. */
export function dropUnresolvedLesson(
  lesson: LessonV2,
  source: string,
  quotes: string[] = [],
): { lesson: LessonV2; dropped: LessonCheckCode[] } {
  const dropped: LessonCheckCode[] = [];
  const next: LessonV2 = {
    ...lesson,
    sections: lesson.sections.map((section) => ({ ...section })),
  };
  const mark = (code: LessonCheckCode) => {
    if (!dropped.includes(code)) dropped.push(code);
  };
  let strippedPlaceholder = false;
  const formulaContext = [
    next.overview ?? "",
    ...next.sections.map((section) => section.body),
    next.example?.prompt ?? "",
    next.example?.solution ?? "",
  ].join("\n");
  const stripField = (text: string) => {
    const parts = sentencesOf(text);
    if (parts.some((sentence) => contradictorySentences(sentence, source).length)) {
      mark("source_contradiction");
    }
    if (parts.some((sentence) => vacuousSentence(sentence))) mark("vacuous");
    if (
      parts.some(
        (sentence) =>
          placeholderWork(sentence) ||
          restatedResult(sentence) ||
          isIncompleteExample(sentence) ||
          (/veri\s*:/i.test(sentence) && /ad[ıi]m\s*\d+/i.test(sentence)),
      )
    ) {
      strippedPlaceholder = true;
    }
    if (parts.some((sentence) => ambiguousEnergyClaim(sentence, source) || overgeneralCorrection(sentence, source) || quoteHits(sentence, quotes))) {
      mark("claim_wrong");
    }
    return cleanSentences(text, source, quotes, formulaContext);
  };
  if (next.overview) {
    const overview = stripField(next.overview);
    if (overview) next.overview = overview;
    else delete next.overview;
  }
  next.sections = next.sections.flatMap((section) => {
    const body = stripField(section.body);
    if (body.length < 20) return [];
    let check = section.check && stemLacksSubject(section.check.prompt) ? undefined : section.check;
    if (section.check && !check) mark("stem_grammar");
    if (check && quoteHits(check.explanation, quotes)) {
      const explanation = cleanSentences(check.explanation, source, quotes, formulaContext);
      mark("claim_wrong");
      if (explanation) check = { ...check, explanation };
      else check = undefined;
    }
    let diagram = section.diagram;
    if (diagram && diagramIssues(diagram).length) {
      diagram = undefined;
      mark("diagram_unreadable");
    }
    return [{ ...section, body, check, diagram }];
  });
  if (next.example) {
    const combined = `${next.example.prompt}\n${next.example.solution}`;
    let prompt = next.example.prompt;
    let solution = next.example.solution;
    if (!expectsCalculation(combined)) {
      if (restatedResult(combined) || isIncompleteExample(combined)) {
        delete next.example;
        mark("example_incomplete");
      } else {
        next.example = { prompt, solution };
      }
    } else {
      if (workedExampleNeedsFormula(combined)) {
        const lines = [prompt, solution]
          .map((part) => polishWorkedExample(part, formulaContext))
          .filter((line): line is string => {
            if (!line) return false;
            return !workedExampleNeedsFormula(line) && exampleIsComplete(line);
          });
        const unique = [...new Set(lines)];
        if (unique.length) {
          solution = unique.join(" ");
          if (workedExampleNeedsFormula(prompt)) prompt = "Verilenlerle sonuç nedir?";
        } else {
          prompt = "";
          solution = "";
        }
      }
      const exampleText = `${prompt}\n${solution}`;
      if (
        !prompt ||
        !solution ||
        !exampleIsComplete(exampleText) ||
        restatedResult(exampleText) ||
        isIncompleteExample(exampleText) ||
        workedExampleNeedsFormula(exampleText)
      ) {
        delete next.example;
        mark("example_incomplete");
      } else {
        next.example = { prompt, solution: withConstantUnits(solution, source) };
      }
    }
  } else if (strippedPlaceholder) {
    mark("example_incomplete");
  }
  if (next.commonMistake) {
    const rewritten = rewriteSignFlip(next.commonMistake.correction);
    const correction = rewritten ?? "";
    const correctionBad =
      !rewritten ||
      signConventionFlip(correction) ||
      overgeneralCorrection(correction, source) ||
      ambiguousEnergyClaim(correction, source) ||
      quoteHits(correction, quotes);
    if (correctionBad) {
      delete next.commonMistake;
      mark("claim_wrong");
    } else {
      next.commonMistake = { ...next.commonMistake, correction };
    }
  }
  if (next.summary?.length && quotes.length) {
    const kept = next.summary.filter((line) => !quoteHits(line, quotes));
    if (kept.length !== next.summary.length) mark("claim_wrong");
    if (kept.length) next.summary = kept;
    else delete next.summary;
  }
  const summary = filledSummary(next, source);
  const previous = (lesson.summary ?? []).filter((line) => acceptSummaryLine(line, source)).length;
  if (summary.length) next.summary = summary;
  else delete next.summary;
  if (summary.length < 3 && previous < 3) mark("summary_weak");
  return { lesson: next, dropped };
}

export function lessonRepairPrompt(
  lesson: LessonV2,
  issues: LessonCheck[],
  source: string,
  quotes: string[] = [],
): string {
  const codes = [...new Set(issues.map((issue) => issue.code))];
  const gaps = issues.filter((issue) => issue.code === "coverage_gap").map((issue) => issue.detail);
  return [
    "Yalnızca bozuk parçaları yeniden yaz. Dersin tamamını yazma.",
    "Kaynakta olmayan sayı, tanım ve formül uydurma. Türkçe, tam cümle.",
    "Her kontrol sorusunun kökü öznesi olan bitmiş bir cümle olsun.",
    "Kontrol sorusu üçten azsa, dersteki bağıntılardan kaynakta duran sorular ekle. Üçten az soruyla bitirme.",
    "Örnek ya tam olsun (verilen, yerine koyma, sayısal sonuç, sabitin birimi) ya da null. Her örnek bloğu için geçerli.",
    "Sayısal örnekte sıra formül, birimli yerine koyma, sonuç olsun. Formül dersin içinde yoksa örneği sil. Hesap yoksa sayısal örnek uydurma.",
    "Sağ tarafı boş formül yazma. Sol tarafı yazıp sağını boş bırakma.",
    "Aynı simgeyi bir eşitlikte hem işaretli değer hem büyüklük yapma. −(−X) ancak |X| ile yazılır.",
    "Özet 3 ile 5 bildiren cümle olsun. Her cümle nokta ile bitsin. Başlık, öğrenme hedefi, etiket zinciri, Soru:, Cevap:, ifade doğrudur, doğru cevap, seçenek, diğerleri, yanlış ve çünkü ile biten satır yazma.",
    "Bağıntının harf büyüklüğünü ve katsayısını kaynaktaki gibi koru. Kaynak söylemediği sayısal varsayımı sonuç diye yazma.",
    "Kontrol sorularının en fazla biri doğru/yanlış olsun. Diğerleri dört şıklı çoktan seçmeli olsun.",
    "Doğru/yanlış yargısının sonuna 'Bu ifade doğru mudur?' ekleme. Göstereni olmayan cümle yazma.",
    "Tek cümlelik tekrar yazma. Verileni ve işlemi aynı sayıda göster: sonuç = bağıntı = verilen − sıfır.",
    "Adım 1 / Sonucu hesapla gibi yer tutucu yazma.",
    "Özetteki sayı, örneğin ve kaynağın sayısıyla aynı olsun.",
    "Sık yapılan hatanın doğrusu kaynak cümlesiyle desteklensin. Destekleyemiyorsan commonMistake yazma.",
    "Başlıkta olup kaynakta duran her kavram bir bölümde geçsin. Kaynakta yoksa ekleme.",
    "Çizim gerekiyorsa diagram koy: en az iki etiket, en az iki şekil.",
    `Düzeltilecek kodlar: ${codes.join(", ")}.`,
    gaps.length ? `Eksik kavramlar: ${gaps.join(", ")}.` : "",
    quotes.length ? `Kaynağa uymayan cümleler: ${quotes.join(" | ")}` : "",
    `Ayrıntı: ${issues
      .map((issue) => `${issue.code}: ${issue.detail}`)
      .slice(0, 8)
      .join(" | ")}`,
    "JSON: {\"sections\":[{\"index\":0,\"body\":\"...\",\"check\":{\"type\":\"mcq\",\"prompt\":\"...\",\"options\":[\"...\"],\"answerIndex\":0,\"explanation\":\"...\"},\"diagram\":{\"caption\":\"...\",\"shapes\":[]}}],\"addedSections\":[],\"example\":{\"prompt\":\"...\",\"solution\":\"...\"},\"summary\":[\"...\"],\"diagram\":null}",
    `Kaynak:\n${source.slice(0, 6000)}`,
    `Mevcut ders:\n${JSON.stringify({
      title: lesson.title,
      overview: lesson.overview,
      sections: lesson.sections.map((section) => ({
        heading: section.heading,
        body: section.body,
        check: section.check ?? null,
      })),
      example: lesson.example ?? null,
      summary: lesson.summary ?? [],
    }).slice(0, 8000)}`,
  ]
    .filter((line) => line.trim().length > 0)
    .join("\n\n");
}

const MODEL_CODES = new Set<LessonCheckCode>([
  "source_contradiction",
  "stem_grammar",
  "example_incomplete",
  "summary_weak",
  "vacuous",
  "diagram_missing",
  "diagram_unreadable",
  "claim_wrong",
  "coverage_gap",
]);

function relationKey(text: string): string {
  return foldTr(text).replace(/[\s_]/g, "").replace(/[−–]/g, "-");
}

/** Kaynakta tanıtılıp derste durmayan bağıntının cümlesi eklenir. Sayısal örnek eklenmez. */
function coverSourceRelations(lesson: LessonV2, source: string): LessonV2 {
  let next = lesson;
  const blob = () =>
    [next.overview ?? "", ...next.sections.map((section) => section.body)].join("\n");
  let pending = missingFormulaCoverage(blob(), source).map(relationKey);
  if (!pending.length) return next;
  for (const sentence of sentencesOf(source)) {
    if (!pending.length) break;
    if (summaryLineProblem(sentence) || sentence.length < 20) continue;
    const hit = statedRelations(sentence).some((formula) => pending.includes(relationKey(formula)));
    if (!hit) continue;
    const host = next.sections[next.sections.length - 1];
    if (!host) continue;
    const combined = `${host.body} ${sentence}`.replace(/\s+/g, " ").trim();
    if (combined.length <= 2400) {
      next = {
        ...next,
        sections: next.sections.map((section, index) =>
          index === next.sections.length - 1 ? { ...section, body: combined } : section,
        ),
      };
    } else if (next.sections.length < 8) {
      next = {
        ...next,
        sections: [...next.sections, { heading: "Bağıntı", body: sentence.slice(0, 2400) }],
      };
    } else {
      continue;
    }
    const covered = new Set(statedRelations(sentence).map(relationKey));
    pending = pending.filter((key) => !covered.has(key));
  }
  return next;
}

const FORMULA_STOP = new Set([
  "ve",
  "ic",
  "ile",
  "bir",
  "bu",
  "su",
  "da",
  "de",
  "ki",
  "mi",
  "mu",
  "her",
  "ya",
  "ise",
  "veya",
  "icin",
  "olan",
  "olarak",
  "is",
  "isi",
  "gibi",
]);

function formulaToken(token: string): boolean {
  if (/[∫Δδ()[\]+\-−–×*/^₀-₉⁰-⁹0-9_]/.test(token)) return true;
  const bare = token.replace(/^[.(]+|[.,;:)]+$/g, "");
  if (!bare || FORMULA_STOP.has(foldTr(bare))) return false;
  if (/^d[A-Za-z]$/.test(bare)) return true;
  if (/[A-Z]/.test(bare.slice(1)) || /^ln$/i.test(bare)) return true;
  return bare.length <= 2 && /^[A-Za-zΔδ]+$/.test(bare);
}

/** `22,4` ve `22.4` tek sayıdır; virgül ya da nokta cümle sonu sayılmaz. */
function shieldDecimals(text: string): string {
  return text.replace(/(\d),(\d)/g, "$1\uE000$2").replace(/(\d)\.(\d)/g, "$1\uE001$2");
}

function restoreDecimals(text: string): string {
  return text.replace(/\uE000/g, ",").replace(/\uE001/g, ".");
}

export function decimalNumberKeys(text: string): string[] {
  return [...text.matchAll(/\d+(?:[.,]\d+)?/g)].map((match) => match[0].replace(",", "."));
}

/** Formüldeki her sayı kaynakta aynı basamaklarla durmuyorsa formül kesilmiştir. */
export function numbersMatchSource(text: string, source: string): boolean {
  if (!source.trim()) return true;
  const have = new Set(decimalNumberKeys(source));
  return decimalNumberKeys(text).every((number) => have.has(number));
}

function trimFormula(raw: string): string {
  let equation = shieldDecimals(raw.replace(/\s+/g, " ").trim());
  equation = equation
    .replace(/[,.;:].*$/, "")
    .replace(
      /\s+(?:formül\w*|formul\w*|ba[gğ]lant[ıi]\w*|ba[gğ]ınt[ıi]\w*|şeklinde|seklinde|yazılır|yazilir|bulunur|hesaplanır|hesaplanir|ile|olarak|eşitliği|esitligi|eşitliğe|esitlige).*$/i,
      "",
    )
    .replace(/[,\s]+$/g, "")
    .trim();
  const eq = equation.indexOf("=");
  if (eq < 0) return restoreDecimals(equation);
  const words = equation
    .slice(eq + 1)
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  while (words.length && !formulaToken(restoreDecimals(words[words.length - 1]))) words.pop();
  return restoreDecimals(`${equation.slice(0, eq).trim()} = ${words.join(" ")}`.replace(/\s+/g, " ").trim());
}

/** Sayı, birim ya da sayıya uygulanan fonksiyon bir bağıntı değildir. */
function measuredConstant(equation: string): boolean {
  const right = equation.split("=").slice(1).join("=");
  const stripped = right
    .replace(/\b(?:ln|log|exp)(?=\d|\s*\()/gi, "")
    .replace(new RegExp(MEASURE, "gi"), "")
    .replace(/[\d.,\s×*·+\-−/()≈^]/g, "");
  return stripped.length === 0;
}

function symbolicEquations(sentence: string): string[] {
  const normalized = sentence.replace(/\bc\s*_?\s*([vp])\b/gi, "c_$1");
  const start =
    /(?:(?:Δ|δ)?[A-Za-z][A-Za-z0-9_]*\s*[-−–+]\s*)?(?:Δ|δ)?[A-Za-z][A-Za-z0-9_]*\s*=\s*/g;
  const starts = [...normalized.matchAll(start)];
  const out: string[] = [];
  for (let index = 0; index < starts.length; index += 1) {
    const match = starts[index];
    const begin = match?.index ?? 0;
    const end = starts[index + 1]?.index ?? normalized.length;
    for (const piece of trimFormula(normalized.slice(begin, end)).split(/\s+ve\s+/i)) {
      const trimmed = trimFormula(piece);
      if (!trimmed || (trimmed.match(/=/g) ?? []).length !== 1) continue;
      if (/\|/.test(trimmed)) continue;
      const right = trimmed.split("=").slice(1).join("=");
      if (!/[A-Za-zΔδ∫]/.test(right) || trimmed.length < 5 || trimmed.length > 120) continue;
      if (measuredConstant(trimmed)) continue;
      out.push(trimmed);
    }
  }
  return out;
}

/** Kısa ya da birden fazla şıkkın solundaki simge soru kökü olamaz. */
export function ambiguousRelationQuestion(prompt: string, options: string[]): boolean {
  const match = prompt.match(/^(.{1,16}?)\s+(?:büyüklüğü\s+)?hangi bağıntıyla\s+hesaplanır/i);
  if (!match) return false;
  const symbol = match[1].trim();
  const letters = symbol.replace(/[^A-Za-zΔδ]/g, "");
  const short =
    letters.length <= 1 ||
    (letters.length <= 2 && !symbol.includes("Δ") && !symbol.includes("δ") && !symbol.includes("_"));
  if (!short) return false;
  const stem = foldTr(symbol).replace(/[^a-z0-9]/g, "");
  const hits = options.filter((option) => {
    const side = foldTr((option.split("=")[0] ?? "").trim()).replace(/[^a-z0-9]/g, "");
    return side.length > 0 && side === stem;
  });
  return letters.length <= 2 || hits.length > 1;
}

function tidyJoins(text: string): string {
  return text
    .replace(/\?\s*\./g, "?")
    .replace(/\.\s+\./g, ".")
    .replace(/\s+/g, " ")
    .trim();
}

/** Bildirim cümlesine yapışmış 'hangisidir' ya da baştaki virgül soru değildir. */
function stemBroken(prompt: string): boolean {
  const text = tidyJoins(prompt);
  if (/^[,.;:]/.test(text) || /(?:^|\s),\d/.test(text)) return true;
  return /(?:kullanılır|kullanilir|hesaplanır|hesaplanir|yazılır|yazilir|bulunur|denir|olur|şeklindedir|seklinde|eşittir|esittir|gösterilir|gosterilir|olarak)\s+hangisidir\??$/i.test(
    text,
  );
}

/** Kök, doğru şıkkın sağ tarafını veya onun simgelerini söylüyorsa yanıtı vermiş olur. */
function leaksAnswer(prompt: string, equation: string): boolean {
  const rhs = equation.split("=").slice(1).join("=").trim();
  if (!rhs) return false;
  const compactPrompt = foldTr(prompt).replace(/\s+/g, "");
  const compactRhs = foldTr(rhs).replace(/\s+/g, "");
  if (compactRhs.length >= 2 && compactPrompt.includes(compactRhs)) return true;
  const tokens = rhs.match(/[A-Za-zΔδ](?:[A-Za-z0-9_]|[ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ])*/g) ?? [];
  return tokens.some((token) => token.length >= 2 && foldTr(prompt).includes(foldTr(token)));
}

function conceptQuestion(sentence: string, equation: string): string | null {
  if (!sentence.trim() || !equation.includes("=")) return null;
  const flexible = equation
    .split("=")
    .map((part) => escapeReg(part.trim()))
    .join("\\s*=\\s*");
  let rest = sentence
    .replace(new RegExp(flexible, "i"), " ")
    .replace(
      /(?:^|\s)(şeklindedir|şeklinde yazılır|olarak yazılır|ile verilir|ile bulunur|eşitliğiyle yazılır|eşitliği geçerlidir|bağıntısıyla yazılır|bağıntısıyla hesaplanır|bağıntısıyla bulunur)[.!]*/gi,
      " ",
    )
    .replace(/[.:;]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (rest.length < 8 || leaksAnswer(rest, equation)) return null;
  rest = rest
    .replace(/\s+için\s+(?:formülü|formül|bağıntısı|eşitliği)\s+(?:kullanılır|yazılır|hesaplanır|bulunur)\.?$/i, "")
    .replace(/\s+(?:şöyle\s+)?olarak\s+hesaplan\w*/gi, "")
    .replace(/hesaplamak$/i, "hesaplayan bağıntı")
    .replace(/[,\s]+$/g, "")
    .trim();
  if (rest.length < 8 || leaksAnswer(rest, equation) || /^[,.;:]/.test(rest)) return null;
  if (/\?$/.test(rest)) return stemBroken(rest) ? null : rest.slice(0, 300);
  if (!/bağıntı|eşitlik|formül|ifade/i.test(rest)) return null;
  const question = `${rest} hangisidir?`.replace(/\s+/g, " ");
  if (stemBroken(question) || leaksAnswer(question, equation)) return null;
  return question.slice(0, 300);
}

function wordsBeforeEquation(sentence: string, equation: string): string {
  if (!sentence.trim() || !equation.includes("=")) return "";
  const flexible = equation
    .split("=")
    .map((part) => escapeReg(part.trim()))
    .join("\\s*=\\s*");
  const match = sentence.match(new RegExp(`([\\s\\S]{0,120})${flexible}`, "i"));
  if (!match) return "";
  const cleaned = match[1]
    .replace(
      /(?:^|\s)(şeklindedir|şeklinde yazılır|olarak yazılır|ile verilir|ile bulunur|eşitliğiyle yazılır|eşitliği geçerlidir|bağıntısıyla yazılır|bağıntısıyla hesaplanır|bağıntısıyla bulunur)[.!]*/gi,
      " ",
    )
    .replace(/[.:;=]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (/^[,.]/.test(cleaned) || /,\d/.test(cleaned)) return "";
  return cleaned.split(" ").filter((word) => word.length >= 2).slice(-3).join(" ");
}

function promptForEquation(equation: string, sentence = ""): string | null {
  const left = formulaLhs(equation);
  if (!left) return null;
  const lead = wordsBeforeEquation(sentence, equation);
  const flavored =
    lead.length >= 8 && !leaksAnswer(`${lead} ${left}`, equation)
      ? `${lead} ${left} için doğru bağıntı hangisidir?`
      : null;
  const candidates = [conceptQuestion(sentence, equation), flavored, `${left} için doğru bağıntı hangisidir?`];
  for (const prompt of candidates) {
    if (!prompt || stemBroken(prompt) || leaksAnswer(prompt, equation) || /hangi bağıntıyla/i.test(prompt)) continue;
    if (ambiguousRelationQuestion(prompt, []) || stemLacksSubject(prompt)) continue;
    return prompt.slice(0, 300);
  }
  return null;
}

function equationPrompt(equation: string, sentence = ""): string | null {
  return promptForEquation(equation, sentence);
}

function symbolPiece(text: string): boolean {
  return /^(?:Δ|δ)?[A-Za-z](?:_[A-Za-z0-9]+|[₀-₉¹²³ᵤᵣₐₑₕᵢⱼₖₗₘₙₒₚₛₜᵥₓ])?$/.test(text.trim());
}

function mutateEquation(equation: string): string[] {
  const lhs = formulaLhs(equation);
  const rhs = equation.split("=").slice(1).join("=").trim();
  if (!lhs || !rhs) return [];
  const alts: string[] = [];
  const push = (next: string) => {
    const cleaned = next.replace(/\s+/g, " ").trim();
    if (!cleaned || foldTr(cleaned) === foldTr(rhs)) return;
    if (alts.some((item) => foldTr(item) === foldTr(cleaned))) return;
    alts.push(cleaned);
  };
  const full: string[] = [];
  const add = (next: string) => {
    const cleaned = next.replace(/\s+/g, " ").trim();
    if (!cleaned || foldTr(cleaned) === foldTr(equation)) return;
    if (full.some((item) => foldTr(item) === foldTr(cleaned))) return;
    full.push(cleaned);
  };
  if (/[−-]/.test(rhs) && !/^[−-]\s*\(/.test(rhs)) push(rhs.replace(/[−-]/, "+"));
  if (/\+/.test(rhs)) push(rhs.replace("+", "−"));
  if (rhs.includes("/")) {
    const [left, right] = rhs.split("/").map((part) => part.trim());
    push([right, left].filter(Boolean).join("/"));
    push(rhs.replace("/", "×"));
    push(rhs.replace("/", "−"));
    if (left && right && symbolPiece(left) && symbolPiece(right)) {
      add(`${left} = ${lhs} × ${right}`);
      add(`${right} = ${left} / ${lhs}`);
    }
  }
  const factors = rhs.split(/\s*[×·*]\s*/).map((item) => item.trim()).filter(Boolean);
  if (factors.length >= 2) {
    push([...factors].reverse().join(" × "));
    if (factors.every(symbolPiece)) {
      for (const factor of factors) add(`${lhs} = ${factor}`);
      add(`${factors[0]} = ${lhs} / ${factors[1]}`);
      add(`${factors[1]} = ${lhs} / ${factors[0]}`);
    }
  }
  const tokens = rhs.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    push(`${tokens[tokens.length - 1]} ${tokens.slice(0, -1).join(" ")}`);
    push([...tokens].reverse().join(" "));
  }
  return [...alts.map((item) => `${lhs} = ${item}`.replace(/\s+/g, " ").trim()), ...full];
}

function closeOption(option: string): string {
  let next = option.trim();
  while ((next.match(/\(/g) ?? []).length > (next.match(/\)/g) ?? []).length) {
    const cut = next.lastIndexOf("(");
    if (cut < 0) break;
    next = next.slice(0, cut).trim();
  }
  return next;
}

function optionIdentity(option: string): string {
  const closed = closeOption(option)
    .replace(/\s*\((?![^)]*[0-9₀-₉+\-−×*/=])[^)]{1,40}\)?/g, " ");
  const folded = foldTr(closed).replace(/[−–]/g, "-");
  const eq = folded.indexOf("=");
  if (eq < 0) return folded.replace(/[^a-z0-9-]/g, "");
  const lhs = folded.slice(0, eq).replace(/[^a-z0-9-]/g, "");
  const rhs = folded.slice(eq + 1);
  const factors = rhs
    .split(/\s*[×·*]\s*/)
    .map((item) => item.replace(/[^a-z0-9-]/g, ""))
    .filter(Boolean);
  const product = factors.length >= 2 && !/[+\-/()]/.test(rhs);
  const body = product ? [...factors].sort().join("×") : rhs.replace(/[^a-z0-9-]/g, "");
  return `${lhs}=${body}`;
}

function artificialSignWrap(option: string): boolean {
  const rhs = option.split("=").slice(1).join("=").trim();
  return /^[−-]\s*\(/.test(rhs);
}

function uniqueOptions(options: string[], extras: string[], source = ""): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (option: string) => {
    const cleaned = closeOption(option);
    const key = optionIdentity(cleaned);
    const openCount = (cleaned.match(/\(/g) ?? []).length;
    const closeCount = (cleaned.match(/\)/g) ?? []).length;
    if (!cleaned || !key || seen.has(key) || openCount !== closeCount || /[/×*·+\-−]\s*$/.test(cleaned)) return;
    if (artificialSignWrap(cleaned)) return;
    if (source && !numbersMatchSource(cleaned, source)) return;
    seen.add(key);
    out.push(cleaned);
  };
  for (const option of options) push(option);
  for (const extra of extras) {
    if (out.length >= 4) break;
    push(extra);
  }
  return out.slice(0, 4);
}

function optionsForEquation(equation: string, equations: { equation: string }[], source = ""): string[] {
  const others = equations
    .map((row) => row.equation)
    .filter((item) => foldTr(item.replace(/\s+/g, "")) !== foldTr(equation.replace(/\s+/g, "")));
  return uniqueOptions([equation], [...others, ...mutateEquation(equation)], source);
}

function isBinaryCheck(check: SectionCheck): boolean {
  if (check.type === "trueFalse") return true;
  const options = check.options.map((option) => option.trim().toLocaleLowerCase("tr"));
  if (options.length <= 2 && options.includes("doğru") && options.includes("yanlış")) return true;
  return options.length <= 2 && /\bm[ıi]d[ıi]r\s*\??$/i.test(check.prompt.trim());
}

function equationCheck(
  item: { equation: string; sentence: string },
  equations: { equation: string }[],
  source = "",
): SectionCheck | null {
  const prompt = equationPrompt(item.equation, item.sentence);
  if (!prompt || prompt.length < 12 || stemLacksSubject(prompt) || stemBroken(prompt)) return null;
  if (ambiguousRelationQuestion(prompt, [])) return null;
  const options = [...optionsForEquation(item.equation, equations, source)];
  if (options.length < 4 || ambiguousRelationQuestion(prompt, options)) return null;
  if (!options.some((option) => optionIdentity(option) === optionIdentity(item.equation))) return null;
  const explanation =
    item.sentence.length >= 12 ? item.sentence.slice(0, 580) : `${item.equation} dersin anlatımında verilir.`;
  return validCheck({
    type: "mcq",
    prompt,
    options,
    answerIndex: 0,
    explanation,
  });
}

/**
 * Model üçüncü soruyu yazmadıysa dersin kendi cümlelerinden kurulur.
 * Yeni bir model çağrısı yok. Çeldirici, dersteki başka bağıntı ya da aynı bağıntının değişimidir.
 */
export function ensureThreeChecks(lesson: LessonV2, source = ""): LessonV2 {
  const next: LessonV2 = {
    ...lesson,
    sections: lesson.sections.map((section) => ({ ...section })),
  };
  const used = new Set(
    next.sections.map((section) => foldTr(section.check?.prompt ?? "")).filter(Boolean),
  );
  const pool = [next.overview ?? "", ...next.sections.map((section) => section.body)];
  const equations: { equation: string; sentence: string }[] = [];
  const seenEq = new Set<string>();
  const statements: string[] = [];
  for (const text of pool) {
    for (const sentence of sentencesOf(text)) {
      if (isIncompleteExample(sentence) || vacuousSentence(sentence)) continue;
      if (
        sentence.length >= 24 &&
        sentence.length <= 220 &&
        !summaryLineProblem(sentence) &&
        concreteStatement(sentence)
      ) {
        statements.push(sentence.replace(/\s+/g, " ").trim());
      }
      for (const equation of symbolicEquations(sentence)) {
        const key = foldTr(equation).replace(/\s+/g, "");
        if (seenEq.has(key)) continue;
        seenEq.add(key);
        equations.push({ equation, sentence });
      }
    }
  }
  const queue: SectionCheck[] = [];
  const needed = () => checkCount(next) + queue.length < 3;
  for (const item of equations) {
    if (!needed()) break;
    const check = equationCheck(item, equations, source);
    if (!check || used.has(foldTr(check.prompt))) continue;
    used.add(foldTr(check.prompt));
    queue.push(check);
  }
  for (const sentence of statements) {
    if (!needed()) break;
    if (
      danglingOpener(sentence) ||
      clippedContrastDefinition(sentence) ||
      announcesIncompleteExample(sentence)
    ) {
      continue;
    }
    const check = validCheck(conceptCheck(sentence));
    if (!check || used.has(foldTr(check.prompt)) || stemLacksSubject(check.prompt)) continue;
    used.add(foldTr(check.prompt));
    queue.push(check);
  }
  for (const section of next.sections) {
    if (!queue.length) break;
    if (section.check) continue;
    section.check = queue.shift();
  }
  while (queue.length && checkCount(next) < 3 && next.sections.length < 8) {
    const check = queue.shift();
    if (!check) break;
    const body = check.explanation.length >= 20 ? check.explanation : `${check.explanation} Bu bağıntı dersin anlatımındadır.`;
    const heading = addedHeading(check.prompt, next.title);
    next.sections.push({
      heading: heading.length >= 2 ? heading : "Bağıntı",
      body: body.slice(0, 2400),
      check,
    });
  }
  const spare: SectionCheck[] = [];
  for (const item of equations) {
    const check = equationCheck(item, equations, source);
    if (!check || used.has(foldTr(check.prompt))) continue;
    if (spare.some((row) => foldTr(row.prompt) === foldTr(check.prompt))) continue;
    spare.push(check);
  }
  let keptBinary = 0;
  for (const section of next.sections) {
    if (!section.check || !isBinaryCheck(section.check)) continue;
    if (keptBinary < 1) {
      keptBinary += 1;
      continue;
    }
    const replacement = spare.shift();
    if (!replacement) break;
    used.add(foldTr(replacement.prompt));
    section.check = replacement;
  }
  return next;
}

function alignedTopicTitle(title: string, topicLabel: string): string {
  const wanted = topicLabel.trim();
  if (wanted.length >= 3) return wanted;
  return title || wanted;
}

/** "Bu formüller…" gibi göstereni olmayan evet/hayır kökü soru değildir. */
function vagueYesNo(prompt: string): boolean {
  const folded = foldTr(prompt);
  if (!/(dogru mudur|dogru mu)/.test(folded)) return false;
  return /^(bu formuller|bu ifade|bu yontem|bu baginti)/.test(folded);
}

function concreteStatement(sentence: string): boolean {
  const folded = foldTr(sentence);
  return !/^(bu formuller|bu ifade|bu yontem|bu baginti)/.test(folded);
}

function headingIsCut(heading: string): boolean {
  const folded = foldTr(heading).replace(/[^a-z ]/g, " ").replace(/\s+/g, " ").trim();
  const last = folded.split(" ").pop() ?? "";
  if (/^(ve|ile|icin|olan|olarak|gore|kadar|turune|turu)$/.test(last)) return true;
  return /^(bu formuller|bu ifade|bu yontem)\b/.test(folded) && folded.split(" ").length <= 6;
}

function addedHeading(prompt: string, title: string): string {
  const cleaned = prompt.replace(/[?]/g, "").replace(/\s+/g, " ").trim();
  if (
    cleaned &&
    !headingIsCut(cleaned) &&
    cleaned.split(/\s+/).length <= 6 &&
    !/^(bu|şu)\b/i.test(cleaned)
  ) {
    return cleaned.slice(0, 80);
  }
  return title.trim() || "Bağıntı";
}

function finishHeading(heading: string, topicLabel: string, discardedTitle = ""): string {
  const trimmed = heading.replace(/\s+/g, " ").trim();
  if (!trimmed) return topicLabel.trim() || trimmed;
  if (headingIsCut(trimmed)) return topicLabel.trim() || trimmed;
  if (
    discardedTitle &&
    foldTr(trimmed) === foldTr(discardedTitle) &&
    foldTr(trimmed) !== foldTr(topicLabel)
  ) {
    return topicLabel.trim() || trimmed;
  }
  return trimmed;
}

/** Formüldeki sayı kaynakta aynı basamaklarla yoksa cümle kesilmiş bir bağıntı taşır. */
function missesSourceEquation(sentence: string, source: string): boolean {
  if (!source.trim()) return false;
  const equations = sentencesOf(sentence).flatMap((item) => symbolicEquations(item));
  if (!equations.length) return false;
  return equations.some((equation) => !numbersMatchSource(equation, source));
}

/**
 * Numaralı notta başka bölümün sayısı ya da uzun sözcüğü bu cümlede duruyorsa
 * cümle tıklanan konunun değildir.
 */
function mentionsOtherSection(sentence: string, source: string, topicLabel: string): boolean {
  const topic = sliceNumberedSection(source, topicLabel);
  if (topic.length >= source.trim().length - 20) return false;
  const topicNumbers = new Set(decimalNumberKeys(topic));
  if (decimalNumberKeys(sentence).some((number) => !topicNumbers.has(number))) return true;
  const topicFold = foldTr(topic);
  const foreign = new Set<string>();
  for (const match of source.matchAll(/[A-Za-zÇĞİÖŞÜçğıöşü]{7,}/g)) {
    const key = foldTr(match[0]);
    if (key.length >= 7 && !topicFold.includes(key)) foreign.add(key);
  }
  for (const match of sentence.matchAll(/[A-Za-zÇĞİÖŞÜçğıöşü]{7,}/g)) {
    if (foreign.has(foldTr(match[0]))) return true;
  }
  return false;
}

function sourceSpellings(source: string): Map<string, string> {
  const found = new Map<string, string>();
  const blocked = new Set<string>();
  for (const match of source.matchAll(/[A-Za-zÇĞİÖŞÜçğıöşü]{5,}/g)) {
    const word = match[0];
    const key = foldTr(word);
    if (blocked.has(key)) continue;
    const existing = found.get(key);
    if (!existing) {
      found.set(key, word);
      continue;
    }
    if (existing.toLocaleLowerCase("tr") !== word.toLocaleLowerCase("tr")) {
      found.delete(key);
      blocked.add(key);
    }
  }
  return found;
}

function hamming(left: string, right: string): number {
  if (left.length !== right.length) return 99;
  let distance = 0;
  for (let index = 0; index < left.length; index += 1) {
    if (left[index] !== right[index]) distance += 1;
  }
  return distance;
}

function applyWordCase(sourceWord: string, original: string): string {
  const first = original.charAt(0);
  if (first !== first.toLocaleLowerCase("tr")) {
    return sourceWord.charAt(0).toLocaleUpperCase("tr") + sourceWord.slice(1);
  }
  return sourceWord;
}

/** Kaynak sözcüğünden bir harf sapmış üretimi, kaynağın yazımına çeker. */
function correctSpellings(text: string, source: string): string {
  const dict = sourceSpellings(source);
  const keys = [...dict.keys()];
  return text.replace(/[A-Za-zÇĞİÖŞÜçğıöşü]{5,}/g, (word) => {
    const key = foldTr(word);
    const exact = dict.get(key);
    if (exact) {
      if (word.toLocaleLowerCase("tr") === exact.toLocaleLowerCase("tr")) return word;
      return applyWordCase(exact, word);
    }
    const hits = keys.filter((item) => hamming(item, key) === 1);
    if (hits.length !== 1) return word;
    const surface = dict.get(hits[0]);
    return surface ? applyWordCase(surface, word) : word;
  });
}

function keepTopicSentence(sentence: string, source: string, topicLabel: string): string | null {
  const gapped = repairGappedFrame(restoreMathNotation(sentence));
  if (!gapped) return null;
  const topicSource = sliceNumberedSection(source, topicLabel);
  if (missesSourceEquation(gapped, topicSource) || mentionsOtherSection(gapped, source, topicLabel)) return null;
  if (realGasPrecisionIssue(gapped, topicSource) || foreignToTopic(gapped, source, topicLabel)) return null;
  const plain = gapped.replace(/\*\*/g, "").trim();
  if (ambiguousRelationQuestion(plain, [])) return null;
  const folded = foldTr(plain);
  if (/^(bu formuller|bu yontem|bu ifade)\b/.test(folded) && !/=/.test(plain)) return null;
  return gapped;
}

function cleanTopicText(text: string, source: string, topicLabel: string): string {
  const topicSource = sliceNumberedSection(source, topicLabel);
  const parts = text
    .split(/\n+|(?<=[.!?])\s+(?=[A-ZÇĞİÖŞÜ“"])/)
    .map((part) => part.trim())
    .filter(Boolean);
  const kept = parts
    .map((part) => (part.length < 8 ? restoreMathNotation(part) : keepTopicSentence(part, source, topicLabel)))
    .filter((part): part is string => Boolean(part));
  return correctSpellings(
    alignSymbolSubscripts(separateRunOnFormulas(kept.join(" ").replace(/\s+/g, " ").trim()), topicSource),
    topicSource,
  );
}

function repairPublishedCheck(check: SectionCheck, corpus: string, source: string): SectionCheck | undefined {
  const open = (option: string) => (option.match(/\(/g) ?? []).length > (option.match(/\)/g) ?? []).length;
  const identities = check.options.map((option) => optionIdentity(option));
  const equationOptions = check.options.some((option) => /=/.test(option));
  const broken =
    check.options.some(open) ||
    new Set(identities).size !== identities.length ||
    check.options.some((option) => artificialSignWrap(option)) ||
    (source.trim().length > 0 &&
      check.options.some((option) => /=/.test(option) && !numbersMatchSource(option, source))) ||
    (equationOptions && check.options.length < 4) ||
    stemBroken(check.prompt);
  let next = check;
  if (broken) {
    const equations = [...new Set(sentencesOf(corpus).flatMap((sentence) => symbolicEquations(sentence)))].map(
      (equation) => alignSymbolSubscripts(equation, source),
    );
    const correct = check.options[check.answerIndex] ?? "";
    const extras = [
      ...equations,
      ...equations.flatMap((equation) => mutateEquation(equation)),
      ...(/=/.test(correct) ? mutateEquation(correct) : []),
    ];
    const options = uniqueOptions(check.options, extras, source);
    if (options.length < 2) return undefined;
    if (equationOptions && options.length < 4) return undefined;
    const answerIndex = Math.max(
      0,
      options.findIndex((item) => optionIdentity(item) === optionIdentity(correct)),
    );
    if (equationOptions && optionIdentity(options[answerIndex] ?? "") !== optionIdentity(correct)) return undefined;
    next = { ...check, options, answerIndex };
  }
  const correct = next.options[next.answerIndex] ?? "";
  if ((/=/.test(correct) && leaksAnswer(next.prompt, correct)) || stemBroken(next.prompt)) {
    const compact = foldTr(correct).replace(/\s+/g, "");
    const sentence =
      sentencesOf(corpus).find((item) => foldTr(item).replace(/\s+/g, "").includes(compact)) ?? "";
    const prompt = /=/.test(correct) ? promptForEquation(correct, sentence) : null;
    if (!prompt) return undefined;
    next = { ...next, prompt };
  }
  next = {
    ...next,
    prompt: correctSpellings(tidyJoins(next.prompt), source),
    explanation: correctSpellings(next.explanation, source),
    options: next.options.map((option) => correctSpellings(option, source)),
  };
  if (
    ambiguousRelationQuestion(next.prompt, next.options) ||
    /hangi bağıntıyla/i.test(next.prompt) ||
    stemBroken(next.prompt)
  ) {
    return undefined;
  }
  if (next.type !== "trueFalse" && next.options.some((option) => /=/.test(option)) && next.options.length < 4) {
    return undefined;
  }
  return next;
}

function checkLeavesTopic(check: SectionCheck, source: string, topicLabel: string): boolean {
  if (ambiguousRelationQuestion(check.prompt, check.options)) return true;
  const blob = [check.prompt, check.explanation, ...check.options].join(" ");
  const prose = `${check.prompt} ${check.explanation}`;
  return foreignToTopic(blob, source, topicLabel) || realGasPrecisionIssue(prose, source);
}

const SYMBOL = "(?:Δ|δ)?[A-Za-z](?:[A-Za-z0-9_]|[₀-₉¹²³ᵤᵣₐₑₕᵢⱼₖₗₘₙₒₚₛₜᵥₓ])*";

function sourceAssignments(source: string): Map<string, { raw: string; unit: string; value: number }> {
  const found = new Map<string, { raw: string; unit: string; value: number }>();
  const re = new RegExp(`(${SYMBOL})\\s*=\\s*(\\d+(?:[.,]\\d+)?)\\s*(${MEASURE})?`, "gi");
  for (const match of source.matchAll(re)) {
    found.set(match[1], { raw: match[2], unit: match[3] ?? "", value: readNumber(match[2]) });
  }
  return found;
}

function statedResult(source: string): { raw: string; unit: string; value: number } | null {
  const match = source.match(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${MEASURE})\\s+(?:olur|eder|bulunur)`, "i"));
  if (!match) return null;
  return { raw: match[1], unit: match[2], value: readNumber(match[1]) };
}

/** Kaynak değeri ve sonucu yazıyorsa, dersteki formüle o değerler konur. */
function withBoundaryExample(lesson: LessonV2, source: string): LessonV2 {
  const existing = `${lesson.example?.prompt ?? ""}\n${lesson.example?.solution ?? ""}`;
  if (lesson.example && (exampleIsComplete(existing) || !expectsCalculation(existing))) return lesson;
  const blob = [lesson.overview ?? "", ...lesson.sections.map((section) => section.body)].join("\n");
  const values = sourceAssignments(source);
  const result = statedResult(source);
  if (!result || !values.size) return lesson;
  const symbol = `(${SYMBOL})`;
  for (const formula of formulasIn(blob)) {
    const rhs = formula.split("=").slice(1).join("=").trim();
    const product = rhs.match(new RegExp(`^${symbol}\\(${symbol}\\s*[−–-]\\s*${symbol}\\)$`));
    const quotient = rhs.match(new RegExp(`^${symbol}\\s*/\\s*${symbol}$`));
    const difference = rhs.match(new RegExp(`^${symbol}\\s*[−–-]\\s*${symbol}$`));
    let solution = "";
    if (product) {
      const factor = values.get(product[1]);
      const left = values.get(product[2]);
      const right = values.get(product[3]);
      if (!factor || !left || !right) continue;
      if (!nearly(factor.value * (left.value - right.value), result.value, 0.051)) continue;
      solution = `${formula} = ${factor.raw} ${factor.unit} × (${left.raw} − ${right.raw}) ${left.unit} = ${result.raw} ${result.unit}`.replace(/\s+/g, " ");
    } else if (quotient) {
      const left = values.get(quotient[1]);
      const right = values.get(quotient[2]);
      if (!left || !right || right.value === 0) continue;
      if (!nearly(left.value / right.value, result.value, 0.051)) continue;
      solution = `${formula} = ${left.raw} ${left.unit} / ${right.raw} ${right.unit} = ${result.raw} ${result.unit}`.replace(/\s+/g, " ");
    } else if (difference) {
      const left = values.get(difference[1]);
      const right = values.get(difference[2]);
      if (!left || !right) continue;
      if (!nearly(left.value - right.value, result.value, 0.051)) continue;
      solution = `${formula} = ${left.raw} ${left.unit} − ${right.raw} ${right.unit} = ${result.raw} ${result.unit}`.replace(/\s+/g, " ");
    }
    if (!solution || !exampleIsComplete(solution)) continue;
    return {
      ...lesson,
      example: {
        prompt: "Kaynaktaki verilenlerle sonuç nedir?",
        solution,
      },
    };
  }
  return lesson;
}

/**
 * Ders, tıklanan konunun kendi sayfalarında kalır.
 * Başlık uymuyorsa istenen ad gelir. Kapsam dışı cümle ve soru düşer.
 * Yeni bir model çağrısı yok.
 */
function withInfoFormula(lesson: LessonV2, source: string): LessonV2 {
  const info = lesson.infoCheck;
  if (!info?.answer.trim() || /=/.test(info.answer)) return lesson;
  const equations = [...new Set(sentencesOf(source).flatMap((sentence) => symbolicEquations(sentence)))];
  if (!equations.length) return lesson;
  const blob = `${info.prompt} ${info.answer}`;
  const named = equations.find((equation) => {
    const left = formulaLhs(equation);
    if (!left) return false;
    return new RegExp(`(?<![A-Za-zΔδ0-9_])${escapeReg(left)}(?![A-Za-z0-9_])`).test(blob);
  });
  const hit = named ?? (equations.length === 1 ? equations[0] : "");
  if (!hit) return lesson;
  const compact = foldTr(hit).replace(/\s+/g, "");
  if (foldTr(info.answer).replace(/\s+/g, "").includes(compact)) return lesson;
  const answer = `${info.answer.replace(/[.]+$/g, "").trim()}: ${hit}.`.replace(/\s+/g, " ").slice(0, 400);
  return { ...lesson, infoCheck: { ...info, answer } };
}

export function scopeLessonToTopic(lesson: LessonV2, source: string, topicLabel: string): LessonV2 {
  const topicSource = sliceNumberedSection(source, topicLabel);
  const clean = (text: string) => cleanTopicText(text, source, topicLabel);
  const next: LessonV2 = {
    ...lesson,
    title: alignedTopicTitle(lesson.title, topicLabel),
    sections: [],
  };
  delete next.overview;
  delete next.summary;
  delete next.example;
  delete next.commonMistake;
  if (lesson.overview) {
    const overview = clean(lesson.overview);
    if (overview) next.overview = overview;
  }
  next.sections = lesson.sections.flatMap((section) => {
    const body = polishCalculations(clean(section.body), source);
    const heading = alignSymbolSubscripts(
      finishHeading(restoreMathNotation(section.heading), topicLabel, lesson.title),
      source,
    );
    if (body.length < 20) return [];
    if (offTopicSection(heading, body, source, topicLabel)) return [];
    let check = section.check;
    if (check && !vagueYesNo(check.prompt)) {
      const corpus = [topicSource, body, check.explanation, check.prompt].join("\n");
      check = repairPublishedCheck(
        {
          ...check,
          prompt: alignSymbolSubscripts(restoreMathNotation(check.prompt), topicSource),
          explanation: alignSymbolSubscripts(restoreMathNotation(check.explanation), topicSource),
          options: check.options.map((option) => alignSymbolSubscripts(restoreMathNotation(option), topicSource)),
        },
        corpus,
        topicSource,
      );
    } else if (check && vagueYesNo(check.prompt)) {
      check = undefined;
    }
    if (check && checkLeavesTopic(check, source, topicLabel)) check = undefined;
    return [{
      ...section,
      heading,
      body,
      check,
    }];
  });
  if (lesson.commonMistake) {
    const correction = clean(lesson.commonMistake.correction);
    if (correction && !foreignToTopic(correction, source, topicLabel) && !realGasPrecisionIssue(correction, topicSource)) {
      next.commonMistake = {
        claim: restoreMathNotation(lesson.commonMistake.claim),
        correction,
      };
    }
  }
  if (lesson.summary?.length) {
    const summary: string[] = [];
    for (const line of lesson.summary) {
      const cleaned = clean(line);
      if (cleaned.length < 8 || summaryLineProblem(cleaned)) continue;
      rememberLine(summary, cleaned);
    }
    if (summary.length) {
      next.summary = publishSummary(summary, next.sections.map((section) => section.body));
    }
  }
  if (lesson.example) {
    const prompt = correctSpellings(alignSymbolSubscripts(restoreMathNotation(lesson.example.prompt), topicSource), topicSource);
    const solution = correctSpellings(alignSymbolSubscripts(restoreMathNotation(lesson.example.solution), topicSource), topicSource);
    const blob = `${prompt}\n${solution}`;
    if (prompt && solution && !foreignToTopic(blob, source, topicLabel) && !realGasPrecisionIssue(blob, source)) {
      if (!expectsCalculation(blob)) {
        if (!restatedResult(blob) && !isIncompleteExample(blob)) {
          next.example = { prompt: tidyJoins(prompt), solution };
        }
      } else {
        next.example = { prompt, solution };
      }
    }
  }
  return withInfoFormula(withCalculatedExample(withBoundaryExample(next, topicSource), topicSource), topicSource);
}

const GIVEN_SYMBOL = `(?<![A-Za-zΔδ0-9_])(${SYMBOL})`;

function askedLhs(solution: string): string {
  const match = solution.match(new RegExp(`^\\s*(${SYMBOL})\\s*=`));
  return match?.[1] ?? "";
}

function formulaClause(solution: string): string {
  const parts = solution.split("=").map((part) => part.trim());
  if (parts.length < 3 || /\d/.test(parts[1] ?? "")) return "";
  return `${parts[0]} = ${parts[1]}`;
}

function numberUsed(solution: string, raw: string): boolean {
  const value = readNumber(raw);
  return [...solution.matchAll(/\d+(?:[.,]\d+)?/g)].some((match) => nearly(readNumber(match[0]), value, 1e-6));
}

function isResultGiven(raw: string, unit: string, solution: string): boolean {
  const marks = [...solution.matchAll(new RegExp(`(?:≈|=)\\s*(\\d+(?:[.,]\\d+)?)\\s*(${MEASURE})?`, "gi"))];
  const last = marks[marks.length - 1];
  if (!last || !nearly(readNumber(last[1]), readNumber(raw), 1e-6)) return false;
  if (!unit || !last[2]) return true;
  return foldTr(unit) === foldTr(last[2]);
}

const NOUN_STOP = new Set([
  "ve",
  "ile",
  "icin",
  "olarak",
  "kadar",
  "ise",
  "olan",
  "bir",
  "bu",
  "kac",
  "nedir",
  "olur",
  "denir",
  "gore",
  "hangi",
  "sonuc",
  "mol",
  "gram",
]);

function loneSymbol(text: string): string | null {
  const trimmed = text.trim();
  if (/^(?:Δ|δ)?[A-Za-z](?:_[A-Za-z0-9]+|[₀-₉¹²³ᵤᵣₐₑₕᵢⱼₖₗₘₙₒₚₛₜᵥₓ])?$/.test(trimmed)) return trimmed;
  return null;
}

function splitFormulaFactors(text: string, op: "/" | "×"): string[] {
  const re = op === "/" ? /\s+\/\s+/ : /\s+[×*·]\s+/;
  return text.split(re).map((part) => part.trim()).filter(Boolean);
}

/** Formülün sağındaki simge, yerine koymadaki aynı sıradaki miktarla eşlenir. */
function pairedGivens(solution: string): { symbol: string; raw: string; unit: string }[] {
  const parts = solution.split("=").map((part) => part.trim());
  if (parts.length < 3 || /\d/.test(parts[1] ?? "")) return [];
  const formulaRhs = parts[1];
  const valueRhs = parts[2].replace(/[.;]+$/g, "").trim();
  const amount = `(\\d+(?:[.,]\\d+)?)\\s*(${MEASURE})`;
  const op = /\s+\/\s+/.test(formulaRhs) ? "/" : /\s+[×*·]\s+/.test(formulaRhs) ? "×" : "";
  if (!op) {
    const symbol = loneSymbol(formulaRhs);
    const match = valueRhs.match(new RegExp(`^${amount}$`, "i"));
    if (!symbol || !match) return [];
    return [{ symbol, raw: match[1], unit: match[2] }];
  }
  const symbols = splitFormulaFactors(formulaRhs, op);
  const amounts = splitFormulaFactors(valueRhs, op);
  if (symbols.length < 2 || symbols.length !== amounts.length) return [];
  const out: { symbol: string; raw: string; unit: string }[] = [];
  for (let index = 0; index < symbols.length; index += 1) {
    const symbol = loneSymbol(symbols[index] ?? "");
    const match = (amounts[index] ?? "").match(new RegExp(`^${amount}$`, "i"));
    if (!symbol || !match) return [];
    out.push({ symbol, raw: match[1], unit: match[2] });
  }
  return out;
}

function nounAfterAmount(context: string, raw: string, unit: string): string {
  const re = new RegExp(`${escapeReg(raw)}\\s*${escapeReg(unit)}\\s+([\\p{L}]{2,})`, "giu");
  const words: string[] = [];
  for (const match of context.matchAll(re)) {
    const word = match[1];
    if (!word || NOUN_STOP.has(foldTr(word))) continue;
    words.push(word);
  }
  words.sort((left, right) => left.length - right.length);
  return words[0] ?? "";
}

function precededByOperator(text: string, index: number): boolean {
  return /[/×*·]$/.test(text.slice(0, index).trimEnd());
}

/** Örnek kökü, çözümde kullanılan kaynak verilenlerinden kurulur. Soru kökü yapıştırılmaz. */
function exampleQuestion(solution: string, context: string): string {
  const formula = formulaClause(solution);
  const asked = askedLhs(solution);
  const defs: string[] = [];
  const seen = new Map<string, number>();
  const push = (symbol: string, raw: string, unit: string) => {
    if (asked && sameSymbol(symbol, asked)) return;
    const related = formula
      ? [formula]
      : formulasIn(context).filter((item) => sameSymbol(formulaLhs(item), asked));
    if (related.length && !related.some((item) => formulaUsesSymbol(item, symbol))) return;
    const visible = preserveSubscriptLetters(solution);
    const visibleSymbol = preserveSubscriptLetters(symbol);
    if (
      !related.length &&
      !new RegExp(`(?<![A-Za-zΔδ0-9_])${escapeReg(visibleSymbol)}(?![A-Za-z0-9_])`).test(visible)
    ) {
      return;
    }
    if (!numberUsed(solution, raw)) return;
    if (isResultGiven(raw, unit, solution)) return;
    const symbolKey = `${symbol}:${readNumber(raw)}`;
    if ([...seen.keys()].some((key) => key.startsWith(`${symbol}:`) && key !== symbolKey)) return;
    const noun = nounAfterAmount(context, raw, unit);
    const clause = noun ? `${symbol} = ${raw} ${unit} ${noun}` : `${symbol} = ${raw} ${unit}`;
    const key = `${symbol}:${readNumber(raw)}`;
    const previous = seen.get(key);
    if (previous != null) {
      const previousUnit = defs[previous]?.match(new RegExp(MEASURE, "i"))?.[0] ?? "";
      if (unit.length >= previousUnit.length) defs[previous] = clause;
      return;
    }
    seen.set(key, defs.length);
    defs.push(clause);
  };
  for (const given of pairedGivens(solution)) push(given.symbol, given.raw, given.unit);
  const re = new RegExp(`${GIVEN_SYMBOL}\\s*=\\s*(\\d+(?:[.,]\\d+)?)\\s*(${MEASURE})`, "g");
  for (const match of context.matchAll(re)) {
    if (precededByOperator(context, match.index ?? 0)) continue;
    push(match[1], match[2], match[3]);
  }
  const askedBit = asked ? `${asked} kaçtır?` : "sonuç kaçtır?";
  if (defs.length) {
    const list = defs.length === 1 ? defs[0] : `${defs.slice(0, -1).join(", ")} ve ${defs[defs.length - 1]}`;
    return tidyJoins(`${list} verildiğine göre ${askedBit}`);
  }
  const amounts = [
    ...solution.matchAll(new RegExp(`(\\d+(?:[.,]\\d+)?)\\s*(${MEASURE})`, "gi")),
  ]
    .filter((match) => !isResultGiven(match[1], match[2], solution))
    .map((match) => `${match[1]} ${match[2]}`);
  const unique = [...new Set(amounts)];
  if (!unique.length || !asked) return "";
  const list = unique.length === 1 ? unique[0] : `${unique.slice(0, -1).join(", ")} ve ${unique[unique.length - 1]}`;
  const unit =
    [...solution.matchAll(new RegExp(`(?:≈|=)\\s*\\d+(?:[.,]\\d+)?\\s*(${MEASURE})`, "gi"))].pop()?.[1] ?? "";
  return tidyJoins(`${list} verildiğine göre ${asked} kaç ${unit}?`);
}

function repeatsSectionWork(solution: string, bodies: string): boolean {
  const needle = foldTr(solution).replace(/[^a-z0-9]/g, "");
  if (needle.length < 8) return false;
  return foldTr(bodies).replace(/[^a-z0-9]/g, "").includes(needle);
}

/**
 * Örnek kartı, bölümdeki hesabın kopyasıysa düşer.
 * Kalan kart, kullanılan verilenlerden yazılmış bir soru olur.
 */
/** Kaynak dışı örnek düşünce, bölümdeki tamamlanmış hesap bir kez karta alınır. */
function promoteSectionExample(lesson: LessonV2, source: string): LessonV2 {
  if (lesson.example) return lesson;
  const sections = lesson.sections.map((section) => ({ ...section }));
  for (let index = 0; index < sections.length; index += 1) {
    const section = sections[index];
    const sentences = sentencesOf(section.body);
    const solution = sentences.find(
      (sentence) => exampleIsComplete(sentence) && !workedExampleNeedsFormula(sentence),
    );
    if (!solution) continue;
    const remaining = sentences.filter((sentence) => sentence !== solution).join(" ");
    if (remaining.length < 20) continue;
    const context = [lesson.overview ?? "", ...sections.map((item) => item.body), source].join("\n");
    const asked = askedLhs(solution);
    const prompt = exampleQuestion(solution, context) || (asked ? `${asked} kaçtır?` : "");
    if (!prompt.endsWith("?")) continue;
    sections[index] = { ...section, body: remaining };
    return { ...lesson, sections, example: { prompt, solution } };
  }
  return lesson;
}

function usablePrompt(prompt: string): string {
  const tidy = tidyJoins(prompt);
  if (!/[?？]\s*$/.test(tidy)) return "";
  return tidy;
}

function withCalculatedExample(lesson: LessonV2, source: string): LessonV2 {
  if (!lesson.example) return promoteSectionExample(lesson, source);
  const promptText = lesson.example.prompt;
  const solutionText = lesson.example.solution;
  const blob = `${promptText}\n${solutionText}`;
  if (!expectsCalculation(blob) && !workedExampleNeedsFormula(solutionText)) {
    return { ...lesson, example: { prompt: tidyJoins(promptText), solution: solutionText } };
  }
  const bodies = lesson.sections.map((section) => section.body).join("\n");
  const context = [lesson.overview ?? "", bodies, promptText, source].join("\n");
  const polished = polishWorkedExample(solutionText, context);
  const solution =
    polished && (exampleIsComplete(polished) || !workedExampleNeedsFormula(polished)) ? polished : solutionText;
  if (workedExampleNeedsFormula(solution)) {
    const next = { ...lesson };
    delete next.example;
    return next;
  }
  if (repeatsSectionWork(solution, bodies)) {
    const next = { ...lesson };
    delete next.example;
    return next;
  }
  const asked = askedLhs(solution);
  const prompt =
    exampleQuestion(solution, context) || (asked ? `${asked} kaçtır?` : "") || usablePrompt(promptText);
  if (!prompt || !prompt.endsWith("?")) {
    const next = { ...lesson };
    delete next.example;
    return next;
  }
  return { ...lesson, example: { prompt, solution } };
}

export async function repairLearnerLesson(
  lesson: LessonV2,
  input: { source: string; topicLabel: string; targetMinutes?: number },
  complete: (prompt: string) => Promise<unknown>,
  verify?: (prompt: string) => Promise<unknown>,
): Promise<{
  lesson: LessonV2;
  requested: LessonCheckCode[];
  succeeded: LessonCheckCode[];
  dropped: LessonCheckCode[];
  verifyMs: number;
}> {
  const topicSource = sliceNumberedSection(input.source, input.topicLabel);
  const scoped = { source: topicSource, topicLabel: input.topicLabel };
  const bounded = applyBoundFix(
    coverSourceRelations(scopeLessonToTopic(lesson, input.source, input.topicLabel), topicSource),
    topicSource,
  );
  const filled = filledSummary(bounded, topicSource);
  const prepared: LessonV2 = filled.length ? { ...bounded, summary: filled } : bounded;
  /**
   * Regex kapısı temiz olsa da her ders kaynağa karşı bir kez denetlenir.
   * Denetim, yerel tarama ile aynı anda başlar. Onarım yalnız işaret varsa açılır.
   */
  const verifyStarted = Date.now();
  const verifyTask = (async (): Promise<string[]> => {
    if (!verify || !topicSource.trim()) return [];
    try {
      return claimsFromVerify(
        await verify(claimVerifyPrompt(prepared, topicSource, input.topicLabel)),
        prepared,
      );
    } catch {
      return [];
    }
  })();
  const audit = auditLearnerLesson(prepared, scoped);
  let quotes: string[] = [];
  let verifyMs = 0;
  try {
    quotes = await verifyTask;
  } finally {
    verifyMs = Date.now() - verifyStarted;
  }
  if (quotes.length && !audit.some((issue) => issue.code === "claim_wrong")) {
    audit.push({ code: "claim_wrong", detail: quotes[0].slice(0, 160) });
  }
  const requested = [...new Set(audit.map((issue) => issue.code))];
  const coherent = (candidate: LessonV2) =>
    publishCoherentLesson(candidate, topicSource, input.topicLabel, {
      targetMinutes: input.targetMinutes,
    });
  if (!requested.length) {
    const counted = prepared.sections.filter((section) => section.check).length;
    if (counted >= 3) {
      return { lesson: coherent(prepared), requested, succeeded: [], dropped: [], verifyMs };
    }
    const summary = filledSummary(prepared, topicSource);
    const drafted = summary.length ? { ...prepared, summary } : prepared;
    return {
      lesson: coherent(ensureThreeChecks(scopeLessonToTopic(drafted, input.source, input.topicLabel), topicSource)),
      requested,
      succeeded: [],
      dropped: [],
      verifyMs,
    };
  }
  let merged = prepared;
  const needsModel = requested.some((code) => MODEL_CODES.has(code));
  if (needsModel) {
    try {
      const patch = await complete(lessonRepairPrompt(prepared, audit, topicSource, quotes));
      if (patch) {
        const patched = mergeLessonRepair(prepared, patch, topicSource);
        merged = groundLearnerLesson(patched, topicSource).lesson as LessonV2;
      }
    } catch {
      merged = prepared;
    }
  }
  const finalized = dropUnresolvedLesson(applyBoundFix(merged, topicSource), topicSource, quotes);
  const covered = coverSourceRelations(finalized.lesson, topicSource);
  const summary = filledSummary(covered, topicSource);
  const drafted = summary.length ? { ...covered, summary } : covered;
  const published = coherent(
    ensureThreeChecks(scopeLessonToTopic(drafted, input.source, input.topicLabel), topicSource),
  );
  const remaining = new Set(auditLearnerLesson(published, scoped).map((issue) => issue.code));
  const removed = new Set(finalized.dropped);
  const succeeded = requested.filter((code) => !remaining.has(code) && !removed.has(code));
  const dropped = [...new Set([...finalized.dropped, ...remaining])];
  return { lesson: published, requested, succeeded, dropped, verifyMs };
}

function applyBoundFix(lesson: LessonV2, source: string): LessonV2 {
  const fix = (text: string) => alignBounds(text, source);
  return {
    ...lesson,
    overview: lesson.overview ? fix(lesson.overview) : lesson.overview,
    sections: lesson.sections.map((section) => ({ ...section, body: fix(section.body) })),
    example: lesson.example
      ? { prompt: fix(lesson.example.prompt), solution: fix(lesson.example.solution) }
      : lesson.example,
    summary: lesson.summary?.map((line) => fix(line)),
  };
}
