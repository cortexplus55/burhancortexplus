/**
 * Genel hesap denetimi: dört işlem, kesir, parantez, üslü sayı, kök, π ve
 * özel açıların trigonometrisi (açı ° ya da π ile yazılmışsa).
 *
 * exponent-key.ts yalnızca aynı tabanlı üslü işleme bakıyordu; 29 Eylül'de
 * canlı derste "(3⁴)² = 3¹²" anahtarı onunla yakalandı. Trigonometri, kesir
 * ya da düz aritmetik sorusunda aynı tür hata ("sin 30° = √3/2") hiçbir
 * denetime girmiyordu. İlke aynı: yalnızca kesin hesaplanan ifadeye hüküm
 * verilir; okunamayan, harfli, sözel ya da iki anlamlı yazıda null döner.
 *
 * Yazım kuralları (ders kitabı alışkanlığı):
 * - "3/4" bitişik yazılmışsa kesirdir, işlemden önce hesaplanır:
 *   "3/4 ÷ 2/5" = (3/4) ÷ (2/5).
 * - "2π", "2√3" tek sayıdır: "π × 360 ÷ 2π" = 180.
 * - Yalnız başına açı iki türlü okunur: "180° = π" (radyan) ve
 *   "1 × 180 / π = 57.2958°" (derece sayısı). Biri tutarsa eşittir.
 * - Yazılan ondalık basamak kadar yuvarlama payı verilir.
 */

const SUP_DIGITS = "⁰¹²³⁴⁵⁶⁷⁸⁹";

/** Üst simge dizisini "^(...)" biçimine çevirir: "3²ˣ⁴" → "3^(2*4)". */
function expandSuperscripts(text: string): string {
  return text.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ˣ⁽⁾]+/g, (run) => {
    const plain = [...run]
      .map((char) => {
        const digit = SUP_DIGITS.indexOf(char);
        if (digit >= 0) return String(digit);
        return { "⁺": "+", "⁻": "-", ˣ: "*", "⁽": "(", "⁾": ")" }[char] ?? "";
      })
      .join("");
    return `^(${plain})`;
  });
}

function normalize(text: string): string {
  const grouped = text
    .replace(/(\d),(\d)/g, "$1.$2")
    // Örtük çarpım tek sayıdır: "2π", "2√3".
    .replace(/(\d+(?:\.\d+)?)\s*(π|√\d+(?:\.\d+)?)/g, "($1$2)")
    // Bitişik kesir: "3/4". Kökten sonra gelen "√3/2" kesir değildir, (√3)/2'dir.
    .replace(/(?<![√\d.)])(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)(?![\d.])/g, "($1/$2)");
  return expandSuperscripts(
    grouped
      .replace(/[×·*]/g, "*")
      .replace(/[÷/]/g, "/")
      .replace(/[−–]/g, "-")
      .replace(/π/g, "p")
      .replace(/√/g, "r")
      .replace(/°/g, "d"),
  )
    .replace(/\b(sin|cos|tan|cot)\b/gi, (name) => ({ sin: "S", cos: "C", tan: "T", cot: "K" })[name.toLowerCase()] ?? name)
    .replace(/\s+/g, "");
}

type Value = { value: number; degrees: boolean; hasPi: boolean };

class Parser {
  private index = 0;
  constructor(private readonly text: string) {}

  parse(): Value | null {
    const result = this.expr();
    if (!result || this.index !== this.text.length || !Number.isFinite(result.value)) return null;
    return result;
  }

  private peek(): string {
    return this.text[this.index] ?? "";
  }

  private expr(): Value | null {
    let left = this.term();
    while (left && (this.peek() === "+" || this.peek() === "-")) {
      const op = this.text[this.index++];
      const right = this.term();
      if (!right) return null;
      left = {
        value: op === "+" ? left.value + right.value : left.value - right.value,
        degrees: left.degrees || right.degrees,
        hasPi: left.hasPi || right.hasPi,
      };
    }
    return left;
  }

  private term(): Value | null {
    let left = this.power();
    while (left) {
      const op = this.peek();
      const implicit = op === "p" || op === "(" || op === "r";
      if (op !== "*" && op !== "/" && !implicit) break;
      if (!implicit) this.index += 1;
      const right = this.power();
      if (!right) return null;
      if (op === "/" && right.value === 0) return null;
      left = {
        value: op === "/" ? left.value / right.value : left.value * right.value,
        degrees: left.degrees || right.degrees,
        hasPi: left.hasPi || right.hasPi,
      };
    }
    return left;
  }

