/**
 * Stage 7 — ordered validation pipeline for pdf_learning_v2.
 *
 * Order (fail-fast):
 * 1. structural → 2. source → 3. domain → 4. pedagogy
 * Then (caller): 5. repair → 6. recheck → 7. safe outcome
 *
 * Independent (non-LLM) checks are preferred where cheap. A second model
 * call alone is never treated as a correctness guarantee.
 */

import { foldTr } from "@/lib/documents/page-analysis";
import { lessonHasTeachingCore, lessonPublishIssues, publishLessonDraft } from "@/lib/learning/teaching-standards";

export type ValidationStage =
  | "structural"
  | "source"
  | "domain"
  | "pedagogy"
  | "repair"
  | "recheck"
  | "safe_outcome";

export type ValidationIssue = {
  stage: ValidationStage;
  code: string;
  message: string;
};

export type ValidationMetrics = {
  generationMs: number;
  validationMs: number;
  stagesMs: Partial<Record<ValidationStage, number>>;
  failedStage: ValidationStage | null;
  failureCodes: string[];
  repairAttempted: boolean;
  recheckPassed: boolean | null;
  outcome: "accepted" | "rejected" | "validator_unavailable";
};

export type IndependentValidationInput = {
  /** Raw JSON string or object from the model. */
  draft: unknown;
  /** Parsed object when JSON.parse succeeded; null if invalid JSON. */
  parsed: unknown | null;
  /** Deterministic pedagogy / activity-specific issues (Stage 5 validators). */
  pedagogyIssues?: string[];
  /** Declared source page numbers from session / topic map. */
  sourcePages?: number[];
  /** Whether document-backed generation requires non-empty source support. */
  requireSourceSupport?: boolean;
  /** Non-empty source excerpt / block when documents_only. */
  sourceExcerpt?: string;
  /** Expected minimum item count (questions / cards / statements). */
  minItems?: number;
  /** Soft domain: subject hint for heuristic checks. */
  subjectHint?: string;
};

export type IndependentValidationResult = {
  ok: boolean;
  issues: ValidationIssue[];
  failedStage: ValidationStage | null;
  stagesMs: Partial<Record<ValidationStage, number>>;
};

const STAGE_ORDER = ["structural", "source", "domain", "pedagogy"] as const;

