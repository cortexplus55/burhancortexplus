import { MEASURE } from "@/lib/learning/lesson-claims";

/**
 * Sembolik matematik koruması (Faz 2, madde 1).
 *
 * Metin son-işleyicileri (sohbet sağlaması, ders/soru/podcast aritmetik denetimi, ses kılavuzu) eşitliği sayısal
 * olarak okur. Değişkenli bir denklemin içindeki sayısal parça ("ax + b − b = c − b" içinde yalnız "b − b = c − b")
 * tek başına okununca iki taraf "eşit değil" görünür ve doğru adım yanlış bir cümleyle değiştirilirdi. Kural:
 * içinde harf/değişken, LaTeX komutu, kimyasal ok ya da eşitsizlik bulunan bir ifadeye aritmetik eşitlik testi
 * uygulanmaz ve o ifadenin metni otomatik değiştirilmez.
 *
 * Ölçü birimi (sayının hemen ardındaki "g", "mol", "kJ/mol" …) ve iki sayı arasındaki çarpı olarak "x" değişken
 * değildir: birimli aritmetik ("a g + b g = c g") denetimi korunur.
 */

const LETTER = /[A-Za-zÇĞİÖŞÜçğıöşü\p{L}]/u;
const LATEX = /\$|\\[A-Za-z]+|\\[{}()[\]]/;
const ARROW = /->|=>|<=>|<->|→|⇌|⟶|⟹|↔|⇄|⇆|⇋|⟷/;
const INEQUALITY = /[<>≤≥≠≦≧⩽⩾]|!=/;
/** Sayıya yapışmayan, kendi başına cümle bağlayan kısa sözcükler: ifade sınırıdır, değişken değildir. */
const STOP_WORDS = new Set([
  "ve", "ile", "de", "da", "ya", "yani", "ise", "bu", "şu", "o", "ki", "mi", "mı", "mu", "mü", "ne", "her", "en",
  "the", "and", "or", "is", "so", "if", "of", "to", "in", "on", "at",
]);
/** Fonksiyon adları ifadenin parçasıdır ve ifadeyi sembolik yapar. */
const FUNCTION_WORDS = /^(?:sin|cos|tan|tg|cot|cotg|sec|csc|log|ln|lg|exp|lim|max|min|det|sgn|arcsin|arccos|arctan)$/i;

const TRAILING_PUNCT = /[,.;:!?…]+$/;
const MATH_OPERATOR = /[+\-−–×÷*/^=·∙√∑∫π]/;

let unitRe: RegExp | null = null;
function unitPattern(): RegExp {
  // MEASURE ders modülü yüklenince okunur (döngüsel içe aktarmada ilk anda boş olabilir).
  if (!unitRe) {
    unitRe = new RegExp(
      String.raw`(\d(?:[.,]\d+)?)\s*(?:${MEASURE}|°F|km|cm|mm|mg|µg|ms|min|sn|kN|mA|kW|kWh|MHz|Hz|mV|V|W|N|J|A|Ω|ohm|atm|bar|cal|h|s|m)(?:\s*[·∙/]\s*(?:${MEASURE}|s|h|m|K|°C)(?:[⁻\-]?[¹²³123])?)*(?:[²³]|\^\s*[23])?(?![\p{L}\d_])`,
      "gu",
    );
  }
  return new RegExp(unitRe.source, unitRe.flags);
}

/**
 * Bir ifade (eşitliğin bütün koşusu) sembolik mi: değişken, LaTeX, kimyasal ok ya da eşitsizlik.
 * Birimler ve sayılar arası çarpı "x" değişken sayılmaz.
 */
export function isSymbolicMathExpression(expr: string): boolean {
  if (!expr) return false;
  if (LATEX.test(expr) || ARROW.test(expr) || INEQUALITY.test(expr)) return true;
  if (!LETTER.test(expr)) return false;
  let rest = expr
    // 6,02 × 10²³ ve 3 x 10^5 bilimsel yazımı.
    .replace(/(\d)\s*[x×·]\s*(?=10(?:\^|[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]))/g, "$1 * ")
    // Sayılar arası çarpı olarak yazılmış "x" (boşluklu): "3 x 4".
    .replace(/(\d)\s+[xX]\s+(?=\d)/g, "$1 * ");
  rest = rest.replace(unitPattern(), "$1");
  // Yalnız rakamdan sonra gelen yüzde/derece işaretleri harf değildir.
  return LETTER.test(rest);
}

type Token = { text: string; start: number; end: number };

function tokensOf(text: string): Token[] {
  const out: Token[] = [];
  for (const match of text.matchAll(/\S+/g)) {
    const start = match.index ?? 0;
    out.push({ text: match[0], start, end: start + match[0].length });
  }
  return out;
}

