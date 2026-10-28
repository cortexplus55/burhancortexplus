/**
 * Doğru/yanlış seti kalitesi (28 Ekim 2026) — ders bağımsız, yalnız ölçü.
 *
 * Canlı setlerde aynı bilgi iki kez soruluyordu: "X, Y'dir" (doğru) ile hemen ardından "X, Y değildir"
 * (yanlış), ya da yanlış önermenin doğru hâli setteki başka bir doğru önermenin kendisiydi. Öğrenci
 * ikinci önermeyi düşünmeden cevaplıyor, set 8 yerine 6 bilgi yokluyordu. Kod önermeyi yeniden yazmaz;
 * yalnız aynı alt bilgiyi ya da aynı yanılgıyı yoklayan ikinci önermeyi kabul etmez, motor eksik kadar
 * yenisini ister.
 */

export type TrueFalseLike = {
  text: string;
  correct: boolean;
  explanation: string;
  correctedStatement?: string;
  misconceptionTag?: string;
};

/** İki önerme bu kadar ortak içerik sözcüğü taşıyorsa aynı alt bilgiyi yokluyordur. */
export const TF_SAME_FACT_OVERLAP = 0.75;

/** Olumsuzluk ve bağlaç sözcükleri: "Y'dir" ile "Y değildir" aynı bilgidir. */
const NEUTRAL = new Set([
  "degil", "degildir", "yok", "yoktur", "var", "vardir", "ve", "ile", "veya", "ya", "da", "de", "ki", "bir",
  "bu", "su", "o", "her", "icin", "gibi", "en", "daha", "cok", "az", "olarak", "olan", "olur", "olmaz",
  "eder", "etmez", "ise", "dir", "dir.", "tir", "dur", "tur", "mi", "mu",
]);

function fold(text: string): string {
  return text
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/[*_`=]/g, "")
    .replace(/[^a-z0-9%.,]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Önermenin içerik anahtarları. Türkçe ekler kök karşılaştırmasını bozmasın diye sözcüğün ilk
 * altı harfi alınır ("bağlanır" / "bağlanmaz" → "baglan"); sayılar olduğu gibi kalır.
 */
export function factKeys(text: string): Set<string> {
  const keys = new Set<string>();
  for (const raw of fold(text).split(" ")) {
    const word = raw.replace(/[.,]+$/g, "");
    if (!word || NEUTRAL.has(word)) continue;
    if (/^\d/.test(word)) {
      keys.add(word);
      continue;
    }
    if (word.length < 3) continue;
    keys.add(word.slice(0, 6));
  }
  return keys;
}

function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const key of a) if (b.has(key)) shared += 1;
  return shared / Math.min(a.size, b.size);
}

function sameNumbers(a: string, b: string): boolean {
  const nums = (text: string) => (fold(text).match(/\d+(?:[.,]\d+)?/g) ?? []).sort().join("|");
  return nums(a) === nums(b);
}

function sameTag(a?: string, b?: string): boolean {
  const left = fold(a ?? "");
  const right = fold(b ?? "");
  // Kısa, genel etiket ("kavram karisikligi") ayırt etmez; yalnız en az üç sözcüklü etiket sayılır.
  return Boolean(left) && left === right && left.split(" ").length >= 3;
}

/**
 * İki önerme aynı alt bilgiyi ya da aynı yanılgıyı mı yokluyor: birebir ya da olumsuzlukla ters
 * çevrilmiş aynı cümle, biri ötekinin doğru hâli, ya da aynı (ayırt edici) yanılgı etiketi.
 */
export function sameTrueFalseFact(a: TrueFalseLike, b: TrueFalseLike): boolean {
  const texts = [a.text, ...(a.correct ? [] : [a.correctedStatement ?? ""])].filter(Boolean);
  const others = [b.text, ...(b.correct ? [] : [b.correctedStatement ?? ""])].filter(Boolean);
  for (const left of texts) {
    for (const right of others) {
      if (!sameNumbers(left, right)) continue;
      if (overlap(factKeys(left), factKeys(right)) >= TF_SAME_FACT_OVERLAP) return true;
    }
  }
  return sameTag(a.misconceptionTag, b.misconceptionTag);
}

/** Setten çift/ters önermeleri atar; ilk geleni tutar. */
export function dedupeTrueFalse<T extends TrueFalseLike>(items: readonly T[]): T[] {
  const kept: T[] = [];
  for (const item of items) {
    if (kept.some((other) => sameTrueFalseFact(item, other))) continue;
    kept.push(item);
  }
  return kept;
}

export const TF_CORRECTION_PREFIX = "✏️ Doğrusu:";

/**
 * Yanlış önermenin açıklaması "✏️ Doğrusu: …" ile başlar (biçim, yeni bilgi değil): doğru hâl yazarın
 * kendi `correctedStatement`'ıdır. Açıklama zaten öyle başlıyorsa dokunulmaz; doğru önermeye dokunulmaz.
 */
export function trueFalseExplanation(item: TrueFalseLike): string {
  const explanation = (item.explanation ?? "").trim();
  if (item.correct) return explanation;
  const bare = explanation.replace(/^✏️\s*/u, "");
  if (/^doğrusu\s*:/iu.test(bare)) return `${TF_CORRECTION_PREFIX}${bare.replace(/^doğrusu\s*:/iu, "")}`;
  const corrected = (item.correctedStatement ?? "").trim();
  if (!corrected) return explanation;
  const sentence = /[.!…]$/u.test(corrected) ? corrected : `${corrected}.`;
  if (fold(explanation).startsWith(fold(corrected))) {
    return `${TF_CORRECTION_PREFIX} ${explanation}`;
  }
  return explanation ? `${TF_CORRECTION_PREFIX} ${sentence} ${explanation}` : `${TF_CORRECTION_PREFIX} ${sentence}`;
}
