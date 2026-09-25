/**
 * Soru gösterilmeden önce bağımsız doğrulama.
 *
 * Aritmetik, oran, dengeli denklem, birim ve "tek doğru şık" deterministik.
 * Bunlar yetmezse çağıran tek bir ikinci çözüm isteği yapar; bu dosya o
 * çağrıyı açmaz. Kimya, fizik, tarih, hukuk ve biyoloji aynı kapıdan geçer.
 */

import { fluencyIssues } from "@/lib/learning/learner-fluency";
import {
  auditQuantitative,
  gradeStudentClaim,
  parseReactions,
  repairQuantitative,
  type GradedClaim,
} from "@/lib/learning/tutor-quant";
import { announcedExampleGap, exampleIsComplete } from "@/lib/learning/lesson-repair";

const SUB: Record<string, string> = {
  "₀": "0", "₁": "1", "₂": "2", "₃": "3", "₄": "4",
  "₅": "5", "₆": "6", "₇": "7", "₈": "8", "₉": "9",
};

const META_OPTION =
  /^(hepsi|hiçbiri|all of the above|none of the above|yukarıdakilerin hepsi|yukarıdakilerin hiçbiri)/i;

export type VerifiedChoice = {
  text: string;
  options: string[];
  correct: string[];
  multi: boolean;
  explanation?: string;
  learningObjective?: string;
  misconceptionTag?: string;
  optionWhy?: string[];
  topic?: string;
  /** Deterministik kapı hükmü veremedi. Tek ikinci çağrı bunu çözer. */
  needsSolver?: boolean;
};

export type ChoiceCheck = {
  status: "keep" | "drop" | "unresolved";
  question: VerifiedChoice;
};

type Term = { coeff: number; formula: string; atoms: Map<string, number> };
type Equation = { reactants: Term[]; products: Term[]; raw: string };

function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function expandSub(text: string): string {
  return text.replace(/[₀-₉]/g, (ch) => SUB[ch] ?? ch);
}

/** Modelin İngilizce "full" kırpıntısı. Konuya özel değil. */
export function polishLearnerText(text: string): string {
  return text
    .replace(/\bful olarak\b/gi, "tam olarak")
    .replace(/yarısı kadar,?\s*yani/gi, "katsayı oranına göre");
}

function atomsOf(formula: string): Map<string, number> | null {
  const raw = expandSub(formula).replace(/\s+/g, "");
  if (!/^[A-Z][A-Za-z0-9()]*$/.test(raw)) return null;
  const counts = new Map<string, number>();
  const add = (el: string, n: number) => counts.set(el, (counts.get(el) ?? 0) + n);
  const parse = (group: string, mult: number): boolean => {
    let i = 0;
    while (i < group.length) {
      if (group[i] === "(") {
        let depth = 1;
        let j = i + 1;
        while (j < group.length && depth > 0) {
          if (group[j] === "(") depth += 1;
          else if (group[j] === ")") depth -= 1;
          j += 1;
        }
        if (depth !== 0) return false;
        const inner = group.slice(i + 1, j - 1);
        const num = group.slice(j).match(/^(\d+)/);
        const n = num ? Number(num[1]) : 1;
        if (!parse(inner, mult * n)) return false;
        i = j + (num?.[1].length ?? 0);
        continue;
      }
      const match = group.slice(i).match(/^([A-Z][a-z]?)(\d*)/);
      if (!match) return false;
      add(match[1], (match[2] ? Number(match[2]) : 1) * mult);
      i += match[0].length;
    }
    return group.length > 0;
  };
  if (!parse(raw, 1) || !counts.size) return null;
  return counts;
}

function looksChemical(formula: string): boolean {
  return /[a-z]/.test(formula) || /\d|[₀-₉]/.test(formula);
}

const TERM_SRC = String.raw`(?:\d+\s*)?[A-Z][A-Za-z0-9₀-₉()]*`;
const EQ_RE = new RegExp(
  `(${TERM_SRC}(?:\\s*\\+\\s*${TERM_SRC})*)\\s*(?:→|->|=>)\\s*(${TERM_SRC}(?:\\s*\\+\\s*${TERM_SRC})*)`,
  "g",
);

