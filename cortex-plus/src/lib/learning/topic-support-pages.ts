import { foldTr } from "@/lib/documents/page-analysis";

/**
 * Konunun yardımcı kaynakları: kendi sayfası olmayan küçük dosyaların sayfaları ve ince kaynaklı
 * konuya en yakın sayfalar.
 *
 * 19 Ekim 2026, 7 dosyalık AYT Biyoloji seti: kurs haritası her konuyu tek bir dosyaya bağlıyor.
 * Nefron defter fotoğrafı, işaretli test fotoğrafı ve hipofiz hormon kartı hiçbir konuya
 * bağlanmadı; içlerindeki bilgi (öğrencinin yanlış yaptığı ADH ve CO₂ soruları, "FLAT PiG" kodu)
 * hiçbir derse girmedi. "Refrakter Dönem" konusu ise yalnız 408 karakterlik tahta fotoğrafından
 * yazılacaktı; aynı bilgi PDF'in 5–6. sayfasında ayrıntılıydı.
 *
 * Model çağrılmaz. Benzerlik, konunun başlığı ve kendi sayfalarının kelimeleriyle (Türkçe kök,
 * konular arası yaygınlığa göre ağırlık) ölçülür:
 *   - Küçük dosyanın (en çok 8 sayfa) hiçbir konunun kaynağı olmayan sayfası, bir konuya açık ara
 *     daha yakınsa o konuya bütün olarak bağlanır.
 *   - Açık ara yakın değilse (bir test sayfası altı konudan soru sorar) numaralı ya da maddeli
 *     parçalarına bölünür ve her parça kendi konusuna bağlanır.
 *   - Kendi kaynağı 900 karakterden kısa konuya, başka dosyalardan en yakın iki sayfa eklenir.
 * Hiçbir konuya yeterince yakın olmayan sayfa ya da parça kimseye verilmez.
 */

export type SupportSourcePage = {
  documentId: string;
  fileName: string;
  page: number;
  text: string;
  /** Dosyanın sayfa sayısı: yalnız küçük dosyaların yetim sayfaları dağıtılır. */
  pageCount: number;
};

export type SupportTopic = {
  id: string;
  title: string;
  refs: { documentId: string; pages: number[] }[];
};

export type SupportExcerpt = {
  documentId: string;
  fileName: string;
  page: number;
  /** Parça numarası (1'den); sayfanın tamamıysa null. */
  part: number | null;
  text: string;
  similarity: number;
  pageCount: number;
};

const SMALL_FILE_PAGES = 8;
const THIN_SOURCE_CHARS = 900;
const MIN_PAGE_CHARS = 80;
const MIN_SEGMENT_CHARS = 40;
/** Bir sayfa ya da parça ancak bu kadar benzerse bir konuya verilir. */
const MIN_SIMILARITY = 0.12;
/** İnce konuya başka dosyadan sayfa: daha sıkı. */
const MIN_THIN_SIMILARITY = 0.2;
/** En yakın konu, ikinciden en az bu kat yakın olmalı. */
const DOMINANCE = 1.25;
/** Bir konuya eklenen yardımcı metnin üst sınırı (karakter). */
const MAX_SUPPORT_CHARS = 6000;
const TITLE_WEIGHT = 3;

const STOPWORDS = new Set([
  "ve", "ile", "veya", "ya", "da", "de", "ki", "bir", "bu", "su", "o", "icin", "gibi", "daha", "cok",
  "en", "her", "olan", "olarak", "ise", "ama", "hem", "ne", "mi", "mu", "kadar", "sonra", "once",
  "hangi", "hangisi", "hangisidir", "asagidaki", "asagidakilerden", "ifadelerden", "dogrudur",
  "the", "and", "of", "to", "in", "for",
]);

function stems(text: string): string[] {
  return foldTr(text)
    .split(/[^a-z0-9]+/)
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word) && !/^\d+$/.test(word))
    .map((word) => (word.length > 6 ? word.slice(0, 6) : word));
}

type Vector = Map<string, number>;

function counts(words: string[], weight = 1, into: Map<string, number> = new Map()): Map<string, number> {
  for (const word of words) into.set(word, (into.get(word) ?? 0) + weight);
  return into;
}

function weigh(tf: Map<string, number>, idf: Map<string, number>): Vector {
  const out: Vector = new Map();
  for (const [stem, n] of tf) {
    const w = idf.get(stem);
    if (w == null) continue;
    out.set(stem, (1 + Math.log(n)) * w);
  }
  return out;
}

function cosine(a: Vector, b: Vector): number {
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [stem, value] of a) {
    na += value * value;
    const other = b.get(stem);
    if (other != null) dot += value * other;
  }
  for (const value of b.values()) nb += value * value;
  return na && nb ? dot / Math.sqrt(na * nb) : 0;
}

/** Numaralı ("1.", "2)") ya da maddeli ("•") parçalar; tek parça çıkarsa boş. */
export function splitSegments(text: string): string[] {
  const numbered = text.split(/(?:^|\s)(?=\d{1,2}[.)]\s+\S)/).map((part) => part.trim()).filter(Boolean);
  const bulleted = text.split(/\s*[•▪●]\s+/).map((part) => part.trim()).filter(Boolean);
  const best = numbered.length >= bulleted.length ? numbered : bulleted;
  return best.length >= 2 ? best : [];
}

const key = (documentId: string, page: number) => `${documentId}:${page}`;

