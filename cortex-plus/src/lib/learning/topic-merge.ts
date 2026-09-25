import { foldTr } from "@/lib/documents/page-analysis";

/**
 * Birden fazla dosyadaki konu başlıklarını tek konuya indirir.
 *
 * Eşleşme gömme (embedding) kullanmaz. Önce yazım: büyük/küçük harf,
 * Türkçe ek, çoğul ve "konusu / nedir" gibi boş sözcükler. Emin olunmayan
 * çift "sor" diye işaretlenir; model ancak o zaman çağrılır ve cevap
 * önbelleğe yazılır. Eşleşmeyen başlık düşmez.
 */

export type TopicSourceRef = {
  documentId: string;
  fileName: string;
  pages: number[];
  nodeId: string | null;
};

export type MergeTopicInput = {
  id: string;
  title: string;
  pages: number[];
  documentId?: string;
  fileName?: string;
  prerequisites?: string[];
};

export type MergedTopic = {
  title: string;
  pages: number[];
  sources: TopicSourceRef[];
  prerequisites: string[];
  nodeIds: string[];
};

export type AmbiguousTopicPair = {
  left: string;
  right: string;
  key: string;
};

const STOP = new Set([
  "konusu",
  "konu",
  "nedir",
  "hakkinda",
  "uzerine",
  "ile",
  "ve",
  "icin",
  "bir",
  "bu",
]);

function singularizeTr(token: string): string {
  if (token.length < 6) return token;
  if (token.endsWith("leri") || token.endsWith("lari")) {
    const stem = token.slice(0, -4);
    return stem.length >= 4 ? stem : token;
  }
  if (token.endsWith("ler") || token.endsWith("lar")) {
    const stem = token.slice(0, -3);
    return stem.length >= 4 ? stem : token;
  }
  return token;
}

/** Karşılaştırma anahtarı. Aynı anahtar aynı konudur; model gerekmez. */
export function topicMatchKey(title: string): string {
  const folded = foldTr(title)
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  return folded
    .split(" ")
    .filter((token) => token && !STOP.has(token))
    .map(singularizeTr)
    .filter(Boolean)
    .join(" ");
}

function levenshtein(left: string, right: string): number {
  const rows = left.length + 1;
  const cols = right.length + 1;
  const grid: number[][] = Array.from({ length: rows }, () => Array(cols).fill(0));
  for (let row = 0; row < rows; row += 1) grid[row][0] = row;
  for (let col = 0; col < cols; col += 1) grid[0][col] = col;
  for (let row = 1; row < rows; row += 1) {
    for (let col = 1; col < cols; col += 1) {
      const cost = left[row - 1] === right[col - 1] ? 0 : 1;
      grid[row][col] = Math.min(
        grid[row - 1][col] + 1,
        grid[row][col - 1] + 1,
        grid[row - 1][col - 1] + cost,
      );
    }
  }
  return grid[left.length][right.length];
}

/**
 * same: yazım aynı, birleştir.
 * ask: yakın ama emin değiliz; model karar versin.
 * different: ayrı konu olarak kalır.
 */
export function classifyTopicPair(left: string, right: string): "same" | "different" | "ask" {
  const a = topicMatchKey(left);
  const b = topicMatchKey(right);
  if (!a || !b) return "different";
  if (a === b) return "same";
  const ta = a.split(" ");
  const tb = b.split(" ");
  if (ta.length === 1 && tb.length === 1) {
    const [x] = ta;
    const [y] = tb;
    if (x.length >= 6 && y.length >= 6 && levenshtein(x, y) <= 1) return "ask";
    return "different";
  }
  const setB = new Set(tb);
  const inter = ta.filter((token) => setB.has(token)).length;
  const union = new Set([...ta, ...tb]).size;
  const jaccard = union ? inter / union : 0;
  if (jaccard >= 0.5 && jaccard < 1 && Math.min(ta.length, tb.length) >= 2) return "ask";
  return "different";
}

export function mergePairKey(left: string, right: string): string {
  const [a, b] = [topicMatchKey(left), topicMatchKey(right)].sort();
  return `${a}||${b}`;
}

function uniquePages(pages: number[]): number[] {
  return [...new Set(pages.filter((page) => Number.isInteger(page) && page > 0))].sort(
    (a, b) => a - b,
  );
}

function uniqueText(items: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const item of items) {
    const text = item.trim();
    const key = topicMatchKey(text);
    if (!text || !key || seen.has(key)) continue;
    seen.add(key);
    out.push(text);
  }
  return out;
}

function toMerged(topic: MergeTopicInput): MergedTopic {
  const nodeId = topic.id && !topic.id.startsWith("added:") ? topic.id : null;
  return {
    title: topic.title.trim(),
    pages: uniquePages(topic.pages),
    sources: [
      {
        documentId: topic.documentId ?? "",
        fileName: topic.fileName ?? "",
        pages: uniquePages(topic.pages),
        nodeId,
      },
    ].filter((source) => source.documentId || source.fileName || source.pages.length || source.nodeId),
    prerequisites: uniqueText(topic.prerequisites ?? []),
    nodeIds: nodeId ? [nodeId] : [],
  };
}

