/**
 * Matematik yazımının normalizasyonu (29 Ekim 2026, Paket H; 6 Kasım 2026'da `source-contradictions.ts`'ten ayrıldı).
 * Saf ve bağımlılıksız: istemci de okur (sınav sabahı kâğıdı aynı formülü iki yazımla iki kez basmasın).
 * Aynı ifadenin farklı yazımları aynı anahtara iner: `×`/`·`/`*`, Unicode alt ve üst simge (`ₖ` = `k`, `²` = `^2`),
 * LaTeX (`\frac`, `\cdot`, `x_{k}`), ondalık virgül, boşluk, büyük harf, Türkçe harf.
 */

/** Fold Turkish letters so ASCII-ish regexes match KAPAK / İÇİNDEKİLER. */
export function foldTr(text: string): string {
  return text
    .normalize("NFKD")
    .replace(/\p{M}/gu, "")
    .replace(/ı/g, "i")
    .replace(/İ/g, "i")
    .replace(/[ğĞ]/g, "g")
    .replace(/[üÜ]/g, "u")
    .replace(/[şŞ]/g, "s")
    .replace(/[öÖ]/g, "o")
    .replace(/[çÇ]/g, "c")
    .toLowerCase();
}

export const SUPERSCRIPT: Record<string, string> = {
  "⁰": "0",
  "¹": "1",
  "²": "2",
  "³": "3",
  "⁴": "4",
  "⁵": "5",
  "⁶": "6",
  "⁷": "7",
  "⁸": "8",
  "⁹": "9",
};

export function unfoldSuperscripts(text: string): string {
  return text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]+/g, (run) =>
    `^${[...run].map((char) => SUPERSCRIPT[char] ?? "").join("")}`,
  );
}

/** `≠` gibi işleçler NFKD'de "=" + birleşik işarete ayrışır; foldTr işareti atınca `a≠0` `a=0` olurdu. Önce ASCII. */
const UNICODE_OPERATORS: [RegExp, string][] = [
  [/≠/g, "!="],
  [/≤/g, "<="],
  [/≥/g, ">="],
  [/[×·∗⋅]/g, "*"],
  [/[−–—]/g, "-"],
  [/÷/g, "/"],
  [/≈/g, "~"],
];

const LATEX: [RegExp, string][] = [
  [/\\(?:left|right)\b/g, ""],
  [/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, "$1/$2"],
  [/\\(?:cdot|times)\b/g, "*"],
  [/\\(?:neq|ne)\b/g, "!="],
  [/\\(?:leq|le)\b/g, "<="],
  [/\\(?:geq|ge)\b/g, ">="],
  [/\\pm\b/g, "+-"],
  [/\\(?:mathrm|text|textrm|operatorname)\{([^{}]*)\}/g, "$1"],
];

/** Boşlukları koruyan ortak normalizasyon; parçalama ve kök çıkarma bunun üstünde çalışır. */
export function mathNormalizeLoose(text: string): string {
  let out = unfoldSuperscripts(text);
  for (const [pattern, replacement] of UNICODE_OPERATORS) out = out.replace(pattern, replacement);
  out = out.normalize("NFKC");
  for (const [pattern, replacement] of LATEX) out = out.replace(pattern, replacement);
  out = out.replace(/[\\$]/g, "");
  out = out.replace(/(\d),(\d)/g, "$1.$2");
  out = foldTr(out);
  return out.replace(/\s+/g, " ").trim();
}

/** Boşluksuz parça: açık çarpım harfin önünde düşer (`m*a` = `ma`), koşul ayracı virgül olur. */
export function denseNormalize(dense: string): string {
  let out = dense.replace(/\s+/g, "").replace(/;/g, ",");
  out = out.replace(/\*(?=[a-z(])/g, "");
  out = out.replace(/\(([^()]*(?:!=|<=|>=|=|<|>)[^()]*)\)/g, ",$1");
  out = out.replace(/[.,:]+$/g, "").replace(/,+/g, ",").replace(/^,/, "");
  return out;
}

/**
 * `mathNormalize("f(x) = ax + b (a ≠ 0)") === mathNormalize("f(x) = ax + b, a ≠ 0")`.
 * NFKC, Unicode işleçler ASCII, ondalık virgül nokta, boşluk / ters bölü / $ yok, `\frac{a}{b}` → a/b,
 * `\cdot` → *, üst simge → ^n, koşul ayracı virgül, küçük harf.
 */
export function mathNormalize(expression: string): string {
  return denseNormalize(mathNormalizeLoose(expression));
}

const COMPARISON_AT = /(?:!=|<=|>=|=|<|>)/;

/**
 * Bir formül satırının bağıntı anahtarları (6 Kasım 2026, sınav sabahı kâğıdı). Satır `;` ile ayrılmış birden çok
 * bağıntı taşıyabilir; her biri ayrı anahtar olur. Bağıntının önündeki düz metin ("şu durumda N = …") anahtara
 * girmez: anahtar karşılaştırma işlecinden önceki son sözcükten başlar. LaTeX alt simgesi (`x_{k}`, `x_k`) Unicode
 * alt simgeyle (`xₖ`) aynı anahtara iner. Karşılaştırma işleci taşımayan parça anahtar vermez.
 */
export function formulaRelationKeys(expression: string): string[] {
  const keys: string[] = [];
  for (const raw of expression.split(/;|\n/)) {
    let part = raw
      // LaTeX alt simge düz yazılır (`x_{k}` = `x_k` = `xₖ`); tek karakterli üs ayracı düşer (`x^{n}` = `x^n`).
      .replace(/_\{([^{}]*)\}/g, "$1")
      .replace(/_([\p{L}\p{N}])/gu, "$1")
      .replace(/\^\{([\p{L}\p{N}])\}/gu, "^$1")
      // Harfli üst simge (`xⁿ`) NFKC'de düz harfe iner ve üs olduğu kaybolurdu: `^n` yazılır.
      .replace(/[ⁱⁿᵃ-ᵡʰ-ʸ]/gu, (char) => `^${char.normalize("NFKC")}`);
    const loose = mathNormalizeLoose(part);
    const at = loose.search(COMPARISON_AT);
    if (at <= 0) continue;
    const before = loose.slice(0, at).trimEnd();
    const start = before.lastIndexOf(" ") + 1;
    part = loose.slice(start);
    const key = denseNormalize(part);
    if (key && !keys.includes(key)) keys.push(key);
  }
  return keys;
}