export function assignSupportExcerpts(
  topics: SupportTopic[],
  pages: SupportSourcePage[],
): Map<string, SupportExcerpt[]> {
  const out = new Map<string, SupportExcerpt[]>();
  if (topics.length < 2 || !pages.length) return out;
  const pageByKey = new Map(pages.map((page) => [key(page.documentId, page.page), page]));
  const cited = new Set<string>();
  const ownText = new Map<string, string>();
  for (const topic of topics) {
    const texts: string[] = [];
    for (const ref of topic.refs) {
      for (const number of ref.pages) {
        const k = key(ref.documentId, number);
        cited.add(k);
        const page = pageByKey.get(k);
        if (page) texts.push(page.text);
      }
    }
    ownText.set(topic.id, texts.join("\n"));
  }

  // Konu profili: başlık (ağırlıklı) + kendi sayfaları. Ağırlık konular arası yaygınlıktan.
  const profiles = topics.map((topic) =>
    counts(stems(ownText.get(topic.id) ?? ""), 1, counts(stems(topic.title), TITLE_WEIGHT)),
  );
  const df = new Map<string, number>();
  for (const profile of profiles) for (const stem of profile.keys()) df.set(stem, (df.get(stem) ?? 0) + 1);
  const idf = new Map<string, number>();
  for (const [stem, n] of df) idf.set(stem, Math.log((topics.length + 1) / (n + 0.5)));
  const vectors = profiles.map((profile) => weigh(profile, idf));

  const ranked = (text: string) =>
    topics
      .map((topic, index) => ({ topic, similarity: cosine(weigh(counts(stems(text)), idf), vectors[index]!) }))
      .sort((a, b) => b.similarity - a.similarity);
  const clearWinner = (text: string) => {
    const [first, second] = ranked(text);
    if (!first || first.similarity < MIN_SIMILARITY) return null;
    if (second && first.similarity < second.similarity * DOMINANCE) return null;
    return first;
  };
  const give = (topicId: string, excerpt: SupportExcerpt) => {
    const list = out.get(topicId) ?? [];
    list.push(excerpt);
    out.set(topicId, list);
  };

  // 1) Küçük dosyaların hiçbir konuya ait olmayan sayfaları.
  for (const page of pages) {
    if (page.pageCount > SMALL_FILE_PAGES || cited.has(key(page.documentId, page.page))) continue;
    const text = page.text.trim();
    if (text.length < MIN_PAGE_CHARS) continue;
    // Parçaları üç ayrı konuya giden sayfa (altı konudan soru soran test) bölünür; tek bir konuya
    // açık ara yakın sayfa bütün kalır (nefron defteri "1) süzülme 2) geri emilim 3) salgılama").
    const segments = splitSegments(text).map((segment, index) => ({
      segment,
      index,
      best: segment.length >= MIN_SEGMENT_CHARS ? clearWinner(segment) : null,
    }));
    const spread = new Set(segments.flatMap((item) => (item.best ? [item.best.topic.id] : []))).size;
    const fileWords = page.fileName.replace(/\.[a-z0-9]+$/i, "").replace(/[-_]+/g, " ");
    const winner = segments.length >= 3 && spread >= 3 ? null : clearWinner(`${fileWords} ${text}`);
    if (winner) {
      give(winner.topic.id, { documentId: page.documentId, fileName: page.fileName, page: page.page, part: null, text, similarity: winner.similarity, pageCount: page.pageCount });
      continue;
    }
    segments.forEach(({ segment, index, best }) => {
      if (best) {
        give(best.topic.id, {
          documentId: page.documentId,
          fileName: page.fileName,
          page: page.page,
          part: index + 1,
          text: segment,
          similarity: best.similarity,
          pageCount: page.pageCount,
        });
      }
    });
  }

  // 2) İnce kaynaklı konu: başka dosyalardan en yakın iki sayfa.
  for (const [index, topic] of topics.entries()) {
    if ((ownText.get(topic.id) ?? "").length >= THIN_SOURCE_CHARS) continue;
    const mine = new Set(topic.refs.flatMap((ref) => ref.pages.map((number) => key(ref.documentId, number))));
    const ownDocs = new Set(topic.refs.map((ref) => ref.documentId));
    const candidates = pages
      .filter((page) => !mine.has(key(page.documentId, page.page)) && !ownDocs.has(page.documentId))
      .filter((page) => page.text.trim().length >= MIN_PAGE_CHARS)
      .map((page) => ({ page, similarity: cosine(weigh(counts(stems(page.text)), idf), vectors[index]!) }))
      .filter((item) => item.similarity >= MIN_THIN_SIMILARITY)
      .sort((a, b) => b.similarity - a.similarity)
      .slice(0, 2);
    for (const { page, similarity } of candidates) {
      give(topic.id, { documentId: page.documentId, fileName: page.fileName, page: page.page, part: null, text: page.text.trim(), similarity, pageCount: page.pageCount });
    }
  }

  // Konu başına üst sınır: en benzer önce.
  for (const [topicId, list] of out) {
    list.sort((a, b) => b.similarity - a.similarity);
    let used = 0;
    const kept = list.filter((item) => {
      if (used + item.text.length > MAX_SUPPORT_CHARS && used > 0) return false;
      used += item.text.length;
      return true;
    });
    out.set(topicId, kept);
  }
  return out;
}

/** Öğretmen istemindeki etiket: "Ek kaynak · Test-14-Homeostazi-Isaretli.jpg · parça 2". */
export function supportLabel(excerpt: Pick<SupportExcerpt, "fileName" | "page" | "part" | "pageCount">): string {
  const where = excerpt.pageCount > 1 ? ` s.${excerpt.page}` : "";
  const part = excerpt.part ? ` · parça ${excerpt.part}` : "";
  return `Ek kaynak · ${excerpt.fileName}${where}${part}`;
}
