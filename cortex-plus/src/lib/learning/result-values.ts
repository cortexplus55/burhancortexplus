/**
 * Sonuç değeri okuyucuları (29 Ekim 2026, Paket H).
 *
 * `mock-exam/grade.ts` içindeki saf sayı ve eşitlik zinciri ayrıştırıcıları buraya taşındı: açıklama ↔ cevap
 * anahtarı tutarlılığı (`answer-consistency.ts`) aynı okuyucuları ders, test ve deneme için kullanır. grade.ts
 * aynı adları yeniden dışa aktarır; davranış değişmedi, yalnız iki ekleme var:
 * - `normalizeNumberText`: Unicode eksi (−) ve işaret yerindeki uzun tire (–) ASCII eksi olur, Türkçe binlik
 *   noktası düşer ("3.500" → 3500), ondalık virgül noktaya çevrilir. Aralık tiresi ("8–12 mm") dokunulmaz.
 * - `optionValueIndexes`: bir değeri taşıyan şıkların indeksleri (hoşgörülü eşitlik).
 *
 * Ders kelimesi yok; yalnız sayı ve işaret kuralları.
 */

const NUMBER_SRC = String.raw`-?\d+(?:[.,]\d+)?`;
const LEADING_VALUE = new RegExp(String.raw`^\s*(${NUMBER_SRC})(?:\s*\/\s*(${NUMBER_SRC}))?`, "u");
const TRAILING_FRACTION = new RegExp(String.raw`(${NUMBER_SRC})\s*\/\s*(${NUMBER_SRC})\s*\D*$`, "u");

/**
 * Sayı metnini ayrıştırıcıların okuyacağı biçime getirir. Binlik kuralı yalnız 1-3 basamakla başlayan ve
 * üçer basamaklı gruplarla süren yazımda ("1.234.567"); "0.500" gibi ondalık yazım korunur.
 */
export function normalizeNumberText(text: string): string {
  return text
    .replace(/−/g, "-")
    // Uzun tire yalnız işaret yerindeyse eksidir ("= –3", "(–2"); iki rakam arasında aralıktır ("8–12").
    .replace(/(^|[^\d\p{L}])–(?=\s*\d)/gu, "$1-")
    .replace(/(?<![\d.,])([1-9]\d{0,2})((?:\.\d{3})+)(?![\d.])/g, (_match, head: string, groups: string) => `${head}${groups.replace(/\./g, "")}`)
    .replace(/(\d),(\d)/g, "$1.$2");
}

export function toNumber(raw: string): number | null {
  const value = Number(normalizeNumberText(raw));
  return Number.isFinite(value) ? value : null;
}

/** İki sayı aynı mı: mutlak 1e-9 ya da göreli 1e-6. */
export function sameNumber(a: number, b: number): boolean {
  return Math.abs(a - b) <= Math.max(1e-9, Math.abs(b) * 1e-6);
}

/**
 * Metindeki sayılar (normalize edilmiş). Rakama ya da harfe yapışık tire işaret değildir ("3-5" aralığı 3 ve 5;
 * "x-2" ifadede 2): yalnız boşluk, eşittir ya da parantezden sonra gelen tire eksidir.
 */
export function numbersIn(text: string): number[] {
  const normalized = normalizeNumberText(text);
  const out: number[] = [];
  for (const match of normalized.matchAll(/-?\d+(?:\.\d+)?/g)) {
    let raw = match[0];
    const at = match.index ?? 0;
    // "3-5", "x-2": tire rakamdan ya da harften sonra geliyor → işaret değil.
    if (raw.startsWith("-") && /[\d\p{L}]/u.test(normalized[at - 1] ?? "")) raw = raw.slice(1);
    const value = Number(raw);
    if (Number.isFinite(value)) out.push(value);
  }
  return out;
}

/**
 * Eşitlik kuyruğunun başındaki değer: "= 12 cm²", "= 3/2", "= 10 W." sonuçtur;
 * "= 24^2 / (4*12)" işlem, "= 2x" ifadedir — sonuç değil.
 */