function parseSide(side: string): Term[] | null {
  const terms: Term[] = [];
  for (const part of side.split(/\s*\+\s*/)) {
    const match = part.trim().match(/^(\d+)?\s*([A-Z][A-Za-z0-9₀-₉()]*)$/);
    if (!match) return null;
    const formula = match[2];
    const atoms = atomsOf(formula);
    if (!atoms) return null;
    terms.push({ coeff: match[1] ? Number(match[1]) : 1, formula, atoms });
  }
  return terms.length ? terms : null;
}

function parseEquation(text: string): Equation | null {
  const match = new RegExp(EQ_RE.source).exec(text);
  if (!match) return null;
  const reactants = parseSide(match[1]);
  const products = parseSide(match[2]);
  if (!reactants || !products) return null;
  if (![...reactants, ...products].some((term) => looksChemical(term.formula))) return null;
  return { reactants, products, raw: match[0] };
}

function tally(terms: Term[], coeffs: number[], offset: number): Map<string, number> {
  const totals = new Map<string, number>();
  terms.forEach((term, index) => {
    const coeff = coeffs[offset + index];
    for (const [el, count] of term.atoms) {
      totals.set(el, (totals.get(el) ?? 0) + count * coeff);
    }
  });
  return totals;
}

function sameTotals(left: Map<string, number>, right: Map<string, number>): boolean {
  const keys = new Set([...left.keys(), ...right.keys()]);
  for (const key of keys) {
    if ((left.get(key) ?? 0) !== (right.get(key) ?? 0)) return false;
  }
  return true;
}

function balancedCoeffs(eq: Equation): number[] | null {
  const current = [...eq.reactants, ...eq.products].map((term) => term.coeff);
  const left = tally(eq.reactants, current, 0);
  const right = tally(eq.products, current, eq.reactants.length);
  if (sameTotals(left, right)) return current;
  const n = current.length;
  if (n > 6) return null;
  let best: number[] | null = null;
  let bestSum = Infinity;
  const coeffs = new Array<number>(n).fill(1);
  const walk = (index: number) => {
    if (index === n) {
      const l = tally(eq.reactants, coeffs, 0);
      const r = tally(eq.products, coeffs, eq.reactants.length);
      if (!sameTotals(l, r)) return;
      const sum = coeffs.reduce((acc, value) => acc + value, 0);
      if (sum < bestSum) {
        bestSum = sum;
        best = [...coeffs];
      }
      return;
    }
    for (let value = 1; value <= 6; value += 1) {
      coeffs[index] = value;
      walk(index + 1);
    }
  };
  walk(0);
  return best;
}

function formatEquation(eq: Equation, coeffs: number[]): string {
  const side = (terms: Term[], offset: number) =>
    terms
      .map((term, index) => {
        const coeff = coeffs[offset + index];
        return `${coeff === 1 ? "" : coeff}${term.formula}`;
      })
      .join(" + ");
  return `${side(eq.reactants, 0)} → ${side(eq.products, eq.reactants.length)}`;
}

function balanceSpan(text: string): string {
  return text.replace(new RegExp(EQ_RE.source, "g"), (raw) => {
    const eq = parseEquation(raw);
    if (!eq) return raw;
    const coeffs = balancedCoeffs(eq);
    if (!coeffs) return raw;
    return formatEquation(eq, coeffs);
  });
}

function balanceIntent(prompt: string): "balanced" | "unbalanced" | null {
  const folded = fold(prompt);
  if (/denkle[sş]tirilmemi[sş]|dengelenmemi[sş]|unbalanced|katsay[ıi]s[ıi] yanl[ıi][sş]/.test(folded)) {
    return "unbalanced";
  }
  if (/denkle[sş]tirilmi[sş]|dengeli denklem|hangi denklem dengeli|balanced equation/.test(folded)) {
    return "balanced";
  }
  return null;
}

function equationBalanced(text: string): boolean | null {
  const eq = parseEquation(text);
  if (!eq) return null;
  const coeffs = [...eq.reactants, ...eq.products].map((term) => term.coeff);
  return sameTotals(tally(eq.reactants, coeffs, 0), tally(eq.products, coeffs, eq.reactants.length));
}

