/**
 * Birim beklentisi (bütün dersler).
 *
 * Yıl, tarih, madde numarası, oran ve sayım birim değildir. Karar birimin
 * biçiminden okunur; ders adı ya da terim listesi yok.
 */

const YEAR = /\b(?:1[0-9]{3}|20[0-9]{2})\b/g;
const DATE = /\b\d{1,2}[./]\d{1,2}[./]\d{2,4}\b/g;
const ARTICLE =
  /\b(?:madde|md|article|art)\.?\s*\d{1,4}\b|\bm\.\d{1,4}\b|\b\d{1,4}\.\s*madde\b|\b\d{1,4}(?:st|nd|rd|th)\s+article\b/gi;
const RATIO = /\b\d+(?:[.,]\d+)?\s*(?:\/|:)\s*\d+(?:[.,]\d+)?\b/g;

/** Uzun yazım önce: mw, w'den önce; cm, m'den önce. */
const UNIT_TOKEN =
  /(\d+(?:[.,]\d+)?)\s*(mw|milivat|kw|kilowatt|watt|kpa|mpa|ohm|omega|hertz|volt|ampere|amper|metre|meter|second|litre|liter|gram|mole|newton|joule|pascal|mol|mm|cm|km|kg|mg|ml|sn|dk|ms|pa|hz|ma|kv|mv|w|v|a|m|g|l|s|n|j|ω|Ω)\b|(\d+(?:[.,]\d+)?)\s*%|%\s*(\d+(?:[.,]\d+)?)/iu;

const SPELLED: { quantity: string; scale: number; re: RegExp }[] = [
  { quantity: "power", scale: 0.001, re: /(\d+(?:[.,]\d+)?)\s*(?:mw|milivat)\b/giu },
  { quantity: "power", scale: 1000, re: /(\d+(?:[.,]\d+)?)\s*(?:kw|kilowatt)\b/giu },
  { quantity: "power", scale: 1, re: /(\d+(?:[.,]\d+)?)\s*(?:watt|\bw\b)/giu },
  { quantity: "voltage", scale: 1000, re: /(\d+(?:[.,]\d+)?)\s*(?:kv|kilovolt)\b/giu },
  { quantity: "voltage", scale: 0.001, re: /(\d+(?:[.,]\d+)?)\s*(?:mv|milivolt)\b/giu },
  { quantity: "voltage", scale: 1, re: /(\d+(?:[.,]\d+)?)\s*(?:volt|\bv\b)/giu },
  { quantity: "current", scale: 0.001, re: /(\d+(?:[.,]\d+)?)\s*(?:ma|miliamper)\b/giu },
  { quantity: "current", scale: 1, re: /(\d+(?:[.,]\d+)?)\s*(?:ampere|amper|\ba\b)/giu },
  { quantity: "resistance", scale: 1000, re: /(\d+(?:[.,]\d+)?)\s*(?:kohm|kω|kΩ)\b/giu },
  { quantity: "resistance", scale: 1, re: /(\d+(?:[.,]\d+)?)\s*(?:ohm|ω|Ω)\b/giu },
  { quantity: "mass", scale: 1000, re: /(\d+(?:[.,]\d+)?)\s*(?:kg|kilogram)\b/giu },
  { quantity: "mass", scale: 0.001, re: /(\d+(?:[.,]\d+)?)\s*(?:mg|miligram)\b/giu },
  { quantity: "mass", scale: 1, re: /(\d+(?:[.,]\d+)?)\s*(?:gram|\bg\b)/giu },
  { quantity: "length", scale: 0.001, re: /(\d+(?:[.,]\d+)?)\s*mm\b/giu },
  { quantity: "length", scale: 0.01, re: /(\d+(?:[.,]\d+)?)\s*cm\b/giu },
  { quantity: "length", scale: 1000, re: /(\d+(?:[.,]\d+)?)\s*km\b/giu },
  { quantity: "length", scale: 1, re: /(\d+(?:[.,]\d+)?)\s*(?:metre|meter|\bm\b)/giu },
  { quantity: "time", scale: 0.001, re: /(\d+(?:[.,]\d+)?)\s*ms\b/giu },
  { quantity: "time", scale: 60, re: /(\d+(?:[.,]\d+)?)\s*(?:dk|dakika)\b/giu },
  { quantity: "time", scale: 1, re: /(\d+(?:[.,]\d+)?)\s*(?:sn|saniye|second|\bs\b)/giu },
  { quantity: "amount", scale: 1, re: /(\d+(?:[.,]\d+)?)\s*(?:mol|mole)\b/giu },
  { quantity: "pressure", scale: 1000, re: /(\d+(?:[.,]\d+)?)\s*kpa\b/giu },
  { quantity: "pressure", scale: 1_000_000, re: /(\d+(?:[.,]\d+)?)\s*mpa\b/giu },
  { quantity: "pressure", scale: 1, re: /(\d+(?:[.,]\d+)?)\s*(?:pa|pascal)\b/giu },
  { quantity: "force", scale: 1, re: /(\d+(?:[.,]\d+)?)\s*(?:newton|\bn\b)/giu },
  { quantity: "energy", scale: 1000, re: /(\d+(?:[.,]\d+)?)\s*(?:kj|kilojoule)\b/giu },
  { quantity: "energy", scale: 1, re: /(\d+(?:[.,]\d+)?)\s*(?:joule|\bj\b)/giu },
  { quantity: "frequency", scale: 1, re: /(\d+(?:[.,]\d+)?)\s*(?:hz|hertz)\b/giu },
  { quantity: "percent", scale: 1, re: /(\d+(?:[.,]\d+)?)\s*%|%\s*(\d+(?:[.,]\d+)?)/giu },
];