/** Bir belirteç ifadenin parçası olabilir mi (rakam, işlem, kısa değişken, fonksiyon, LaTeX, parantez). */
function mathy(raw: string): boolean {
  const token = raw.replace(TRAILING_PUNCT, "").replace(/^[("'“‘[{]+|[)"'”’\]}]+$/g, "");
  if (!token) return /^[()[\]{}]+$/.test(raw.replace(TRAILING_PUNCT, ""));
  if (LATEX.test(token) || ARROW.test(token) || INEQUALITY.test(token)) return true;
  if (/\d/.test(token) || MATH_OPERATOR.test(token)) return true;
  const word = token.toLocaleLowerCase("tr-TR");
  if (STOP_WORDS.has(word)) return false;
  if (FUNCTION_WORDS.test(token)) return true;
  // Tek ya da iki harfli değişken / kimyasal sembol ("x", "ab", "Fe").
  return /^[\p{L}]{1,2}['′]?$/u.test(token);
}

type Run = { text: string; start: number };

/**
 * Metinde [start, end) aralığındaki eşleşmenin içinde bulunduğu ifade koşusu. Sola ve sağa doğru boşlukla ayrılmış
 * belirteçler ifade parçası oldukça eklenir; cümle sözcüğünde ya da noktalama ile biten belirteçte durur.
 */
function runAround(text: string, start: number, end: number): Run {
  if (!text) return { text: "", start: 0 };
  const lineStart = text.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
  const nextBreak = text.indexOf("\n", end);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const line = text.slice(lineStart, lineEnd);
  const relStart = start - lineStart;
  const relEnd = end - lineStart;
  const tokens = tokensOf(line);
  if (!tokens.length) return { text: text.slice(start, end), start };
  let first = tokens.findIndex((token) => token.end > relStart);
  if (first === -1) first = tokens.length - 1;
  let last = first;
  for (let i = first; i < tokens.length; i += 1) {
    if (tokens[i]!.start < relEnd) last = i;
  }
  // Sola: önceki belirteç noktalama ile bitiyorsa (cümle/yan cümle sınırı) ya da ifade parçası değilse dur.
  while (first > 0) {
    const prev = tokens[first - 1]!.text;
    if (TRAILING_PUNCT.test(prev) && !/^\d+[.,]$/.test(prev)) break;
    if (!mathy(prev)) break;
    first -= 1;
  }
  // Sağa: belirteç ifade parçasıysa eklenir; noktalamayla bitiyorsa eklenip durulur.
  if (!TRAILING_PUNCT.test(tokens[last]!.text)) {
    while (last < tokens.length - 1) {
      const next = tokens[last + 1]!.text;
      if (!mathy(next)) break;
      last += 1;
      if (TRAILING_PUNCT.test(next)) break;
    }
  }
  // Eşleşme bir belirtecin ortasından başlayıp bitebilir ("2x"in "2"si): belirteçlerin tamamı alınır.
  const from = Math.min(tokens[first]!.start, relStart);
  const to = Math.max(tokens[last]!.end, relEnd);
  return { text: line.slice(from, to).replace(TRAILING_PUNCT, ""), start: lineStart + from };
}

export function expressionRunAround(text: string, start: number, end: number): string {
  return runAround(text, start, end).text;
}

/**
 * [start, end) eşleşmesi sembolik bir ifadenin parçası mı. Aritmetik denetimler bu durumda eşleşmeyi atlar.
 *
 * Koşuda LaTeX, kimyasal ok ya da eşitsizlik varsa koşunun tamamı semboliktir. Değişken ise eşitliğin TARAFINA
 * bakılır: eşleşmenin değdiği taraflardan biri değişken taşıyorsa ("ax + b − b" tarafı) denetim yok; değişken
 * yalnız eşleşmenin dışında kalan bir tarafta, niceliğin adı olarak duruyorsa ("N = a × b = c" içinde "a × b = c")
 * sayısal eşitlik değişkenden bağımsızdır ve denetlenir.
 */
export function isInsideSymbolicMath(text: string, start: number, end: number): boolean {
  const run = runAround(text, start, end);
  if (!run.text) return false;
  if (LATEX.test(run.text) || ARROW.test(run.text) || INEQUALITY.test(run.text)) return true;
  if (!LETTER.test(run.text)) return false;
  const relStart = start - run.start;
  const relEnd = end - run.start;
  let sideStart = 0;
  const cuts = [...run.text.matchAll(/=|≈|~/g)].map((match) => match.index ?? 0);
  cuts.push(run.text.length);
  for (const cut of cuts) {
    const side = run.text.slice(sideStart, cut);
    const overlaps = sideStart < relEnd && cut > relStart;
    if (overlaps && isSymbolicMathExpression(side)) return true;
    sideStart = cut + 1;
  }
  return false;
}

/**
 * Satırda eşitlik/eşitsizlik/ok taşıyan sembolik bir ifade var mı. Biçim düzelticileri (ham üs → üst simge vb.)
 * böyle bir satıra dokunmaz: öğrencinin gördüğü denklem kaydedilenle karakteri karakterine aynı kalır.
 */
export function lineHasSymbolicEquation(line: string): boolean {
  if (!/[=<>≤≥≠⇌→]|->|=>/.test(line)) return false;
  for (const match of line.matchAll(/=|<|>|≤|≥|≠|⇌|→|->|=>/g)) {
    const at = match.index ?? 0;
    if (isSymbolicMathExpression(runAround(line, at, at + match[0].length).text)) return true;
  }
  return false;
}