function readNumber(raw: string): number {
  return Number(raw.replace(",", "."));
}

function formatTr(n: number): string {
  const rounded = Math.round(n * 1000) / 1000;
  return String(rounded).replace(".", ",");
}

function optionNumber(option: string): number | null {
  const match = option.match(/-?\d+(?:[.,]\d+)?/);
  if (!match) return null;
  const value = readNumber(match[0]);
  return Number.isFinite(value) ? value : null;
}

function close(left: number, right: number): boolean {
  return Math.abs(left - right) <= Math.max(0.02, Math.abs(right) * 0.02);
}

/** Metindeki son doğru eşitlik. Ara adım (`= 8/16`) sonucu değildir. */
function computedResult(text: string): number | null {
  const audited = auditQuantitative(text);
  const settled = audited.ok ? text : repairQuantitative(text, audited);
  const again = auditQuantitative(settled);
  if (!again.ok || !again.checked) return null;
  const matches = [...settled.matchAll(/=\s*(-?\d+(?:[.,]\d+)?)(?!\s*\/)/g)];
  const match = matches[matches.length - 1];
  if (!match) return null;
  const value = readNumber(match[1]);
  return Number.isFinite(value) ? value : null;
}

function elementMasses(text: string): Map<string, number> {
  const masses = new Map<string, number>();
  for (const match of text.matchAll(/\b([A-Z][a-z]?)\s*=\s*(\d+(?:[.,]\d+)?)/g)) {
    masses.set(match[1], readNumber(match[2]));
  }
  return masses;
}

function formulaMass(formula: string, masses: Map<string, number>): number | null {
  const atoms = atomsOf(formula);
  if (!atoms) return null;
  let sum = 0;
  for (const [element, count] of atoms) {
    const mass = masses.get(element);
    if (mass == null) return null;
    sum += mass * count;
  }
  return sum;
}

/**
 * "kaç gram / kaç mol" sorusu, denklem ve verilen miktardan.
 * Ayrışmazsa null; o zaman eşitlik sonucuna bakılır.
 */
function stoichiometryQuantity(text: string): number | null {
  const eq = parseEquation(text);
  if (!eq) return null;
  const asked = text.match(/kaç\s+(gram|g|mol)\s+([A-Za-z][A-Za-z0-9₀-₉]*)/i);
  if (!asked) return null;
  const wantUnit = /mol/i.test(asked[1]) ? "mol" : "g";
  const want = [...eq.reactants, ...eq.products].find((term) => normSpecies(term.formula) === normSpecies(asked[2]));
  if (!want) return null;
  const masses = elementMasses(text);
  const givenMol = text.match(/(\d+(?:[.,]\d+)?)\s*mol\s+([A-Za-z][A-Za-z0-9₀-₉]*)/i);
  const givenMass = text.match(/(\d+(?:[.,]\d+)?)\s*g\s+([A-Za-z][A-Za-z0-9₀-₉]*)/i);
  let scale: number | null = null;
  if (givenMol) {
    const term = [...eq.reactants, ...eq.products].find((item) => normSpecies(item.formula) === normSpecies(givenMol[2]));
    if (term) scale = readNumber(givenMol[1]) / term.coeff;
  } else if (givenMass) {
    const term = [...eq.reactants, ...eq.products].find((item) => normSpecies(item.formula) === normSpecies(givenMass[2]));
    const mass = term ? formulaMass(term.formula, masses) : null;
    if (term && mass) scale = readNumber(givenMass[1]) / mass / term.coeff;
  }
  if (scale == null || !Number.isFinite(scale)) return null;
  const moles = want.coeff * scale;
  if (wantUnit === "mol") return moles;
  const mass = formulaMass(want.formula, masses);
  return mass == null ? null : moles * mass;
}

function normSpecies(raw: string): string {
  return fold(expandSub(raw)).replace(/[^a-z0-9]/g, "");
}

