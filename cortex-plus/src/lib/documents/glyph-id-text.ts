/**
 * Glif numarasıyla çıkmış PDF metni (19 Ekim 2026).
 *
 * Word'den üretilmiş bazı PDF'lerde Calibri'nin ToUnicode tablosu eksik: metin
 * katmanı harf yerine glif numarasını verir. pdf.js bunu olduğu gibi aktarır ve
 * "Anayasacılık Tarihi" sayfada "\u0004ŶĂǇĂƐĂĐŦůŦŬ\u0003dĂƌŝŚŝ" olur: küçük harfler
 * U+0100–U+01CC arasına, büyük harfler ASCII ve kontrol kodlarına, rakamlar
 * U+03EC–U+03F5'e, noktalama U+034A–U+037F'e düşer. 30 sayfalık bir KPSS notunda
 * her sayfanın harflerinin %75–85'i böyleydi; konu haritası bu metinden kuruldu,
 * temellendirme 34 başlığın 34'ünü düşürdü ve öğrenciye 2 konu kaldı.
 *
 * Tablo o belgenin ham metni ile modelin temizlediği metin hizalanarak çıkarıldı
 * (Calibri'nin glif sırası). Yalnız böyle bir sayfa olduğu kesinleşince ve yalnız
 * bozuk parçalara uygulanır; düzgün yazı tipiyle basılmış satırlar ("DEVLET",
 * "I. Devlet") olduğu gibi kalır. Çehçe/Lehçe gibi Latin-genişletilmiş harf
 * kullanan diller tabloda en çok 2-3 koda değer; sayfa eşiği onları dışarıda tutar.
 */

const TABLE_ENTRIES: [number, string][] = [
  [3, " "], [4, "A"], [17, "B"], [18, "C"], [23, "Ç"], [24, "D"], [28, "E"],
  [38, "F"], [39, "G"], [44, "H"], [47, "I"], [55, "İ"], [59, "("], [60, "K"], [62, "L"],
  [68, "M"], [69, "N"], [75, "O"], [80, "Ö"], [87, "P"], [90, "R"], [94, "S"], [98, "Ş"],
  [100, "T"], [104, "U"], [109, "Ü"], [115, "V"], [122, "Y"],
  [258, "a"], [261, "â"], [271, "b"], [272, "c"], [277, "ç"], [282, "d"], [286, "e"],
  [296, "f"], [302, "f"], [311, "ı"], [336, "g"], [338, "ğ"], [346, "h"], [349, "i"],
  [358, "ı"], [361, "j"], [364, "k"], [367, "l"], [373, "m"], [374, "n"], [381, "o"],
  [386, "ö"], [393, "p"], [395, "q"], [396, "r"], [400, "s"], [404, "ş"], [410, "t"],
  [415, "ti"], [424, "ı"], [437, "u"], [442, "ü"], [448, "v"], [449, "w"], [454, "x"],
  [455, "y"], [460, "z"],
  // bitişik harfler (ligatür): "Çift" → "ÇiŌ", "tarafları" → "taraŇarı", "faaliyette" → "faaliyeƩe", "ettiği" → "eƫği"
  [327, "fl"], [332, "ft"], [425, "tt"], [427, "tti"],
  [842, "!"], [845, "?"], [853, ","], [854, ";"], [855, ":"], [856, "."], [859, "'"],
  [876, "/"], [882, "-"], [895, ")"],
  [1004, "0"], [1005, "1"], [1006, "2"], [1007, "3"], [1008, "4"], [1009, "5"],
  [1010, "6"], [1011, "7"], [1012, "8"], [1013, "9"], [1085, "+"],
];

const TABLE = new Map<number, string>(TABLE_ENTRIES);

/** Türkçe metinde meşru olan Latin-genişletilmiş harfler (tabloyla çakışan tek kod Ğ = 286). */
const LEGIT_GBREVE = 0x011e;