function absorb(target: MergedTopic, topic: MergeTopicInput) {
  const extra = toMerged(topic);
  absorbMerged(target, extra);
}

function absorbMerged(target: MergedTopic, extra: MergedTopic) {
  target.pages = uniquePages([...target.pages, ...extra.pages]);
  target.prerequisites = uniqueText([...target.prerequisites, ...extra.prerequisites]);
  target.nodeIds = [...new Set([...target.nodeIds, ...extra.nodeIds])];
  for (const source of extra.sources) {
    const have = target.sources.find(
      (item) => item.documentId && item.documentId === source.documentId,
    );
    if (!have) {
      target.sources.push({ ...source, pages: [...source.pages] });
      continue;
    }
    have.pages = uniquePages([...have.pages, ...source.pages]);
    if (!have.fileName && source.fileName) have.fileName = source.fileName;
    if (!have.nodeId && source.nodeId) have.nodeId = source.nodeId;
  }
}

function cloneTopic(topic: MergedTopic): MergedTopic {
  return {
    title: topic.title,
    pages: [...topic.pages],
    sources: topic.sources.map((source) => ({ ...source, pages: [...source.pages] })),
    prerequisites: [...topic.prerequisites],
    nodeIds: [...topic.nodeIds],
  };
}

/**
 * Kesin yazım eşleşmelerini birleştirir.
 * Gri bölgedeki çiftler `ambiguous` içinde kalır; ikisi de listede durur.
 */
export function mergeTopicGroups(groups: MergeTopicInput[][]): {
  topics: MergedTopic[];
  ambiguous: AmbiguousTopicPair[];
} {
  const topics: MergedTopic[] = [];
  const indexByKey = new Map<string, number>();
  const seenIds = new Set<string>();

  for (const group of groups) {
    for (const topic of group) {
      if (topic.id && seenIds.has(topic.id)) continue;
      if (topic.id) seenIds.add(topic.id);
      const title = topic.title.trim();
      if (!title) continue;
      const key = topicMatchKey(title);
      const existing = key ? indexByKey.get(key) : undefined;
      if (existing == null) {
        if (key) indexByKey.set(key, topics.length);
        topics.push(toMerged({ ...topic, title }));
        continue;
      }
      absorb(topics[existing], { ...topic, title });
    }
  }

  const ambiguous: AmbiguousTopicPair[] = [];
  const seenPairs = new Set<string>();
  for (let left = 0; left < topics.length; left += 1) {
    for (let right = left + 1; right < topics.length; right += 1) {
      if (classifyTopicPair(topics[left].title, topics[right].title) !== "ask") continue;
      const key = mergePairKey(topics[left].title, topics[right].title);
      if (!key || key === "||" || seenPairs.has(key)) continue;
      seenPairs.add(key);
      ambiguous.push({ left: topics[left].title, right: topics[right].title, key });
    }
  }

  return { topics, ambiguous };
}

/**
 * Modelin "aynı" dediği çiftleri birleştirir.
 * Karar yoksa ya da "farklı" ise başlık durur — konu düşmez.
 */
export function applySameDecisions(
  topics: MergedTopic[],
  sameKeys: ReadonlySet<string>,
): MergedTopic[] {
  if (!sameKeys.size) return topics.map(cloneTopic);
  const parent = topics.map((_, index) => index);
  const find = (index: number): number => {
    if (parent[index] !== index) parent[index] = find(parent[index]);
    return parent[index];
  };
  for (let left = 0; left < topics.length; left += 1) {
    for (let right = left + 1; right < topics.length; right += 1) {
      if (!sameKeys.has(mergePairKey(topics[left].title, topics[right].title))) continue;
      const rootLeft = find(left);
      const rootRight = find(right);
      if (rootLeft !== rootRight) parent[rootRight] = rootLeft;
    }
  }
  const groups = new Map<number, MergedTopic>();
  for (let index = 0; index < topics.length; index += 1) {
    const root = find(index);
    const have = groups.get(root);
    if (!have) {
      groups.set(root, cloneTopic(topics[index]));
      continue;
    }
    absorbMerged(have, topics[index]);
  }
  return [...groups.values()];
}

/** Önkoşul adlarını birleşmiş başlıklara çevirir. Konu kendi önkoşulu olamaz. */
export function remapPrerequisites(topics: MergedTopic[]): MergedTopic[] {
  const byKey = new Map(topics.map((topic) => [topicMatchKey(topic.title), topic.title]));
  return topics.map((topic) => {
    const self = topicMatchKey(topic.title);
    const prerequisites = uniqueText(
      topic.prerequisites.map((item) => byKey.get(topicMatchKey(item)) ?? item),
    ).filter((item) => topicMatchKey(item) !== self);
    return { ...topic, prerequisites };
  });
}