function molesIn(text: string): Map<string, number> {
  const map = new Map<string, number>();
  const named = /n\s*\(\s*([A-Za-z][A-Za-z0-9₀-₉]*)\s*\)\s*=\s*[^,\n]{0,40}?=\s*(\d+(?:[.,]\d+)?)/gi;
  for (const match of text.matchAll(named)) {
    map.set(normSpecies(match[1]), readNumber(match[2]));
  }
  const plain = /(\d+(?:[.,]\d+)?)\s*mol\s+([A-Za-z][A-Za-z0-9₀-₉]*)/gi;
  for (const match of text.matchAll(plain)) {
    const key = normSpecies(match[2]);
    if (!map.has(key)) map.set(key, readNumber(match[1]));
  }
  return map;
}

/**
 * Denklem ve bir tepkenin molü verilmişse ürün/tepken molleri.
 * Uymayan "1 mol CO₂" cümlesi hesaplanan değere çekilir.
 */
export function repairStoichiometryClaims(text: string): string {
  const eq = parseEquation(text);
  if (!eq) return text;
  const stated = molesIn(text);
  const anchor = [...eq.reactants, ...eq.products].find((term) => stated.has(normSpecies(term.formula)));
  if (!anchor) return text;
  const scale = (stated.get(normSpecies(anchor.formula)) as number) / anchor.coeff;
  if (!Number.isFinite(scale) || scale < 0) return text;
  const expected = new Map<string, number>();
  for (const term of [...eq.reactants, ...eq.products]) {
    expected.set(normSpecies(term.formula), term.coeff * scale);
  }
  return text
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => {
      const claims = [...sentence.matchAll(/(\d+(?:[.,]\d+)?)\s*mol\s+([A-Za-z][A-Za-z0-9₀-₉]*)/gi)];
      const wrong = claims.filter((claim) => {
        const want = expected.get(normSpecies(claim[2]));
        return want != null && !close(readNumber(claim[1]), want);
      });
      if (!wrong.length) return sentence;
      const bits = [...eq.products]
        .filter((term) => expected.has(normSpecies(term.formula)))
        .map((term) => `${formatTr(expected.get(normSpecies(term.formula)) as number)} mol ${term.formula}`);
      if (!bits.length) return sentence;
      return `Hesaplanan ürün ${bits.join(" ve ")}.`;
    })
    .join(" ");
}

/** Öğrenciye kalacak cümle: sayı denetimi, akıcılık ve duyurulmuş örnek kapısı. */
function shownExplanationOk(text: string, source: string): boolean {
  const clean = text.trim();
  if (clean.length < 2) return false;
  if (!auditQuantitative(clean, source).ok) return false;
  if (fluencyIssues(clean).length) return false;
  if (announcedExampleGap(clean)) return false;
  return true;
}

export function settleExplanation(text: string, source = ""): string {
  let next = polishLearnerText(text).trim();
  next = repairStoichiometryClaims(next);
  const audit = auditQuantitative(next, source);
  if (!audit.ok) {
    const repaired = repairQuantitative(next, audit).trim();
    if (repaired && auditQuantitative(repaired, source).ok) next = repaired;
    else {
      const kept = next
        .split(/(?<=[.!?])\s+/)
        .filter((sentence) => auditQuantitative(sentence, source).ok);
      next = kept.join(" ").trim();
    }
  }
  if (!next) return next;
  const gap = announcedExampleGap(next);
  if (!gap && fluencyIssues(next).length === 0) return next;
  const kept = next
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => {
      if (!shownExplanationOk(sentence, source)) return false;
      if (gap && /\d/.test(sentence) && !exampleIsComplete(sentence)) return false;
      return true;
    });
  return kept.join(" ").trim();
}

function limitingContext(question: VerifiedChoice): string {
  return `${question.text}\n${question.explanation ?? ""}\n${question.options.join("\n")}`;
}

function isLimitingQuestion(text: string): boolean {
  return /(sınırlayıcı|sinirlayici|limiting)/i.test(text);
}

const NEITHER = "İkisi de tamamen tükenir";