  private power(): Value | null {
    const base = this.unary();
    if (!base) return null;
    if (this.peek() !== "^") return base;
    this.index += 1;
    const exponent = this.power();
    if (!exponent) return null;
    return { value: base.value ** exponent.value, degrees: false, hasPi: base.hasPi };
  }

  private unary(): Value | null {
    const char = this.peek();
    if (char === "-") {
      this.index += 1;
      const inner = this.unary();
      return inner ? { ...inner, value: -inner.value } : null;
    }
    if (char === "r") {
      this.index += 1;
      const inner = this.power();
      if (!inner || inner.value < 0) return null;
      return { value: Math.sqrt(inner.value), degrees: false, hasPi: inner.hasPi };
    }
    if (char && "SCTK".includes(char)) {
      this.index += 1;
      const argument = this.power();
      if (!argument) return null;
      // Açı birimi yazılı değilse hüküm yok: "sin 30" derece mi radyan mı belirsiz.
      if (!argument.degrees && !argument.hasPi) return null;
      const radians = argument.degrees ? (argument.value * Math.PI) / 180 : argument.value;
      const sin = Math.sin(radians);
      const cos = Math.cos(radians);
      const clean = (x: number) => (Math.abs(x) < 1e-12 ? 0 : x);
      if (char === "S") return { value: clean(sin), degrees: false, hasPi: false };
      if (char === "C") return { value: clean(cos), degrees: false, hasPi: false };
      if (char === "T") return Math.abs(cos) < 1e-12 ? null : { value: clean(sin / cos), degrees: false, hasPi: false };
      return Math.abs(sin) < 1e-12 ? null : { value: clean(cos / sin), degrees: false, hasPi: false };
    }
    return this.primary();
  }

  private primary(): Value | null {
    const char = this.peek();
    if (char === "(") {
      this.index += 1;
      const inner = this.expr();
      if (!inner || this.peek() !== ")") return null;
      this.index += 1;
      return this.degreeSuffix(inner);
    }
    if (char === "p") {
      this.index += 1;
      return { value: Math.PI, degrees: false, hasPi: true };
    }
    const match = this.text.slice(this.index).match(/^\d+(?:\.\d+)?/);
    if (!match) return null;
    this.index += match[0].length;
    return this.degreeSuffix({ value: Number(match[0]), degrees: false, hasPi: false });
  }

  private degreeSuffix(value: Value): Value {
    if (this.peek() !== "d") return value;
    this.index += 1;
    return { ...value, degrees: true };
  }
}

/** Bir ifadenin olası okumaları ve yazıldığı ondalık basamak sayısı. */
type Reading = { values: number[]; decimals: number };

function read(text: string): Reading | null {
  const trimmed = text.trim().replace(/[.;:?!]+$/g, "").trim();
  if (!trimmed || /[A-Za-zÇĞİÖŞÜçğıöşüᵃ-ᶻ]/.test(trimmed.replace(/\b(?:sin|cos|tan|cot)\b/gi, ""))) return null;
  if (!/\d|π/.test(trimmed)) return null;
  let parsed: Value | null = null;
  try {
    parsed = new Parser(normalize(trimmed)).parse();
  } catch {
    return null;
  }
  if (!parsed) return null;
  const values =
    parsed.degrees && !parsed.hasPi ? [(parsed.value * Math.PI) / 180, parsed.value] : [parsed.value];
  const decimals = Math.max(0, ...[...trimmed.matchAll(/\d[.,](\d+)/g)].map((match) => match[1]?.length ?? 0));
  return { values, decimals };
}

/** Tam bir matematik ifadesinin değeri (yalnız açı radyana çevrilir); okunamazsa null. */
export function evaluateMath(text: string): number | null {
  return read(text)?.values[0] ?? null;
}

function agree(left: Reading, right: Reading): boolean {
  const decimals = Math.max(left.decimals, right.decimals);
  const rounding = decimals ? 0.51 * 10 ** -decimals : 0;
  return left.values.some((a) =>
    right.values.some((b) => Math.abs(a - b) <= Math.max(rounding, 1e-9 * Math.max(1, Math.abs(a), Math.abs(b)))),
  );
}

