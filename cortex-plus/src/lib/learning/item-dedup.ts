/**
 * Soru ve kart tekrarı süzgeci (25 Ekim 2026, canlı test P1-2).
 *
 * Canlıda aynı konunun üç testi neredeyse aynı on beş terim sorusundan oluştu, ileri konuların
 * kartları önceki konunun kartlarını kelimesi kelimesine kopyaladı. Yazar önceki öğeleri görür
 * ("tekrarlama" listesi), ama model listeyi her zaman tutmuyor; bu süzgeç üretimden sonra aynı
 * bilgiyi soran öğeyi deterministik olarak eler. Ders, konu ya da terim adı taşımaz: yalnız metin.
 */

const STOPWORDS = new Set([
  "aşağıdakilerden",
  "aşağıdaki",
  "hangisi",
  "hangisidir",
  "hangileri",
  "hangisinde",
  "nedir",
  "nelerdir",
  "olarak",
  "olan",
  "olur",
  "için",
  "ile",
  "veya",
  "ancak",
  "gibi",
  "daha",
  "değildir",
  "doğru",
  "yanlış",
  "ifade",
  "ifadelerden",
  "bilgi",
  "bilgilerden",
  "verilen",
  "verilenlerden",
  "durum",
  "durumda",
  "şekilde",
  "kadar",
  "bunun",
  "şunun",
  "hangi",
  "neden",
  "nasıl",
  "kimdir",
  "kavram",
  "kavramı",
]);

export function normalizeItemText(text: string): string {
  return text
    .toLocaleLowerCase("tr-TR")
    .replace(/[*_=`~>#[\]()"“”'’.,;:!?¿¡…\-–—/\\|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * İçerik kelimelerinin ilk beş harfi (Türkçe ekler kıyası bozmasın). Sayılar ve kısa büyük harfli
 * ayırıcılar ("A", "B", "DNA", "pH" değil) da kök sayılır: "Hepatit A" ile "Hepatit B" ya da "2. ay"
 * ile "6. ay" aynı soru değildir.
 */
export function itemStems(text: string): Set<string> {
  const out = new Set<string>();
  for (const token of text.split(/[^\p{L}\p{N}]+/u)) {
    if (!token) continue;
    if (/^\p{N}+$/u.test(token)) {
      out.add(`#${token}`);
      continue;
    }
    if (token.length < 4) {
      if (/^[\p{Lu}\p{N}]{1,3}$/u.test(token)) out.add(`^${token.toLocaleLowerCase("tr-TR")}`);
      continue;
    }
    const word = token.toLocaleLowerCase("tr-TR");
    if (STOPWORDS.has(word)) continue;
    out.add(word.slice(0, 5));
  }
  return out;
}

/**
 * Sınav kâğıdında aynı olgu. Sayılar ayırıcı sayılmaz: kökün içerik kelimeleri
 * örtüşüyorsa soru kopyadır. Şablonun ortak kelimeleri (konu adı dahil) tek başına yetmez.
 */
export function examFactOverlap(left: string, right: string, leftTopic = "", rightTopic = ""): boolean {
  const dropTopic = (text: string, topic: string) => {
    const stems = itemStems(text);
    for (const stem of itemStems(topic)) stems.delete(stem);
    const out = new Set<string>();
    for (const stem of stems) {
      if (stem.startsWith("#") || stem.startsWith("^")) continue;
      out.add(stem);
    }
    return out;
  };
  const a = dropTopic(left, leftTopic);
  const b = dropTopic(right, rightTopic);
  if (a.size < 3 || b.size < 3) return false;
  let shared = 0;
  for (const stem of a) if (b.has(stem)) shared += 1;
  const union = a.size + b.size - shared;
  // Dört ortak kök, yalnız sayı değişen kalıp soruyu (seçenek 3 / seçenek 4) kopya saymasın.
  if (shared >= 5 && shared / union >= 0.72) return true;
  const smaller = Math.min(a.size, b.size);
  return shared >= 5 && shared / smaller >= 0.85;
}

/** Aynı metin ya da içerik kelimelerinin büyük kısmı ortak (Jaccard ≥ eşik, en az üç kelime). */
export function nearDuplicate(left: string, right: string, threshold = 0.7): boolean {
  const a = normalizeItemText(left);
  const b = normalizeItemText(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const x = itemStems(left);
  const y = itemStems(right);
  // Sayı ya da kısa ayırıcı farklıysa başka soru (uzun ortak gövde oranı şişirmesin).
  const markers = (set: Set<string>) => [...set].filter((stem) => stem.startsWith("#") || stem.startsWith("^")).sort().join("|");
  if (markers(x) !== markers(y)) return false;
  if (x.size < 3 || y.size < 3) return false;
  let shared = 0;
  for (const stem of x) if (y.has(stem)) shared += 1;
  return shared / (x.size + y.size - shared) >= threshold;
}

/**
 * Kopyayı yalnız yerine başka sağlam öğe varken çıkarır. Eleme vaat edilen sayının altına
 * düşürecekse kopya da kalır (26 Ekim 2026, tek geçiş: soru sayısı eksilmez).
 */
export function dropNearDuplicatesKeepingCount<T>(
  items: readonly T[],
  key: (item: T) => string,
  count: number,
  previous: readonly string[] = [],
  threshold = 0.7,
): T[] {
  const unique = dropNearDuplicates(items, key, previous, threshold);
  if (unique.length >= Math.min(count, items.length)) return unique;
  const skipped = items.filter((item) => !unique.includes(item));
  return [...unique, ...skipped].slice(0, Math.max(unique.length, Math.min(count, items.length)));
}

/** Önceki öğelerle ya da listede kendinden öncekiyle aynı bilgiyi soran öğe düşer; sıra korunur. */
export function dropNearDuplicates<T>(
  items: readonly T[],
  key: (item: T) => string,
  previous: readonly string[] = [],
  threshold = 0.7,
): T[] {
  const seen = previous.map((text) => text).filter((text) => text.trim());
  const kept: T[] = [];
  for (const item of items) {
    const text = key(item);
    if (seen.some((other) => nearDuplicate(text, other, threshold))) continue;
    seen.push(text);
    kept.push(item);
  }
  return kept;
}

/** Yazara giden "tekrarlama" listesi; en çok `limit` satır, kısaltılmış. */
export function avoidListBlock(title: string, items: readonly string[], limit = 30): string {
  const lines = items
    .map((text) => text.replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, limit)
    .map((text) => `- ${text.slice(0, 160)}`);
  return lines.length ? `${title}\n${lines.join("\n")}` : "";
}
