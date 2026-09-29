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

/*
  Üs içinde işlem: "3²ˣ⁴", "3¹⁶⁻⁵", "3⁴⁺⁻²". Canlıda sık hata kartı
  "(3²)⁴ = 3²ˣ⁴ = 3¹²" dedi (doğrusu 3⁸); kart düz metin olduğu için anahtar
  denetimi görmüyordu.
*/
const SUP_EXPR = "[⁻⁰¹²³⁴⁵⁶⁷⁸⁹⁺ˣ]+";

function superscriptArithmetic(text: string): number | null {
  const plain = [...text]
    .map((char) => {
      const digit = DIGITS.indexOf(char);
      if (digit >= 0) return String(digit);
      if (char === "⁺") return "+";
      if (char === "⁻") return "-";
      if (char === "ˣ") return "*";
      return "?";
    })
    .join("");
  if (plain.includes("?") || !/^-?\d+(?:[+*-]-?\d+)*$/.test(plain)) return null;
  // Çarpma önce, sonra toplama/çıkarma. "4+-2": işaretli sayı "~" ile korunur.
  let total = 0;
  for (const raw of plain.replace(/([+*])-/g, "$1~").split(/(?=[+-])/)) {
    const sign = raw.startsWith("-") ? -1 : 1;
    const body = raw.replace(/^[+-]/, "");
    const product = body
      .split("*")
      .map((part) => Number(part.replace("~", "-")))
      .reduce((left, right) => left * right, 1);
    if (!Number.isFinite(product)) return null;
    total += sign * product;
  }
  return total;
}

function parseExprTerm(term: string): Power | null {
  const nested = term.match(new RegExp(`^\\(\\s*(\\d+)(${SUP_EXPR})\\s*\\)(${SUP_EXPR})$`));
  if (nested) {
    const inner = superscriptArithmetic(nested[2] ?? "");
    const outer = superscriptArithmetic(nested[3] ?? "");
    if (inner == null || outer == null) return null;
    return { base: Number(nested[1]), exp: inner * outer };
  }
  const plain = term.match(new RegExp(`^(\\d+)(${SUP_EXPR})$`));
  if (!plain) return null;
  const exp = superscriptArithmetic(plain[2] ?? "");
  return exp == null ? null : { base: Number(plain[1]), exp };
}

function evaluateSide(side: string): Power | number | null {
  const text = side.trim();
  if (/^\d+$/.test(text)) return Number(text);
  const terms = text.split(/\s*[×·÷/]\s*/);
  const ops = [...text.matchAll(/[×·÷/]/g)].map((match) => match[0]);
  if (terms.length !== ops.length + 1) return null;
  let result: Power | null = null;
  for (const [index, raw] of terms.entries()) {
    const power = parseExprTerm(raw.trim());
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

function sidesDiffer(left: Power | number, right: Power | number): boolean | null {
  const value = (side: Power | number) => (typeof side === "number" ? side : numericValue(side));
  if (typeof left !== "number" && typeof right !== "number" && left.base === right.base) {
    return left.exp !== right.exp;
  }
  const a = value(left);
  const b = value(right);
  return a == null || b == null ? null : a !== b;
}

const EXPR_TERM = `(?:\\(\\s*\\d+${SUP_EXPR}\\s*\\)${SUP_EXPR}|\\d+${SUP_EXPR})`;
const EXPR_SIDE = `${EXPR_TERM}(?:\\s*[×·÷/]\\s*${EXPR_TERM})*`;
const EQUATION = new RegExp(
  `${EXPR_SIDE}(?:\\s*=\\s*(?:${EXPR_SIDE}|\\d+(?![\\d/.,⁰¹²³⁴⁵⁶⁷⁸⁹])))+`,
  "g",
);

/**
 * Metindeki aynı tabanlı üslü eşitlik zinciri kendi içinde çelişiyor mu?
 * "(3²)⁴ = 3²ˣ⁴ = 3¹²" → true. Yanlışı anan cümleye ("… değil",
 * "yanlış", "hata") hüküm verilmez: orada yanlış eşitlik kasıtlıdır.
 */
export function exponentProseWrong(text: string): boolean {
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    if (/değil|yanlış|hata|sanmak|sanılır|sanır/i.test(sentence)) continue;
    for (const match of sentence.matchAll(EQUATION)) {
      const sides = match[0].split(/\s*=\s*/).map(evaluateSide);
      for (let index = 1; index < sides.length; index += 1) {
        const left = sides[index - 1];
        const right = sides[index];
        if (left == null || right == null) continue;
        if (sidesDiffer(left, right) === true) return true;
      }
    }
  }
  return false;
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
