/**
 * Ünitenin alt konu listesi ve dersin derinliği (20 Kasım 2026, ürün sahibinin kararı) — biçim, ders bağımsız.
 *
 * Yeni hazırlık birkaç tam ana üniteden kurulur; her ünite konu haritasının bulduğu ince konuları alt konu olarak taşır
 * (`exam_prep_topics.subtopics`) ve tek derin dersle öğretilir. Büyük ünite birkaç derse bölünürse düğüm yalnız kendi
 * kısmını taşır (`session_meta.lessonSubtopics`). İkisi de bu okuyucudan geçer.
 *
 * Bağımlılıksız (içe aktarma yok): oturum meta ayrıştırıcısı (`teaching-standards.ts`) ve ekran tavanı
 * (`lesson-key-facts.ts`) da okur; içe aktarma döngüsü kurulmasın.
 */

/** Bir listede en çok bu kadar alt konu okunur (istem ve denetim şişmesin). */
export const SUBTOPIC_LIST_MAX = 24;
const SUBTOPIC_MAX_CHARS = 160;

/** Karşılaştırma anahtarı: büyük/küçük harf, boşluk ve noktalama farkı yok sayılır. */
export function subtopicKey(title: string): string {
  return title
    .normalize("NFC")
    .toLocaleLowerCase("tr")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

/** Ham değer (jsonb dizi) → temiz alt konu adları, sırası korunur; tekrar edenler ve boşlar bir kez / hiç. */
export function parseSubtopicList(raw: unknown, options: { max?: number } = {}): string[] {
  if (!Array.isArray(raw)) return [];
  const max = options.max ?? SUBTOPIC_LIST_MAX;
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const title = item.replace(/\s+/g, " ").trim().slice(0, SUBTOPIC_MAX_CHARS);
    const key = subtopicKey(title);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(title);
    if (out.length >= max) break;
  }
  return out;
}

/**
 * Listenin kısa parmak izi (önceden yazılan dersin seçim anahtarı): aynı liste aynı izi verir, sıra ya da bir alt
 * konu değişirse iz değişir. FNV-1a; kriptografik değil, yalnız eşleme için.
 */
export function subtopicListFingerprint(subtopics: readonly string[]): string {
  let hash = 0x811c9dc5;
  for (const char of subtopics.map(subtopicKey).join("|")) {
    hash ^= char.codePointAt(0)!;
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(36);
}

/** Alt konulu dersin derinliği: ekran aralığı ve kavram sınırı tek yerden (istem ve yapı denetimi aynı sayıyı okur). */
export type LessonDepth = { subtopics: number; minScreens: number; maxScreens: number; maxConcepts: number };

/**
 * Alt konu sayısından ders derinliği: 1-2 alt konu 4-5 ekran, 3-4 alt konu 6-8 ekran, 5 ve üstü 8-11 ekran. Bir alt
 * konu 1-2 ekrana yayılabilir; kavram sınırı en az eski 6, alt konu çoksa her alt konuya bir kavram (ekran sınırına
 * kadar). Alt konu yoksa null: ders bugünkü sayılarla yazılır.
 */
export function lessonDepthForSubtopics(count: number): LessonDepth | null {
  const n = Number.isFinite(count) ? Math.max(0, Math.floor(count)) : 0;
  if (!n) return null;
  const [minScreens, maxScreens] = n <= 2 ? [4, 5] : n <= 4 ? [6, 8] : [8, 11];
  return { subtopics: n, minScreens, maxScreens, maxConcepts: Math.max(6, Math.min(n, maxScreens)) };
}

/**
 * Alt konulu derste kapanıştaki ek ekran payı: yazarın "kapsanmayan kilit bilgi için en çok 4 ekran daha" payıyla aynı.
 * Ekran tavanı (`lessonScreenCap`) derinliğin üst ucuna bunu ekler; sert tavanı (16) yine geçmez.
 */
export const SUBTOPIC_EXTRA_SCREENS = 4;
