/**
 * Yanlış cevabın yapısal türü (5 Kasım 2026, öğrenme hafızası) — MODELSİZ.
 *
 * Yalnız sorunun yapısına bakar: seçilen ve doğru şıkkın sayısal ilişkisi, kökün olumsuzluğu, öncül
 * kümeleri, çok cevaplı seçim kümesi, cevap süresi. Ders, konu ya da kişi adı yok; aynı kural bütün
 * disiplinlerde çalışır. Sayı okuma mevcut okuyuculardan (`result-values`, `gate-v14`); yenisi yazılmadı.
 */
import { numericChoice } from "@/lib/content-pool/gate-v14";
import { answerKey } from "@/lib/learning/exam-quiz";
import { numbersIn, sameNumber, toNumber } from "@/lib/learning/result-values";

export const ERROR_KINDS = [
  "sign",
  "magnitude",
  "unit_factor",
  "reciprocal",
  "rounding",
  "arithmetic",
  "polarity",
  "premise_subset",
  "partial_select",
  "over_select",
  "hurried",
  "other",
] as const;

export type ErrorKind = (typeof ERROR_KINDS)[number];

export type WrongAnswerInput = {
  stem: string;
  options: string[];
  correct: string[];
  chosen: string[];
  multi: boolean;
  /** Cevap süresi (ms); bilinmiyorsa null. */
  timeMs?: number | null;
};

/** Bu süreden kısa yanlış cevap, başka tür bulunamazsa acele sayılır. */
export const HURRIED_MS = 4000;

/** Genel dönüşüm çarpanları; 10'un katları `magnitude` ile paylaşılır (birim yazımı farklıysa dönüşüm). */
const POWERS_OF_TEN = [10, 100, 1000] as const;
const CONVERSION_FACTORS = [60, 3600, 24, 7, 12, 1024, 2.54, 1.6] as const;
/** Yuvarlama: göreli fark bu eşiğin altında. Aritmetik: bu eşik ile üst eşik arasında. */
const ROUNDING_REL = 0.01;
const ARITHMETIC_REL = 0.25;
/** Oran karşılaştırmasının hoşgörüsü (binde beş). */
const RATIO_TOL = 0.005;

/**
 * Olumsuz soru kökü: "değil(dir)", "yanlış olan / yanlıştır / yanlış bir ifade", "yoktur", "dışındadır",
 * "hariç" ve geniş zamanın olumsuzu (-maz/-mez: olamaz, söylenemez, gerektirmez, bulunmaz, yer almaz…).
 * Sözcük listesi değil ek kuralı: hangi dersin fiili olursa olsun aynı çalışır.
 * Türkçe harf içeren sözcüklerde `\b` çalışmaz (ç, ş harf sayılmaz); sınır harf olmayan karakterle kurulur.
 * "not" alınmadı: Türkçede "not ortalaması" gibi olumlu köklerde geçer.
 */
const NEGATIVE_STEM =
  /(?<!\p{L})(?:değildir|değil|yanlıştır|yanlış\s+olan(?:ı|lar)?|yanlış(?=\s+(?:bir\s+)?(?:ifade|bilgi|açıklama|yargı|önerme|eşleştirme))|yoktur|dışındadır|hariç|\p{L}{2,}(?:maz|mez)(?:dır|dir|dur|dür|lar|ler)?|except|incorrect|is\s+not|cannot\s+be|does\s+not)(?!\p{L})/iu;

/** Öncül numarası: yalnız büyük harf Roma rakamı, harf ya da rakama yapışık değil. */
const ROMAN_TOKEN = /(?<![\p{L}\p{N}])(VI{0,3}|IV|I{1,3})(?![\p{L}\p{N}])/gu;
/** Kökte öncül işareti: "I." / "II)" / "III-" satır ya da boşluktan sonra. */
const PREMISE_MARKER = /(?:^|\s)(VI{0,3}|IV|I{1,3})\s*[.)\-–:](?=\s|$)/gu;
/** Öncül şıkkında numaraların arasında kalabilen bağlaçlar. */
const PREMISE_CONNECTORS = /(?:yalnızca|yalnız|sadece|ve|ile|only|and|&|,|\.|\s)+/giu;

