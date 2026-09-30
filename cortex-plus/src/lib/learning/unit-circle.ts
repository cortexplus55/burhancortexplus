/**
 * Birim çember: açı ↔ nokta denetimi.
 *
 * 30 Eylül 2026 canlı quiz (birim çember konusu) şunu gösterdi: "(1, 0) ve
 * (0, 1) arasında" şıkkının gerekçesi "bu noktalar 0° ile 90° arasında
 * geçerli değildir" diyordu. (1, 0) 0°'nin, (0, 1) 90°'nin noktasıdır;
 * gerekçe öğrenciye yanlışı öğretiyordu. math-key.ts "sin 30° = √3/2"
 * eşitliğini yakalıyor ama nokta yazımına ("90° → (0, 1)") hiç bakmıyordu.
 *
 * İlke math-key.ts ile aynı: yalnızca kesin okunan iddiaya hüküm verilir.
 * Metin "birim çember" demiyorsa, cümlede birden fazla açı varsa ya da
 * nokta hesaplanamıyorsa hüküm yok.
 */
import { evaluateMath } from "@/lib/learning/math-key";

type Point = [number, number];

const EPS = 1e-9;

function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/ı/g, "i")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ş/g, "s")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c");
}

function isUnitCircleContext(text: string): boolean {
  return /birim\s+cember/.test(fold(text));
}

/** θ derecenin birim çemberdeki noktası. */
export function unitPoint(degrees: number): Point {
  const radians = (degrees * Math.PI) / 180;
  const clean = (value: number) => (Math.abs(value) < EPS ? 0 : value);
  return [clean(Math.cos(radians)), clean(Math.sin(radians))];
}

function samePoint(a: Point, b: Point): boolean {
  return Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6;
}

function onCircle(point: Point): boolean {
  return Math.abs(point[0] ** 2 + point[1] ** 2 - 1) < 1e-6;
}

/** Birim çemberdeki noktanın açısı [0, 360); çember dışındaysa null. */
export function pointAngle(point: Point): number | null {
  if (!onCircle(point)) return null;
  const degrees = (Math.atan2(point[1], point[0]) * 180) / Math.PI;
  const normalized = Math.round(((degrees % 360) + 360) % 360 * 1e6) / 1e6;
  return normalized === 360 ? 0 : normalized;
}

const TUPLE = /\(([^()]*)\)/g;

/** "(√2/2, √2/2)" → [0.707…, 0.707…]; iki bileşen hesaplanamıyorsa null. */
export function parsePoint(text: string): Point | null {
  const inner = text.trim().match(/^\(([^()]*)\)$/)?.[1];
  if (inner == null) return null;
  const parts = inner.includes(";") ? inner.split(";") : inner.split(/,\s+/);
  if (parts.length !== 2) return null;
  const values = parts.map((part) => evaluateMath(part.replace(/−/g, "-")));
  if (values.some((value) => value == null)) return null;
  return values as Point;
}

/** Metindeki bütün noktalar; biri okunamazsa null (yarım okuma hüküm vermez). */
function pointsIn(text: string): Point[] | null {
  const points: Point[] = [];
  for (const match of text.matchAll(TUPLE)) {
    const point = parsePoint(match[0]);
    if (!point) return null;
    points.push(point);
  }
  return points;
}

const DEGREE = /(-?\d+(?:[.,]\d+)?)\s*(?:°|derece\b)/giu;

function anglesIn(text: string): number[] {
  return [...new Set([...text.matchAll(DEGREE)].map((match) => Number((match[1] ?? "").replace(",", "."))))];
}

type Span = { angle?: number; range?: [number, number] };