export function leadingValue(part: string): number | null {
  const match = part.match(LEADING_VALUE);
  if (!match) return null;
  const rest = part.slice(match[0].length);
  if (/^\s*[+\-*/^(·×÷√:]/.test(rest)) return null;
  const glued = rest.match(/^([a-zA-ZçğıöşüÇĞİÖŞÜµΩ°]+)/u)?.[1];
  if (glued && glued.length === 1 && !/[mgsNJWVALKΩ°]/.test(glued)) return null;
  const whole = toNumber(match[1] ?? "");
  if (whole == null) return null;
  if (match[2] == null) return whole;
  const divisor = toNumber(match[2]);
  return divisor ? whole / divisor : null;
}

/** Cevabın sonundaki değer: kesirse bölümü ("x = 3/2" → 1,5), yoksa son sayı. */
export function trailingValue(answer: string): number | null {
  const text = normalizeNumberText(answer);
  const fraction = text.match(TRAILING_FRACTION);
  if (fraction) {
    const whole = toNumber(fraction[1] ?? "");
    const divisor = toNumber(fraction[2] ?? "");
    if (whole != null && divisor) return whole / divisor;
  }
  const matches = [...text.matchAll(/-?\d+(?:\.\d+)?/g)];
  const last = Number(matches.at(-1)?.[0]);
  return Number.isFinite(last) ? last : null;
}

/** Cümle, satır, ";" ve bağlaç ("çünkü", "ise", "ve") ayrı eşitlik zinciri açar. */
const CLAUSE_SPLIT =
  /\n+|;|(?<=\D)\.\s+|\.\s+(?=\p{Lu})|[!?]\s+|,\s+|⇒|→|(?<![\p{L}\p{N}])(?:çünkü|cunku|ise|dolayısıyla|dolayisiyla|buradan|yani|ve|öyleyse|o halde)(?![\p{L}\p{N}])/iu;

export type EqualityChain = { left: string; values: number[] };

const variableKey = (text: string) => text.toLocaleLowerCase("tr").replace(/[^\p{L}\p{N}]/gu, "");

export function chainsOf(text: string): EqualityChain[] {
  const out: EqualityChain[] = [];
  for (const clause of normalizeNumberText(text).split(CLAUSE_SPLIT)) {
    if (!clause.includes("=")) continue;
    const parts = clause.split("=");
    const values = parts.slice(1).map(leadingValue).filter((value): value is number => value != null);
    out.push({ left: variableKey(parts[0] ?? ""), values });
  }
  return out;
}

/** Örnek cevabın sonuç değişkeni: son zincirin sol tarafı ("Pmax", "x", "Alan"); uzun ifade sayılmaz. */
export function resultVariable(modelAnswer: string): string | null {
  const left = chainsOf(modelAnswer).at(-1)?.left ?? "";
  return /^\p{L}[\p{L}\p{N}]{0,19}$/u.test(left) ? left : null;
}

/**
 * Cevapta "sonuç" diye okunan sayılar (29 Ekim 2026): her eşitlik kuyruğunun değeri (kesir dahil)
 * ve cevabın son sayısı. Eskiden yalnız son sayı okunuyordu: "Alan = 3·4 = 12 cm² (3 ve 4 kenarlar)"
 * 4 sayılıp doğru cevap çelişkili görünüyor, "x = 3/2" 2 okunuyordu.
 */
export function claimedResults(answer: string): number[] {
  const values = chainsOf(answer).flatMap((chain) => chain.values);
  const tail = trailingValue(answer);
  if (tail != null) values.push(tail);
  return values;
}

/**
 * Öğrencinin SON sonucu: örnek cevabın sonuç değişkeniyle başlayan zincirin son değeri
 * ("Pmax = 24²/(4·12) = 10 W" → 10; "Rth = 12 Ω" ara değerdir, sonuç değil); değişken
 * eşleşmezse son zincirin son değeri ve cevabın son sayısı.
 */
export function finalResults(answer: string, modelAnswer: string | null | undefined): number[] {
  const chains = chainsOf(answer).filter((chain) => chain.values.length);
  const variable = resultVariable(modelAnswer ?? "");
  const named = variable ? chains.filter((chain) => chain.left === variable).map((chain) => chain.values.at(-1)!) : [];
  if (named.length) return named;
  const out: number[] = [];
  const last = chains.at(-1)?.values.at(-1);
  if (last != null) out.push(last);
  const tail = trailingValue(answer);
  if (tail != null) out.push(tail);
  return out;
}

/** Şıkta taşınan değerler: sayılar ve baştaki kesir ("3/2" → 1,5). */
export function optionValues(option: string): number[] {
  const values = numbersIn(option);
  const fraction = normalizeNumberText(option).match(/^\s*(-?\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\s*(?:$|[^\d/])/);
  if (fraction) {
    const whole = Number(fraction[1]);
    const divisor = Number(fraction[2]);
    if (Number.isFinite(whole) && divisor) values.push(whole / divisor);
  }
  return values;
}

/** `value`yi taşıyan şıkların indeksleri (hoşgörülü eşitlik). */
export function optionValueIndexes(options: readonly string[], value: number): number[] {
  return options.flatMap((option, index) => (optionValues(option).some((item) => sameNumber(item, value)) ? [index] : []));
}

/**
 * Açıklamanın ilk sonuç cümlesi: ilk cümle ya da ";" öncesi. Şema gereği explanation önce doğrunun nedenini
 * söyler; sonraki cümleler çeldiricileri anlatır ve başka şık değerleri taşır.
 */
export function firstResultSentence(text: string): string {
  const [first = ""] = text.trim().split(/\n+|;|(?<=\D)\.\s+|\.\s+(?=\p{Lu})|[!?]\s+/u);
  return first.trim();
}