function speciesFormulas(text: string): Set<string> {
  const found = new Set<string>();
  for (const reaction of parseReactions(text)) {
    for (const row of reaction) found.add(row.species);
  }
  return found;
}

function optionOnTopic(option: string, species: Set<string>, limiting: boolean): boolean {
  if (!limiting) return true;
  const key = normSpecies(option);
  if (species.has(key)) return true;
  const folded = fold(option);
  return /tuken|oran|katsay|sinirlay/.test(folded);
}

function limitingSetup(text: string): boolean {
  return parseReactions(text).some((reaction) => reaction.length >= 2) && molesIn(text).size >= 2;
}

function repairLimiting(question: VerifiedChoice): VerifiedChoice | null {
  if (!isLimitingQuestion(`${question.text} ${question.explanation ?? ""}`)) return question;
  const blob = limitingContext(question);
  if (!limitingSetup(blob)) return question;
  const probe = `${question.correct[0] ?? question.options[0] ?? ""} sınırlayıcıdır. ${question.explanation ?? ""}`;
  const grade = gradeStudentClaim({ student: probe, context: blob });
  if (!grade || grade.topicLabel !== "Sınırlayıcı bileşen") return null;
  if (grade.verdict === "dogru") {
    return { ...question, explanation: settleExplanation(grade.conclusion || question.explanation || "", blob), needsSolver: false };
  }
  const neither = /hiçbiri sınırlayıcı değil/i.test(grade.verdictLine) || /hiçbiri sınırlayıcı değil/i.test(grade.conclusion);
  const species = speciesFormulas(blob);
  let options = question.options.filter((option) => optionOnTopic(option, species, true) && !META_OPTION.test(option.trim()));
  let correct = question.correct.filter((item) => options.includes(item));
  if (neither) {
    if (!options.some((option) => fold(option).includes("tuken"))) options = [NEITHER, ...options];
    correct = [options.find((option) => fold(option).includes("tuken")) ?? NEITHER];
  } else {
    const named = grade.conclusion.match(/sınırlayıcı\s+([A-Za-z][A-Za-z0-9₀-₉]*)/i);
    const want = named ? options.find((option) => normSpecies(option) === normSpecies(named[1])) : undefined;
    if (!want) return null;
    correct = [want];
  }
  options = [...new Set(options)].slice(0, 4);
  if (options.length < 2 || !correct.every((item) => options.includes(item))) return null;
  const explanation = settleExplanation(grade.conclusion, blob);
  return {
    ...question,
    options,
    correct,
    multi: false,
    explanation,
    misconceptionTag: grade.wrongType || question.misconceptionTag || "oran",
    needsSolver: false,
  };
}

function alignNumericKey(question: VerifiedChoice): VerifiedChoice | null {
  const blob = `${question.text}\n${question.explanation ?? ""}`;
  const value = stoichiometryQuantity(blob) ?? computedResult(blob);
  if (value == null) return question;
  const matches = question.options.filter((option) => {
    const n = optionNumber(option);
    return n != null && close(n, value);
  });
  if (matches.length !== 1) return question;
  const explanation = settleExplanation(question.explanation || `${formatTr(value)} sonucu hesapla uyumludur.`, blob);
  return {
    ...question,
    correct: [matches[0]],
    multi: false,
    explanation,
    needsSolver: false,
  };
}

function tokens(text: string): string[] {
  return fold(text)
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
}

function sourceBackedOption(question: VerifiedChoice, source: string): string | null {
  if (!source.trim() || isLimitingQuestion(question.text) || computedResult(`${question.text} ${question.explanation ?? ""}`) != null) {
    return null;
  }
  const questionTokens = new Set(tokens(question.text));
  if (!questionTokens.size) return null;
  const sentences = source.split(/(?<=[.!?])\s+|\n+/);
  const relevant = sentences.filter((sentence) => tokens(sentence).some((token) => questionTokens.has(token)));
  if (!relevant.length) return null;
  const hay = fold(relevant.join(" "));
  const scored = question.options.map((option) => {
    const own = tokens(option);
    const hit = own.filter((token) => hay.includes(token)).length;
    const year = option.match(/\b(1[0-9]{3}|20[0-9]{2})\b/);
    const yearHit = year && hay.includes(year[1]) ? 2 : 0;
    return { option, score: hit + yearHit };
  });
  scored.sort((a, b) => b.score - a.score);
  if (scored[0].score < 1) return null;
  if (scored[1] && scored[1].score === scored[0].score) return null;
  const keyScore = scored.find((row) => question.correct.includes(row.option))?.score ?? 0;
  if (keyScore > 0 && scored[0].option !== question.correct[0]) return null;
  return scored[0].option;
}

