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

/*
  Aynı terimin iki tanımı (30 Ekim 2026, canlı tur, Makroekonomi D/Y): önerme 5 "Deflasyon genel fiyat düzeyinin sürekli
  düşmesidir" (D), önerme 6 "Deflasyon, enflasyon oranının düşmesidir" (Y). İkisi de "deflasyon nedir?" sorusunu
  yokluyor: 5'i doğru bilen 6'yı düşünmeden yanlış der. Eski ölçü bütün cümlenin anahtarlarına bakıyordu: ortak
  anahtar 2/4 (deflasyon, düşmesi), 6'nın doğru hâli ("Enflasyon oranının düşmesi dezenflasyondur") 5'le 1/4 —
  üç yol da tutmadı. Bir önermenin yanlış hâlinin doğrusu öbürüyse çift: aynı öznenin tanımı. Ders bağımsız ölçü:
  iki önerme aynı özneyle açılıyor (virgülden önceki sözcükler, virgül yoksa ilk sözcük) ve ikisinin de yüklemi bir
  tanım (eylem adı + ek-fiil: "-mesidir", "-masıdır", "-medir", "-ışıdır"; ya da "bir … -dir": "bir endekstir").
*/

/** Önermenin başında özne olamayan genel niteleyiciler ("Normal nabız …", "İlk belge …"). */
const NOT_SUBJECT = new Set([
  "normal", "genel", "temel", "ilk", "son", "yeni", "eski", "yuksek", "dusuk", "buyuk", "kucuk", "ana", "toplam",
  "ortalama", "butun", "her", "tum", "bazi", "cok", "bu", "su", "o", "bir", "iki", "uc",
]);

/** Tanım yüklemi: eylem adı + ek-fiil ("düşmesidir", "bölünmedir", "artışıdır") ya da "bir <ad>dır" kalıbı. */
function definitionalPredicate(text: string): boolean {
  const words = fold(text).replace(/[.!]+$/u, "").split(" ").filter(Boolean);
  const last = words[words.length - 1] ?? "";
  if (/(?:mesi|masi|me|ma|isi|usu|is|us)(?:d|t)(?:i|u)r$/u.test(last)) return true;
  return words.length >= 3 && words[words.length - 2] === "bir" && /(?:d|t)(?:i|u)r$/u.test(last);
}

/** Tanımın öznesi: virgülden önceki sözcükler (en çok dört), virgül yoksa ilk sözcük; genel niteleyici özne değildir. */
function definedSubject(text: string): string | null {
  const raw = text.trim();
  const comma = raw.indexOf(",");
  const head = comma > 0 ? raw.slice(0, comma) : raw.split(/\s+/u)[0] ?? "";
  const words = fold(head).split(" ").filter(Boolean);
  if (!words.length || words.length > 4) return null;
  if (comma < 0 && NOT_SUBJECT.has(words[0]!)) return null;
  return words.join(" ");
}

/** İki önerme aynı öznenin tanımı mı ("X, …-mesidir" / "X …-mesidir"). */
export function sameDefinedSubject(a: string, b: string): boolean {
  if (!definitionalPredicate(a) || !definitionalPredicate(b)) return false;
  const left = definedSubject(a);
  const right = definedSubject(b);
  if (!left || !right) return false;
  if (left === right) return true;
  // Biri virgüllü çok sözcüklü özne, öbürü virgülsüz: öbürü aynı sözcüklerle başlamalı.
  const [longer, shorter] = left.length >= right.length ? [left, a] : [right, b];
  return fold(shorter).startsWith(`${longer} `) || fold(shorter).startsWith(`${longer},`);
}

/**
 * İki önerme aynı alt bilgiyi ya da aynı yanılgıyı mı yokluyor: birebir ya da olumsuzlukla ters
 * çevrilmiş aynı cümle, biri ötekinin doğru hâli, aynı öznenin iki tanımı, ya da aynı (ayırt edici) yanılgı etiketi.
 */
export function sameTrueFalseFact(a: TrueFalseLike, b: TrueFalseLike): boolean {
  const texts = [a.text, ...(a.correct ? [] : [a.correctedStatement ?? ""])].filter(Boolean);
  const others = [b.text, ...(b.correct ? [] : [b.correctedStatement ?? ""])].filter(Boolean);
  for (const left of texts) {
    for (const right of others) {
      if (sameDefinedSubject(left, right)) return true;
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