function issue(
  stage: ValidationStage,
  code: string,
  message: string,
): ValidationIssue {
  return { stage, code, message };
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

function collectItems(parsed: unknown): unknown[] {
  const row = asRecord(parsed);
  if (!row) return [];
  for (const key of ["questions", "items", "cards", "chapters", "sections"]) {
    if (Array.isArray(row[key])) return row[key] as unknown[];
  }
  return [];
}

function emptyish(value: unknown): boolean {
  if (value == null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  return false;
}

/**
 * Ucuz aritmetik denetimi: "2+2=4", "3×4=12" gibi parçalar.
 *
 * DENETÇİ İKİ KEZ DOĞRU DERSİ REDDETTİ; ikisi de burada düzeltildi.
 *
 * 1. YUVARLAMA. Ders "0,54 / 1,54 = 0,351" yazdı. Doğrusu 0,35064…; üç
 *    basamağa yuvarlanmış hâli tam olarak 0,351. Denetim 1e-6 mutlak fark
 *    istediği için bunu hata saydı. Oysa ders kitabı da yuvarlar. Hoşgörü
 *    artık iddianın YAZILDIĞI basamağa göre: üç basamak yazılmışsa yarım
 *    birim sapma kabul, dördüncü basamakta değil.
 *
 * 2. ZİNCİR. Ders "3,24 × 9,81 / 1,54 = 20,64" yazdı. Denetim zincirin
 *    ortasından "9,81 / 1,54"ü koparıp sonuçla karşılaştırdı ve tutmadı.
 *    Üç terimli bir işlemin son iki terimi tek başına sonucu vermez.
 *    Eşleşmenin solunda bir işleç varsa parça bir zincirin ortasıdır ve
 *    tek başına denetlenemez.
 *
 * Yanlış alarmın bedeli görünmez ve ağır: taslak reddedilir, üç deneme de
 * düşerse ders yedek yoldan — daha kötü hâliyle — öğrenciye gider.
 */
export function checkSimpleMathClaims(text: string): string[] {
  const issues: string[] = [];
  const eq = /(?<![\d.,\w])([−-]?\d+(?:[.,]\d+)?)\s*([+\-−×x*÷/])\s*([−-]?\d+(?:[.,]\d+)?)\s*=\s*([−-]?\d+(?:[.,]\d+)?)(?![\d.,/])/gi;
  let match: RegExpExecArray | null;
  while ((match = eq.exec(text)) !== null) {
    // Zincirin ortası mı? Solunda bir işleç varsa evet.
    const before = text.slice(0, match.index).trimEnd();
    if (/[+\-−×x*÷/]$/i.test(before)) continue;

    const number = (value: string) => Number(value.replace("−", "-").replace(",", "."));
    const a = number(match[1]);
    const op = match[2];
    const b = number(match[3]);
    const claimedText = match[4];
    const claimed = number(claimedText);
    if (![a, b, claimed].every((n) => Number.isFinite(n))) continue;
    let expected: number | null = null;
    if (op === "+" || op === "-" || op === "−") expected = op === "+" ? a + b : a - b;
    else if (op === "×" || op === "x" || op === "*") expected = a * b;
    else if (op === "÷" || op === "/") expected = b === 0 ? null : a / b;
    if (expected == null) continue;

    // Yazılan basamak kadar hoşgörü: "0,351" için yarım binde bir.
    const decimals = claimedText.split(/[.,]/)[1]?.length ?? 0;
    const tolerance = decimals > 0 ? 0.5 * 10 ** -decimals : 1e-6;
    if (Math.abs(expected - claimed) > tolerance) {
      issues.push(`Hesap uyuşmazlığı: ${a}${op}${b}≠${claimed}`);
    }
  }
  return issues;
}

const PA_PER_MMHG = 101_325 / 760;

const PRESSURE_TO_PA: Record<string, number> = {
  pa: 1,
  kpa: 1_000,
  mpa: 1_000_000,
  bar: 100_000,
  atm: 101_325,
  mmhg: PA_PER_MMHG,
  torr: PA_PER_MMHG,
  psi: 6_894.757,
};

/** m³/kg */
const SPECIFIC_VOLUME_TO_BASE: Record<string, number> = {
  "m3/kg": 1,
  "l/kg": 0.001,
  "cm3/g": 0.001,
  "cm3/kg": 1e-6,
};

/** J/kg */
const SPECIFIC_ENERGY_TO_BASE: Record<string, number> = {
  "j/kg": 1,
  "kj/kg": 1_000,
  "mj/kg": 1_000_000,
  "j/g": 1_000,
  "kj/g": 1_000_000,
};

type UnitFamily = "pressure" | "temperature" | "specificVolume" | "specificEnergy";

type ParsedUnit = {
  family: UnitFamily;
  key: string;
  toBase: (value: number) => number;
  fromBase: (value: number) => number;
  /** Kelvin per degree. Only temperature scales. */
  intervalKelvin?: number;
};

/**
 * Uzun birimler önce. `K` ve `R` sonda: aksi halde `kPa` içindeki k
 * kelvin sanılır.
 */
const UNIT_TOKEN =
  "(?:mm\\s*Hg|mmHg|torr|m³/kg|m3/kg|cm³/g|cm3/g|cm³/kg|cm3/kg|L/kg|l/kg|kJ/kg|MJ/kg|J/kg|kJ/g|J/g|°\\s*[CFRc]|℃|º\\s*C|MPa|kPa|Pa|bar|atm|psi|K|R)";
const NUM_TOKEN = "[−-]?\\d+(?:[.,]\\d+)?";
const OP_TOKEN = "[+−\\-×x*÷/]";

function parseDecimal(raw: string): number {
  return Number(raw.replace("−", "-").replace(",", "."));
}

function canonicalUnitKey(raw: string): string {
  return raw
    .replace(/\s+/g, "")
    .replace(/º/g, "°")
    .replace(/℃/g, "°c")
    .replace(/³/g, "3")
    .toLowerCase();
}

function temperatureUnit(key: "c" | "k" | "f" | "r"): ParsedUnit {
  if (key === "c") {
    return {
      family: "temperature",
      key,
      intervalKelvin: 1,
      toBase: (value) => value + 273.15,
      fromBase: (value) => value - 273.15,
    };
  }
  if (key === "k") {
    return {
      family: "temperature",
      key,
      intervalKelvin: 1,
      toBase: (value) => value,
      fromBase: (value) => value,
    };
  }
  if (key === "f") {
    return {
      family: "temperature",
      key,
      intervalKelvin: 5 / 9,
      toBase: (value) => ((value - 32) * 5) / 9 + 273.15,
      fromBase: (value) => ((value - 273.15) * 9) / 5 + 32,
    };
  }
  return {
    family: "temperature",
    key,
    intervalKelvin: 5 / 9,
    toBase: (value) => (value * 5) / 9,
    fromBase: (value) => (value * 9) / 5,
  };
}

function scaledUnit(
  family: Exclude<UnitFamily, "temperature">,
  key: string,
  factor: number,
): ParsedUnit {
  return {
    family,
    key,
    toBase: (value) => value * factor,
    fromBase: (value) => value / factor,
  };
}

function parseUnitToken(raw: string | undefined): ParsedUnit | null {
  if (!raw) return null;
  const key = canonicalUnitKey(raw);
  if (key === "°c" || key === "c") return temperatureUnit("c");
  if (key === "°f" || key === "f") return temperatureUnit("f");
  if (key === "°r") return temperatureUnit("r");
  if (key === "k") return temperatureUnit("k");
  if (key === "r") return temperatureUnit("r");
  const pressure = PRESSURE_TO_PA[key];
  if (pressure) return scaledUnit("pressure", key, pressure);
  const volume = SPECIFIC_VOLUME_TO_BASE[key];
  if (volume) return scaledUnit("specificVolume", key, volume);
  const energy = SPECIFIC_ENERGY_TO_BASE[key];
  if (energy) return scaledUnit("specificEnergy", key, energy);
  return null;
}

type TemperatureVerdict = "ok" | "mismatch" | "uncertain";

/**
 * Sıcaklık eşitliği ya bir aralık ya da mutlak dönüşümdür.
 * Aralık: 1 K = 1 °C, 1.8 °F = 1 °C. Sıfır aralık her ölçekte
 * tutar; "0 °C = 0 K" aralık diye kabul edilmez.
 * Mutlak: T(K) = T(°C) + 273.15, 25 °C ≈ 298 K.
 * İkisi de tutmuyorsa ama yakınsa uyarı. Uzaksa kesindir.
 */
function temperatureEqualityVerdict(
  left: number,
  leftUnit: ParsedUnit,
  right: number,
  rightUnit: ParsedUnit,
): TemperatureVerdict {
  const leftStep = leftUnit.intervalKelvin ?? 1;
  const rightStep = rightUnit.intervalKelvin ?? 1;
  const leftInterval = left * leftStep;
  const rightInterval = right * rightStep;
  const intervalScale = Math.max(Math.abs(leftInterval), Math.abs(rightInterval), 1e-9);
  const intervalMeaningful = Math.max(Math.abs(left), Math.abs(right)) >= 0.05;
  if (intervalMeaningful && Math.abs(leftInterval - rightInterval) / intervalScale <= 0.02) {
    return "ok";
  }
  const leftK = leftUnit.toBase(left);
  const rightK = rightUnit.toBase(right);
  const absDiff = Math.abs(leftK - rightK);
  const absScale = Math.max(Math.abs(leftK), Math.abs(rightK), 1);
  if (absDiff <= 0.6 || absDiff / absScale <= 0.002) return "ok";
  const intervalApprox =
    intervalMeaningful && Math.abs(leftInterval - rightInterval) / intervalScale <= 0.15;
  const absoluteApprox = absDiff <= 5 || absDiff / absScale <= 0.02;
  if (intervalApprox || absoluteApprox) return "uncertain";
  return "mismatch";
}

function closeEnough(expected: number, claimedRaw: string, claimed: number): boolean {
  const fraction = claimedRaw.split(/[.,]/)[1];
  const decimals = fraction?.length ?? 0;
  const tolerance = decimals > 0 ? 0.5 * 10 ** -decimals : 1e-6;
  if (Math.abs(expected - claimed) <= tolerance + 1e-9) return true;
  const scale = Math.max(Math.abs(expected), 1);
  return Math.abs(expected - claimed) / scale <= 0.005;
}

function precededByOperator(text: string, index: number): boolean {
  return new RegExp(`${OP_TOKEN}\\s*$`).test(text.slice(0, index));
}

type ChainSpan = { start: number; end: number };

type UnitEquality = {
  raw: string;
  index: number;
  verdict: "ok" | "mismatch" | "uncertain";
};

/**
 * Aynı nicelik, farklı birim, arada işlem yok.
 * Blok yalnız matematiksel olarak kesin yanlışta: 50 kPa = 5000 Pa.
 * Sıcaklıkta aralık (1 K = 1 °C) ve doğru mutlak dönüşüm geçer.
 * Emin olunamayan eşitlik uyarıdır, dersi düşürmez.
 */
function scanUnitEqualities(text: string): UnitEquality[] {
  const covered = chainSpans(text);
  const found: UnitEquality[] = [];
  const re = new RegExp(
    `(?<![\\d.,])(${NUM_TOKEN})\\s*(${UNIT_TOKEN})\\s*=\\s*(${NUM_TOKEN})\\s*(${UNIT_TOKEN})(?![\\d.,A-Za-z°º])`,
    "gi",
  );
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (covered.some((span) => match!.index >= span.start && match!.index < span.end)) continue;
    if (precededByOperator(text, match.index)) continue;
    const leftUnit = parseUnitToken(match[2]);
    const rightUnit = parseUnitToken(match[4]);
    if (!leftUnit || !rightUnit) continue;
    const left = parseDecimal(match[1]);
    const right = parseDecimal(match[3]);
    if (!Number.isFinite(left) || !Number.isFinite(right)) continue;
    let verdict: UnitEquality["verdict"] = "ok";
    if (leftUnit.family !== rightUnit.family) {
      verdict = "uncertain";
    } else if (leftUnit.key === rightUnit.key) {
      verdict = closeEnough(left, match[3], right) ? "ok" : "uncertain";
    } else if (leftUnit.family === "temperature") {
      verdict = temperatureEqualityVerdict(left, leftUnit, right, rightUnit);
    } else {
      const leftBase = leftUnit.toBase(left);
      const rightBase = rightUnit.toBase(right);
      const scale = Math.max(Math.abs(leftBase), Math.abs(rightBase), 1);
      verdict = Math.abs(leftBase - rightBase) / scale <= 0.02 ? "ok" : "mismatch";
    }
    found.push({ raw: match[0], index: match.index, verdict });
  }
  return found;
}

export function checkUnitConversionClaims(text: string): string[] {
  return scanUnitEqualities(text)
    .filter((item) => item.verdict === "mismatch")
    .map((item) => `Birim dönüşümü tutarsız: ${item.raw}`);
}

type ChainOp = "+" | "-" | "*" | "/";

function opOf(raw: string): ChainOp | null {
  if (raw === "+" ) return "+";
  if (raw === "-" || raw === "−" || raw === "–") return "-";
  if (raw === "*" || raw === "×" || raw === "x" || raw === "X") return "*";
  if (raw === "/" || raw === "÷") return "/";
  return null;
}

/**
 * "49.05 kPa + 95 kPa = 144.1 kPa" ve "101 kPa − 20 kPa = 81 kPa".
 * İki terimli birimsiz işlem `checkSimpleMathClaims`'e kalır.
 * Ayrıştırılamayan zincir hata değildir.
 */
export function checkCalculationChains(text: string): string[] {
  const issues: string[] = [];
  const re = new RegExp(
    `(?<![\\d.,])(${NUM_TOKEN}(?:\\s*${UNIT_TOKEN})?(?:\\s*${OP_TOKEN}\\s*${NUM_TOKEN}(?:\\s*${UNIT_TOKEN})?)+)\\s*=\\s*(${NUM_TOKEN})(?:\\s*(${UNIT_TOKEN}))?(?![\\d.,A-Za-z])`,
    "gi",
  );
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    if (precededByOperator(text, match.index)) continue;
    const verdict = evaluateChain(match[1], match[2], match[3]);
    if (verdict === "mismatch") issues.push(`Hesap uyuşmazlığı: ${match[0]}`);
  }
  return issues;
}