export type Measure = {
  value: number;
  quantity: string;
  /** Karşılaştırma için taban birime çevrilmiş değer. */
  canonical: number;
};

function toNumber(raw: string): number | null {
  const n = Number(raw.replace(",", "."));
  return Number.isFinite(n) ? n : null;
}

/** Yıl, tarih, madde ve oran maskelenmiş metin. */
export function maskNonUnits(text: string): string {
  return text.replace(DATE, " ").replace(YEAR, " ").replace(ARTICLE, " ").replace(RATIO, " ");
}

/** Beklenen cevap ya da kilit bilgi birim taşıyor mu. Sayım, yıl ve madde taşımaz. */
export function expectsUnit(text: string): boolean {
  const masked = ` ${maskNonUnits(text)} `;
  return UNIT_TOKEN.test(masked);
}

function consume(text: string, start: number, end: number, spans: { start: number; end: number }[]): boolean {
  if (spans.some((span) => start < span.end && end > span.start)) return false;
  spans.push({ start, end });
  return true;
}

/** Metindeki ölçüler. Yıl ve madde sayı olarak dönmez. Kesir + birim tek değerdir. */
export function parseMeasures(text: string): Measure[] {
  const masked = maskNonUnits(text);
  const spans: { start: number; end: number }[] = [];
  const out: Measure[] = [];

  const fraction = /(\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*(mw|milivat|kw|watt|volt|ampere|amper|ohm|gram|metre|meter|mol|mole|cm|mm|km|kg|mg|ml|sn|dk|w|v|a|g|m|s|ω|Ω|%)/giu;
  for (const match of masked.matchAll(fraction)) {
    const start = match.index ?? 0;
    if (!consume(masked, start, start + match[0].length, spans)) continue;
    const left = toNumber(match[1] ?? "");
    const right = toNumber(match[2] ?? "");
    if (left == null || right == null || right === 0) continue;
    const unit = match[3] ?? "";
    const spec = specForUnit(unit);
    if (!spec) continue;
    const value = left / right;
    out.push({ value, quantity: spec.quantity, canonical: value * spec.scale });
  }

  for (const spec of SPELLED) {
    for (const match of masked.matchAll(spec.re)) {
      const start = match.index ?? 0;
      if (!consume(masked, start, start + match[0].length, spans)) continue;
      const raw = match[1] || match[2];
      const value = raw ? toNumber(raw) : null;
      if (value == null) continue;
      out.push({ value, quantity: spec.quantity, canonical: value * spec.scale });
    }
  }
  return out;
}

const UNIT_SCALE: Record<string, { quantity: string; scale: number }> = {
  mw: { quantity: "power", scale: 0.001 },
  milivat: { quantity: "power", scale: 0.001 },
  kw: { quantity: "power", scale: 1000 },
  kilowatt: { quantity: "power", scale: 1000 },
  w: { quantity: "power", scale: 1 },
  watt: { quantity: "power", scale: 1 },
  kv: { quantity: "voltage", scale: 1000 },
  kilovolt: { quantity: "voltage", scale: 1000 },
  mv: { quantity: "voltage", scale: 0.001 },
  milivolt: { quantity: "voltage", scale: 0.001 },
  v: { quantity: "voltage", scale: 1 },
  volt: { quantity: "voltage", scale: 1 },
  ma: { quantity: "current", scale: 0.001 },
  miliamper: { quantity: "current", scale: 0.001 },
  a: { quantity: "current", scale: 1 },
  ampere: { quantity: "current", scale: 1 },
  amper: { quantity: "current", scale: 1 },
  kohm: { quantity: "resistance", scale: 1000 },
  "kω": { quantity: "resistance", scale: 1000 },
  "kΩ": { quantity: "resistance", scale: 1000 },
  ohm: { quantity: "resistance", scale: 1 },
  ω: { quantity: "resistance", scale: 1 },
  Ω: { quantity: "resistance", scale: 1 },
  kg: { quantity: "mass", scale: 1000 },
  kilogram: { quantity: "mass", scale: 1000 },
  mg: { quantity: "mass", scale: 0.001 },
  miligram: { quantity: "mass", scale: 0.001 },
  g: { quantity: "mass", scale: 1 },
  gram: { quantity: "mass", scale: 1 },
  mm: { quantity: "length", scale: 0.001 },
  cm: { quantity: "length", scale: 0.01 },
  km: { quantity: "length", scale: 1000 },
  m: { quantity: "length", scale: 1 },
  metre: { quantity: "length", scale: 1 },
  meter: { quantity: "length", scale: 1 },
  ms: { quantity: "time", scale: 0.001 },
  dk: { quantity: "time", scale: 60 },
  dakika: { quantity: "time", scale: 60 },
  sn: { quantity: "time", scale: 1 },
  saniye: { quantity: "time", scale: 1 },
  second: { quantity: "time", scale: 1 },
  s: { quantity: "time", scale: 1 },
  mol: { quantity: "amount", scale: 1 },
  mole: { quantity: "amount", scale: 1 },
  kpa: { quantity: "pressure", scale: 1000 },
  mpa: { quantity: "pressure", scale: 1_000_000 },
  pa: { quantity: "pressure", scale: 1 },
  pascal: { quantity: "pressure", scale: 1 },
  n: { quantity: "force", scale: 1 },
  newton: { quantity: "force", scale: 1 },
  kj: { quantity: "energy", scale: 1000 },
  kilojoule: { quantity: "energy", scale: 1000 },
  j: { quantity: "energy", scale: 1 },
  joule: { quantity: "energy", scale: 1 },
  hz: { quantity: "frequency", scale: 1 },
  hertz: { quantity: "frequency", scale: 1 },
  "%": { quantity: "percent", scale: 1 },
  ml: { quantity: "volume", scale: 0.001 },
  litre: { quantity: "volume", scale: 1 },
  liter: { quantity: "volume", scale: 1 },
  l: { quantity: "volume", scale: 1 },
};

function specForUnit(unit: string): { quantity: string; scale: number } | null {
  return UNIT_SCALE[unit.toLocaleLowerCase("tr")] ?? UNIT_SCALE[unit] ?? null;
}

/** Sayım: birimsiz sayılar. Yıl, madde ve oran hariç. */
export function parseCounts(text: string): number[] {
  const masked = maskNonUnits(text);
  const withoutUnits = masked.replace(UNIT_TOKEN, " ");
  const out: number[] = [];
  for (const match of withoutUnits.matchAll(/\d+(?:[.,]\d+)?/g)) {
    const value = toNumber(match[0]);
    if (value == null || value === 0 || value === 1) continue;
    if (!out.includes(value)) out.push(value);
  }
  return out;
}
