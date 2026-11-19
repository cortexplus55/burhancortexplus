/**
 * SVG metin sığdırma (Faz 1-B): sunucu ve istemci aynı sonucu üretsin diye DOM ölçümü yerine karakter
 * genişliği tablosu (Figtree; değerler em cinsinden ve bilerek biraz geniş — gerçek yazı tahminden dar
 * kalır, taşmaz). Sarma kelime kelime; sığmazsa yazı küçülür, en küçük boyda da sığmazsa son satır "…"
 * ile kesilir. Böylece hiçbir yazı kutusundan taşmaz.
 */

const NARROW = new Set([..."il.,:;'|!ıİfjtrI()[]{}-\u2019\u2018\"`"]);
const WIDE = new Set([..."mwMWÆŒ@%"]);
const UPPER_WIDE = new Set([..."ABCDGHKNOQRUVXYÇĞÖŞÜ"]);
const SYMBOL_WIDE = new Set([..."→←↔↑↓⇒✓✗×÷±≤≥≠≈∫∑√π∞°²³ⁿ"]);

/** Tek karakterin em genişliği (kalın yazı için ayrıca ölçeklenir). */
export function charWidthEm(char: string): number {
  if (char === " ") return 0.28;
  if (NARROW.has(char)) return 0.3;
  if (WIDE.has(char)) return 0.88;
  if (SYMBOL_WIDE.has(char)) return 0.8;
  if (/[0-9]/.test(char)) return 0.6;
  if (UPPER_WIDE.has(char)) return 0.74;
  if (char >= "A" && char <= "Z") return 0.66;
  if (/\p{Lu}/u.test(char)) return 0.7;
  if (/\p{Ll}/u.test(char)) return 0.56;
  return 0.62;
}

export type FontWeight = 400 | 500 | 600 | 700 | 800;

/** Metnin piksel genişliği (tahmin, yukarı yuvarlanmış). */
export function measureText(text: string, fontSize: number, weight: FontWeight = 400): number {
  const boldScale = weight >= 700 ? 1.08 : weight >= 600 ? 1.05 : weight >= 500 ? 1.02 : 1;
  let em = 0;
  for (const char of text) em += charWidthEm(char);
  return Math.ceil(em * fontSize * boldScale);
}

export type FitOptions = {
  maxWidth: number;
  maxLines: number;
  fontSize: number;
  minFontSize?: number;
  weight?: FontWeight;
  /** Satır yüksekliği çarpanı. */
  lineHeight?: number;
};

export type FittedText = {
  lines: string[];
  fontSize: number;
  lineHeightPx: number;
  /** Çizilen bloğun genişliği (en uzun satır) ve yüksekliği. */
  width: number;
  height: number;
  truncated: boolean;
};

/** Tek kelime kutudan genişse heceye bölmeden harf harf böler (son parçada tire yok). */
function splitLongWord(word: string, maxWidth: number, fontSize: number, weight: FontWeight): string[] {
  const parts: string[] = [];
  let current = "";
  for (const char of word) {
    if (current && measureText(`${current}${char}-`, fontSize, weight) > maxWidth) {
      parts.push(`${current}-`);
      current = char;
    } else current += char;
  }
  if (current) parts.push(current);
  return parts;
}

export function wrapText(text: string, maxWidth: number, fontSize: number, weight: FontWeight = 400): string[] {
  const words = text.replace(/\s+/g, " ").trim().split(" ").filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const raw of words) {
    const pieces = measureText(raw, fontSize, weight) > maxWidth ? splitLongWord(raw, maxWidth, fontSize, weight) : [raw];
    for (const word of pieces) {
      const next = current ? `${current} ${word}` : word;
      if (measureText(next, fontSize, weight) <= maxWidth) current = next;
      else {
        if (current) lines.push(current);
        current = word;
      }
    }
  }
  if (current) lines.push(current);
  return lines;
}

function ellipsize(line: string, maxWidth: number, fontSize: number, weight: FontWeight): string {
  let out = line.replace(/[\s,.;:-]+$/, "");
  while (out && measureText(`${out}…`, fontSize, weight) > maxWidth) out = out.slice(0, -1).replace(/\s+$/, "");
  return `${out}…`;
}

/**
 * Metni kutuya sığdırır: önce sarar, satır sayısı aşılırsa yazı 1 px küçülür (en çok `minFontSize`'a),
 * yine aşılırsa son satır "…" ile kesilir. Dönen blok `maxWidth` × (`maxLines` × satır yüksekliği)
 * kutusunun içinde kalır.
 */
export function fitText(text: string, options: FitOptions): FittedText {
  const weight = options.weight ?? 400;
  const lineHeight = options.lineHeight ?? 1.22;
  const minFont = Math.min(options.fontSize, options.minFontSize ?? Math.max(9, Math.round(options.fontSize * 0.72)));
  const clean = text.replace(/\s+/g, " ").trim();
  let fontSize = options.fontSize;
  let lines = wrapText(clean, options.maxWidth, fontSize, weight);
  while (lines.length > options.maxLines && fontSize > minFont) {
    fontSize -= 1;
    lines = wrapText(clean, options.maxWidth, fontSize, weight);
  }
  let truncated = false;
  if (lines.length > options.maxLines) {
    truncated = true;
    const kept = lines.slice(0, options.maxLines);
    const rest = lines.slice(options.maxLines - 1).join(" ");
    kept[kept.length - 1] = ellipsize(rest, options.maxWidth, fontSize, weight);
    lines = kept;
  }
  const lineHeightPx = Math.ceil(fontSize * lineHeight);
  const width = lines.reduce((max, line) => Math.max(max, measureText(line, fontSize, weight)), 0);
  return { lines, fontSize, lineHeightPx, width, height: lines.length * lineHeightPx, truncated };
}

/** Bir satıra sığan en büyük yazı boyu (kesmeden); sığmazsa en küçük boyda "…" ile kesilir. */
export function fitSingleLine(
  text: string,
  maxWidth: number,
  fontSize: number,
  minFontSize = 9,
  weight: FontWeight = 400,
): { text: string; fontSize: number; width: number } {
  const clean = text.replace(/\s+/g, " ").trim();
  let size = fontSize;
  while (size > minFontSize && measureText(clean, size, weight) > maxWidth) size -= 1;
  if (measureText(clean, size, weight) <= maxWidth) return { text: clean, fontSize: size, width: measureText(clean, size, weight) };
  const cut = ellipsize(clean, maxWidth, size, weight);
  return { text: cut, fontSize: size, width: measureText(cut, size, weight) };
}
