/**
 * Cevap anahtarı tutarlılığı (19 Kasım 2026, Faz 1-A §3 güçlendirmesi) — modelsiz, ders bağımsız, saf modül.
 *
 * Canlı bulgu: bir çoktan seçmeli sorunun anahtarı bir şıkkı doğru sayarken sorunun kendi açıklaması ve şık
 * gerekçeleri başka bir şıkkı doğru gösteriyordu; "tek doğru şık" bekçisi yalnız anahtarın biçimine (tam bir doğru
 * şık, şıklarda var mı) baktığı için yakalamadı. Bu modül anahtarı sorunun kendi içeriğiyle karşılaştırır:
 *
 * 1. Aritmetik: açıklamadaki ve gerekçedeki işlem zincirleri ("a × b = c", "10³ = 1000", "x / y = z") kodla
 *    hesaplanır; yanlış işlem sorundur.
 * 2. Hesaplanan sonuç: açıklamanın vardığı (olumsuz cümlede geçmeyen) işlem sonucu, birimiyle birlikte tam bir
 *    şıkka denk geliyorsa ve o şık anahtar değilse sorun; desteklenen şık bilinir (onarım mümkün).
 * 3. Gerekçe: anahtarlı şıkkın kendi gerekçesi onu yanılgı diye anlatıyor ("… sanmaktır", "… değildir") ve
 *    gerekçesi olumsuz olmayan tek bir başka şık varsa sorun; desteklenen şık o.
 *
 * Doğru/Yanlış önermesi ve kart cevabı için: önermedeki işlem yanlışsa önerme yanlıştır (anahtar "Doğru" olamaz).
 * Üretimde sorun düzeltme turuna gider; kayıtlı eski soruda desteklenen şık biliniyorsa anahtar düzeltilir,
 * bilinmiyorsa soru puanlanmaz (gösterilmez ya da tam puan sayılır, çağırana göre).
 */

/* ───────────── Aritmetik ───────────── */

const SUPERSCRIPT_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

function plainMath(text: string): string {
  return text
    .replace(/⁻([⁰¹²³⁴⁵⁶⁷⁸⁹]+)/gu, (_, digits: string) => `^-${[...digits].map((d) => SUPERSCRIPT_DIGITS.indexOf(d)).join("")}`)
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/gu, (digits) => `^${[...digits].map((d) => SUPERSCRIPT_DIGITS.indexOf(d)).join("")}`)
    .replace(/[−–]/g, "-")
    .replace(/[×·∙⋅]/g, "*")
    .replace(/[÷∕]/g, "/");
}

