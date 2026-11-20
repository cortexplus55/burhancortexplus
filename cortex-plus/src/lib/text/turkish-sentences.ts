/**
 * Akıllı Türkçe cümle bölücü (19 Kasım 2026, Faz 1-A §4.1) — ders, özet, karaoke ve kart metinlerinin tek ayırıcısı.
 *
 * `.split('.')` ya da `(?<=[.!?])\s+` her noktada böler; Türkçe metinde nokta cümle sonundan çok daha fazlasını taşır:
 * - Roma rakamı: "II. Mehmet", "IV. bölüm", "X. yüzyıl".
 * - Sıra sayısı ve madde numarası: "116. madde", "87. fıkra", "2. adım", "1. Dünya Savaşı".
 * - Kısaltma: "Prof. Dr.", "Av.", "Md.", "vb.", "örn.", "bkz.", "yy.", "TL.".
 * - Noktalı baş harf kısaltması: "T.C.", "A.Ş.", "M.Ö.".
 * Bunlardan sonra cümle ASLA bölünmez. Ondalık sayı ("3.14", "2,5") boşluk taşımadığından zaten bölünmez.
 *
 * Kural ders bağımsızdır: hiçbir konuya, derse ya da sınava özgü sözcük yoktur. Satır sonu (boş satır, madde satırı)
 * ayrı birim sayılır; tek satır içindeki boşluklar teke indirilir. Bölücü metne hiçbir şey eklemez, silmez: çıkan
 * cümlelerin birleşimi (boşluklar hariç) girdinin kendisidir.
 */

/** Sonrasında cümlenin bitmediği kısaltmalar (küçük harfle, noktasız). */
export const TURKISH_ABBREVIATIONS: ReadonlySet<string> = new Set([
  "dr",
  "prof",
  "doç",
  "doc",
  "yrd",
  "öğr",
  "gör",
  "uzm",
  "op",
  "av",
  "md",
  "mad",
  "müd",
  "vb",
  "vs",
  "vd",
  "örn",
  "ör",
  "bkz",
  "krş",
  "yy",
  "tl",
  "sn",
  "no",
  "nr",
  "st",
  "sok",
  "cad",
  "mah",
  "apt",
  "hz",
  "yön",
  "mr",
  "mrs",
  "ms",
  "jr",
  "etc",
  "vol",
  "fig",
  "s",
  "ss",
]);

const SENTENCE_END = new Set([".", "!", "?", "…"]);
/** Cümle sonu işaretinden sonra cümleye ait kalan kapanış işaretleri. */
const CLOSERS = new Set(['"', "'", "”", "’", "»", ")", "]", "}"]);
/** Geçerli Roma rakamı (1–39); "I.", "II.", "IV.", "X.", "XIX.". */
const ROMAN = /^X{0,3}(?:IX|IV|V?I{0,3})$/u;
const LOWER_START = /^[\p{Ll}]/u;

function lastToken(buffer: string): string {
  const match = /([\p{L}\p{N}.]+)\.$/u.exec(buffer);
  return match ? match[1]! : "";
}

/**
 * Noktada cümle bitmiyor mu? `buffer` noktayla biter, `next` noktadan sonraki ilk boşluk olmayan karakterdir
 * (metin sonunda boş).
 */
function dotContinues(buffer: string, next: string): boolean {
  const token = lastToken(buffer);
  if (!token) return false;
  const bare = token.replace(/\.+$/u, "");
  const lower = bare.toLocaleLowerCase("tr");
  // Kısaltma ("Prof.", "Dr.", "vb.", "TL.") ve noktalı kısaltmanın son parçası ("M.Ö.", "T.C.").
  if (TURKISH_ABBREVIATIONS.has(lower)) return Boolean(next);
  if (/^(?:\p{L}\.){1,}\p{L}$/u.test(bare)) return Boolean(next);
  // Roma rakamı: "II. Mehmet", "X. yüzyıl".
  if (bare && ROMAN.test(bare)) return Boolean(next);
  // Sıra sayısı / madde numarası: "116. madde", "2. adım", "1. Dünya Savaşı".
  if (/^\d{1,3}$/u.test(bare)) return Boolean(next);
  // Dört basamaklı sayı ("2024. yıl") yalnız küçük harfle sürüyorsa sıra sayısıdır; yıl cümle sonu olabilir.
  if (/^\d{4,}$/u.test(bare)) return Boolean(next) && LOWER_START.test(next);
  return false;
}

/**
 * Tek satırlık metinde gerçek cümle sonlarının konumları (noktalama ve kapanış işaretinden hemen sonraki indeks).
 * Metin sonu sayılmaz. Boşluk herhangi bir boşluk karakteri olabilir (metin önceden sıkıştırılmak zorunda değil).
 */
export function turkishSentenceEnds(text: string): number[] {
  const ends: number[] = [];
  if (typeof text !== "string" || !text) return ends;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i]!;
    if (!SENTENCE_END.has(ch)) continue;
    const markStart = i;
    // Üç nokta, "?!" gibi art arda işaretler ve kapanış tırnağı/parantezi cümlenin parçası.
    while (i + 1 < text.length && (SENTENCE_END.has(text[i + 1]!) || CLOSERS.has(text[i + 1]!))) i += 1;
    const after = text[i + 1];
    if (after === undefined) break;
    if (!/\s/u.test(after)) continue; // "3.14", "a.b", "e-posta.com"
    let k = i + 1;
    while (k < text.length && /\s/u.test(text[k]!)) k += 1;
    const next = text[k] ?? "";
    const marks = text.slice(markStart, i + 1).replace(/[\p{Pe}\p{Pf}"'»]+$/u, "");
    if (marks === "." && dotContinues(text.slice(0, markStart + 1), next)) continue;
    // Küçük harfle süren metin aynı cümledir (listede olmayan kısaltma, "vs. gibi").
    if (next && LOWER_START.test(next)) continue;
    if (!next) break;
    ends.push(i + 1);
  }
  return ends;
}

function splitLine(line: string, out: string[]): void {
  const text = line.replace(/\s+/gu, " ").trim();
  if (!text) return;
  let from = 0;
  for (const end of turkishSentenceEnds(text)) {
    const part = text.slice(from, end).trim();
    if (part) out.push(part);
    from = end;
  }
  const rest = text.slice(from).trim();
  if (rest) out.push(rest);
}

/**
 * Metni cümlelere böler. Satır sonları da sınırdır (başlık, madde satırı). Boş girdi boş dizi döner.
 */
export function splitTurkishSentences(text: string): string[] {
  if (typeof text !== "string" || !text.trim()) return [];
  const out: string[] = [];
  for (const line of text.replace(/\r\n?/gu, "\n").split(/\n+/u)) splitLine(line, out);
  return out;
}

/** Satır sonlarını sınır saymadan böler: tek paragraf gibi akan metin (ses satırı, karaoke) için. */
export function splitTurkishSentencesInline(text: string): string[] {
  if (typeof text !== "string" || !text.trim()) return [];
  const out: string[] = [];
  splitLine(text, out);
  return out;
}

/** İlk cümle (yoksa boş). */
export function firstTurkishSentence(text: string): string {
  return splitTurkishSentences(text)[0] ?? "";
}
