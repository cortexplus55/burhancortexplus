import { MATH_SPAN_RE } from "@/lib/text/bracket-spans";

/*
  Düz yazılmış matematik → KaTeX (öğretmen v3, 21 Kasım 2026, ürün sahibi: "çirkin düz √20 yerine üstü çizgili kök").
  Öğretmen istemi formülleri LaTeX ile yazdırır; model yine de düz Unicode yazarsa ("√45 = √9 × √5", "4 × 5", "x² + 1 = 0")
  bu ön işleyici ifadeyi `$…$` içine alır ve TeX'e çevirir: kök gerçek kök şapkasıyla, çarpı ve üs matematik dizgisiyle
  çizilir. Yalnız EKRANDA: kayıt, kopya ve ses aynı metni okur.

  Dokunmadığı yerler: zaten formül olan `$…$`, `$$…$$`, `\(…\)`, kod, `[[…]]` işaretleri ve bağlantılar. Tetik dar tutulur:
  ifadede kök ya da × ÷ · ya da (üs ile birlikte = + −) olmalı; "2-3 gün" (aralık), "A ve B", "m/s²" (birim) dokunulmaz.
  Türkçe ek dışarıda kalır: "√9'un" → "$\sqrt{9}$'un". Saf; ağ yok.
*/

const SUP_MAP: Record<string, string> = { "⁰": "0", "¹": "1", "²": "2", "³": "3", "⁴": "4", "⁵": "5", "⁶": "6", "⁷": "7", "⁸": "8", "⁹": "9" };
const SUP = "⁰¹²³⁴⁵⁶⁷⁸⁹";

const NUMBER = String.raw`\d+(?:[.,]\d+)?`;
const VAR = String.raw`(?<![\p{L}\d])\p{L}(?![\p{L}])`;
const PAREN = String.raw`\([^()\n]{1,40}\)`;
const ROOTED = String.raw`(?:${NUMBER})?\s?[√∛](?:${NUMBER}|\p{L}(?![\p{L}])|${PAREN})`;
const OPERAND = String.raw`(?:${ROOTED}|${NUMBER}(?:\p{L}(?![\p{L}]))?|${VAR}|${PAREN})[${SUP}]*`;
const OPERATOR = String.raw`\s*(?:[×÷·⋅=+−<>≤≥≠≈±]|\s-\s|(?<=[\d\p{L})])-(?=[\d√(]))\s*`;
const EXPRESSION = new RegExp(String.raw`(?<![\p{L}\d.,$\\])${OPERAND}(?:${OPERATOR}${OPERAND})*`, "gu");

/** Korunan parçalar: formül, kod, [[…]] işaretleri, Markdown bağlantısı. */
const PROTECTED = new RegExp(
  [MATH_SPAN_RE.source, "```[\\s\\S]*?```", "`[^`\\n]+`", "\\[\\[[^\\]]*\\]\\]", "\\[[^\\]\\n]+\\]\\([^)\\s]+\\)"].join("|"),
  "g",
);

function shouldTexify(expression: string): boolean {
  if (/[√∛]/.test(expression)) return true;
  const operands = expression.split(/[×÷·⋅=+−<>≤≥≠≈±]|\s-\s/).filter((part) => part.trim()).length;
  if (/[×÷·⋅]/.test(expression) && operands >= 2 && /\d/.test(expression)) return true;
  return new RegExp(`[${SUP}]`).test(expression) && /[=+−]/.test(expression) && operands >= 2;
}

function supToTex(text: string): string {
  return text.replace(new RegExp(`[${SUP}]+`, "g"), (run) => `^{${[...run].map((ch) => SUP_MAP[ch] ?? "").join("")}}`);
}

function numberToTex(text: string): string {
  // Türkçe ondalık virgül KaTeX'te boşluk açmasın: 9,8 → 9{,}8.
  return text.replace(/(\d),(\d)/g, "$1{,}$2");
}

function expressionToTex(expression: string): string {
  let tex = expression.trim();
  tex = tex.replace(/[√∛]\s*\(([^()\n]{1,40})\)/g, (all, inner: string) => `${all.startsWith("∛") ? "\\sqrt[3]" : "\\sqrt"}{${inner.trim()}}`);
  tex = tex.replace(/∛\s*([\d.,]+|\p{L})/gu, "\\sqrt[3]{$1}");
  tex = tex.replace(/√\s*([\d.,]+|\p{L})/gu, "\\sqrt{$1}");
  tex = tex
    .replace(/\s*×\s*/g, " \\times ")
    .replace(/\s*÷\s*/g, " \\div ")
    .replace(/\s*[·⋅]\s*/g, " \\cdot ")
    .replace(/−/g, "-")
    .replace(/≤/g, " \\leq ")
    .replace(/≥/g, " \\geq ")
    .replace(/≠/g, " \\neq ")
    .replace(/≈/g, " \\approx ")
    .replace(/±/g, " \\pm ");
  tex = supToTex(tex);
  tex = numberToTex(tex);
  return tex.replace(/\s{2,}/g, " ").trim();
}

function texifyPlain(text: string): string {
  return text.replace(EXPRESSION, (expression) => {
    if (!shouldTexify(expression)) return expression;
    const lead = expression.match(/^\s*/)?.[0] ?? "";
    const tail = expression.match(/\s*$/)?.[0] ?? "";
    return `${lead}$${expressionToTex(expression)}$${tail}`;
  });
}

/** Ekranda gösterilecek metindeki düz matematiği KaTeX formülüne çevirir; korunan parçalara dokunmaz. */
export function texifyUnicodeMath(text: string): string {
  const source = String(text ?? "");
  if (!/[√∛×÷·⋅⁰¹²³⁴⁵⁶⁷⁸⁹]/.test(source)) return source;
  let out = "";
  let cursor = 0;
  for (const match of source.matchAll(PROTECTED)) {
    const at = match.index ?? 0;
    out += texifyPlain(source.slice(cursor, at)) + match[0];
    cursor = at + match[0].length;
  }
  return out + texifyPlain(source.slice(cursor));
}