function keySet(values: readonly string[]): Set<string> {
  return new Set(values.map(answerKey).filter(Boolean));
}

function isProperSubset(small: Set<string>, big: Set<string>): boolean {
  if (small.size === 0 || small.size >= big.size) return false;
  for (const item of small) if (!big.has(item)) return false;
  return true;
}

function sameSet(a: Set<string>, b: Set<string>): boolean {
  if (a.size !== b.size) return false;
  for (const item of a) if (!b.has(item)) return false;
  return true;
}

function premiseSet(text: string): Set<string> | null {
  const matches = [...text.matchAll(ROMAN_TOKEN)].map((match) => match[1]!);
  if (!matches.length) return null;
  const rest = text.replace(ROMAN_TOKEN, " ").replace(PREMISE_CONNECTORS, "").trim();
  return rest ? null : new Set(matches);
}

function stemHasPremises(stem: string): boolean {
  const markers = new Set([...stem.matchAll(PREMISE_MARKER)].map((match) => match[1]!));
  return markers.size >= 2;
}

/** Şıkkın tek sayısı: yalnız sayı (+ kısa birim), kesir ya da metinde geçen tek sayı. Belirsizse null. */
export function optionNumber(text: string): number | null {
  const direct = numericChoice(text);
  if (direct != null) return direct;
  const fraction = /^\s*(-?\d+(?:[.,]\d+)?)\s*\/\s*(\d+(?:[.,]\d+)?)\s*$/u.exec(text);
  if (fraction) {
    const whole = toNumber(fraction[1]!);
    const divisor = toNumber(fraction[2]!);
    return whole != null && divisor ? whole / divisor : null;
  }
  const values = numbersIn(text);
  return values.length === 1 ? values[0]! : null;
}

function unitSuffix(text: string): string {
  const match = /\d\s*([\p{L}%°µΩ][\p{L}%°µΩ/²³]{0,5})\s*$/u.exec(text.trim());
  return match ? match[1]!.toLocaleLowerCase("tr") : "";
}

function decimalPlaces(text: string): number {
  const match = /\d+[.,](\d+)(?!\d)/.exec(text);
  return match ? match[1]!.length : 0;
}

function closeRatio(ratio: number, target: number): boolean {
  return Math.abs(ratio - target) <= RATIO_TOL * target || Math.abs(ratio - 1 / target) <= RATIO_TOL * (1 / target);
}

function numericKind(chosenText: string, correctText: string): ErrorKind | null {
  const chosen = optionNumber(chosenText);
  const correct = optionNumber(correctText);
  if (chosen == null || correct == null || sameNumber(chosen, correct)) return null;
  if (correct !== 0 && sameNumber(chosen, -correct)) return "sign";
  if (correct !== 0 && chosen !== 0 && Math.sign(chosen) === Math.sign(correct)) {
    if (Math.abs(chosen - 1 / correct) <= RATIO_TOL * Math.abs(1 / correct)) return "reciprocal";
    const ratio = Math.abs(chosen) / Math.abs(correct);
    if (POWERS_OF_TEN.some((power) => closeRatio(ratio, power))) {
      const chosenUnit = unitSuffix(chosenText);
      const correctUnit = unitSuffix(correctText);
      return chosenUnit && correctUnit && chosenUnit !== correctUnit ? "unit_factor" : "magnitude";
    }
    if (CONVERSION_FACTORS.some((factor) => closeRatio(ratio, factor))) return "unit_factor";
  }
  if (correct === 0) return Math.abs(chosen) <= ROUNDING_REL ? "rounding" : null;
  const relative = Math.abs(chosen - correct) / Math.abs(correct);
  const places = Math.max(decimalPlaces(chosenText), decimalPlaces(correctText));
  if (relative <= ROUNDING_REL) return "rounding";
  if (places > 0 && sameNumber(Math.abs(chosen - correct), 10 ** -places)) return "rounding";
  if (relative <= ARITHMETIC_REL) return "arithmetic";
  return null;
}