function evaluateChain(
  expr: string,
  claimedRaw: string,
  claimedUnitRaw: string | undefined,
): "ok" | "mismatch" | "uncertain" {
  const pieces = expr
    .split(new RegExp(`(${OP_TOKEN})`))
    .map((piece) => piece.trim())
    .filter(Boolean);
  if (pieces.length < 3 || pieces.length % 2 === 0) return "uncertain";
  const values: number[] = [];
  const units: Array<ParsedUnit | null> = [];
  const ops: ChainOp[] = [];
  for (let index = 0; index < pieces.length; index += 1) {
    const piece = pieces[index];
    if (index % 2 === 1) {
      const op = opOf(piece);
      if (!op) return "uncertain";
      ops.push(op);
      continue;
    }
    const term = piece.match(new RegExp(`^(${NUM_TOKEN})(?:\\s*(${UNIT_TOKEN}))?$`, "i"));
    if (!term) return "uncertain";
    const value = parseDecimal(term[1]);
    if (!Number.isFinite(value)) return "uncertain";
    const unit = term[2] ? parseUnitToken(term[2]) : null;
    if (term[2] && !unit) return "uncertain";
    values.push(value);
    units.push(unit);
  }
  const claimed = parseDecimal(claimedRaw);
  const claimedUnit = claimedUnitRaw ? parseUnitToken(claimedUnitRaw) : null;
  if (!Number.isFinite(claimed) || (claimedUnitRaw && !claimedUnit)) return "uncertain";
  const hasUnit = units.some(Boolean) || Boolean(claimedUnit);
  if (!hasUnit && ops.length === 1) return "uncertain";

  const families = new Set(
    [...units, claimedUnit].filter((unit): unit is ParsedUnit => Boolean(unit)).map((unit) => unit.family),
  );
  if (families.size > 1) return "uncertain";
  const family = [...families][0] ?? null;
  const additive = ops.every((op) => op === "+" || op === "-");
  let expected = Number.NaN;
  const expectedRaw = claimedRaw;
  if (additive && family === "pressure" && units.every(Boolean) && claimedUnit) {
    const baseValues = values.map((value, index) => units[index]!.toBase(value));
    expected = claimedUnit.fromBase(evalLeftToRight(baseValues, ops));
  } else if (additive && family === "temperature") {
    return "uncertain";
  } else if (units.every((unit) => !unit)) {
    expected = evalLeftToRight(values, ops);
  } else if (units.every((unit) => !unit || unit.key === units.find(Boolean)?.key)) {
    expected = evalLeftToRight(values, ops);
  } else {
    return "uncertain";
  }
  if (!Number.isFinite(expected)) return "uncertain";
  return closeEnough(expected, expectedRaw, claimed) ? "ok" : "mismatch";
}

