import { normalizeNumberText, toNumber } from "@/lib/learning/result-values";

/**
 * Türkçe aritmetik sağlama düzelticisi (10 Kasım 2026, güven paketi) — saf, deterministik, ders bağımsız.
 *
 * Sohbet yanıtı öğrenciye gitmeden önce metindeki açık çarpma/bölme eşitlikleri ("A × B = C", "A ÷ B = C"; `·`, `*`,
 * `/`, LaTeX `\times` `\cdot` `\div`, birim ekleriyle) Türkçe yazımla okunur: nokta binlik, virgül ondalık
 * (`normalizeNumberText` kuralı; yeni ayrıştırıcı yok). Yazılan sonuç gerçek sonuçtan YALNIZ ayırıcı karışıklığının
 * imzasıyla sapıyorsa (oran 10^(3k), k ≠ 0; binlik nokta ondalık sanılmış ya da tersi) sonuç doğru değerle ve Türkçe
 * biçimle değiştirilir. Başka her sapmada metne dokunulmaz: yuvarlama, birim dönüşümü, yaklaşık eşitlik ve gerçek
 * hesap hatası bu kuralın işi değildir.
 *
 * "Kod metne dokunmaz" ilkesinin ürün sahibinin isteğiyle dar istisnası: yalnız eşitliğin sonucundaki sayı değişir,
 * cümle yazılmaz. Dokunulmayanlar: kod blokları ve satır içi kod, tarih, saat, sürüm numarası, bağlantı, `[[…]]`
 * işaretleri, aralık ("a-b"), zincirin parçası olan eşitlik ("a + b × c = d"), değişkenli ifade, yüzde, "bin/milyon"
 * gibi büyüklük sözcüğü taşıyan sonuç, birimi işlenenlerden farklı sonuç (dönüşüm olabilir), nokta-ondalık yazan metin.
 */

export type MathFixResult = {
  text: string;
  /** Düzeltilen eşitlik sayısı. */
  fixes: number;
};

const MASK = "\u0001";

