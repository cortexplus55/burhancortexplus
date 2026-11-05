/**
 * Çözümün ara işlem satırları (5 Kasım 2026).
 *
 * "Kâğıtta çöz"de ve uygulamada yazılan açık uçlu cevapta öğrencinin çözümü satır satır okunur; her satır
 * modelsiz denetimden geçer ve ilk hatalı satır türüyle birlikte öğrenciye söylenir ("2. satıra kadar kurulumun
 * doğru; 3. satırda işaret hatası …"). Kod yalnız sayılarla ve genel cebirle karar verir — ders adı, konu kelimesi
 * yok; aynı kurallar matematik, fizik, kimya, iktisat ve her sayısal çözümde çalışır. Sayı içermeyen cevapta
 * (tarih, hukuk, sözel) bütün satırlar "unknown" kalır, hiçbir kesinti olmaz.
 *
 * Denetimler:
 *   - işlem: satırın kendi eşitlik zinciri tutmuyor (`stepArithmeticCheck`),
 *   - işaret: bir terim eşitliğin öbür yanına geçerken işareti değişmemiş (a + b = c → a = c + b) ya da çarpan /
 *     bölen karşıya geçerken işlem tersine çevrilmemiş (3x = 15 → x = 45),
 *   - birim: aynı değer dönüşüm çarpanı olmadan başka birimle yazılmış (150 cm → 150 m),
 *   - kopuk zincir: satır önceki satırla hiçbir terim ya da sayı paylaşmıyor — yalnız not, puan düşürmez.
 * Kavram ve eksik adım kararı modelden gelir (`open-grade.ts`); `mergeStepVerdicts` ikisini birleştirir.
 */

import { closeValues, evaluate, segmentValue, stepArithmeticCheck } from "@/lib/solve/step-arithmetic";

export type WorkStepKind = "islem" | "isaret" | "birim" | "kavram" | "eksik";
export type WorkStepStatus = "ok" | "error" | "unknown";

export type WorkStepVerdict = {
  /** Satır numarası (1'den). */
  n: number;
  text: string;
  status: WorkStepStatus;
  kind?: WorkStepKind;
  /** Öğrenciye gidecek kısa not. */
  note?: string;
};

export type WorkStepKindInput = WorkStepKind | string | null | undefined;

/** En çok bu kadar satır incelenir; kalanı okunur ama değerlendirilmez. */
export const WORK_MAX_LINES = 24;

/** Kâğıt okuyucunun okuyamadığı satırın yerine yazdığı işaret: sıra bozulmaz, satır sınanmaz. */
export const UNREADABLE_LINE_MARK = "[okunamadı]";

export const WORK_STEP_KINDS: readonly WorkStepKind[] = ["islem", "isaret", "birim", "kavram", "eksik"];

/** Hata türünün öğrenciye söylenen adı; cümle `stepFeedbackLine` ve `firstErrorSentence`'ta kurulur. */
export const STEP_KIND_LABEL: Record<WorkStepKind, string> = {
  islem: "işlem hatası",
  isaret: "işaret hatası",
  birim: "birim hatası",
  kavram: "kavram hatası",
  eksik: "eksik adım",
};

const SIGN_MOVE_NOTE = "terim karşıya geçerken işareti değişmemiş";
const SCALE_MOVE_NOTE = "çarpan karşıya geçerken bölmeye dönmemiş";
const DIVISOR_MOVE_NOTE = "bölen karşıya geçerken çarpmaya dönmemiş";
const UNIT_NOTE = "aynı değer dönüşüm yapılmadan başka birimle yazılmış";
const UNIT_CONVERSION_NOTE = "birim dönüşümü tutmuyor";
const BROKEN_CHAIN_NOTE = "önceki satırla bağı görünmüyor";
const UNREADABLE_NOTE = "bu satır okunamadı";

const SEGMENT_SPLIT = /=|⇒|→/;
const LINE_NUMBER_PREFIX = /^\(?\d{1,2}[.)]\s+/;