const MATH_CHARS = "0-9⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻ˣ⁽⁾.,()×÷·*/+\\-−–√π°^\\s";
// Fonksiyon adı kelime başında olmalı: "kesin 3" içindeki "sin" sayılmaz.
const FN = "(?<!\\p{L})(?:sin|cos|tan|cot)\\s*";
const SPAN = new RegExp(`(?:${FN}|[${MATH_CHARS}])+`, "giu");
const TAIL_RUN = new RegExp(`(?:${FN}|[${MATH_CHARS}])+$`, "iu");
const HEAD_RUN = new RegExp(`^(?:${FN}|[${MATH_CHARS}])+`, "iu");
/*
  Parça bir harfe ya da tanınmayan simgeye bitişikse daha büyük bir ifadenin
  kırığıdır: "x² + 3 · 2" içindeki "3 · 2" ya da "a_1 + 2" gibi. Hüküm yok.
  Türkçe ek kesme işaretiyle ayrılır ("4³'tür"); o bitişiklik sayılmaz.
*/
const GLUED = /[\p{L}_^]/u;

/** Hesap işlemi taşıyor mu? Tek başına kesir ("3/4") bir sayıdır, işlem değil. */
function isComputation(span: string): boolean {
  const withoutFractions = span.replace(/\d+(?:[.,]\d+)?\/\d+(?:[.,]\d+)?/g, "1");
  return /[×÷·*+\-−√⁰¹²³⁴⁵⁶⁷⁸⁹^/]|sin|cos|tan|cot/i.test(withoutFractions.replace(/^-/, ""));
}

type Span = { text: string; start: number; end: number };

function spansOf(text: string): Span[] | null {
  const spans: Span[] = [];
  for (const match of text.matchAll(SPAN)) {
    const raw = match[0];
    const start = (match.index ?? 0) + (raw.length - raw.trimStart().length);
    const end = (match.index ?? 0) + raw.trimEnd().length;
    const span = text.slice(start, end).replace(/^[,.\s]+|[,.\s]+$/g, "");
    if (!/\d|π/.test(span)) continue;
    const before = text[start - 1] ?? "";
    const after = text[end] ?? "";
    if (!/^(?:sin|cos|tan|cot)/i.test(span) && (GLUED.test(before) || GLUED.test(after))) return null;
    spans.push({ text: span, start, end });
  }
  return spans;
}

type KeyedCheck = {
  type: string;
  prompt: string;
  options?: string[];
  answerIndex?: number;
  answer?: string;
};

/*
  Eşitliğin iki yanı "="ye BİTİŞİK olmalı: "m = 2 kg; Q = 2 × 0,25 × 10"
  içinde Q'nun sol yanı 2 değildir. Arkasından birim ya da % gelen sayı bir
  niceliktir ("1 kg = 1000 g"); ona hüküm verilmez.
*/
const UNIT_AFTER =
  /^\s*(?:%|kg|g|mg|m|cm|mm|km|s|sn|dk|sa|h|K|°C|°F|J|kJ|cal|kcal|N|L|mL|mol|Pa|kPa|MPa|atm|W|kW|V|A|Hz|TL|m²|m³|cm²|cm³)(?![A-Za-zÇĞİÖŞÜçğıöşü])/;

function equationPairs(sentence: string): [Reading, Reading][] {
  const pairs: [Reading, Reading][] = [];
  const parts = sentence.split("=");
  for (let index = 1; index < parts.length; index += 1) {
    const before = parts[index - 1] ?? "";
    const after = parts[index] ?? "";
    const tail = before.match(TAIL_RUN)?.[0] ?? "";
    const head = after.match(HEAD_RUN)?.[0] ?? "";
    if (!/\d|π/.test(tail) || !/\d|π/.test(head)) continue;
    const tailStart = before.length - tail.trimStart().length;
    const headEnd = after.length - after.trimStart().length + head.trim().length;
    const beforeTail = before.slice(tailStart - 1, tailStart);
    const afterHead = after.slice(headEnd, headEnd + 1);
    // Harfe bitişik taraf daha büyük bir ifadenin kırığıdır: "x2 = 4" gibi.
    if (GLUED.test(beforeTail) && !/^\s*(?:sin|cos|tan|cot)/i.test(tail)) continue;
    if (GLUED.test(afterHead)) continue;
    if (/%\s*$/.test(before.slice(0, tailStart))) continue;
    if (UNIT_AFTER.test(after.slice(headEnd))) continue;
    const left = read(tail);
    const right = read(head);
    if (!left || !right) continue;
    pairs.push([left, right]);
  }
  return pairs;
}

/**
 * true: anahtar hesapla çelişiyor. false: uyuşuyor. null: hüküm yok.
 * Soruda tek hesap parçası olmalı ve o parçanın dışında sayı olmamalı
 * (sözel problemde verilen ipucu sorulan değer sanılmasın). Şıklardan tam
 * biri o değere eşit olmalı. Şıklar ifade, kök değer ise ("hangisinin
 * sonucu 4³?") ters yönde de aynı karşılaştırma işler.
 */