function asksQuantity(text: string): boolean {
  return /(kaç|hesapla|calculate|how many|how much|kaçtır|kaçtir)/i.test(text);
}

function fillOptionWhy(question: VerifiedChoice): VerifiedChoice {
  if (question.optionWhy && question.optionWhy.length === question.options.length && question.optionWhy.every((line) => line.trim().length >= 8)) {
    return question;
  }
  const trap = question.misconceptionTag?.trim() || "yanlış eşleme";
  const optionWhy = question.options.map((option) => {
    if (question.correct.includes(option)) {
      const why = question.explanation?.split(/(?<=[.!?])\s+/)[0]?.trim();
      return (why && why.length >= 8 ? why : `${option} sorunun doğrulanmış sonucudur.`).slice(0, 200);
    }
    return `${option} bu sorunun cevabı değil; tuzak: ${trap}.`.slice(0, 200);
  });
  return { ...question, optionWhy };
}

function balanceQuestion(question: VerifiedChoice): VerifiedChoice | null {
  const intent = balanceIntent(question.text);
  if (intent === "unbalanced") {
    const unbalanced = question.options.filter((option) => equationBalanced(option) === false);
    if (unbalanced.length === 1) {
      return { ...question, correct: [unbalanced[0]], multi: false, needsSolver: false };
    }
    return unbalanced.length === 0 ? question : null;
  }
  if (intent === "balanced") {
    const balanced = question.options.filter((option) => equationBalanced(option) === true);
    if (balanced.length === 1) return { ...question, correct: [balanced[0]], multi: false, needsSolver: false };
    return null;
  }
  const options = question.options.map((option) => balanceSpan(option));
  const explanation = question.explanation ? balanceSpan(question.explanation) : question.explanation;
  const correct = question.correct.map((item) => balanceSpan(item));
  return { ...question, options: [...new Set(options)], correct, explanation };
}

export function verifyChoiceQuestion(raw: VerifiedChoice, source = ""): ChoiceCheck {
  const polished: VerifiedChoice = {
    ...raw,
    text: polishLearnerText(raw.text).trim(),
    options: raw.options.map((option) => polishLearnerText(option).trim()).filter(Boolean),
    explanation: raw.explanation ? polishLearnerText(raw.explanation) : raw.explanation,
  };
  if (polished.text.length < 8 || polished.options.length < 2) return { status: "drop", question: polished };
  if (polished.options.some((option) => META_OPTION.test(option.trim()))) return { status: "drop", question: polished };
  const balanced = balanceQuestion(polished);
  if (!balanced) return { status: "drop", question: polished };
  const limited = repairLimiting(balanced);
  if (!limited) return { status: "drop", question: balanced };
  const numeric = alignNumericKey(limited);
  if (!numeric || numeric.options.length < 2) return { status: "drop", question: limited };
  const backed = sourceBackedOption(numeric, source);
  let next = numeric;
  if (backed && !next.correct.includes(backed)) {
    next = { ...next, correct: [backed], multi: false, needsSolver: false };
  }
  if (!next.multi && next.correct.length !== 1) return { status: "drop", question: next };
  if (next.multi && next.correct.length < 2) return { status: "drop", question: next };
  if (!next.correct.every((item) => next.options.includes(item))) return { status: "drop", question: next };
  const explanation = settleExplanation(next.explanation ?? "", `${source}\n${next.text}`);
  next = {
    ...next,
    explanation: explanation || `Doğru seçenek: ${next.correct[0]}.`,
    misconceptionTag: next.misconceptionTag?.trim() || "yanlış eşleme",
  };
  next = fillOptionWhy(next);
  const blob = `${next.text}\n${next.explanation ?? ""}`;
  const quantitative = asksQuantity(next.text) || Boolean(parseEquation(blob)) || (isLimitingQuestion(next.text) && molesIn(blob).size >= 2);
  const settled = next.needsSolver === false
    || computedResult(blob) != null
    || Boolean(backed)
    || (isLimitingQuestion(next.text) && molesIn(blob).size < 2);
  if (quantitative && !settled) return { status: "unresolved", question: { ...next, needsSolver: true } };
  return { status: "keep", question: { ...next, needsSolver: false } };
}