export function isWorkStepKind(value: unknown): value is WorkStepKind {
  return typeof value === "string" && (WORK_STEP_KINDS as readonly string[]).includes(value);
}

/**
 * Cevabı çözüm satırlarına böler: satır sonu; tek satırsa ";" ve "⇒ / →" zincirleri. Baştaki satır numarası
 * ("1.", "2)") atılır; boş satır düşer; en çok `WORK_MAX_LINES`.
 */
export function splitWorkLines(answer: string): string[] {
  const raw = answer
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const lines = raw.length === 1 ? raw[0]!.split(/;|⇒|→/).map((part) => part.trim()).filter(Boolean) : raw;
  return lines.map((line) => line.replace(LINE_NUMBER_PREFIX, "").trim()).filter(Boolean).slice(0, WORK_MAX_LINES);
}

/* ---------- cebir yardımcıları ---------- */

type Term = { sign: 1 | -1; body: string; key: string };

function normalizeExpression(text: string): string {
  return text
    .trim()
    .replace(/[−–]/g, "-")
    .replace(/[·×∙]/g, "*")
    .replace(/÷/g, "/")
    .replace(/(\d),(\d)/g, "$1.$2")
    .replace(/\s+/g, "");
}

/** Terim anahtarı: hesaplanabilen gövde değeriyle, öbürü metniyle eşlenir. */
function termKey(body: string): string {
  const value = evaluate(body);
  return value === null ? body : `#${Math.round(value * 1e9) / 1e9}`;
}