export function mathKeyWrong(check: KeyedCheck): boolean | null {
  if (check.type === "trueFalse" && check.options?.length === 2 && check.answerIndex != null) {
    const pairs = equationPairs(check.prompt);
    if (!pairs.length) return null;
    const holds = pairs.every(([left, right]) => agree(left, right));
    const trueIndex = check.options.findIndex((option) => /^doğru$/i.test(option.trim()));
    if (trueIndex < 0) return null;
    return (check.answerIndex === trueIndex) !== holds;
  }
  const spans = spansOf(check.prompt);
  if (!spans) return null;
  const computations = spans.filter((span) => isComputation(span.text));
  if (computations.length !== 1) return null;
  const chosen = computations[0];
  const rest = check.prompt.slice(0, chosen.start) + check.prompt.slice(chosen.end);
  if (/\d/.test(rest)) return null;
  const expected = read(chosen.text);
  if (!expected) return null;
  if (check.type === "numerical" && check.answer) {
    const given = read(check.answer.replace(/\s*[A-Za-zÇĞİÖŞÜçğıöşü%].*$/, ""));
    return given ? !agree(given, expected) : null;
  }
  if (check.options && check.answerIndex != null) {
    const readings = check.options.map((option) => read(option));
    if (readings.some((reading) => !reading)) return null;
    const matches = readings.flatMap((reading, index) => (reading && agree(reading, expected) ? [index] : []));
    if (matches.length !== 1) return null;
    return matches[0] !== check.answerIndex;
  }
  return null;
}

/**
 * İki şık aynı değere mi çıkıyor? "3/5" ile "6/10" ya da "3⁶" ile "729"
 * aynı sorunun iki doğru cevabıdır: öğrenci hangisini seçerse seçsin biri
 * yanlış sayılır. Model yarışında hakem yakaladı (29 Eylül). Okunamayan
 * şıklar karşılaştırmaya girmez.
 *
 * Anahtar biliniyorsa yalnızca anahtarla eşit değerli şık belirsizliktir.
 * İki YANLIŞ şıkkın aynı değere çıkması çoğu zaman bilerek yapılmıştır:
 * "Hangisi 5³'ün hesaplanmasında doğru bir adım değildir?" sorusunda
 * "5 × 5 × 5", "5² × 5" ve "(5 × 5) × 5" üçü de 125'tir. Canlı taramada
 * (30 Eylül, 184 soru) bu kural böyle üç iyi soruyu düşürüyordu.
 */
export function mathOptionsAmbiguous(check: KeyedCheck): boolean {
  if (!check.options || check.options.length < 2) return false;
  const readings = check.options.map((option) => read(option));
  const ordered = ORDER_CUE.test(check.prompt);
  const key = check.answerIndex != null && check.answerIndex >= 0 && check.answerIndex < check.options.length
    ? check.answerIndex
    : null;
  for (let i = 0; i < readings.length; i += 1) {
    for (let j = i + 1; j < readings.length; j += 1) {
      const a = readings[i];
      const b = readings[j];
      if (a && b && agree(a, b) && (key == null || key === i || key === j)) return true;
      if (!ordered && sameUnorderedSet(check.options[i] ?? "", check.options[j] ?? "")) return true;
    }
  }
  return false;
}

/*
  Aynı noktalar, farklı sıra. 30 Eylül canlı quiz: "(1, 0) ve (0, 1)
  arasında" ile "(0, 1) ve (1, 0) arasında" iki ayrı şıktı; öğrenci
  hangisini seçerse seçsin diğeri aynı cevaptı. Parantez içi sıralı ikilidir
  ("(1, 0)" ≠ "(0, 1)"); "ve / ile / veya / virgül" ile ayrılan liste
  sırasızdır. Soru sıra soruyorsa ("küçükten büyüğe", "dizinin terimleri")
  liste sıralıdır, hüküm yok.

  Bu kural anahtara bakmaz. Tek değerli şıklar çoğu zaman bir YÖNTEMDİR
  ("8 + 8", "2 × 8") ve aynı değere çıkmaları bilerek olabilir; nokta ya da
  değer listesi ise cevabın kendisidir. Canlı soruda aynı iki şık gerçek
  cevaptı ve anahtar ikisini de yanlış sayıyordu.
*/
const ORDER_CUE =
  /sıra|dizi|dizil|terim|önce|sonra|ardışık|küçükten|büyükten|artan|azalan|kronoloj|aşama|adım|basamak/i;