function evalLeftToRight(values: number[], ops: ChainOp[]): number {
  const next = values.slice();
  const pending = ops.slice();
  for (let index = 0; index < pending.length; ) {
    if (pending[index] !== "*" && pending[index] !== "/") {
      index += 1;
      continue;
    }
    const combined =
      pending[index] === "*"
        ? next[index] * next[index + 1]
        : next[index + 1] === 0
          ? Number.NaN
          : next[index] / next[index + 1];
    next.splice(index, 2, combined);
    pending.splice(index, 1);
  }
  let acc = next[0] ?? Number.NaN;
  for (let index = 0; index < pending.length; index += 1) {
    acc = pending[index] === "+" ? acc + next[index + 1] : acc - next[index + 1];
  }
  return acc;
}

/** Emin olunamayan eşitlik uyarıdır. Ders bu yüzden düşmez. */
export function checkUncertainUnitClaims(text: string): string[] {
  return scanUnitEqualities(text)
    .filter((item) => item.verdict === "uncertain")
    .map((item) => `Birim eşitliği doğrulanamadı (uyarı): ${item.raw}`);
}

function chainSpans(text: string): ChainSpan[] {
  const re = new RegExp(
    `(?<![\\d.,])${NUM_TOKEN}(?:\\s*${UNIT_TOKEN})?(?:\\s*${OP_TOKEN}\\s*${NUM_TOKEN}(?:\\s*${UNIT_TOKEN})?)+\\s*=\\s*${NUM_TOKEN}(?:\\s*${UNIT_TOKEN})?(?![\\d.,A-Za-z])`,
    "gi",
  );
  return [...text.matchAll(re)].map((match) => ({
    start: match.index ?? 0,
    end: (match.index ?? 0) + match[0].length,
  }));
}

function deterministicMathErrors(text: string): string[] {
  if (!text) return [];
  return [
    ...checkSimpleMathClaims(text),
    ...checkCalculationChains(text),
    ...checkUnitConversionClaims(text),
  ];
}

/**
 * Aritmetik iddiası ancak deterministik kontrol de hata görürse kalır.
 * Kaynak/formül şikâyeti burada elenmez.
 */
export function isUnconfirmedMathAllegation(issue: string, draft: string): boolean {
  const folded = foldTr(issue);
  if (/kaynak|belge|materyal|ideal gaz|formul/.test(folded)) return false;
  const alleges = /\d/.test(issue) && /donus|cevril|hesap uyusmaz|birim donusumu tutarsiz|esit degil|birim/.test(folded);
  if (!alleges) return false;
  if (deterministicMathErrors(issue).length || deterministicMathErrors(draft).length) return false;
  return true;
}

export type IssueSeverity = "blocking" | "non_blocking";

export type IssueSeverityReport = {
  blocking: string[];
  nonBlocking: string[];
};