/** İfadenin en üst düzeydeki toplamsal terimleri (parantez içi bölünmez); ayrıştırılamazsa null. */
function additiveTerms(expression: string): Term[] | null {
  const src = normalizeExpression(expression);
  if (!src) return null;
  const terms: Term[] = [];
  let depth = 0;
  let start = 0;
  let sign: 1 | -1 = 1;
  let index = 0;
  if (src[0] === "+" || src[0] === "-") {
    sign = src[0] === "-" ? -1 : 1;
    start = 1;
    index = 1;
  }
  for (; index < src.length; index += 1) {
    const ch = src[index];
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    else if ((ch === "+" || ch === "-") && depth === 0) {
      const before = src.slice(0, index);
      // "2*-3", "x^-1", "(-2", "2e-3": işaret, terim ayracı değil.
      if (/[*/^(]$/.test(before) || /\d[eE]$/.test(before)) continue;
      const body = src.slice(start, index);
      if (!body) return null;
      terms.push({ sign, body, key: termKey(body) });
      sign = ch === "-" ? -1 : 1;
      start = index + 1;
    }
  }
  const last = src.slice(start);
  if (depth !== 0 || !last) return null;
  terms.push({ sign, body: last, key: termKey(last) });
  return terms;
}

function multisetMinus(a: Term[], b: Term[], withSign: boolean): Term[] {
  const pool = b.map((term) => (withSign ? `${term.sign}${term.key}` : term.key));
  const out: Term[] = [];
  for (const term of a) {
    const id = withSign ? `${term.sign}${term.key}` : term.key;
    const at = pool.indexOf(id);
    if (at >= 0) pool.splice(at, 1);
    else out.push(term);
  }
  return out;
}

type Equation = { left: string; right: string; last: string };

/** "A = B = C" → sol A, ilk sağ B, son parça C. Tek parçalı satır denklem değildir. */
function equationOf(line: string): Equation | null {
  if (/[<>≤≥≈≠]/.test(line)) return null;
  const parts = line.split(SEGMENT_SPLIT).map((part) => part.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  return { left: parts[0]!, right: parts[1]!, last: parts[parts.length - 1]! };
}

/**
 * Toplamsal taşıma: önceki satır A = B, bu satır C = D. A'dan tam bir terim eksilip D'ye eklenmişse (ya da
 * tersi) işareti değişmiş olmalı. "ok" doğru taşıma, "error" işaret hatası, null karar yok.
 */
function additiveMove(prev: Equation, cur: Equation): "ok" | "error" | null {
  const a = additiveTerms(prev.left);
  const b = additiveTerms(prev.last);
  const c = additiveTerms(cur.left);
  const d = additiveTerms(cur.right);
  if (!a || !b || !c || !d) return null;
  const judge = (fromBefore: Term[], fromAfter: Term[], toBefore: Term[], toAfter: Term[]): "ok" | "error" | null => {
    const left = multisetMinus(fromBefore, fromAfter, true);
    const stayed = multisetMinus(fromAfter, fromBefore, true);
    if (left.length !== 1 || stayed.length) return null;
    const moved = left[0]!;
    const added = multisetMinus(toAfter, toBefore, false);
    const lost = multisetMinus(toBefore, toAfter, false);
    if (added.length !== 1 || lost.length || added[0]!.key !== moved.key) return null;
    return added[0]!.sign === moved.sign ? "error" : "ok";
  };
  return judge(a, c, b, d) ?? judge(b, d, a, c);
}

/**
 * Çarpımsal taşıma: "k·X = R" → "X = R/k" ya da "X/k = R" → "X = R·k". Yalnız R ve D sayıysa karar verir.
 */
function scaleMove(prev: Equation, cur: Equation): { verdict: "ok" | "error"; note: string } | null {
  const left = normalizeExpression(prev.left);
  const nextLeft = normalizeExpression(cur.left);
  if (!left || !nextLeft || /[+-]/.test(left.replace(/^[+-]/, "")) || evaluate(nextLeft) !== null) return null;
  const before = segmentValue(prev.last);
  const after = segmentValue(cur.right);
  if (before === null || after === null) return null;
  const product = left.match(/^(\d+(?:\.\d+)?)\*?(.+)$/);
  if (product && normalizeExpression(product[2]!) === nextLeft) {
    const factor = Number(product[1]);
    if (!factor) return null;
    if (closeValues(after, before / factor)) return { verdict: "ok", note: "" };
    if (closeValues(after, before * factor)) return { verdict: "error", note: SCALE_MOVE_NOTE };
    return null;
  }
  const quotient = left.match(/^(.+)\/(\d+(?:\.\d+)?)$/);
  if (quotient && normalizeExpression(quotient[1]!) === nextLeft) {
    const divisor = Number(quotient[2]);
    if (!divisor) return null;
    if (closeValues(after, before * divisor)) return { verdict: "ok", note: "" };
    if (closeValues(after, before / divisor)) return { verdict: "error", note: DIVISOR_MOVE_NOTE };
    return null;
  }
  return null;
}

/* ---------- birim ---------- */

const VALUE_UNIT = /^(-?\d+(?:[.,]\d+)?)(\s*)([a-zA-ZçğıöşüÇĞİÖŞÜµΩ°%]+[²³]?(?:\/[a-zA-ZçğıöşüÇĞİÖŞÜµΩ°]+[²³]?)?)$/u;
/** Sayıya bitişik tek harf değişkendir ("2x"); bu harfler bitişik yazılınca da birimdir. */
const GLUED_SINGLE_UNIT = /^[mgsNJWVALKΩ°%]$/;
const UNIT_ALIAS: Record<string, string> = {
  sn: "s",
  san: "s",
  saniye: "s",
  sa: "h",
  saat: "h",
  dk: "min",
  dak: "min",
  dakika: "min",
  lt: "l",
  litre: "l",
  gr: "g",
  gram: "g",
  metre: "m",
  santimetre: "cm",
  milimetre: "mm",
  kilometre: "km",
  kilogram: "kg",
  derece: "°",
};

/** Yazılı birim adı simgeye; simgenin büyük/küçük harfi korunur (M mega, m mili). */
function canonicalUnit(unit: string): string {
  return unit
    .split("/")
    .map((part) => UNIT_ALIAS[part.toLocaleLowerCase("tr")] ?? part)
    .join("/");
}

/** "mL" ile "ml" aynı birimdir: yalnız harf büyüklüğü farkı birim farkı sayılmaz. */
function sameUnit(a: string, b: string): boolean {
  return a === b || a.toLowerCase() === b.toLowerCase();
}

type Quantity = { value: number; unit: string };

function valueWithUnit(segment: string): Quantity | null {
  const match = segment.trim().match(VALUE_UNIT);
  if (!match) return null;
  const [, number, gap, unit] = match;
  if (!gap && unit!.length === 1 && !GLUED_SINGLE_UNIT.test(unit!)) return null;
  const value = Number(number!.replace(",", "."));
  return Number.isFinite(value) ? { value, unit: canonicalUnit(unit!) } : null;
}

/** SI ön ekleri ve zaman birimleri: iki birim aynı tabanı paylaşıyorsa dönüşüm çarpanı bilinir. */
const SI_PREFIX: Record<string, number> = { G: 1e9, M: 1e6, k: 1e3, h: 1e2, da: 1e1, d: 1e-1, c: 1e-2, m: 1e-3, "µ": 1e-6, u: 1e-6, n: 1e-9 };
const TIME_SECONDS: Record<string, number> = { s: 1, min: 60, h: 3600 };

function prefixSplits(unit: string): Array<{ factor: number; base: string }> {
  const out = [{ factor: 1, base: unit }];
  for (const [prefix, factor] of Object.entries(SI_PREFIX)) {
    if (unit.length > prefix.length && unit.startsWith(prefix)) out.push({ factor, base: unit.slice(prefix.length) });
  }
  return out;
}

function simpleFactor(from: string, to: string): number | null {
  const power = (unit: string) => (unit.endsWith("²") ? 2 : unit.endsWith("³") ? 3 : 1);
  if (power(from) !== power(to)) return null;
  const exponent = power(from);
  const baseFrom = from.replace(/[²³]$/u, "");
  const baseTo = to.replace(/[²³]$/u, "");
  const timeFrom = TIME_SECONDS[baseFrom];
  const timeTo = TIME_SECONDS[baseTo];
  if (timeFrom && timeTo) return (timeFrom / timeTo) ** exponent;
  for (const a of prefixSplits(baseFrom)) {
    for (const b of prefixSplits(baseTo)) {
      if (a.base && a.base.toLowerCase() === b.base.toLowerCase()) return (a.factor / b.factor) ** exponent;
    }
  }
  return null;
}

/** `from` birimindeki değeri `to` birimine çeviren çarpan; taban farklıysa (m ↔ kg) null. */
export function unitConversionFactor(from: string, to: string): number | null {
  if (sameUnit(from, to)) return 1;
  const [fromTop, fromBottom] = from.split("/");
  const [toTop, toBottom] = to.split("/");
  if ((fromBottom === undefined) !== (toBottom === undefined)) return null;
  const top = simpleFactor(fromTop!, toTop!);
  const bottom = fromBottom === undefined ? 1 : simpleFactor(fromBottom, toBottom!);
  return top == null || bottom == null ? null : top / bottom;
}

/**
 * İki nicelik arasında birim kararı: aynı birim → karar yok; dönüşüm biliniyorsa tutuyor/tutmuyor; bilinmiyorsa
 * yalnız "aynı sayı, başka birim" hata sayılır (dönüşüm yapılmamış).
 */
function unitVerdict(a: Quantity, b: Quantity): { status: "ok" | "error"; note: string } | null {
  if (sameUnit(a.unit, b.unit)) return null;
  const factor = unitConversionFactor(a.unit, b.unit);
  if (factor != null && closeValues(a.value * factor, b.value)) return { status: "ok", note: "" };
  // Sayı aynen taşınmış: dönüşüm hiç yapılmamış ("150 cm" → "150 m").
  if (closeValues(a.value, b.value)) return { status: "error", note: UNIT_NOTE };
  return factor != null ? { status: "error", note: UNIT_CONVERSION_NOTE } : null;
}

/** Satır içinde ardışık birimli parçalar ("150 cm = 1,5 m", "150 cm = 150 m"). İlk hata ya da ilk "ok". */
function unitCheckInLine(line: string): { status: "ok" | "error"; note: string } | null {
  const parts = line.split(SEGMENT_SPLIT).map((part) => valueWithUnit(part));
  let ok: { status: "ok" | "error"; note: string } | null = null;
  for (let i = 1; i < parts.length; i += 1) {
    const a = parts[i - 1];
    const b = parts[i];
    if (!a || !b) continue;
    const verdict = unitVerdict(a, b);
    if (verdict?.status === "error") return verdict;
    ok = ok ?? verdict;
  }
  return ok;
}

/**
 * Satırın hesabı birim değişen yerde kesilerek sınanır: "150 cm = 1,5 m" bir dönüşümdür, 150 ≠ 1,5 diye işlem hatası
 * değildir. Birimsiz parçalar önceki birimin zincirinde kalır ("3·50 = 150 cm").
 */
function arithmeticByUnitRuns(line: string): { issues: string[]; verified: number } {
  if (/[<>≤≥≈≠]/.test(line)) return { issues: [], verified: 0 };
  const runs: string[][] = [[]];
  let currentUnit: string | null = null;
  for (const part of line.split(SEGMENT_SPLIT).map((item) => item.trim()).filter(Boolean)) {
    const unit = valueWithUnit(part)?.unit ?? null;
    if (unit && currentUnit && !sameUnit(unit, currentUnit)) runs.push([]);
    if (unit) currentUnit = unit;
    runs[runs.length - 1]!.push(part);
  }
  return runs.reduce(
    (sum, run) => {
      const check = stepArithmeticCheck(run.join(" = "));
      return { issues: [...sum.issues, ...check.issues], verified: sum.verified + check.verified };
    },
    { issues: [] as string[], verified: 0 },
  );
}

const variableKey = (text: string) => text.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]/gu, "");