const LIST_TOKEN = /\([^()]*\)|\d+,\d+|,|[^\s(),]+/g;

function foldWord(text: string): string {
  return text.toLocaleLowerCase("tr-TR").replace(/[.;:!?]+$/g, "");
}

function listTokens(option: string): string[] {
  return option.match(LIST_TOKEN) ?? [];
}

function isConnector(tokens: string[], index: number): number {
  const word = foldWord(tokens[index] ?? "");
  if (word === "," || word === "ve" || word === "ile" || word === "veya" || word === "&") return 1;
  if (word === "ya" && foldWord(tokens[index + 1] ?? "") === "da") return 2;
  return 0;
}

/** Tek bir değerin anahtarı: hesaplanabiliyorsa sayı, değilse küçük harfli metin. */
function valueKey(text: string): string {
  const value = evaluateMath(text);
  if (value != null) return `#${Math.round(value * 1e9) / 1e9}`;
  return text.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
}

function itemKey(tokens: string[]): string {
  const text = tokens.join(" ").trim();
  const tuple = text.match(/^\(\s*(.+?)\s*\)$/);
  if (!tuple) return valueKey(text);
  const inner = tuple[1] ?? "";
  const parts = inner.includes(";") ? inner.split(";") : inner.split(/,\s+/);
  return `(${parts.map((part) => valueKey(part)).join(";")})`;
}

type ListShape = { items: string[]; connectors: string[] };

function listItems(tokens: string[]): ListShape | null {
  const items: string[] = [];
  const connectors: string[] = [];
  let current: string[] = [];
  for (let index = 0; index < tokens.length; index += 1) {
    const skip = isConnector(tokens, index);
    if (!skip) {
      current.push(tokens[index] ?? "");
      continue;
    }
    if (!current.length) return null;
    items.push(itemKey(current));
    connectors.push(tokens.slice(index, index + skip).map(foldWord).join(" "));
    current = [];
    index += skip - 1;
  }
  if (!current.length) return null;
  items.push(itemKey(current));
  return { items, connectors };
}

function sameShape(a: string[], b: string[]): boolean {
  if (!a.length || !b.length) return false;
  const left = listItems(a);
  const right = listItems(b);
  if (!left || !right || left.items.length !== right.items.length) return false;
  // "ve" ile "veya" aynı küme değildir.
  if ([...left.connectors].sort().join("|") !== [...right.connectors].sort().join("|")) return false;
  if (left.items.length === 1) {
    return (left.items[0] ?? "").startsWith("(") && left.items[0] === right.items[0];
  }
  return [...left.items].sort().join("|") === [...right.items].sort().join("|");
}

/**
 * İki şık, ortak bir baş ve son arasında aynı öğelerin farklı sırası mı?
 * Ortak baş/son her kesimde denenir: "sin A ve cos A" ile "cos A ve sin A"
 * sonundaki "A" çerçeve değil, öğenin parçasıdır. Tek öğede yalnızca iki
 * eşdeğer nokta sayılır: "(√2/2, √2/2)" ile "(1/√2, 1/√2)". Tek sayılar
 * zaten `read` ile karşılaştırılıyor.
 */
export function sameUnorderedSet(left: string, right: string): boolean {
  const a = listTokens(left);
  const b = listTokens(right);
  let prefix = 0;
  while (prefix < Math.min(a.length, b.length) && foldWord(a[prefix] ?? "") === foldWord(b[prefix] ?? "")) {
    prefix += 1;
  }
  let suffix = 0;
  while (
    suffix < Math.min(a.length, b.length) - prefix &&
    foldWord(a[a.length - 1 - suffix] ?? "") === foldWord(b[b.length - 1 - suffix] ?? "")
  ) {
    suffix += 1;
  }
  for (let p = 0; p <= prefix; p += 1) {
    for (let s = 0; s <= suffix; s += 1) {
      if (sameShape(a.slice(p, a.length - s), b.slice(p, b.length - s))) return true;
    }
  }
  return false;
}

/**
 * Metindeki eşitlik zinciri kendi içinde çelişiyor mu? "sin 30° = √3/2"
 * → true. Yanlışı anan cümleye hüküm verilmez.
 */
export function mathProseWrong(text: string): boolean {
  for (const sentence of text.split(/(?<=[.!?])\s+|\n+/)) {
    if (/değil|yanlış|hata|sanmak|sanılır|sanır|≠/i.test(sentence)) continue;
    if (!sentence.includes("=")) continue;
    if (equationPairs(sentence).some(([left, right]) => !agree(left, right))) return true;
  }
  return false;
}