/**
 * Doğrulayıcı cümlesinin dersi düşürüp düşürmeyeceği.
 *
 * Varsayılan serbesttir. Bloklayan liste dardır: kaynakta olmadığı
 * söylenen belirli bir iddia, formül, sayı ya da örnek; denetçinin
 * doğruladığı yanlış işlem; uydurma; güvensiz içerik; gerçekten
 * okunamayan çıktı. "Net değil", "daha ayrıntılı olsun", bölüm sayısı
 * ve "doğrulanamıyor" dersi düşürmez.
 *
 * "Çıktı geçerli JSON değil" cümlesi tek başına kanıt değildir. Ayrıştırıcı
 * gerçekten okuyamazsa red `invalid_json` KODUYLA gelir.
 */
export function classifyVerifierIssue(message: string, draft = ""): IssueSeverity {
  const text = message.replace(/^\[[a-z_]+\]\s*/i, "").trim();
  if (!text) return "non_blocking";
  if (isConfirmedComputationIssue(text, draft)) return "blocking";
  if (isUnconfirmedMathAllegation(text, draft)) return "non_blocking";
  if (isBlockingAllowlist(foldTr(text), text, draft)) return "blocking";
  return "non_blocking";
}

function isConfirmedComputationIssue(issue: string, draft: string): boolean {
  const folded = foldTr(issue);
  const alleges =
    /\d/.test(issue) &&
    /donus|cevril|hesap uyusmaz|birim donusumu tutarsiz|esit degil/.test(folded);
  if (!alleges) return false;
  if (/kaynakta olmayan|dokumanda yer almiyor|belgede yer almiyor/.test(folded)) return false;
  return deterministicMathErrors(issue).length > 0 || deterministicMathErrors(draft).length > 0;
}

function schemaComplaintIsReal(draft: string): boolean {
  if (!draft.trim()) return true;
  try {
    return !lessonHasTeachingCore(JSON.parse(draft));
  } catch {
    return !lessonHasTeachingCore(draft);
  }
}

function isBlockingAllowlist(folded: string, original: string, draft = ""): boolean {
  if (/guvensiz icerik|zararli icerik|nefret soylemi|cinsel istismar|intihar yontemi/.test(folded)) {
    return true;
  }
  if (/\buydur/.test(folded)) return true;
  if (/bos alan:/.test(folded)) return true;
  if (/ders v2 semasini karsilamiyor|ders v2 cekirdegi yok/.test(folded)) {
    return schemaComplaintIsReal(draft);
  }
  if (isSpecificAbsence(folded, original)) return true;
  if (isSpecificWrongClaim(folded, original)) return true;
  return false;
}