/** Satırlar arasında: aynı değişkenin değeri başka birimle ("x = 150 cm" → "x = 150 m" hata, "x = 1,5 m" dönüşüm). */
function unitCheckAcross(prev: Equation, cur: Equation): { status: "ok" | "error"; note: string } | null {
  if (variableKey(prev.left) !== variableKey(cur.left) || !variableKey(cur.left)) return null;
  const before = valueWithUnit(prev.last);
  const after = valueWithUnit(cur.last);
  return before && after ? unitVerdict(before, after) : null;
}

/* ---------- kopuk zincir ---------- */

function tokensOf(line: string): Set<string> {
  const out = new Set<string>();
  for (const match of normalizeExpression(line).matchAll(/\p{L}+|\d+(?:\.\d+)?/gu)) {
    const token = match[0]!.toLocaleLowerCase("tr");
    out.add(/^\d/.test(token) ? `#${Number(token)}` : token);
  }
  return out;
}

/** Bu satır öncekiyle hiçbir harf dizisi ya da sayı paylaşmıyor; yalnız denklemli ve sayılı satırlarda bakılır. */
function brokenChain(prevLine: string, line: string): boolean {
  if (!/=/.test(line) || !/\d/.test(line) || !/=/.test(prevLine) || !/\d/.test(prevLine)) return false;
  const previous = tokensOf(prevLine);
  for (const token of tokensOf(line)) if (previous.has(token)) return false;
  return true;
}