export function verifyChoiceSet(questions: VerifiedChoice[], source = "", min = 3): VerifiedChoice[] | null {
  const kept = questions
    .map((question) => verifyChoiceQuestion(question, source))
    .filter((row) => row.status !== "drop")
    .map((row) => row.question);
  if (kept.length < min) return null;
  return kept.slice(0, 8);
}

export function choiceSolverPrompt(
  items: { index: number; text: string; options: string[] }[],
  source: string,
): { system: string; user: string } {
  return {
    system:
      "Bağımsız çözücüsün. Her soruyu yalnızca verilen soru ve kaynakla çöz. " +
      "Kaynakta olmayan olgu uydurma. Hesap varsa yeniden türet. " +
      "Tek doğru yoksa veya soru kendi içinde çözülemiyorsa unanswerable true. " +
      'JSON: {"items":[{"index":number,"answer":string|null,"unanswerable":boolean,"reason":string}]}. ' +
      "answer, seçenek metninin birebir kopyası olsun.",
    user: `KAYNAK:\n${source.slice(0, 3500)}\n\nSORULAR:\n${JSON.stringify(items).slice(0, 6000)}`,
  };
}

export function applyChoiceSolver(questions: VerifiedChoice[], raw: string, source = ""): VerifiedChoice[] | null {
  let parsed: { items?: { index?: number; answer?: string | null; unanswerable?: boolean; reason?: string }[] };
  try {
    parsed = JSON.parse(raw) as typeof parsed;
  } catch {
    return null;
  }
  const verdicts = new Map<number, { answer?: string | null; unanswerable?: boolean; reason?: string }>();
  for (const item of parsed.items ?? []) {
    if (typeof item.index === "number") verdicts.set(item.index, item);
  }
  const next: VerifiedChoice[] = [];
  for (let index = 0; index < questions.length; index += 1) {
    const question = questions[index];
    if (!question.needsSolver) {
      next.push(question);
      continue;
    }
    const verdict = verdicts.get(index);
    if (!verdict || verdict.unanswerable || !verdict.answer) continue;
    const answer = question.options.find((option) => option === verdict.answer || fold(option) === fold(verdict.answer ?? ""));
    if (!answer) continue;
    const reason = settleExplanation(verdict.reason || `Doğru seçenek: ${answer}.`, source);
    if (verdict.reason && !auditQuantitative(reason, source).ok) continue;
    const checked = verifyChoiceQuestion(
      { ...question, correct: [answer], multi: false, explanation: reason, needsSolver: false },
      source,
    );
    if (checked.status === "drop") continue;
    next.push({ ...checked.question, needsSolver: false });
  }
  return next.length ? next : null;
}