/** Dokunulmayacak bölgeler aynı uzunlukta maskelenir; indeksler özgün metinle bire bir kalır. */
const PROTECTED: RegExp[] = [
  /```[\s\S]*?```/g,
  /`[^`\n]*`/g,
  /\[\[[\s\S]*?\]\]/g,
  /https?:\/\/\S+/g,
  // Tarih (gün.ay.yıl, gün/ay/yıl) ve saat.
  /(?<![\d.,])\d{1,2}[./]\d{1,2}[./]\d{2,4}(?![\d.,])/g,
  /(?<![\d.,:])\d{1,2}:\d{2}(?::\d{2})?(?![\d:])/g,
];

/** Üç ve daha çok parçalı noktalı dizi binlik yazımı değilse sürüm / bölüm numarasıdır ("2.10.3"). */
const DOTTED_RUN = /(?<![\d.,])\d+(?:\.\d+){2,}(?![\d.,])/g;
const THOUSANDS_FORM = /^[1-9]\d{0,2}(?:\.\d{3})+$/;

function maskProtected(text: string): string {
  let masked = text;
  for (const pattern of PROTECTED) {
    masked = masked.replace(pattern, (match) => MASK.repeat(match.length));
  }
  return masked.replace(DOTTED_RUN, (match) => (THOUSANDS_FORM.test(match) ? match : MASK.repeat(match.length)));
}

const NUM = String.raw`\d{1,3}(?:\.\d{3})+(?:,\d+)?|\d+(?:[.,]\d+)?`;
const GAP = String.raw`(?:[ \t]|\\[,;:! ])*`;
const UNIT = String.raw`\\(?:text|mathrm)\{\s*[\p{L}µΩ°/²³ ]{1,16}\}|[\p{L}µΩ°₺]{1,12}(?:\/[\p{L}]{1,6})?[²³]?`;
const OP = String.raw`×|·|∙|\*|÷|\/|\\times|\\cdot|\\div`;

/** A [birim] işlem B [birim] = C. Sayı bir harfe, rakama, ayırıcıya, üsse ya da LaTeX komutuna yapışık başlamaz. */
const EQUATION = new RegExp(
  String.raw`(?<![\p{L}\p{N}.,_^{\\%])(${NUM})(?:${GAP}(${UNIT}))?${GAP}(${OP})${GAP}(${NUM})(?:${GAP}(${UNIT}))?${GAP}(?<![=!<>])=(?!=)${GAP}(${NUM})`,
  "gu",
);

const TRAILING_UNIT = new RegExp(String.raw`^${GAP}(${UNIT})`, "u");

/** Sayıdan sonra gelip büyüklüğü değiştiren sözcükler: sonucu taşıyan sayı tek başına okunamaz. */
const MAGNITUDE_WORD = /^(?:yüz|bin|milyon|milyar|trilyon|mn|mr|kat|katı)$/iu;
/** Tek harfli birim simgeleri; başka tek harf değişkendir ("2x") ve ifade atlanır. */
const SINGLE_LETTER_UNIT = /^[mgsNJWVALKTCFhl°Ω₺]$/u;

function unitKey(raw: string | undefined): string {
  if (!raw) return "";
  return raw.replace(/\\(?:text|mathrm)\{\s*([^}]*)\}/u, "$1").trim();
}

function unitUsable(unit: string): boolean {
  if (!unit) return true;
  if (MAGNITUDE_WORD.test(unit)) return false;
  return unit.length > 1 || SINGLE_LETTER_UNIT.test(unit);
}

/** Eşitliğin solunda süren bir işlem var mı ("a + b × c = d"); varsa ifade tek başına hesaplanamaz. */
function continuesLeft(masked: string, start: number): boolean {
  const line = masked.slice(masked.lastIndexOf("\n", start - 1) + 1, start);
  const before = line.replace(/[ \t]+$/, "");
  if (!before) return false;
  if (/\\(?:times|cdot|div|frac|sqrt|pm)$/.test(before)) return true;
  const last = before.at(-1)!;
  if ("+×·∙÷/^%".includes(last)) return true;
  if ("-−–*(".includes(last)) {
    // Satır başındaki madde imi, kalın işareti ya da açıklama parantezi işlem değildir; bir değerden sonra gelen işlemdir.
    const glued = before.slice(0, -1).at(-1) ?? "";
    // "f(…", "2(…": yapışık parantez bir çağrı ya da örtük çarpımdır.
    if (last === "(") return /[\p{L}\p{N})\]}]/u.test(glued);
    const prior = before.slice(0, -1).replace(/[ \t*]+$/, "").at(-1) ?? "";
    return /[\p{L}\p{N})\]}]/u.test(prior);
  }
  return false;
}

/** Sonuçtan sonra süren bir işlem, üs ya da yüzde var mı ("= c × 10ⁿ", "= c + d"). */
function continuesRight(rest: string): boolean {
  const after = rest.replace(new RegExp(String.raw`^${GAP}`, "u"), "");
  if (/^(?:[×·∙÷/^+%]|\\(?:times|cdot|div|pm)|[⁰¹²³⁴⁵⁶⁷⁸⁹⁻])/u.test(after)) return true;
  // Yıldız yalnız bir değerden önce çarpmadır; "**" ya da satır sonu kalın/eğik işaretinin kapanışıdır.
  if (/^\*\s*[\d(]/.test(after)) return true;
  if (/^[-−–]\s*[\d(]/.test(after)) return true;
  return /^[xXeE]\s*[+-]?\d/.test(after);
}

/** Metin nokta-ondalık yazıyor mu: "3.5", "0.75" gibi sayılar var ve hiç ondalık virgül yok. */
function usesDotDecimals(masked: string): boolean {
  if (/\d,\d/.test(masked)) return false;
  return /(?<![\d.,])\d+\.(?:\d{1,2}|\d{4,})(?![\d.,])/.test(masked);
}

function groupThousands(digits: string): string {
  return digits.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
}

/** Türkçe yazım: ondalık virgül; binlik nokta yalnız ifadenin kendisi binlik nokta kullanıyorsa. */
function formatTurkish(value: number, grouped: boolean): string {
  const fixed = Math.abs(value).toFixed(6).replace(/\.?0+$/, "");
  const [whole = "0", fraction] = fixed.split(".");
  const head = grouped && whole.length > 3 ? groupThousands(whole) : whole;
  return fraction ? `${head},${fraction}` : head;
}

const TOLERANCE = 0.005;

/**
 * Yazılan sonuç ile gerçek sonuç arasındaki fark ayırıcı karışıklığının imzası mı: oran 10^(3k), k ≠ 0.
 * Öyleyse k döner; değilse null (eşitlik tutuyor ya da sapma başka türden).
 */
function separatorShift(actual: number, written: number): number | null {
  if (!Number.isFinite(actual) || !Number.isFinite(written) || actual === 0 || written === 0) return null;
  const ratio = Math.abs(written / actual);
  if (Math.abs(ratio - 1) <= TOLERANCE) return null;
  const k = Math.round(Math.log10(ratio) / 3);
  if (k === 0 || Math.abs(k) > 4) return null;
  return Math.abs(ratio / 10 ** (3 * k) - 1) <= TOLERANCE ? k : null;
}

export function verifyAndFixTurkishMathExpressions(text: string): MathFixResult {
  if (!text || !/\d/.test(text) || !/=/.test(text)) return { text: text ?? "", fixes: 0 };
  const masked = maskProtected(text);
  if (usesDotDecimals(masked)) return { text, fixes: 0 };

  const edits: { start: number; end: number; value: string }[] = [];
  for (const match of masked.matchAll(EQUATION)) {
    const whole = match[0];
    const a = match[1] ?? "";
    const unitA = match[2];
    const op = match[3] ?? "";
    const b = match[4] ?? "";
    const unitB = match[5];
    const c = match[6] ?? "";
    const start = match.index ?? 0;
    const end = start + whole.length;
    const rest = masked.slice(end);
    // Sonuç sayısı yarıda kesildiyse ("3.5.1") ya da yapışık bir değişken sürüyorsa okunmaz.
    if (/^[.,]?\d/.test(rest)) continue;
    // Ayırıcı karışıklığı ancak ifadede bir ayırıcı varsa olur.
    if (!/[.,]/.test(`${a}${b}${c}`)) continue;
    if (continuesLeft(masked, start)) continue;

    const unitMatch = rest.match(TRAILING_UNIT);
    const unitC = unitKey(unitMatch?.[1]);
    if (continuesRight(unitMatch ? rest.slice(unitMatch[0].length) : rest)) continue;
    const units = [unitKey(unitA), unitKey(unitB)];
    if (![...units, unitC].every(unitUsable)) continue;
    // Birim tutarlılığı: işlenenlerde birim varsa sonuç aynı birimi taşımalı; yoksa dönüşüm olabilir.
    const operandUnits = units.filter(Boolean);
    if (operandUnits.length && operandUnits.some((unit) => unit !== unitC)) continue;

    const left = toNumber(a);
    const right = toNumber(b);
    const written = toNumber(c);
    if (left == null || right == null || written == null) continue;
    const divide = op === "÷" || op === "/" || op === "\\div";
    if (divide && right === 0) continue;
    const actual = divide ? left / right : left * right;
    const shift = separatorShift(actual, written);
    if (shift == null) continue;

    // Yalnız ayırıcı kayması geri alınır; yazarın yuvarlaması korunur.
    const corrected = written / 10 ** (3 * shift);
    const grouped = [a, b, c].some((token) => normalizeNumberText(token) !== token.replace(",", "."));
    const cStart = end - c.length;
    edits.push({ start: cStart, end, value: formatTurkish(corrected, grouped) });
  }
  if (!edits.length) return { text, fixes: 0 };

  let out = text;
  for (const edit of edits.sort((x, y) => y.start - x.start)) {
    out = `${out.slice(0, edit.start)}${edit.value}${out.slice(edit.end)}`;
  }
  return { text: out, fixes: edits.length };
}