const RANGE =
  /(-?\d+(?:[.,]\d+)?)\s*(?:°|derece)?\s*(?:ile|ve|-|–)\s*(-?\d+(?:[.,]\d+)?)\s*(?:°|derece)\s*(?:'\p{L}+\s*)?(?:aras|aralı)/iu;

function spanIn(text: string): Span | null {
  const range = text.match(RANGE);
  if (range) {
    const lo = Number((range[1] ?? "").replace(",", "."));
    const hi = Number((range[2] ?? "").replace(",", "."));
    return { range: [Math.min(lo, hi), Math.max(lo, hi)] };
  }
  const angles = anglesIn(text);
  if (angles.length === 1) return { angle: angles[0] };
  return null;
}

const NEGATION = /değil|olamaz|olmaz|gelmez|uymaz|geçersiz|bulunmaz|yoktur|yer almaz/giu;

/**
 * Kök tek bir açının noktasını mı soruyor? "Birim çemberde 45° açısının
 * koordinatları nedir?" → 45. Simetri, döndürme, bütünler gibi başka bir
 * nokta soran kökte hüküm yok.
 */
export function askedUnitAngle(stem: string): number | null {
  if (!isUnitCircleContext(stem)) return null;
  const folded = fold(stem);
  if (/simetri|yansi|dondur|donme|butunle|tumle|zit|oteleme|gore/.test(folded)) return null;
  if (!/koordinat|nokta/.test(folded)) return null;
  if (spanIn(stem)?.range) return null;
  const angles = anglesIn(stem);
  return angles.length === 1 ? (angles[0] ?? null) : null;
}

type KeyedCheck = { prompt: string; options?: string[]; answerIndex?: number };

/**
 * true: anahtar birim çemberle çelişiyor (ya da hiçbir şık doğru nokta
 * değil). false: uyuşuyor. null: hüküm yok.
 */
export function unitCircleKeyWrong(check: KeyedCheck): boolean | null {
  const angle = askedUnitAngle(check.prompt);
  if (angle == null || !check.options?.length || check.answerIndex == null) return null;
  const points = check.options.map((option) => parsePoint(option));
  if (points.some((point) => !point)) return null;
  const want = unitPoint(angle);
  const matches = points.flatMap((point, index) => (point && samePoint(point, want) ? [index] : []));
  if (matches.length !== 1) return true;
  return matches[0] !== check.answerIndex;
}

/*
  "yatay koordinatı 0", "kosinüsü √2/2". Değerin hemen ardından "değil"
  geliyorsa o değer reddedilen değerdir ("düşey koordinat 1 değil, √2/2'dir").
*/
const VALUE = String.raw`(-?\s*(?:√\d+(?:\/\d+)?|\d+(?:[.,]\d+)?(?:\/√?\d+)?))`;
const COMPONENT = new RegExp(
  String.raw`(?<!\p{L})(yatay|x|apsis|kosinüs(?:ü)?|düşey|dikey|y|ordinat|sinüs(?:ü)?)(?:\s+koordinat(?:ı)?)?\s*(?:ise\s+)?${VALUE}(?:'\p{L}+)?(?!\s*[\p{L}\d/√]*\s*değil)`,
  "giu",
);

function componentIssues(clause: string, angle: number): string[] {
  const want = unitPoint(angle);
  const issues: string[] = [];
  for (const match of clause.matchAll(COMPONENT)) {
    const word = fold(match[1] ?? "");
    const value = evaluateMath((match[2] ?? "").replace(/\s+/g, ""));
    if (value == null) continue;
    const index = /^(yatay|x|apsis|kosinus)/.test(word) ? 0 : 1;
    if (Math.abs(value - (want[index] ?? 0)) > 1e-6) {
      issues.push(`${angle}° için ${index === 0 ? "yatay" : "düşey"} koordinat ${match[2]?.trim()} değil.`);
    }
  }
  return issues;
}

function clauseIssues(clause: string, stemSpan: Span | null, optionPoints: Point[] | null): string[] {
  const points = pointsIn(clause);
  if (!points) return [];
  let span = spanIn(clause);
  if (!span && /\bbu\s+açı/iu.test(clause)) span = stemSpan;
  if (!span) return [];
  const negations = clause.match(NEGATION)?.length ?? 0;
  // "X değil, Y'dir" iki hüküm taşır; hangisinin hangi noktaya ait olduğu okunamaz.
  if (negations > 1 || /(?:değil|olamaz)\s*,/iu.test(clause)) return [];
  const negative = negations === 1;
  const issues = span.angle != null && !negative ? componentIssues(clause, span.angle) : [];
  const named = points.length ? points : /\bbu\s+(?:nokta|koordinat|şık)/iu.test(clause) ? optionPoints ?? [] : [];
  const circlePoints = named.filter(onCircle);
  if (!circlePoints.length || circlePoints.length !== named.length) return issues;
  if (span.angle != null) {
    const want = unitPoint(span.angle);
    const hits = circlePoints.filter((point) => samePoint(point, want)).length;
    if (!negative && hits < circlePoints.length) issues.push(`${span.angle}° açısının noktası başka bir nokta olarak yazılmış.`);
    if (negative && hits > 0) issues.push(`${span.angle}° açısının kendi noktası reddedilmiş.`);
    return issues;
  }
  const [lo, hi] = span.range ?? [0, 0];
  const inside = circlePoints.every((point) => {
    const angle = pointAngle(point);
    return angle != null && angle >= lo - 1e-6 && angle <= hi + 1e-6;
  });
  if (negative && inside) issues.push(`${lo}°–${hi}° aralığındaki noktalar aralık dışında sayılmış.`);
  if (!negative && !inside) issues.push(`${lo}°–${hi}° aralığı dışındaki bir nokta aralıkta sayılmış.`);
  return issues;
}

function clausesOf(text: string): string[] {
  return text.split(/(?<=[.!?])\s+|;\s*|\n+/).map((part) => part.trim()).filter(Boolean);
}

/**
 * Açıklama ve şık gerekçelerinde birim çember iddiası tablo ile çelişiyor
 * mu? Gerekçe kendi noktasını yazmadan "bu noktalar" diyorsa şıkkın
 * noktaları kullanılır.
 */
export function unitCircleClaimIssues(question: {
  text: string;
  options: string[];
  explanation?: string;
  optionWhy?: string[];
}): string[] {
  const blob = `${question.text}\n${question.explanation ?? ""}\n${(question.optionWhy ?? []).join("\n")}`;
  if (!isUnitCircleContext(blob)) return [];
  const stemSpan = spanIn(question.text);
  const issues: string[] = [];
  for (const clause of clausesOf(question.explanation ?? "")) {
    issues.push(...clauseIssues(clause, stemSpan, null));
  }
  (question.optionWhy ?? []).forEach((line, index) => {
    const optionPoints = pointsIn(question.options[index] ?? "");
    for (const clause of clausesOf(line)) {
      for (const issue of clauseIssues(clause, stemSpan, optionPoints)) {
        issues.push(`${question.options[index] ?? ""}: ${issue}`);
      }
    }
  });
  return [...new Set(issues)];
}

function squareTerm(value: number): string | null {
  if (!Number.isInteger(value)) return null;
  return value < 0 ? `(${value})²` : `${value}²`;
}

/**
 * Tek açının noktasını soran soruda yanlış bir nokta şıkkı için doğru,
 * şıkka özgü gerekçe: o nokta hangi açınındır ya da neden çemberde değildir.
 * Hüküm verilemiyorsa null.
 */
export function unitCircleOptionReason(question: {
  text: string;
  options: string[];
  correct: string[];
}, option: string): string | null {
  const angle = askedUnitAngle(question.text);
  if (angle == null || question.correct.length !== 1) return null;
  const correct = question.correct[0] ?? "";
  const correctPoint = parsePoint(correct);
  const point = parsePoint(option);
  if (!correctPoint || !point || !samePoint(correctPoint, unitPoint(angle)) || samePoint(point, correctPoint)) {
    return null;
  }
  const at = pointAngle(point);
  if (at != null) {
    if (!Number.isInteger(at)) return null;
    return `${option.trim()} noktası ${at}° açısına karşılık gelir; ${angle}° açısının noktası ${correct.trim()} olur.`;
  }
  const x = squareTerm(point[0]);
  const y = squareTerm(point[1]);
  if (!x || !y) return null;
  const sum = point[0] ** 2 + point[1] ** 2;
  return `${option.trim()} birim çemberin üzerinde değildir: ${x} + ${y} = ${sum} olur, birim çemberde bu toplam 1'dir.`;
}