export function verifyOralPrompt(
  prompt: string,
  expectedPoints: string[],
  source = "",
): { prompt: string; expectedPoints: string[] } | null {
  const polished = polishLearnerText(prompt).trim();
  const text = balanceIntent(polished) ? polished : balanceSpan(polished);
  if (text.length < 8 || announcedExampleGap(text)) return null;
  const points = expectedPoints.map((point) => point.trim()).filter((point) => point.length >= 2 && !isScoreLabel(point));
  if (!(isLimitingQuestion(text) && limitingSetup(`${text}\n${points.join("\n")}`))) {
    const settled = points.flatMap((point) => {
      const next = settleExplanation(point, source).trim();
      if (!shownExplanationOk(next, source) || isScoreLabel(next)) return [];
      return [next];
    });
    const next = settled.length ? settled : points.length ? [] : [text.slice(0, 180)];
    if (!next.length) {
      return { prompt: text, expectedPoints: [text.slice(0, 180)] };
    }
    return { prompt: text, expectedPoints: next.slice(0, 6) };
  }
  const probe = verifyChoiceQuestion(
    {
      text,
      options: points.length >= 2 ? points.slice(0, 4) : ["kaynakla uyumlu", "kaynakla uyumsuz"],
      correct: [points[0] ?? "kaynakla uyumlu"],
      multi: false,
      explanation: points.join(" "),
    },
    source,
  );
  if (probe.status === "drop") return null;
  const solved = probe.question.explanation?.trim();
  const nextPoints = solved && solved.length >= 8 ? [solved] : points;
  if (!nextPoints.length) return null;
  if (isLimitingQuestion(text) && limitingSetup(`${text}\n${points.join(" ")}`) && probe.status !== "keep") {
    return null;
  }
  return { prompt: probe.question.text || text, expectedPoints: nextPoints.slice(0, 6) };
}

/** Deterministik kapı yetmezse tek çözüm çağrısı. Çağrı bu dosyada açılmaz. */
export async function refineVerifiedChoices(
  questions: VerifiedChoice[],
  ask: (system: string, user: string) => Promise<string | null>,
  source = "",
  min = 1,
): Promise<VerifiedChoice[] | null> {
  const pending = questions.some((question) => question.needsSolver);
  if (!pending) return questions.length >= min ? questions : null;
  const prompt = choiceSolverPrompt(
    questions
      .map((question, index) => ({ index, text: question.text, options: question.options }))
      .filter((_, index) => questions[index]?.needsSolver),
    source,
  );
  const raw = await ask(prompt.system, prompt.user);
  const solved = raw ? applyChoiceSolver(questions, raw, source) : null;
  const kept = (solved ?? questions.filter((question) => !question.needsSolver)).filter(
    (question) => !question.needsSolver,
  );
  return kept.length >= min ? kept.slice(0, 8) : null;
}

export type PracticeQuestion = {
  question: string;
  options: string[];
  correct: string;
  points?: number;
  multi?: boolean;
  explanation?: string;
  needsSolver?: boolean;
};

export function verifyPracticeQuestions(
  items: PracticeQuestion[],
  source = "",
  min = 1,
): PracticeQuestion[] | null {
  const checks = items.map((item) =>
    verifyChoiceQuestion(
      {
        text: item.question,
        options: item.options,
        correct: [item.correct],
        multi: Boolean(item.multi),
        explanation: item.explanation,
      },
      source,
    ),
  );
  const kept = checks.filter((row) => row.status !== "drop");
  if (kept.length < min) return null;
  return kept.map((row) => {
    const prior = items.find((item) => item.question === row.question.text);
    return {
      question: row.question.text,
      options: row.question.options,
      correct: row.question.correct[0] ?? row.question.options[0] ?? "",
      multi: row.question.multi,
      points: prior?.points,
      explanation: row.question.explanation,
      needsSolver: row.status === "unresolved" || row.question.needsSolver === true,
    };
  });
}

export function verifyFlashcard(front: string, back: string, source = ""): { front: string; back: string } | null {
  const face = polishLearnerText(front).trim();
  const settled = settleExplanation(back, source);
  if (face.length < 4 || !shownExplanationOk(settled, source)) return null;
  return { front: face, back: settled };
}

export function isScoreLabel(text: string): boolean {
  const folded = fold(text).replace(/[:\-]/g, " ").replace(/\s+/g, " ").trim();
  if (!folded || folded.length > 24) return false;
  if (/^(tam|kismen|yok|dogru|yanlis|full|partial|zero)(\s+\d{1,2})?$/.test(folded)) return true;
  if (/^\d{1,2}\s*\/\s*\d{1,2}$/.test(folded)) return true;
  if (/^\d{1,2}\s+puan$/.test(folded)) return true;
  if (/^tam puan$/.test(folded)) return true;
  return false;
}

export function limitingGrade(student: string, context: string): GradedClaim | null {
  return gradeStudentClaim({ student, context });
}
