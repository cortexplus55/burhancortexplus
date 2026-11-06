import { finalResults, numbersIn, optionValues, sameNumber } from "@/lib/learning/result-values";

/**
 * Aynı durumda aynı büyüklüğü soran iki soru (6 Kasım 2026, Paket 2) — ders bağımsız, modelsiz.
 *
 * Canlıda belgeli bir yazılı denemede aynı verilerle (aynı üç sayı) kurulmuş dört sorudan üçü aynı ara
 * büyüklüğü soruyordu: biri çok cevaplı soruda şık, biri açık uçlu, biri çoktan seçmeli. Kâğıdın kopya denetimi
 * (`semanticDuplicate`) kök sözcükleri farklı olduğu için hiçbirini yakalamadı. Burada iki soru "aynı soru" sayılır:
 *
 * - aynı durum: köklerdeki verilen sayıların en az ikisi ortak ve küçük kümenin en az %60'ı öbüründe;
 * - ve aynı istenen büyüklük: ya sorulan büyüklüğün adı aynı (soru sözcüğünden — kaç, nedir, hesapla, bul — önceki
 *   iki içerik sözcüğünün kökü), ya da hesaplanan sonuç aynı (doğru şıkların / örnek cevabın sonucu, kökte verilmiş
 *   sayılar hariç).
 */

const ASK_WORD =
  /(?<![\p{L}])(kaçtır|kaç|nedir|ne kadardır|ne kadar|hesaplay\p{L}*|hesapla\p{L}*|bulunuz|bulun|bulur\p{L}*|belirleyiniz|belirle\p{L}*)(?![\p{L}])/iu;

/** Büyüklüğün adı olamayan genel sözcükler (soru kalıbı, bağlaç, birim sözü). */
const FRAME = new Set([
  "ise",
  "için",
  "olarak",
  "olan",
  "cinsinden",
  "değeri",
  "değerini",
  "değer",
  "sembolüyle",
  "yaklaşık",
  "kaç",
  "biriminde",
  "birimi",
  "göre",
  "bu",
  "bir",
  "şu",
  "ve",
  "ile",
  "durumda",
  "alınırsa",
  "alınız",
  "alınıyor",
  "verildiğine",
]);

/** Sorulan büyüklüğün anahtarı ("… paralel bileşeni kaçtır?" → "para bile"); soru sözcüğü yoksa null. */
export function askedQuantityKey(text: string): string | null {
  const sentences = text.split(/(?<=[.?!])\s+/u);
  const asked = sentences.find((sentence) => ASK_WORD.test(sentence));
  if (!asked) return null;
  const before = asked.slice(0, asked.search(ASK_WORD));
  const words = before
    .toLocaleLowerCase("tr")
    .replace(/\d+(?:[.,]\d+)?/g, " ")
    .split(/[^\p{L}]+/u)
    .filter((word) => word.length >= 3 && !FRAME.has(word));
  const tail = words.slice(-2);
  if (!tail.length) return null;
  return tail.map((word) => word.slice(0, 4)).join(" ");
}

function distinctValues(values: readonly number[]): number[] {
  const out: number[] = [];
  for (const value of values) if (Number.isFinite(value) && !out.some((other) => sameNumber(other, value))) out.push(value);
  return out;
}

/** Kökte verilen sayılar (tekrarsız). */
export function givenNumbers(text: string): number[] {
  return distinctValues(numbersIn(text));
}

type Quantified = { text: string; correctAnswers?: readonly string[]; modelAnswer?: string | null };

/** Hesaplanan sonuç(lar): doğru şıkların değerleri, açık uçluda örnek cevabın sonucu. */
export function resultNumbers(item: Quantified): number[] {
  const fromOptions = (item.correctAnswers ?? []).flatMap((answer) => optionValues(answer));
  const fromModel = item.modelAnswer?.trim() ? finalResults(item.modelAnswer, item.modelAnswer) : [];
  return distinctValues([...fromOptions, ...fromModel]);
}

function sameScenario(left: readonly number[], right: readonly number[]): boolean {
  if (left.length < 2 || right.length < 2) return false;
  const shared = left.filter((value) => right.some((other) => sameNumber(other, value))).length;
  return shared >= 2 && shared >= 0.6 * Math.min(left.length, right.length);
}

export function sameAskedQuantity(left: Quantified, right: Quantified): boolean {
  const leftGiven = givenNumbers(left.text);
  const rightGiven = givenNumbers(right.text);
  if (!sameScenario(leftGiven, rightGiven)) return false;
  const leftKey = askedQuantityKey(left.text);
  if (leftKey && leftKey === askedQuantityKey(right.text)) return true;
  const given = [...leftGiven, ...rightGiven];
  const computed = (item: Quantified) => resultNumbers(item).filter((value) => !given.some((other) => sameNumber(other, value)));
  const leftResult = computed(left);
  const rightResult = computed(right);
  return leftResult.some((value) => rightResult.some((other) => sameNumber(other, value)));
}