/* ---------- satır satır karar ---------- */

/** Satırları modelsiz denetler; sıra kâğıttaki sıradır. */
export function analyzeWorkSteps(answer: string | string[]): WorkStepVerdict[] {
  const lines = Array.isArray(answer) ? answer.slice(0, WORK_MAX_LINES) : splitWorkLines(answer);
  const out: WorkStepVerdict[] = [];
  let previous: { line: string; equation: Equation | null } | null = null;
  lines.forEach((text, index) => {
    const n = index + 1;
    if (text === UNREADABLE_LINE_MARK) {
      out.push({ n, text, status: "unknown", note: UNREADABLE_NOTE });
      previous = null;
      return;
    }
    const equation = equationOf(text);
    const arithmetic = arithmeticByUnitRuns(text);
    const units = unitCheckInLine(text) ?? (previous?.equation && equation ? unitCheckAcross(previous.equation, equation) : null);
    let verdict: WorkStepVerdict = { n, text, status: arithmetic.verified > 0 || units?.status === "ok" ? "ok" : "unknown" };
    if (arithmetic.issues.length) {
      verdict = { n, text, status: "error", kind: "islem", note: `hesap tutmuyor: ${arithmetic.issues[0]}` };
    } else if (previous?.equation && equation) {
      const move = additiveMove(previous.equation, equation);
      const scale = move === null ? scaleMove(previous.equation, equation) : null;
      if (move === "error") verdict = { n, text, status: "error", kind: "isaret", note: SIGN_MOVE_NOTE };
      else if (scale?.verdict === "error") verdict = { n, text, status: "error", kind: "isaret", note: scale.note };
      else if (move === "ok" || scale?.verdict === "ok") verdict = { n, text, status: "ok" };
    }
    if (verdict.status !== "error" && units?.status === "error") {
      verdict = { n, text, status: "error", kind: "birim", note: units.note };
    }
    if (verdict.status !== "error" && previous && brokenChain(previous.line, text)) {
      verdict = { ...verdict, note: BROKEN_CHAIN_NOTE };
    }
    out.push(verdict);
    previous = { line: text, equation };
  });
  return out;
}