/** Sayı: binlik noktalı (1.000), virgüllü ondalık (2,5) ya da noktalı ondalık (2.5). */
const NUMBER = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?`;
/**
 * Kök işaretleri (√ ∛ ∜) hesaplanır: "√(9 + 16) = 5", "c = √(6² + 8²) = 10". Önceden işaret okunmuyor, zincir
 * kökün içinden başlıyordu ("(9 + 16) = 5" → 25 ≠ 5) ve doğru satırlar yanlış işlem sayılıyordu.
 */
const RADICAL = "√∛∜";
const TERM = String.raw`(?:\(\s*)*-?\s*(?:[${RADICAL}]\s*(?:\(\s*)*-?\s*)*(?:${NUMBER})(?:\s*\^\s*-?\d+)?(?:\s*\))*`;
const EXPR = String.raw`${TERM}(?:\s*[-+*/]\s*${TERM})*`;
const CHAIN = new RegExp(String.raw`(?<![\p{L}\d.,^%${RADICAL}])(${EXPR})((?:\s*=\s*${EXPR})+)`, "gu");
/** İki sayı arasında işlem: yalnız böyle bir yanı olan eşitlik hesap zinciri sayılır ("√25 = 5" tek başına değil). */
const OPERATION = new RegExp(String.raw`\d\s*\)?\s*[-+*/^]\s*(?:[(${RADICAL}]\s*)*-?\s*(?:[(${RADICAL}]\s*)*\d`, "u");

function parseNumber(token: string): number {
  if (/^\d{1,3}(?:\.\d{3})+(?:,\d+)?$/.test(token)) return Number(token.replace(/\./g, "").replace(",", "."));
  return Number(token.replace(",", "."));
}

/** Kök: √ ve ∜ eksi sayıda tanımsız (null), ∛ eksi sayıyı da alır. */
function radical(sign: string, value: number): number | null {
  if (sign === "∛") return Math.cbrt(value);
  if (value < 0) return null;
  return sign === "∜" ? value ** 0.25 : Math.sqrt(value);
}

/** Küçük ifade değerlendirici: + - * / ^, kök (√ ∛ ∜) ve parantez (× ve · çarpma). Hatalıysa null. */
export function evaluateExpression(source: string): number | null {
  const text = plainMath(source);
  const tokens = text.match(new RegExp(String.raw`${NUMBER}|[-+*/^()${RADICAL}]`, "gu"));
  if (!tokens || tokens.join("") !== text.replace(/\s+/g, "")) return null;
  let index = 0;
  const peek = () => tokens[index];
  const next = () => tokens[index++];
  const primary = (): number | null => {
    const token = next();
    if (token === undefined) return null;
    if (token === "(") {
      const value = sum();
      return next() === ")" ? value : null;
    }
    if (token === "-") {
      const value = power();
      return value === null ? null : -value;
    }
    if (RADICAL.includes(token)) {
      // "√9²" kökün içini üsle birlikte alır; eksi olmayan sayıda (√9)² ile aynı değer.
      const inner = power();
      return inner === null ? null : radical(token, inner);
    }
    const value = parseNumber(token);
    return Number.isFinite(value) ? value : null;
  };
  const power = (): number | null => {
    const base = primary();
    if (base === null) return null;
    if (peek() === "^") {
      next();
      const exponent = power();
      return exponent === null ? null : base ** exponent;
    }
    return base;
  };
  const product = (): number | null => {
    let value = power();
    while (value !== null && (peek() === "*" || peek() === "/")) {
      const op = next();
      const right = power();
      if (right === null) return null;
      value = op === "*" ? value * right : right === 0 ? null : value / right;
    }
    return value;
  };
  const sum = (): number | null => {
    let value = product();
    while (value !== null && (peek() === "+" || peek() === "-")) {
      const op = next();
      const right = product();
      if (right === null) return null;
      value = op === "+" ? value + right : value - right;
    }
    return value;
  };
  const result = sum();
  return index === tokens.length ? result : null;
}

/** Yazılı ondalık basamak sayısı ("0,33" → 2); yuvarlama payı buna göre. */
function decimalsOf(part: string): number {
  const literal = part.trim().match(/^-?\d+(?:[.,](\d+))?$/);
  if (!literal?.[1] || /^\d{1,3}(?:\.\d{3})+$/.test(part.trim())) return 0;
  return literal[1].length;
}

function close(a: number, b: number, decimals = 6): boolean {
  const scale = Math.max(Math.abs(a), Math.abs(b), 1e-12);
  // Yuvarlanmış sonuç ("1/3 = 0,33") için %1 ya da son yazılı basamağın yarısı kadar pay.
  return Math.abs(a - b) <= Math.max(1e-9, scale * 0.01, 0.5 * 10 ** -decimals);
}

export type Computation = { text: string; sides: number[]; ok: boolean; result: number; unit: string; index: number };

/** Metindeki işlem zincirleri: en az bir yanında işlem olan "ifade = ifade (= ifade)". */
export function computations(text: string): Computation[] {
  const source = plainMath(text);
  const out: Computation[] = [];
  for (const match of source.matchAll(CHAIN)) {
    const whole = match[0];
    const at = match.index ?? 0;
    // Cebirsel bağlam ("2y − 3 × 2 = …", "… = 4x"): zincir bir değişkene ya da işleme yapışıksa okunmaz.
    const raw = source.slice(0, at);
    const before = raw.trimEnd();
    // "v = 2 + 2 = 4" gibi kısa bir adın ataması okunur; "… × 2 = …" gibi bir işlemin devamı okunmaz.
    const assigned = /(?:^|[\s(,;:])\p{L}[\p{L}\d_]{0,3}\s*=$/u.test(before);
    // Kökün içinden başlayan parça ("2√ (…)") da bir işlemin devamıdır.
    if (/[\p{L}\d]$/u.test(raw) || (/[-+*/^=(√∛∜]$/u.test(before) && !assigned)) continue;
    if (whole.trimStart().startsWith("-") && /[\p{L}\d)]$/u.test(before)) continue;
    // "2 √(9 + 16)": kök bir katsayıyla çarpılıyor (örtük çarpım); katsayısız okunursa doğru satır yanlış görünür.
    if (/^[(\s]*[√∛∜]/u.test(whole) && /[\d)]$/u.test(before)) continue;
    const tail = source.slice(at + whole.length);
    // "… = 8√2": son yan kökle çarpılıyor (örtük çarpım); hesaplanmaz, okunmaz.
    if (/^\p{L}/u.test(tail) || /^\s*[-+*/^(√∛∜]\s*[\p{L}\d(√∛∜]/u.test(tail)) continue;
    const parts = whole.split("=").map((part) => part.trim());
    if (!parts.some((part) => OPERATION.test(part))) continue;
    const sides = parts.map(evaluateExpression);
    if (sides.some((side) => side === null)) continue;
    const values = sides as number[];
    // Kök ya da işlem taşıyan yan hesaplanmış değerdir; yuvarlama payını yalnız yazılı sayı belirler.
    const decimals = Math.min(...parts.map((part) => (/[-+*/^√∛∜]/.test(part.replace(/^-/, "")) ? 6 : decimalsOf(part))));
    const ok = values.every((value) => close(value, values[values.length - 1]!, decimals));
    const after = tail.match(/^\s*([\p{L}%°]+)/u)?.[1] ?? "";
    out.push({ text: whole, sides: values, ok, result: values[values.length - 1]!, unit: fold(after), index: at });
  }
  return out;
}

/** Metinde yanlış bir işlem var mı ("3 × 4 = 10"). */
export function hasFalseArithmetic(text: string): boolean {
  return computations(text).some((item) => !item.ok);
}

/* ───────────── Çoktan seçmeli anahtar ───────────── */

function fold(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase("tr-TR");
}

const NEGATIVE = /(?<![\p{L}])(?:san(?:mak|maktır|ılır|ıp)|yanılgı|karıştır|değil|yanlış|hatalı|uymaz|vermez|unut|ihmal|ters\s+çevir|tuzak)/iu;
const AFFIRMATIVE = /(?<![\p{L}])(?:doğru(?:dur|\s+cevap|\s+şık)?|geçerli(?:dir)?|elde\s+edil|sonuç(?:tur)?|eşittir)/iu;

/**
 * Gerekçe şıkkı yanılgı diye mi anlatıyor (olumsuz işaret var, olumlu işaret yok). Şıkkın kendi metni gerekçeden
 * çıkarılarak bakılır: olumsuz bir ifade taşıyan doğru şık ("… bağlı değildir") kendi sözcüğüyle çürütülmüş sayılmaz.
 */
export function rationaleRejects(text: string | undefined, option = ""): boolean {
  if (!text?.trim()) return false;
  let rest = fold(text);
  const own = fold(option).trim();
  if (own.length >= 2) rest = rest.split(own).join(" ");
  return NEGATIVE.test(rest) && !AFFIRMATIVE.test(rest);
}

/**
 * Gerekçelerin gösterdiği şık: anahtarlı şıkkın gerekçesi onu çürütüyor ve gerekçesi çürütmeyen TAM BİR başka şık
 * varsa o şık; aksi hâlde null (kanıt yetersiz, anahtara dokunulmaz).
 */
export function rationaleSupportedIndex(options: readonly string[], answerIndex: number, optionWhy: readonly string[] | null | undefined): number | null {
  if (!optionWhy || optionWhy.length !== options.length || answerIndex < 0 || answerIndex >= options.length) return null;
  if (!rationaleRejects(optionWhy[answerIndex], options[answerIndex])) return null;
  const others = optionWhy.flatMap((line, index) => (index !== answerIndex && !rationaleRejects(line, options[index]) ? [index] : []));
  return others.length === 1 ? others[0]! : null;
}

type OptionValue = { value: number; unit: string } | null;

function optionValue(option: string): OptionValue {
  const source = plainMath(option.trim());
  const match = source.match(new RegExp(String.raw`^\s*(${EXPR})\s*([\p{L}%°/]*)`, "u"));
  if (!match) return null;
  // "2√3" örtük çarpımdır: şık 2 diye okunmaz.
  if (/^[√∛∜]/u.test(source.slice(match[0].length))) return null;
  const value = evaluateExpression(match[1]!);
  if (value === null) return null;
  const rest = source.slice(match[0].length).trim();
  // Şık sayıdan sonra uzun bir cümle taşıyorsa hesaplanan şık sayılmaz.
  if (rest.split(/\s+/).filter(Boolean).length > 2) return null;
  return { value, unit: fold(match[2] ?? "") };
}

function sentencesOf(text: string): { text: string; start: number }[] {
  const out: { text: string; start: number }[] = [];
  const regex = /[^.!?;\n]+(?:[.!?;]+|$)/gu;
  for (const match of text.matchAll(regex)) out.push({ text: match[0], start: match.index ?? 0 });
  return out;
}

export type KeyedChoice = {
  options: readonly string[];
  answerIndex: number;
  explanation?: string;
  optionWhy?: readonly string[];
  steps?: readonly string[];
};

export type KeyVerdict =
  | { ok: true }
  | { ok: false; reason: "arithmetic" | "computed" | "rationale"; issue: string; supported: number | null };

export const KEY_CONSISTENCY_PREFIX = "Cevap anahtarı tutarsız";

/** Açıklamanın (ve çözüm adımlarının) hesapla vardığı şık; tek ve kesin değilse null. */
export function computedOption(question: KeyedChoice): number | null {
  const values = question.options.map(optionValue);
  if (values.filter(Boolean).length < 2) return null;
  const units = new Set(values.flatMap((value) => (value?.unit ? [value.unit] : [])));
  const text = plainMath([question.explanation ?? "", ...(question.steps ?? [])].join("\n"));
  const sentenceAt = sentencesOf(text);
  const results = computations(text).filter((item) => {
    if (!item.ok) return false;
    const sentence = sentenceAt.find((part) => item.index >= part.start && item.index < part.start + part.text.length);
    if (sentence && NEGATIVE.test(sentence.text)) return false;
    // Şıklar birim taşıyorsa sonuç da aynı birimle yazılmış olmalı ("… = 40 kat"); birimsiz ara sonuç sayılmaz.
    if (units.size) return [...units].some((unit) => item.unit.startsWith(unit));
    return true;
  });
  // Hesaplanan her nitelikli sonuç aynı tek şıkka varmalı; iki farklı şıkka varan açıklama kesin değildir.
  const hits = new Set<number>();
  for (const item of results) {
    const matches = values.flatMap((value, index) => (value && close(value.value, item.result) ? [index] : []));
    if (matches.length === 1) hits.add(matches[0]!);
  }
  return hits.size === 1 ? [...hits][0]! : null;
}

/** Anahtar sorunun kendi açıklaması, gerekçeleri ve hesabıyla tutarlı mı. */
export function keyConsistency(question: KeyedChoice): KeyVerdict {
  const { options, answerIndex } = question;
  if (!Array.isArray(options) || answerIndex < 0 || answerIndex >= options.length) return { ok: true };
  const explanation = question.explanation ?? "";
  const why = question.optionWhy && question.optionWhy.length === options.length ? question.optionWhy : null;
  const keyedWhy = why?.[answerIndex] ?? "";
  if (hasFalseArithmetic([explanation, keyedWhy, ...(question.steps ?? [])].join("\n"))) {
    return { ok: false, reason: "arithmetic", issue: `${KEY_CONSISTENCY_PREFIX}: açıklamadaki işlem yanlış; hesabı düzelt.`, supported: null };
  }
  const computed = computedOption(question);
  if (computed !== null && computed !== answerIndex) {
    return {
      ok: false,
      reason: "computed",
      issue: `${KEY_CONSISTENCY_PREFIX}: açıklamanın hesabı «${options[computed]}» şıkkına varıyor, anahtar «${options[answerIndex]}». Anahtarı, açıklamayı ve gerekçeleri aynı şıkta birleştir.`,
      supported: computed,
    };
  }
  const supported = computed === answerIndex ? null : rationaleSupportedIndex(options, answerIndex, why);
  if (supported !== null) {
    return {
      ok: false,
      reason: "rationale",
      issue: `${KEY_CONSISTENCY_PREFIX}: anahtarlı şıkkın gerekçesi onu yanılgı diye anlatıyor («${keyedWhy.slice(0, 80)}»), gerekçeler «${options[supported]}» şıkkını doğru gösteriyor. Anahtarı ve gerekçeleri aynı şıkta birleştir.`,
      supported,
    };
  }
  return { ok: true };
}

/**
 * Kayıtlı soru için karar: tutarlıysa olduğu gibi, desteklenen şık kesinse (hesap) düzeltilmiş anahtar, değilse
 * puanlanmaz. Gerekçeye dayalı tek aday da düzeltme sayılır (gerekçeler tek bir başka şıkkı gösteriyorsa).
 */
export function auditStoredKey(question: KeyedChoice): { action: "keep" } | { action: "fix"; answerIndex: number } | { action: "void" } {
  const verdict = keyConsistency(question);
  if (verdict.ok) return { action: "keep" };
  if (verdict.supported !== null) return { action: "fix", answerIndex: verdict.supported };
  return { action: "void" };
}

/* ───────────── Doğru / Yanlış ve kart ───────────── */

/**
 * Kayıtlı D/Y önermesinin güvenli anahtarı: önermedeki işlem yanlışken "Doğru" anahtarlı eski kayıt "Yanlış" okunur
 * (önerme kodla hesaplanabildiği için kesin). Diğer durumlarda kayıttaki anahtar.
 */
export function storedTrueFalseKey(item: { text?: unknown; statement?: unknown; correct: boolean }): boolean {
  const text = typeof item.text === "string" ? item.text : typeof item.statement === "string" ? item.statement : "";
  return trueFalseKeyInconsistent({ text, correct: item.correct }) ? false : item.correct;
}

/** Önermedeki işlem yanlışsa önerme yanlıştır: anahtar "Doğru" ise tutarsız. */
export function trueFalseKeyInconsistent(item: { text: string; correct: boolean }): boolean {
  return item.correct === true && hasFalseArithmetic(item.text);
}

/* ───────────── Ders içi kontrol (check) ───────────── */

type CheckLike = {
  type?: string;
  prompt?: string;
  options?: readonly string[] | null;
  answerIndex?: number | null;
  explanation?: string | null;
  optionWhy?: readonly string[] | null;
  whyRight?: string | null;
  steps?: readonly string[] | null;
  corrected?: string | null;
};

/** Kontrolün açıklama, gerekçe ve çözüm adımlarında yanlış bir işlem var mı. */
export function checkArithmeticIssue(check: CheckLike): boolean {
  const text = [check.explanation ?? "", check.whyRight ?? "", ...(check.optionWhy ?? []), ...(check.steps ?? [])].join("\n");
  return hasFalseArithmetic(text);
}

/** Doğru/Yanlış kontrolü: önermedeki işlem yanlışken anahtar "Doğru". */
export function trueFalseCheckInconsistent(check: CheckLike): boolean {
  if (check.type !== "trueFalse") return false;
  const picked = check.options?.[check.answerIndex ?? -1]?.trim() ?? "";
  const keyedTrue = /^(doğru|dogru|true)$/iu.test(picked);
  return trueFalseKeyInconsistent({ text: check.prompt ?? "", correct: keyedTrue });
}

/** Kayıtlı kontrol okunurken: güvenle puanlanamayacak (işlemi yanlış ya da D/Y anahtarı işlemle çelişen) soru. */
export function unsafeStoredCheck(check: CheckLike): boolean {
  return checkArithmeticIssue(check) || trueFalseCheckInconsistent(check);
}
