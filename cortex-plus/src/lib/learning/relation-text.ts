/**
 * Sözel ilişki okuma (19 Kasım 2026, Faz 1-A §2.1 ek düzeltmesi ve Faz 1-B sahne denetimi): "X artarsa Y azalır",
 * "X iki katına çıkarsa Y yarıya iner", "X ile Y ters orantılıdır" gibi cümlelerden iki büyüklüğün doğru/ters
 * ilişkisi. Saf modül, model çağrısı yok; kaynak düzeltmesi ve görsel sahne denetimi aynı kuralı kullanır.
 */

export type Relation = "direct" | "inverse";
type Change = "increase" | "decrease";


const INCREASE_STEM = /(?<![\p{L}])(?:art(?:ar|arsa|ınca|tıkça|tığında|ış|an|ıyor|ırılırsa|ırılınca)|(?:iki|üç|dört|\p{N}+) katına çık|katına çık|büyü|yüksel|çoğal)/giu;
const DECREASE_STEM = /(?<![\p{L}])(?:azal|yarıya|küçül|düş(?:er|erse|ünce|tükçe|tüğünde)|üçte bir|dörtte bir)/giu;
const DIRECT_PHRASE = /doğru orantı/iu;
const INVERSE_PHRASE = /ters orantı/iu;

export type Quantity = { key: string; names: string[] };

function fold(text: string): string {
  return text.normalize("NFKC").toLocaleLowerCase("tr-TR");
}

/** Adın Türkçe çekimleri de eşleşsin diye kökü ("hacim" → "hac", "basınç" → "bası"). */
function nameStem(name: string): string {
  const word = fold(name).trim().split(/\s+/)[0] ?? "";
  return word.length <= 4 ? word : word.slice(0, Math.max(3, word.length - 2));
}

function firstMention(text: string, quantity: Quantity): number {
  let best = -1;
  for (const name of quantity.names) {
    if (!name.trim()) continue;
    // Simge (ör. "X") büyük/küçük harf duyarlı, tek başına; ad ise kökten, çekimli halleriyle.
    const symbolLike = name.length <= 3 && !/\s/.test(name);
    const pattern = symbolLike
      ? new RegExp(`(?<![\\p{L}\\p{N}_])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![\\p{L}\\p{N}_])`, "u")
      : new RegExp(`(?<![\\p{L}])${nameStem(name).replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "iu");
    const source = symbolLike ? text : fold(text);
    const index = source.search(pattern);
    if (index >= 0 && (best < 0 || index < best)) best = index;
  }
  return best;
}

function changeIn(segment: string): Change | null {
  const inc = [...segment.matchAll(INCREASE_STEM)].map((m) => m.index ?? 0);
  const dec = [...segment.matchAll(DECREASE_STEM)].map((m) => m.index ?? 0);
  if (!inc.length && !dec.length) return null;
  if (!dec.length) return "increase";
  if (!inc.length) return "decrease";
  return Math.min(...inc) < Math.min(...dec) ? "increase" : "decrease";
}

/** Cümle iki büyüklük arasında hangi ilişkiyi söylüyor ("X artarsa Y azalır", "X ile Y ters orantılı"). */
export function sentenceRelation(sentence: string, a: Quantity, b: Quantity): Relation | null {
  const pa = firstMention(sentence, a);
  const pb = firstMention(sentence, b);
  if (pa < 0 || pb < 0 || pa === pb) return null;
  if (INVERSE_PHRASE.test(sentence) && !DIRECT_PHRASE.test(sentence)) return "inverse";
  if (DIRECT_PHRASE.test(sentence) && !INVERSE_PHRASE.test(sentence)) return "direct";
  const [first, second] = pa < pb ? [pa, pb] : [pb, pa];
  const c1 = changeIn(sentence.slice(first, second));
  const c2 = changeIn(sentence.slice(second));
  if (!c1 || !c2) return null;
  return c1 === c2 ? "direct" : "inverse";
}

export function sentences(text: string): string[] {
  return text
    .split(/(?<=[.!?;])\s+|\n+/u)
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}


/* ───────────── Cümlenin öne sürdüğü ilişki (konu bağımsız) ───────────── */

/** Değişim fiilinin öznesi sayılmayan bağlaçlar, sayılar ve dolgu sözcükleri. */
const PARTICLES = new Set(["de", "da", "ise", "ile", "ve", "ya", "veya", "bir", "iki", "üç", "dört", "kat", "katına", "çok", "daha", "en", "olarak", "biçimde", "şekilde", "zaman", "durumda"]);

/** Tek başına büyüklük adı olmayan baş adlar ("mol sayısı", "tepkime hızı"): önündeki sözcükle birlikte ad olur. */
const HEAD_NOUN = /^(?:nicel|değer|miktar|sayı|oran|düzey|seviye|şiddet)/u;

function subjectBefore(text: string, index: number): string | null {
  const words = text.slice(0, index).split(/[^\p{L}\p{N}]+/u).filter(Boolean);
  for (let i = words.length - 1; i >= 0 && i >= words.length - 4; i -= 1) {
    const word = words[i]!;
    if (PARTICLES.has(fold(word)) || /^\p{N}+$/u.test(word)) continue;
    const before = words[i - 1];
    if (HEAD_NOUN.test(fold(word)) && before && !PARTICLES.has(fold(before))) return `${before} ${word}`;
    return word;
  }
  return null;
}

export type RelationClaim = { a: Quantity; b: Quantity; relation: Relation };

/**
 * Cümlenin iki büyüklük arasında öne sürdüğü ilişki: değişim fiillerinin özneleri büyüklük sayılır ("X artarsa Y de
 * artar" → X, Y doğru). Tam iki farklı özne ve okunur bir ilişki yoksa null.
 */
export function relationClaimOf(sentence: string): RelationClaim | null {
  const marks = [...sentence.matchAll(INCREASE_STEM), ...sentence.matchAll(DECREASE_STEM)].map((m) => m.index ?? 0).sort((x, y) => x - y);
  const subjects: string[] = [];
  for (const mark of marks) {
    const subject = subjectBefore(sentence, mark);
    if (subject && !subjects.some((item) => nameStem(item) === nameStem(subject))) subjects.push(subject);
  }
  if (subjects.length !== 2) return null;
  const a = { key: fold(subjects[0]!), names: [subjects[0]!] };
  const b = { key: fold(subjects[1]!), names: [subjects[1]!] };
  if (nameStem(a.key).length < 3 || nameStem(b.key).length < 3) return null;
  const relation = sentenceRelation(sentence, a, b);
  return relation ? { a, b, relation } : null;
}

/** Cümle bir yanlışı alıntılıyor ya da reddediyor mu ("…değildir", "…sanılır", "kaynakta … yazıyor"). */
export function quotesOrDenies(sentence: string): boolean {
  return /(?<![\p{L}])(?:değil|yanlış|sanıl|sanma|zannedil|düşünebilir|düşünülür|kaynakta|notta|hatalı|yanılgı)/iu.test(sentence);
}