export function firstError(steps: readonly WorkStepVerdict[]): WorkStepVerdict | null {
  return steps.find((step) => step.status === "error") ?? null;
}

/** Kayda ve ekrana giden özet: `{ line, kind, note }`. */
export function firstErrorSummary(steps: readonly WorkStepVerdict[]): { line: number; kind?: WorkStepKind; note?: string } | null {
  const step = firstError(steps);
  if (!step) return null;
  return { line: step.n, ...(step.kind ? { kind: step.kind } : {}), ...(step.note ? { note: step.note } : {}) };
}

/** "3. satırda işaret hatası: terim karşıya geçerken işareti değişmemiş." */
export function firstErrorSentence(error: { line: number; kind?: WorkStepKindInput; note?: string | null }): string {
  const label = isWorkStepKind(error.kind) ? STEP_KIND_LABEL[error.kind] : "hata";
  const note = error.note?.trim();
  return `${error.line}. satırda ${label}${note ? `: ${note}` : ""}.`;
}

/**
 * Tek cümlelik geri bildirim: "{k−1}. satıra kadar kurulumun doğru; {k}. satırda {tür}: {not}."
 * k = 1 ise "İlk satırdan itibaren {tür}…". Hata yoksa null.
 */
export function stepFeedbackLine(steps: readonly WorkStepVerdict[], total: number = steps.length): string | null {
  const error = firstError(steps);
  if (!error || total <= 0) return null;
  const label = error.kind ? STEP_KIND_LABEL[error.kind] : "hata";
  const note = error.note?.trim();
  const tail = `${label}${note ? `: ${note}` : ""}.`;
  if (error.n <= 1) return `İlk satırdan itibaren ${tail}`;
  return `${error.n - 1}. satıra kadar kurulumun doğru; ${error.n}. satırda ${tail}`;
}

/**
 * Kod ve model kararını birleştirir. Hesap, işaret ve birimde kod kazanır (deterministik); kavram ve eksik adımda
 * model. Kodun sayıyla doğruladığı ("ok") satıra model yalnız kavram ya da eksik adım diyebilir, işlem/işaret/birim
 * diyemez. Kodun bilmediği ("unknown") satırda modelin "ok" kararı kabul edilir.
 */
export function mergeStepVerdicts(code: readonly WorkStepVerdict[], model: readonly WorkStepVerdict[]): WorkStepVerdict[] {
  const byLine = new Map(model.map((step) => [step.n, step]));
  return code.map((step) => {
    const judged = byLine.get(step.n);
    if (!judged || step.status === "error") return step;
    if (judged.status === "error") {
      const kind = judged.kind ?? "kavram";
      const conceptual = kind === "kavram" || kind === "eksik";
      if (!conceptual && step.status === "ok") return step;
      return { n: step.n, text: step.text, status: "error", kind, ...(judged.note ? { note: judged.note } : {}) };
    }
    if (judged.status === "ok" && step.status === "unknown") return { ...step, status: "ok" };
    return step;
  });
}

