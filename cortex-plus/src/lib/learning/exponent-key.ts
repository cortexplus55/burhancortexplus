/**
 * Aynı tabanlı üslü işlemin cevap anahtarı denetimi.
 *
 * 29 Eylül 2026'da canlı belgesiz derste çoktan seçmeli soru "(3⁴)²
 * ifadesinin sonucu" için 3¹²'yi doğru saydı; açıklama "4 ile 2 üs olarak
 * çarpılır" diyordu (4 × 2 = 8). Öğrenci 3⁸'i seçse yanlış sayılacaktı.
 * Model hesabı yanlış yapıyor; kural metni bunu engellemiyor.
 *
 * Burada yalnızca kesin hesaplanabilen şekle bakılır: tek bir sayı tabanı,
 * üst simgeyle yazılmış tam sayı üsler, `×` `·` `÷` `/` ve `(aᵐ)ⁿ`.
 * Hesap okunamıyorsa hüküm verilmez (null); yalnızca anahtar hesapla
 * çeliştiğinde "yanlış" denir.
 */

const DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

function superscriptInt(text: string): number | null {
  let sign = 1;
  let digits = "";
  for (const char of text) {
    if (char === "⁻") {
      if (digits || sign < 0) return null;
      sign = -1;
      continue;
    }
    const digit = DIGITS.indexOf(char);
    if (digit < 0) return null;
    digits += String(digit);
  }
  return digits ? sign * Number(digits) : null;
}

type Power = { base: number; exp: number };

const SUP = "[⁻⁰¹²³⁴⁵⁶⁷⁸⁹]+";
const TERM = `(?:\\(\\s*\\d+${SUP}\\s*\\)${SUP}|\\d+${SUP})`;
const OP = "\\s*[×·÷/]\\s*";
const CHAIN = new RegExp(`${TERM}(?:${OP}${TERM})*`, "g");

function parseTerm(term: string): Power | null {
  const nested = term.match(new RegExp(`^\\(\\s*(\\d+)(${SUP})\\s*\\)(${SUP})$`));
  if (nested) {
    const inner = superscriptInt(nested[2] ?? "");
    const outer = superscriptInt(nested[3] ?? "");
    if (inner == null || outer == null) return null;
    return { base: Number(nested[1]), exp: inner * outer };
  }
  const plain = term.match(new RegExp(`^(\\d+)(${SUP})$`));
  if (!plain) return null;
  const exp = superscriptInt(plain[2] ?? "");
  return exp == null ? null : { base: Number(plain[1]), exp };
}

/** "3² × 3³ ÷ 3⁴", "(3⁴)²" → aynı tabanlı sonuç; okunamazsa null. */
export function evaluatePowerChain(expression: string): Power | null {
  const text = expression.trim();
  const terms = text.split(/\s*[×·÷/]\s*/);
  const ops = [...text.matchAll(/[×·÷/]/g)].map((match) => match[0]);
  if (terms.length !== ops.length + 1) return null;
  let result: Power | null = null;
  for (const [index, raw] of terms.entries()) {
    const power = parseTerm(raw.trim());
    if (!power) return null;
    if (!result) {
      result = power;
      continue;
    }
    if (power.base !== result.base) return null;
    const op = ops[index - 1];
    result = { base: result.base, exp: op === "÷" || op === "/" ? result.exp - power.exp : result.exp + power.exp };
  }
  return result;
}

function numericValue(power: Power): number | null {
  if (power.exp < 0 || power.base > 1000 || power.exp > 30) return null;
  const value = power.base ** power.exp;
  return Number.isSafeInteger(value) ? value : null;
}

/** Şık ya da cevap hesapla aynı mı? Okunamazsa null. */
function sameValue(text: string, expected: Power): boolean | null {
  const clean = text.replace(/[.\s]+$/g, "").trim();
  const power = evaluatePowerChain(clean);
  if (power) {
    if (power.base === expected.base) return power.exp === expected.exp;
    const left = numericValue(power);
    const right = numericValue(expected);
    return left != null && right != null ? left === right : null;
  }
  if (/^-?\d+$/.test(clean)) {
    const right = numericValue(expected);
    return right == null ? null : Number(clean) === right;
  }
  return null;
}

/** Sorunun kökündeki tek hesaplanabilir zincir; birden fazlaysa belirsiz. */
function promptChain(prompt: string): string | null {
  const chains = [...prompt.matchAll(CHAIN)]
    .map((match) => match[0])
    .filter((chain) => /[×·÷/]/.test(chain) || chain.startsWith("("));
  return chains.length === 1 ? chains[0] ?? null : null;
}

type KeyedCheck = {
  type: string;
  prompt: string;
  options?: string[];
  answerIndex?: number;
  answer?: string;
};

/**
 * true: anahtar hesapla çelişiyor. false: hesapla uyuşuyor.
 * null: hesaplanamadı, hüküm yok.
 */
export function exponentKeyWrong(check: KeyedCheck): boolean | null {
  if (check.type === "trueFalse" && check.options?.length === 2 && check.answerIndex != null) {
    // Sağ taraf önce üslü terim olarak okunur: "2⁵" düz "2" sanılmasın.
    const claim = check.prompt.match(
      new RegExp(`(${TERM}(?:${OP}${TERM})*)\\s*=\\s*(${TERM}|-?\\d+(?![⁻⁰¹²³⁴⁵⁶⁷⁸⁹]))`),
    );
    if (!claim) return null;
    const left = evaluatePowerChain(claim[1] ?? "");
    if (!left || !/[×·÷/(]/.test(claim[1] ?? "")) return null;
    const holds = sameValue(claim[2] ?? "", left);
    if (holds == null) return null;
    const trueIndex = check.options.findIndex((option) => /^doğru$/i.test(option.trim()));
    if (trueIndex < 0) return null;
    return (check.answerIndex === trueIndex) !== holds;
  }
  const chain = promptChain(check.prompt);
  const expected = chain ? evaluatePowerChain(chain) : null;
  if (!expected) return null;
  if (check.type === "numerical" && check.answer) {
    const same = sameValue(check.answer, expected);
    return same == null ? null : !same;
  }
  if (check.options && check.answerIndex != null) {
    const verdicts = check.options.map((option) => sameValue(option, expected));
    const matches = verdicts.flatMap((verdict, index) => (verdict ? [index] : []));
    if (matches.length !== 1) return null;
    return matches[0] !== check.answerIndex;
  }
  return null;
}
