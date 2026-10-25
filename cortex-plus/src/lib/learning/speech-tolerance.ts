/**
 * Sözlü sınav notu — konuşma tanıması (gpt-4o-mini-transcribe) fen ve matematik
 * terimini sesçe yakın ya da konuşma diliyle yazar. "mitokondiri", "x kare",
 * "karbon dioksit", "a te pe" öğrencinin doğru cevabını düşürmesin.
 * Anlamı değişen hata (başka kavram, başka sayı) yine tutmaz.
 */

const DIACRITICS: Record<string, string> = {
  ı: "i",
  İ: "i",
  i̇: "i",
  ğ: "g",
  ü: "u",
  ş: "s",
  ö: "o",
  ç: "c",
};

const SUPER: Record<string, string> = {
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

const SUB: Record<string, string> = {
  "₀": "0",
  "₁": "1",
  "₂": "2",
  "₃": "3",
  "₄": "4",
  "₅": "5",
  "₆": "6",
  "₇": "7",
  "₈": "8",
  "₉": "9",
};

const NUMBER_WORDS: Record<string, string> = {
  sifir: "0",
  bir: "1",
  iki: "2",
  uc: "3",
  dort: "4",
  bes: "5",
  alti: "6",
  yedi: "7",
  sekiz: "8",
  dokuz: "9",
};

function foldChars(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/[ıİi̇ğüşöç]/g, (ch) => DIACRITICS[ch] ?? ch);
}

/** Konuşma tanımasının yazdığı metni, karşılaştırılacak ortak yazıma çeker. */
export function normalizeSpeech(text: string): string {
  let out = foldChars(text)
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹]/g, (ch) => SUPER[ch] ?? ch)
    .replace(/[₀₁₂₃₄₅₆₇₈₉]/g, (ch) => SUB[ch] ?? ch)
    .replace(/\^(\d)/g, "$1")
    .replace(/\ba\s+te\s+pe\b/g, "atp")
    .replace(/\ba\s*t\s*p\b/g, "atp")
    .replace(/\ba\s*d\s*p\b/g, "adp")
    .replace(/\bd\s*n\s*a\b/g, "dna")
    .replace(/\bm\s*r\s*n\s*a\b/g, "mrna")
    .replace(/\br\s*n\s*a\b/g, "rna")
    .replace(/\b(karbon\s*di\s*oksit|karbondioksit|c\s*o\s*2|co2)\b/g, "co2")
    .replace(/\bh\s+iki\s+o\b/g, "h2o")
    .replace(/\bh2o\b/g, "h2o")
    .replace(/\b([a-z0-9])\s+kare\b/g, "$12")
    .replace(/\barti\b/g, "+")
    .replace(/\beksi\b/g, "-")
    .replace(/\bcarpi\b/g, "*")
    .replace(/\bbolu\b/g, "/");
  out = out.replace(
    /\b(sifir|bir|iki|uc|dort|bes|alti|yedi|sekiz|dokuz)\b(?=\s*(mol|sn|saniye|cm|mm|kg|gram|derece|yuzde|%|kere|kat)\b)/g,
    (word) => NUMBER_WORDS[word] ?? word,
  );
  return out.replace(/\s+/g, " ").trim();
}

function compact(text: string): string {
  return text.replace(/[^a-z0-9+*/.-]+/g, "");
}

function tokens(text: string): string[] {
  return text.split(/[^a-z0-9]+/).filter((token) => token.length >= 4);
}

function editDistance(left: string, right: string): number {
  if (left === right) return 0;
  if (Math.abs(left.length - right.length) > 2) return 3;
  const width = right.length;
  let prev = Array.from({ length: width + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= width; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      const value = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + cost);
      cur[j] = value;
      if (value < rowMin) rowMin = value;
    }
    if (rowMin > 2) return 3;
    prev = cur;
  }
  return prev[width];
}

function commonPrefix(left: string, right: string): number {
  const limit = Math.min(left.length, right.length);
  let index = 0;
  while (index < limit && left[index] === right[index]) index += 1;
  return index;
}

function tokenNear(needle: string, hay: string[]): boolean {
  const limit = needle.length >= 8 ? 2 : 1;
  return hay.some((token) => {
    if (token === needle) return true;
    if (
      needle.length >= 5 &&
      token.length >= 5 &&
      (token.startsWith(needle) || needle.startsWith(token) || commonPrefix(needle, token) >= 6)
    ) {
      return Math.abs(needle.length - token.length) <= 4;
    }
    if (needle.length < 5 || token.length < 5) return false;
    return editDistance(needle, token) <= limit;
  });
}

/**
 * İğne, cevapta birebir, boşluksuz, formülün konuşulan hali ya da sesçe yakın
 * terim olarak duruyor mu? Kısa ve sayısal iğnede sayı tutmak zorunda.
 */
export function speechNear(answer: string, needle: string): boolean {
  const hay = normalizeSpeech(answer);
  const pin = normalizeSpeech(needle);
  if (pin.length < 3 || !hay) return false;
  if (hay.includes(pin)) return true;
  const hayCompact = compact(hay);
  const pinCompact = compact(pin);
  const pinNumbers = pin.match(/\d+(?:\.\d+)?/g) ?? [];
  if (pinNumbers.length) {
    const hayNumbers: string[] = hay.match(/\d+(?:\.\d+)?/g) ?? [];
    if (!pinNumbers.every((num) => hayNumbers.includes(num))) return false;
  }
  if (pinCompact.length >= 5 && hayCompact.includes(pinCompact)) return true;
  if (pinCompact.length >= 3 && pinCompact.length < 5 && /\d|[+*/-]/.test(pinCompact) && hayCompact.includes(pinCompact)) {
    return true;
  }
  if (pinCompact.length >= 3 && pinCompact.length < 5 && hay.split(/[^a-z0-9+*/.-]+/).includes(pinCompact)) {
    return true;
  }
  const pinTokens = tokens(pin).filter((token) => token.length >= 5);
  if (!pinTokens.length) return false;
  const hayTokens = tokens(hay);
  const hit = pinTokens.filter((token) => tokenNear(token, hayTokens)).length;
  return hit / pinTokens.length >= 0.75;
}