/**
 * Kayda (`feedback` jsonb) giden adım alanları: `steps`, `firstError` ve tek cümlelik `step`. Satır cümlesi varsa
 * puan notunun (`scoreNote`, ör. "Kurulum doğru; son aritmetik adım hatalı.") yerine geçer; yoksa puan notu kalır.
 * Adım yoksa yalnız puan notu — eski kayıt biçimi değişmez.
 */
export function workStepFeedback(steps: readonly WorkStepVerdict[], scoreNote?: string): Record<string, unknown> {
  const first = firstErrorSummary(steps);
  const note = stepFeedbackLine(steps) ?? scoreNote;
  return {
    ...(steps.length ? { steps: [...steps] } : {}),
    ...(first ? { firstError: first } : {}),
    ...(note ? { step: note } : {}),
  };
}

/** Model notu en çok 15 kelime; öğrenciye gidecek dilde. */
function clampNote(value: unknown): string {
  return typeof value === "string" ? value.trim().split(/\s+/).slice(0, 15).join(" ").slice(0, 160) : "";
}

/**
 * Modelin satır kararları (`{"n":3,"ok":false,"kind":"isaret","note":"…"}`), öğrencinin satırlarına bağlanır.
 * Satır dışı numara, `ok` olmayan ya da yinelenen satır düşer; türsüz hata kavram hatası sayılır.
 */
export function parseModelSteps(raw: unknown, lines: readonly string[]): WorkStepVerdict[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: WorkStepVerdict[] = [];
  for (const item of raw) {
    const row = (item ?? {}) as Record<string, unknown>;
    const n = Number(row.n);
    const text = lines[n - 1];
    if (!Number.isInteger(n) || n < 1 || text === undefined || seen.has(n) || typeof row.ok !== "boolean") continue;
    seen.add(n);
    if (row.ok) {
      out.push({ n, text, status: "ok" });
      continue;
    }
    const note = clampNote(row.note);
    out.push({ n, text, status: "error", kind: isWorkStepKind(row.kind) ? row.kind : "kavram", ...(note ? { note } : {}) });
  }
  return out.sort((a, b) => a.n - b.n);
}

/** Kayıttaki (`feedback.steps`) satır listesi; bozuk satır düşer. Eski kayıtta alan yok → boş. */
export function parseStoredSteps(raw: unknown): WorkStepVerdict[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<number>();
  const out: WorkStepVerdict[] = [];
  for (const item of raw) {
    const row = (item ?? {}) as Record<string, unknown>;
    const n = Number(row.n);
    const status = row.status;
    if (!Number.isInteger(n) || n < 1 || seen.has(n) || typeof row.text !== "string") continue;
    if (status !== "ok" && status !== "error" && status !== "unknown") continue;
    seen.add(n);
    const note = clampNote(row.note);
    out.push({
      n,
      text: row.text,
      status,
      ...(isWorkStepKind(row.kind) ? { kind: row.kind } : {}),
      ...(note ? { note } : {}),
    });
  }
  return out.sort((a, b) => a.n - b.n);
}

/** Kayıttaki `feedback.firstError`; yoksa adımlardan türetilir. */
export function parseStoredFirstError(
  raw: unknown,
  steps: readonly WorkStepVerdict[],
): { line: number; kind?: WorkStepKind; note?: string } | null {
  const row = raw && typeof raw === "object" ? (raw as Record<string, unknown>) : null;
  const line = Number(row?.line);
  if (row && Number.isInteger(line) && line >= 1) {
    const note = clampNote(row.note);
    return { line, ...(isWorkStepKind(row.kind) ? { kind: row.kind } : {}), ...(note ? { note } : {}) };
  }
  return firstErrorSummary(steps);
}