/** Bir sayfanın bu bozuklukta sayılması için gereken en az farklı küçük harf kodu. */
export const MIN_DISTINCT_GLYPHS = 8;
/** … ve en az toplam bozuk harf. */
export const MIN_GLYPH_COUNT = 30;
/** … ve bozuk harflerin bütün harfler içindeki en düşük payı. */
export const MIN_GLYPH_SHARE = 0.08;

const VOWELS = new Set("aeıioöuüâîûAEIİOÖUÜÂÎÛ");

/** Küçük harf bölgesindeki tablo kodu (Ğ hariç — meşru büyük harf olabilir). */
function isLetterGlyph(code: number): boolean {
  return code >= 0x100 && code <= 0x24f && code !== LEGIT_GBREVE && TABLE.has(code);
}

/** Glif kodu olduğu kesin olan karakter: küçük harf bölgesi, kontrol kodu, rakam/noktalama bölgesi. */
function isGlyphCode(code: number): boolean {
  if (isLetterGlyph(code)) return true;
  if (code < 32) return code !== 9 && code !== 10 && code !== 13;
  return code >= 842 && TABLE.has(code);
}

function isWhitespace(ch: string): boolean {
  return /\s/.test(ch);
}

/** Sayfa bu bozuklukta mı? (harf sayımı yalnız karar için) */
export function glyphIdStats(text: string): { letters: number; glyphs: number; distinct: number } {
  let letters = 0;
  let glyphs = 0;
  const distinct = new Set<number>();
  for (const ch of text) {
    const code = ch.codePointAt(0)!;
    if (isLetterGlyph(code)) {
      letters += 1;
      glyphs += 1;
      distinct.add(code);
    } else if (/\p{L}/u.test(ch)) {
      letters += 1;
    }
  }
  return { letters, glyphs, distinct: distinct.size };
}

export function looksGlyphIdText(text: string): boolean {
  const s = glyphIdStats(text);
  return (
    s.distinct >= MIN_DISTINCT_GLYPHS &&
    s.glyphs >= MIN_GLYPH_COUNT &&
    s.letters > 0 &&
    s.glyphs / s.letters >= MIN_GLYPH_SHARE
  );
}

function decodeToken(token: string[]): string {
  let out = "";
  for (const ch of token) {
    const code = ch.codePointAt(0)!;
    const mapped = TABLE.get(code);
    if (mapped !== undefined) out += mapped;
    else if (code < 32) continue; // eşlenmemiş kontrol kodu: at
    else out += ch;
  }
  return out;
}

/**
 * Sayfa metnini çözer. Sayfa bu bozuklukta değilse olduğu gibi döner; öyleyse
 * yalnız içinde glif kodu geçen parçalar çevrilir (ASCII harf ve noktalama o
 * parçada büyük harf kodudur: "'öre" → "Göre"). Çözüm Türkçeye benzemiyorsa
 * (ünlü payı tutmuyorsa) metin değiştirilmez.
 */
export function decodeGlyphIdText(text: string): string {
  if (!text || !looksGlyphIdText(text)) return text;
  const chars = [...text];
  let out = "";
  let decodedLetters = 0;
  let decodedVowels = 0;
  let i = 0;
  while (i < chars.length) {
    const ch = chars[i]!;
    const code = ch.codePointAt(0)!;
    if (isWhitespace(ch)) {
      out += ch;
      i += 1;
      continue;
    }
    let j = i;
    while (j < chars.length && !isWhitespace(chars[j]!)) j += 1;
    const token = chars.slice(i, j);
    if (!token.some((c) => isGlyphCode(c.codePointAt(0)!))) {
      out += token.join("");
      i = j;
      continue;
    }
    const decoded = decodeToken(token);
    for (const c of decoded) {
      if (/\p{L}/u.test(c)) {
        decodedLetters += 1;
        if (VOWELS.has(c)) decodedVowels += 1;
      }
    }
    out += decoded;
    i = j;
    void code;
  }
  if (!decodedLetters) return text;
  const vowelShare = decodedVowels / decodedLetters;
  if (vowelShare < 0.25 || vowelShare > 0.6) return text;
  return out;
}