function hasSpecificArtifact(original: string): boolean {
  if (/[''‘’"“”«»][^''‘’"“”«»]{12,}[''‘’"“”«»]/.test(original)) return true;
  if (/[A-Za-z]\s*=\s*[A-Za-z0-9]/.test(original)) return true;
  if (/\d+(?:[.,]\d+)?\s*(?:°\s*C|℃|MPa|kPa|Pa|bar|atm|K)\b/.test(original)) return true;
  return false;
}

function isSpecificAbsence(folded: string, original: string): boolean {
  const absent =
    /kaynakta olmayan|kaynakta yok|kaynak sayfalarda yer almiyor|dokumanda yer almiyor|belgede yer almiyor|belgede yok|bilgi yokken|kaynakta gecmiyor/.test(
      folded,
    );
  if (!absent) return false;
  const hedge =
    /dogrulanamiyor|materyalin tamami|yeterince degil|eksik ifade|daha detay|net degil|temellendirilmem/.test(
      folded,
    );
  const specific =
    hasSpecificArtifact(original) ||
    /formul|yasa|ornek|kavram|sayi|pv\s*=\s*nrt|ideal gaz|ozgul enerji/.test(folded);
  if (hedge && !specific) return false;
  return true;
}

function isSpecificWrongClaim(folded: string, original: string): boolean {
  if (
    /yetersiz|eksik ifade|daha detay|net degil|cok genel|asiri genel|dogrulanamiyor|temellendirilmem|yeterince degil|aciklanmali|anlamli hale|genel ve yuzeysel/.test(
      folded,
    )
  ) {
    return false;
  }
  const accuses =
    /yanlis terminoloji|yanlis formul|yanlis sayi|yanlis iddia|hatali formul|hatalidir|kaynakla uyumsuz/.test(
      folded,
    );
  if (!accuses) return false;
  return hasSpecificArtifact(original);
}

/** Üslup listesi dersi düşürmez. Bir olgu hatası düşürür. */
export function verifierIssuesRejectLesson(issues: string[], draft = ""): boolean {
  return issues.some((issue) => classifyVerifierIssue(issue, draft) === "blocking");
}

export function partitionVerifierIssues(issues: string[], draft = ""): IssueSeverityReport {
  const blocking: string[] = [];
  const nonBlocking: string[] = [];
  for (const issue of issues) {
    if (classifyVerifierIssue(issue, draft) === "blocking") blocking.push(issue);
    else nonBlocking.push(issue);
  }
  return { blocking, nonBlocking };
}

type LooseCheck = {
  prompt?: string;
  explanation?: string;
  options?: string[];
  answerIndex?: number;
  type?: string;
};

type LooseSection = {
  heading?: string;
  body?: string;
  check?: LooseCheck;
  [key: string]: unknown;
};

type LooseLesson = {
  overview?: string;
  sections?: LooseSection[];
  example?: { prompt?: string; solution?: string };
  commonMistake?: { claim?: string; correction?: string };
  infoCheck?: { prompt?: string; answer?: string };
  [key: string]: unknown;
};

export type LessonExcision = {
  content: string;
  removed: string[];
};

export type SettledLesson = {
  accepted: boolean;
  content: string;
  removed: string[];
  blocking: string[];
  nonBlocking: string[];
};

function needlesFromIssue(issue: string): string[] {
  const needles: string[] = [];
  const quoteRe = /[''‘’"“”«»]([^''‘’"“”«»]{8,220})[''‘’"“”«»]/g;
  for (const match of issue.matchAll(quoteRe)) needles.push(match[1].trim());
  const formulaRe = /[A-Za-z][A-Za-z0-9_]*\s*=\s*[A-Za-z0-9][A-Za-z0-9+\-*/^=.\s]{0,32}/g;
  for (const match of issue.matchAll(formulaRe)) needles.push(match[0].replace(/\s+/g, " ").trim());
  const folded = foldTr(issue);
  if (/ozgul enerji/.test(folded)) needles.push("özgül enerji");
  if (/ideal gaz/.test(folded) || /pv\s*=\s*nrt/.test(folded)) {
    needles.push("PV = nRT", "PV=nRT", "ideal gaz", "İdeal gaz");
  }
  return [...new Set(needles.map((needle) => needle.trim()).filter((needle) => foldTr(needle).length >= 6))];
}

function textHasNeedle(haystack: string, needles: string[]): boolean {
  const folded = foldTr(haystack);
  return needles.some((needle) => folded.includes(foldTr(needle)));
}

function lessonIsSound(lesson: LooseLesson): boolean {
  const sections = (lesson.sections ?? []).filter(
    (section) => (section.heading ?? "").trim().length >= 2 && (section.body ?? "").trim().length >= 20,
  );
  if (!sections.length) return false;
  return sections.some((section) => (section.check?.prompt ?? "").trim().length >= 8);
}

function replacementExample(section: LooseSection): { prompt: string; solution: string } | null {
  const prompt = (section.check?.prompt ?? "").trim();
  const solution = (section.body ?? "").trim();
  if (prompt.length < 8 || solution.length < 8 || foldTr(solution) === foldTr(prompt)) return null;
  return { prompt: prompt.slice(0, 240), solution: solution.slice(0, 700) };
}

/**
 * Bloklayan şikâyette tırnak içindeki metin hangi bölüm, örnek ya da
 * kontrol sorusundaysa yalnız o parça çıkar. Kalan ders en az bir kavram
 * bölümü ve bir kontrol sorusu taşıyorsa durur.
 */
export function exciseUnsupportedLessonParts(
  draft: string,
  blockingIssues: string[],
): LessonExcision | null {
  let lesson: LooseLesson;
  try {
    const parsed = JSON.parse(draft) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    lesson = parsed as LooseLesson;
  } catch {
    return null;
  }
  if (!Array.isArray(lesson.sections)) return null;
  const needles = blockingIssues.flatMap(needlesFromIssue);
  if (!needles.length) return null;

  const removed: string[] = [];
  const sections = lesson.sections.map((section) => ({ ...section }));
  const keep: LooseSection[] = [];
  for (const section of sections) {
    const body = `${section.heading ?? ""}\n${section.body ?? ""}`;
    const checkText = `${section.check?.prompt ?? ""}\n${section.check?.explanation ?? ""}`;
    if (textHasNeedle(body, needles)) {
      removed.push(`section:${(section.heading ?? "bolum").slice(0, 80)}`);
      continue;
    }
    if (section.check && textHasNeedle(checkText, needles)) {
      removed.push(`check:${(section.heading ?? "bolum").slice(0, 80)}`);
      const rest = { ...section };
      delete rest.check;
      keep.push(rest);
      continue;
    }
    keep.push(section);
  }
  lesson.sections = keep;

  if (lesson.example && textHasNeedle(`${lesson.example.prompt ?? ""}\n${lesson.example.solution ?? ""}`, needles)) {
    removed.push("example");
    const donor = keep.find((section) => (section.body ?? "").trim().length >= 20);
    const replacement = donor ? replacementExample(donor) : null;
    if (replacement) lesson.example = replacement;
    else delete lesson.example;
  }
  if (
    lesson.commonMistake &&
    textHasNeedle(`${lesson.commonMistake.claim ?? ""}\n${lesson.commonMistake.correction ?? ""}`, needles)
  ) {
    removed.push("commonMistake");
    delete lesson.commonMistake;
  }
  if (lesson.infoCheck && textHasNeedle(`${lesson.infoCheck.prompt ?? ""}\n${lesson.infoCheck.answer ?? ""}`, needles)) {
    removed.push("infoCheck");
    const donor = keep.find((section) => section.check?.prompt && section.check.options?.length);
    const answer = donor?.check?.options?.[donor.check.answerIndex ?? 0];
    if (donor?.check?.prompt && typeof answer === "string" && answer.trim().length >= 2) {
      lesson.infoCheck = { prompt: donor.check.prompt.slice(0, 180), answer: answer.trim().slice(0, 180) };
    } else {
      delete lesson.infoCheck;
    }
  }
  if (lesson.overview && textHasNeedle(lesson.overview, needles)) {
    removed.push("overview");
    const donor = keep.find((section) => (section.body ?? "").trim().length >= 20);
    if (donor?.body) lesson.overview = donor.body.slice(0, 280);
    else delete lesson.overview;
  }

  if (!removed.length || !lessonIsSound(lesson)) return null;
  return { content: JSON.stringify(lesson), removed };
}

/**
 * Onarımdan sonra kalan bloklayan madde, alıntılanan parçayı keserek
 * giderilebiliyorsa ders kabul edilir. Sağlam parça kalmazsa red sürer.
 */
export function settleRejectedLesson(draft: string, issues: string[]): SettledLesson {
  const split = partitionVerifierIssues(issues, draft);
  if (!split.blocking.length) {
    return {
      accepted: true,
      content: draft,
      removed: [],
      blocking: [],
      nonBlocking: split.nonBlocking,
    };
  }
  const excised = exciseUnsupportedLessonParts(draft, split.blocking);
  if (!excised) {
    return { accepted: false, content: draft, removed: [], ...split };
  }
  let parsed: unknown = null;
  try {
    parsed = JSON.parse(excised.content);
  } catch {
    parsed = null;
  }
  const published = parsed ? publishLessonDraft(parsed) : null;
  const content = published ? JSON.stringify(published) : excised.content;
  const pedagogy = lessonPublishIssues(published ?? parsed);
  const recheck = runIndependentValidation({
    draft: content,
    parsed: published ?? parsed,
    pedagogyIssues: pedagogy,
  });
  const hard = recheck.issues.filter(
    (item) => item.code !== "unit_uncertain" && validationIssueBlocks(item, content),
  );
  if (hard.length || !published || !lessonHasTeachingCore(published)) {
    return { accepted: false, content: draft, removed: [], ...split };
  }
  console.error("removed_for_source", { removed: excised.removed });
  return {
    accepted: true,
    content,
    removed: excised.removed,
    blocking: [],
    nonBlocking: split.nonBlocking,
  };
}

/**
 * Bağımsız kapıdaki madde. `invalid_json` yalnız ayrıştırıcı kodudur.
 * Ayrıştırılamayan birim eşitliği uyarıdır. Pedagoji cümlesi allowlist
 * dışındaysa dersi düşürmez.
 */
export function validationIssueBlocks(item: ValidationIssue, draft = ""): boolean {
  if (item.code === "unit_uncertain") return false;
  if (item.code === "invalid_json" || item.code === "not_object") return true;
  if (item.stage === "domain" || item.stage === "source" || item.stage === "structural") {
    return true;
  }
  return classifyVerifierIssue(item.message, draft) === "blocking";
}

/** Koyu terim, LaTeX ve başlık sözcüğü kodda tamamlanır; dersi düşürmez. */
export function isCosmeticReviewerNit(issue: string): boolean {
  return classifyVerifierIssue(issue) === "non_blocking";
}

function uniqueOptionsIssues(parsed: unknown): string[] {
  const issues: string[] = [];
  const items = collectItems(parsed);
  items.forEach((item, index) => {
    const row = asRecord(item);
    if (!row || !Array.isArray(row.options)) return;
    const options = row.options
      .map((o) => String(o ?? "").trim().toLocaleLowerCase("tr-TR"))
      .filter(Boolean);
    if (options.length >= 2 && new Set(options).size !== options.length) {
      issues.push(`Madde ${index + 1}: tekrarlayan şıklar`);
    }
  });
  return issues;
}

function structuralCheck(input: IndependentValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (input.parsed == null) {
    issues.push(issue("structural", "invalid_json", "Çıktı geçerli JSON değil."));
    return issues;
  }
  const row = asRecord(input.parsed);
  if (!row) {
    issues.push(issue("structural", "not_object", "Çıktı bir JSON nesnesi olmalı."));
    return issues;
  }

  const items = collectItems(input.parsed);
  const minItems = input.minItems ?? 0;
  if (minItems > 0 && items.length < minItems) {
    issues.push(
      issue(
        "structural",
        "item_count",
        `En az ${minItems} öğe gerekli; ${items.length} bulundu.`,
      ),
    );
  }

  for (const [key, value] of Object.entries(row)) {
    if (typeof value === "string" && emptyish(value) && key !== "hint") {
      issues.push(issue("structural", "empty_field", `Boş alan: ${key}`));
    }
  }

  for (let i = 0; i < items.length; i += 1) {
    const item = asRecord(items[i]);
    if (!item) {
      issues.push(issue("structural", "empty_item", `Boş öğe #${i + 1}`));
      continue;
    }
    if (Array.isArray(row.chapters)) {
      if (emptyish(item.title) || !Array.isArray(item.lines) || !item.lines.length ||
          item.lines.some((line) => emptyish(asRecord(line)?.text))) {
        issues.push(issue("structural", "empty_content", `Bölüm #${i + 1} başlığı veya konuşması boş.`));
      }
      continue;
    }
    if (Array.isArray(row.sections)) {
      if (emptyish(item.heading) || emptyish(item.body)) {
        issues.push(issue("structural", "empty_content", `Bölüm #${i + 1} başlığı veya anlatımı boş.`));
      }
      continue;
    }
    const text =
      (typeof item.text === "string" && item.text) ||
      (typeof item.prompt === "string" && item.prompt) ||
      (typeof item.front === "string" && item.front) ||
      (typeof item.question === "string" && item.question) ||
      "";
    if (!String(text).trim()) {
      issues.push(issue("structural", "empty_content", `Öğe #${i + 1} metni boş.`));
    }
    if (Array.isArray(item.options)) {
      if (item.options.length < 2) {
        issues.push(
          issue("structural", "option_format", `Öğe #${i + 1}: en az 2 şık gerekli.`),
        );
      }
      if (item.options.some((o) => emptyish(o))) {
        issues.push(
          issue("structural", "option_format", `Öğe #${i + 1}: boş şık var.`),
        );
      }
    }
  }

  return issues;
}

function sourceCheck(input: IndependentValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  if (input.requireSourceSupport) {
    if (!input.sourceExcerpt?.trim()) {
      issues.push(
        issue(
          "source",
          "source_missing",
          "Kaynak alıntısı yok; documents_only içerik doğrulanamaz.",
        ),
      );
    }
  }
  if (input.sourcePages?.length) {
    const bad = input.sourcePages.filter((n) => !Number.isInteger(n) || n < 1);
    if (bad.length) {
      issues.push(
        issue("source", "invalid_pages", "Kaynak sayfa numaraları geçersiz."),
      );
    }
    const text =
      typeof input.draft === "string"
        ? input.draft
        : JSON.stringify(input.parsed ?? {});
    const cited = [...text.matchAll(/\b(?:sayfa|s\.|p\.)\s*(\d+)\b/gi)].map((m) =>
      Number(m[1]),
    );
    for (const page of cited) {
      if (!input.sourcePages.includes(page)) {
        issues.push(
          issue(
            "source",
            "unsupported_page",
            `Atıf yapılan sayfa kaynak listesinde yok: ${page}`,
          ),
        );
      }
    }
  }
  return issues;
}

/** Soft percent claims like "yüzde 150" / "150%" that cannot be a success rate. */
export function checkImpossiblePercentClaims(text: string): string[] {
  const issues: string[] = [];
  const re = /(?:yüzde|%)\s*(\d{3,})|(\d{3,})\s*%/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const raw = match[1] ?? match[2];
    const value = Number(raw);
    const context = text.slice(Math.max(0, match.index - 35), re.lastIndex + 35);
    if (Number.isFinite(value) && value > 100 && /olasılık|başarı oranı|doğru cevap oranı/i.test(context)) {
      issues.push(`İmkânsız yüzde: ${value}`);
    }
  }
  return issues;
}

/** Wrong propositions, distractors and misconception claims are not assertions. */
function assertionTexts(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (Array.isArray(value)) return value.flatMap(assertionTexts);
  const row = asRecord(value);
  if (!row) return [];
  if (typeof row.correct === "boolean") {
    return assertionTexts(row.correct ? row.text : row.correctedStatement);
  }
  return Object.entries(row).flatMap(([key, child]) => {
    if (["claim", "options", "prompt", "question"].includes(key)) return [];
    if (key === "text" && Array.isArray(row.options)) return [];
    return assertionTexts(child);
  });
}

function domainCheck(input: IndependentValidationInput): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  // A non-JSON draft is used by standalone diagnostic callers.
  const text = typeof input.draft === "string" && !/^[\s]*[\[{]/.test(input.draft)
    ? input.draft : assertionTexts(input.parsed).join("\n");
  for (const msg of checkSimpleMathClaims(text)) {
    issues.push(issue("domain", "math_mismatch", msg));
  }
  for (const msg of checkCalculationChains(text)) {
    issues.push(issue("domain", "math_mismatch", msg));
  }
  for (const msg of checkUnitConversionClaims(text)) {
    issues.push(issue("domain", "unit_mismatch", msg));
  }
  for (const msg of checkUncertainUnitClaims(text)) {
    issues.push(issue("domain", "unit_uncertain", msg));
  }
  for (const msg of uniqueOptionsIssues(input.parsed)) {
    issues.push(issue("domain", "duplicate_options", msg));
  }
  // Lightweight unit clash: "5 kg = 5 g" / "1 mol = 1 g" style nonsense
  if (
    /\b(\d+)\s*kg\s*=\s*\1\s*g\b/i.test(text) ||
    /\b(\d+)\s*g\s*=\s*\1\s*kg\b/i.test(text) ||
    /\b(\d+)\s*mol\s*=\s*\1\s*g\b/i.test(text) ||
    /\b(\d+)\s*g\s*=\s*\1\s*mol\b/i.test(text)
  ) {
    issues.push(issue("domain", "unit_mismatch", "Birim dönüşümü tutarsız."));
  }
  for (const msg of checkImpossiblePercentClaims(text)) {
    issues.push(issue("domain", "impossible_percent", msg));
  }
  // Subject hint only softens messaging; checks stay deterministic.
  void input.subjectHint;
  return issues;
}

function pedagogyCheck(input: IndependentValidationInput): ValidationIssue[] {
  return (input.pedagogyIssues ?? []).map((message) =>
    issue("pedagogy", "pedagogy_rule", message),
  );
}

const STAGE_RUNNERS: Record<
  "structural" | "source" | "domain" | "pedagogy",
  (input: IndependentValidationInput) => ValidationIssue[]
> = {
  structural: structuralCheck,
  source: sourceCheck,
  domain: domainCheck,
  pedagogy: pedagogyCheck,
};

/**
 * Run independent checks in fixed order. Stops at first failing stage
 * (issues still collected within that stage).
 */
export function runIndependentValidation(
  input: IndependentValidationInput,
): IndependentValidationResult {
  const issues: ValidationIssue[] = [];
  const stagesMs: Partial<Record<ValidationStage, number>> = {};
  let failedStage: ValidationStage | null = null;

  for (const stage of STAGE_ORDER) {
    const started = Date.now();
    const stageIssues = STAGE_RUNNERS[stage](input);
    stagesMs[stage] = Date.now() - started;
    const hard = stageIssues.filter((item) => item.code !== "unit_uncertain");
    if (stageIssues.length) issues.push(...stageIssues);
    if (hard.length) {
      failedStage = stage;
      break;
    }
  }

  return {
    ok: failedStage == null,
    issues,
    failedStage,
    stagesMs,
  };
}

/** Flatten issues for quality-gate `validate` callbacks. */
export function issueMessages(result: IndependentValidationResult): string[] {
  return result.issues.map((i) => `[${i.stage}] ${i.message}`);
}

export function emptyMetrics(
  partial?: Partial<ValidationMetrics>,
): ValidationMetrics {
  return {
    generationMs: 0,
    validationMs: 0,
    stagesMs: {},
    failedStage: null,
    failureCodes: [],
    repairAttempted: false,
    recheckPassed: null,
    outcome: "rejected",
    ...partial,
  };
}

/**
 * After repair, content must pass independent checks again — never auto-accept.
 */
export function recheckAfterRepair(
  input: IndependentValidationInput,
): IndependentValidationResult {
  return runIndependentValidation(input);
}