/**
 * Yanlış cevabı yapısal türüne ayırır. Sıra özelden genele: seçim kümesi (çok cevaplı), öncül kümesi,
 * olumsuz kök, sayısal ilişki, acele; hiçbiri tutmazsa `other`. Doğru cevap da `other` döner (çağıran
 * yanlışı seçer).
 */
export function classifyWrongAnswer(input: WrongAnswerInput): ErrorKind {
  const chosen = keySet(input.chosen);
  const correct = keySet(input.correct);
  if (!chosen.size || !correct.size || sameSet(chosen, correct)) return "other";

  if (input.multi || correct.size > 1 || chosen.size > 1) {
    if (isProperSubset(chosen, correct)) return "partial_select";
    if (isProperSubset(correct, chosen)) return "over_select";
  }

  const single = chosen.size === 1 && correct.size === 1;
  const chosenText = single ? [...chosen][0]! : "";
  const correctText = single ? [...correct][0]! : "";

  if (single && stemHasPremises(input.stem)) {
    const picked = premiseSet(chosenText);
    const wanted = premiseSet(correctText);
    if (picked && wanted && (isProperSubset(picked, wanted) || isProperSubset(wanted, picked))) return "premise_subset";
  }

  if (NEGATIVE_STEM.test(input.stem)) return "polarity";

  if (single) {
    const numeric = numericKind(chosenText, correctText);
    if (numeric) return numeric;
  }

  if (typeof input.timeMs === "number" && input.timeMs >= 0 && input.timeMs < HURRIED_MS) return "hurried";
  return "other";
}

/** Öğrencinin gördüğü etiket (kart ve hafıza satırı). Ders ya da konu adı yok. */
export function errorKindLabel(kind: ErrorKind): string {
  switch (kind) {
    case "sign":
      return "işaret hatası";
    case "magnitude":
      return "büyüklük (10'un katı) hatası";
    case "unit_factor":
      return "birim dönüşümü hatası";
    case "reciprocal":
      return "ters çevirme hatası";
    case "rounding":
      return "yuvarlama hatası";
    case "arithmetic":
      return "işlem hatası";
    case "polarity":
      return "olumsuz soru kökünü kaçırma";
    case "premise_subset":
      return "öncülleri eksik ya da fazla seçme";
    case "partial_select":
      return "doğruları eksik seçme";
    case "over_select":
      return "fazladan şık seçme";
    case "hurried":
      return "aceleyle cevaplama";
    case "other":
      return "diğer";
  }
}

/** Öğretmene talimat: bu türde yanlış yapan öğrencide ders ve sohbet ne yapsın. Ders ya da konu adı yok. */
export function errorKindCoachLine(kind: ErrorKind): string {
  switch (kind) {
    case "sign":
      return "işaret değişimlerinde dur ve işaretleri tek tek kontrol ettir";
    case "magnitude":
      return "sonucun büyüklük mertebesini önce tahmin ettir, sıfırları saydır";
    case "unit_factor":
      return "birimleri her adımda yazdır ve dönüşüm çarpanını açıkça göster";
    case "reciprocal":
      return "oranın hangi yönde kurulduğunu sor, payı ve paydayı adlandırt";
    case "rounding":
      return "ara sonuçları yuvarlamadan taşıt, yalnız son adımda yuvarlat";
    case "arithmetic":
      return "işlem adımlarını tek tek yazdır ve her adımı doğrulat";
    case "polarity":
      return "soru kökündeki olumsuz ifadeyi önce işaretlet, sonra şıklara geçir";
    case "premise_subset":
      return "her öncülü ayrı ayrı doğru/yanlış diye değerlendirt, sonra birleştir";
    case "partial_select":
      return "çok cevaplı soruda bütün şıkları tek tek yoklat, 'başka var mı' diye sordur";
    case "over_select":
      return "seçtiği her şık için gerekçe iste; gerekçesiz şıkkı bıraktır";
    case "hurried":
      return "cevaplamadan önce soruyu yeniden okut; hızdan çok doğruluğu öv";
    case "other":
      return "yanlış seçtiği şıkkın neden çekici göründüğünü konuştur";
  }
}

export function isErrorKind(value: unknown): value is ErrorKind {
  return typeof value === "string" && (ERROR_KINDS as readonly string[]).includes(value);
}
