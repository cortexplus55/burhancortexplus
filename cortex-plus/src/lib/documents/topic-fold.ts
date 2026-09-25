/**
 * Konu listesini okunur hale getirir.
 *
 * Model her başlık görünümlü satırı konu sanınca kutu etiketleri, çözümlü
 * örneğin adımları ve aynı kavramın kısa/uzun hâli listeye çıkıyordu.
 * Burada onlar ait oldukları bölüme katılır. Sayfa metni silinmez; konu
 * kalkınca sayfası komşu ya da adının işaret ettiği konuya bağlanır.
 */

import {
  chapterHeadings,
  isCalloutLabel,
  isNumberedChapter,
  isProcedureStep,
  isRunningHeader,
  isSatelliteSection,
  normalizeTopicTitle,
  topicCeiling,
} from "@/lib/documents/topic-title";

export type LooseTopic = {
  title: string;
  learningObjective: string | null;
  pageNumbers: number[];
  prerequisites?: string[];
};

export type FoldPage = {
  pageNumber: number;
  headings: string[];
  textContent?: string;
};

export type FoldMerge = { kept: string; dropped: string[] };

const TOC_PAGE_TAIL = /\s+\d{1,3}$/;

const STOP = new Set([
  "ve",
  "ile",
  "veya",
  "icin",
  "bir",
  "bu",
  "son",
  "her",
]);

/** Örnek/tekrar başlığında konuyu adlandırmayan kelimeler. */
const FOLD_STOP = new Set([
  "butunlesik",
  "cozumlu",
  "ornek",
  "ornegi",
  "ornekler",
  "vize",
  "vizede",
  "oncesi",
  "tekrar",
  "tekrari",
  "rehber",
  "rehberi",
  "mini",
  "formul",
  "haritasi",
  "harita",
  "denklem",
  "denklemi",
  "secme",
  "dikkat",
  "kendini",
  "test",
  "kutusu",
  "kutu",
]);

function foldKey(text: string): string {
  return normalizeTopicTitle(text)
    .toLocaleLowerCase("tr")
    .replace(/ı/g, "i")
    .replace(/ş/g, "s")
    .replace(/ğ/g, "g")
    .replace(/ü/g, "u")
    .replace(/ö/g, "o")
    .replace(/ç/g, "c")
    .replace(/â/g, "a")
    .replace(/î/g, "i")
    .replace(/û/g, "u")
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function significant(title: string): string[] {
  return foldKey(title)
    .split(" ")
    .filter((word) => word.length >= 4 && !STOP.has(word));
}

function cleanHeading(raw: string): string {
  return (raw ?? "").replace(TOC_PAGE_TAIL, "").trim();
}

export function preferredHeading(headings: string[]): string {
  for (const raw of headings) {
    const heading = cleanHeading(raw);
    if (!heading) continue;
    if (isRunningHeader(heading) || isCalloutLabel(heading) || isProcedureStep(heading)) {
      continue;
    }
    return heading;
  }
  return "";
}

/**
 * Aynı kavramın kısa ve uzun başlığı.
 *
 * "Kütle Korunumu" ile "Açık Sistemlere Geçiş: Kütle Korunumu",
 * "Vize Öncesi Son Tekrar" ile "… Denklem Seçme Rehberi".
 * Tek ortak kelime yetmez; iki farklı bölüm birleşmesin.
 */
export function areNearDuplicateTitles(a: string, b: string): boolean {
  const fa = foldKey(a);
  const fb = foldKey(b);
  if (!fa || !fb) return false;
  if (fa === fb) return true;
  const shorter = fa.length <= fb.length ? fa : fb;
  const longer = fa.length <= fb.length ? fb : fa;
  if (shorter.length >= 12 && (longer.startsWith(`${shorter} `) || longer === shorter)) {
    return true;
  }
  const wa = significant(a);
  const wb = significant(b);
  if (wa.length < 2 || wb.length < 2) return false;
  const [small, large] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  const shared = small.filter((word) =>
    large.some((other) => other.startsWith(word) || word.startsWith(other)),
  );
  return shared.length >= 2 && shared.length / small.length >= 0.75;
}

function collectStepTitles(pages: FoldPage[]): Set<string> {
  const titles = new Set<string>();
  const take = (line: string) => {
    const match = line.trim().match(/^\d+\)\s+(.+)$/);
    if (!match) return;
    const title = foldKey(match[1]);
    if (title) titles.add(title);
  };
  for (const page of pages) {
    for (const heading of page.headings ?? []) take(heading);
    for (const line of (page.textContent ?? "").split(/\n+/)) take(line);
  }
  return titles;
}

/**
 * Belgenin kendi numaralı bölümleri, belge sırasıyla.
 * Kutu, adım, çözümlü örnek ve tekrar bu listeye girmez.
 */
export function outlineSections(
  pages: FoldPage[],
): { title: string; pageNumbers: number[] }[] {
  const chapters = new Set(chapterHeadings(pages));
  const byKey = new Map<string, { title: string; pageNumbers: number[] }>();
  const order: string[] = [];
  for (const page of pages) {
    const seenOnPage = new Set<string>();
    for (const raw of page.headings ?? []) {
      const heading = cleanHeading(raw);
      if (!chapters.has(heading) || seenOnPage.has(heading)) continue;
      seenOnPage.add(heading);
      const title = normalizeTopicTitle(heading);
      const key = foldKey(title);
      if (!key) continue;
      const existing = byKey.get(key);
      if (existing) {
        if (!existing.pageNumbers.includes(page.pageNumber)) {
          existing.pageNumbers.push(page.pageNumber);
        }
      } else {
        byKey.set(key, { title, pageNumbers: [page.pageNumber] });
        order.push(key);
      }
    }
  }
  return order.map((key) => byKey.get(key)!);
}

/**
 * Zorunlu omurga. Az sayıda gerçek bölümün hepsi korunur (zemin notundaki
 * sekiz bölüm gibi). Her sayfası ayrı numaralı kısa bölüm olan notta
 * omurga boştur; onları tek tek konu yapmak listeyi şişiriyordu.
 */
/**
 * Kısa notta numaralı bölümler tavanın üstündeyse her biri kendi konusu olur.
 * Uzun, sayfa başına bir başlıklı not bu kurala girmez; sayfa tavanı durur.
 */
function mapCeiling(pageCount: number, pages: { headings: string[] }[]): number {
  const ceiling = topicCeiling(pageCount);
  const numbered = chapterHeadings(pages).filter((heading) => isNumberedChapter(heading)).length;
  if (pageCount <= 6 && numbered >= 2 && numbered <= 8 && numbered > ceiling) return numbered;
  return ceiling;
}

export function headingsToGuard(pages: { headings: string[] }[]): string[] {
  const chapters = chapterHeadings(pages);
  if (chapters.length <= mapCeiling(pages.length, pages)) return chapters;
  const spans = new Map<string, number>();
  for (const page of pages) {
    const seen = new Set<string>();
    for (const raw of page.headings ?? []) {
      const heading = cleanHeading(raw);
      if (!heading || seen.has(heading)) continue;
      seen.add(heading);
      spans.set(heading, (spans.get(heading) ?? 0) + 1);
    }
  }
  return chapters.filter((heading) => (spans.get(heading) ?? 0) >= 2);
}

function unionPages(a: number[], b: number[]): number[] {
  return [...new Set([...a, ...b])].sort((x, y) => x - y);
}

function record(merges: FoldMerge[], kept: string, dropped: string) {
  if (!dropped || foldKey(dropped) === foldKey(kept)) return;
  const row = merges.find((merge) => merge.kept === kept);
  if (row) {
    if (!row.dropped.includes(dropped)) row.dropped.push(dropped);
    return;
  }
  merges.push({ kept, dropped: [dropped] });
}

function chooseKept(current: string, incoming: string, outlineKeys: Set<string>): string {
  const currentKey = foldKey(current);
  const incomingKey = foldKey(incoming);
  const currentOutline = outlineKeys.has(currentKey);
  const incomingOutline = outlineKeys.has(incomingKey);
  if (incomingOutline && !currentOutline) return incoming;
  if (currentOutline && !incomingOutline) return current;
  return incoming.length > current.length ? incoming : current;
}

function mergedTitle(a: string, b: string): string {
  const joined = `${a} ve ${b}`.replace(/\s+/g, " ").trim();
  const words = joined.split(/\s+/).filter(Boolean);
  if (words.length <= 10 && joined.length <= 120) return joined;
  return a;
}

function evenSizes(count: number, groups: number): number[] {
  const size = Math.max(1, Math.min(groups, count));
  const base = Math.floor(count / size);
  const extra = count % size;
  const sizes = Array.from({ length: size }, () => base);
  if (!extra) return sizes;
  const step = size / extra;
  for (let index = 0; index < extra; index += 1) {
    sizes[Math.min(size - 1, Math.floor(index * step))] += 1;
  }
  return sizes;
}

function packOutline(
  sections: { title: string; pageNumbers: number[] }[],
  ceiling: number,
  merges: FoldMerge[],
): LooseTopic[] {
  if (sections.length <= ceiling) {
    return sections.map((section) => ({
      title: section.title,
      learningObjective: null,
      pageNumbers: [...section.pageNumbers].sort((a, b) => a - b),
      prerequisites: [],
    }));
  }
  const out: LooseTopic[] = [];
  let cursor = 0;
  for (const groupSize of evenSizes(sections.length, ceiling)) {
    const chunk = sections.slice(cursor, cursor + groupSize);
    cursor += groupSize;
    let title = chunk[0]?.title ?? "";
    for (const section of chunk.slice(1)) {
      const next = mergedTitle(title, section.title);
      title = next;
      record(merges, next, section.title);
    }
    out.push({
      title,
      learningObjective: null,
      pageNumbers: chunk.flatMap((section) => section.pageNumbers).sort((a, b) => a - b),
      prerequisites: [],
    });
  }
  return out;
}

/**
 * Örnek ya da tekrar sayfası hangi konuya katılır?
 *
 * Sayfa belgenin sonunda duruyor olabilir; en yakın önceki konu o zaman
 * yanlış bölümdür. Başlıktaki kavram kelimesi ("Nozul") asıl konuyu seçer.
 * Normal bölüm sayfasında null: onu başlık eşlemesi ya da sıra çözer.
 */
export function foldedPageHost<T extends { title: string }>(
  topics: T[],
  headings: string[],
): T | null {
  const meaningful = headings.map(cleanHeading).filter(Boolean);
  const hasRealChapter = meaningful.some(
    (heading) => isNumberedChapter(heading) && !isSatelliteSection(heading),
  );
  const needsFold = meaningful.some(
    (heading) => isSatelliteSection(heading) || isProcedureStep(heading),
  );
  if (hasRealChapter || !needsFold || !topics.length) return null;

  // Adım satırı ("Enerji denklemi") ve koşan başlık ("TERMODİNAMİK I | …")
  // sayfayı yanlış kavrama çekmesin. Koşan başlıktaki ders adı, en kısa
  // "Termodinamik …" bölümüne yapışıyordu.
  const words = meaningful
    .filter(
      (heading) =>
        !isProcedureStep(heading) &&
        !isCalloutLabel(heading) &&
        !isRunningHeader(heading),
    )
    .flatMap((heading) => significant(heading))
    .filter((word) => !FOLD_STOP.has(word));
  if (!words.length) return null;

  let best: T | null = null;
  let bestRank = 0;
  for (const topic of topics) {
    const titleWords = significant(topic.title);
    const score = words.filter((word) =>
      titleWords.some((other) => other.startsWith(word) || word.startsWith(other)),
    ).length;
    if (!score) continue;
    const fraction = score / Math.min(words.length, Math.max(titleWords.length, 1));
    const rank = score + fraction;
    if (rank > bestRank) {
      best = topic;
      bestRank = rank;
    }
  }
  return best;
}

function nearestTopic(pages: number[], topics: LooseTopic[]): LooseTopic | null {
  if (!topics.length || !pages.length) return null;
  const page = Math.min(...pages);
  let host = topics[0];
  let best = Number.NEGATIVE_INFINITY;
  for (const topic of topics) {
    const start = Math.min(...topic.pageNumbers);
    if (start <= page && start > best) {
      host = topic;
      best = start;
    }
  }
  return host;
}

function hostForRemoved(
  topic: LooseTopic,
  kept: LooseTopic[],
  pages: FoldPage[],
  stepTitles: Set<string>,
): LooseTopic | null {
  const related = pages.filter((page) => topic.pageNumbers.includes(page.pageNumber));
  const headings = related.flatMap((page) => page.headings ?? []);
  const fromPage = foldedPageHost(kept, headings.length ? headings : [topic.title]);
  if (fromPage) return fromPage;
  // "1)" normalize edilince düşer. Kalan cümle ("mutlak basınç") bir bölüm
  // adıyla örtüşür ve bütün tekrar sayfasını o bölüme taşır.
  if (
    isCalloutLabel(topic.title) ||
    isRunningHeader(topic.title) ||
    isProcedureStep(topic.title) ||
    stepTitles.has(foldKey(topic.title))
  ) {
    return null;
  }
  return foldedPageHost(kept, [topic.title]);
}

/** Kapağın bağıran kısa satırı: "MAKİNE MÜHENDİSLİĞİ". Bölüm adıysa durur. */
function isShoutedBanner(title: string, outlineKeys: Set<string>): boolean {
  if (outlineKeys.has(foldKey(title))) return false;
  const letters = title.replace(/[^\p{L}]/gu, "");
  if (letters.length < 4) return false;
  const upper = letters.replace(/[^\p{Lu}]/gu, "").length;
  const words = title.split(/\s+/).filter(Boolean).length;
  return upper / letters.length > 0.8 && words <= 3;
}

function isJunkTitle(
  title: string,
  stepTitles: Set<string>,
  outlineKeys: Set<string>,
  hasRealOutline: boolean,
): boolean {
  if (isCalloutLabel(title) || isRunningHeader(title) || isShoutedBanner(title, outlineKeys)) {
    return true;
  }
  const key = foldKey(title);
  if (stepTitles.has(key) && !outlineKeys.has(key)) return true;
  if (isSatelliteSection(title) && hasRealOutline && !outlineKeys.has(key)) return true;
  return false;
}

function sharedCount(a: string, b: string): number {
  const left = significant(a);
  const right = new Set(significant(b));
  return left.filter((word) => right.has(word)).length;
}

function foldDownToCeiling(
  topics: LooseTopic[],
  outlineKeys: Set<string>,
  ceiling: number,
  merges: FoldMerge[],
): LooseTopic[] {
  const list = topics
    .map((topic) => ({ ...topic, pageNumbers: [...topic.pageNumbers] }))
    .sort((a, b) => (a.pageNumbers[0] ?? 0) - (b.pageNumbers[0] ?? 0));

  const isOutline = (title: string) =>
    outlineKeys.has(foldKey(title)) ||
    [...outlineKeys].some((key) => areNearDuplicateTitles(title, key));

  while (list.length > ceiling) {
    const extraIndex = list.findIndex((topic) => !isOutline(topic.title));
    if (extraIndex < 0) break;
    const [extra] = list.splice(extraIndex, 1);
    const host =
      foldedPageHost(list, [extra.title]) ?? nearestTopic(extra.pageNumbers, list);
    if (!host) continue;
    host.pageNumbers = unionPages(host.pageNumbers, extra.pageNumbers);
    if (!host.learningObjective && extra.learningObjective) {
      host.learningObjective = extra.learningObjective;
    }
    record(merges, host.title, extra.title);
  }

  while (list.length > ceiling && list.length >= 2) {
    let bestIndex = 0;
    let bestKey = Number.POSITIVE_INFINITY;
    for (let index = 0; index < list.length - 1; index += 1) {
      const span = new Set([...list[index].pageNumbers, ...list[index + 1].pageNumbers]).size;
      const overlap = sharedCount(list[index].title, list[index + 1].title);
      const key = span * 100 - overlap;
      if (key < bestKey) {
        bestKey = key;
        bestIndex = index;
      }
    }
    const left = list[bestIndex];
    const right = list[bestIndex + 1];
    const title = mergedTitle(left.title, right.title);
    left.title = title;
    left.pageNumbers = unionPages(left.pageNumbers, right.pageNumbers);
    left.learningObjective = left.learningObjective ?? right.learningObjective;
    record(merges, title, right.title);
    list.splice(bestIndex + 1, 1);
  }

  return list;
}

/**
 * Modelin döndürdüğü listeyi konu haritasına çevirir.
 *
 * Kutu, adım ve tekrar düşer. Kısa/uzun çift birleşir. Liste tavanın
 * üstündeyse komşu bölümler birleşir. Model hiçbir gerçek bölüm
 * bırakmadıysa belgenin kendi numaralı bölümlerinden kurulur.
 */
export function consolidateTopics(
  topics: LooseTopic[],
  pages: FoldPage[],
  pageCount = pages.length,
): { topics: LooseTopic[]; mergedTitles: FoldMerge[] } {
  const ceiling = mapCeiling(pageCount, pages);
  const outline = outlineSections(pages);
  topics = topics.map((topic) => {
    const title = normalizeTopicTitle(topic.title).replace(/[.!?…:;]+$/u, "").trim();
    return { ...topic, title: title || topic.title };
  });
  const outlineKeys = new Set(outline.map((section) => foldKey(section.title)));
  const stepTitles = collectStepTitles(pages);
  const merges: FoldMerge[] = [];

  const junk: LooseTopic[] = [];
  const kept: LooseTopic[] = [];
  for (const topic of topics) {
    const copy = {
      ...topic,
      pageNumbers: [...topic.pageNumbers],
      prerequisites: topic.prerequisites ? [...topic.prerequisites] : [],
    };
    if (isJunkTitle(copy.title, stepTitles, outlineKeys, outline.length > 0)) {
      junk.push(copy);
    } else {
      kept.push(copy);
    }
  }

  const merged: LooseTopic[] = [];
  for (const topic of kept) {
    const host = merged.find((item) => areNearDuplicateTitles(item.title, topic.title));
    if (!host) {
      merged.push(topic);
      continue;
    }
    const title = chooseKept(host.title, topic.title, outlineKeys);
    const dropped = title === host.title ? topic.title : host.title;
    host.title = title;
    host.pageNumbers = unionPages(host.pageNumbers, topic.pageNumbers);
    if (!host.learningObjective && topic.learningObjective) {
      host.learningObjective = topic.learningObjective;
    }
    record(merges, title, dropped);
  }

  const covered = new Set(merged.flatMap((topic) => topic.pageNumbers));
  for (const topic of junk) {
    const orphans = topic.pageNumbers.filter((page) => !covered.has(page));
    // En yakın önceki konuya yığma: kutu her sayfayı sahiplenmiş olabilir.
    // Örnek sayfası, başlığındaki kavrama gider. Kalan sayfayı sonra
    // sayfanın kendi başlığı bağlar.
    const host = hostForRemoved(topic, merged, pages, stepTitles);
    if (host && orphans.length) {
      host.pageNumbers = unionPages(host.pageNumbers, orphans);
      for (const page of orphans) covered.add(page);
    }
    if (host) record(merges, host.title, topic.title);
  }

  let result = merged;
  const floor = Math.min(ceiling, Math.max(4, Math.ceil(pageCount / 3)));
  if (result.length === 0 && outline.length) {
    result = packOutline(outline, ceiling, merges);
  } else if (
    pageCount <= 6 &&
    outline.length >= 2 &&
    outline.length <= ceiling &&
    result.length < outline.length
  ) {
    result = packOutline(outline, ceiling, merges);
  } else if (outline.length > ceiling && result.length < floor) {
    result = packOutline(outline, ceiling, merges);
  } else if (result.length > ceiling) {
    result = foldDownToCeiling(result, outlineKeys, ceiling, merges);
  }

  return {
    topics: result.sort((a, b) => (a.pageNumbers[0] ?? 0) - (b.pageNumbers[0] ?? 0)),
    mergedTitles: merges,
  };
}

/**
 * Kayıtlı harita hâlâ kutu, adım veya tavanın üstünde mi?
 *
 * Yeni yükleme bu listeyi yazmaz. Eski kuralda yazılmış bir belge
 * açılınca, model bir daha çağrılmadan aynı birleştirme uygulanır.
 */
export function storedTopicsNeedRefold(
  topics: { title: string }[],
  pages: FoldPage[],
  pageCount = pages.length,
): boolean {
  if (!topics.length) return false;
  const pagesCounted = Math.max(pageCount, 1);
  const ceiling = mapCeiling(pagesCounted, pages);
  if (topics.length > ceiling) return true;
  const outline = outlineSections(pages);
  if (pagesCounted <= 6 && outline.length >= 2 && outline.length <= ceiling && topics.length < outline.length) {
    return true;
  }
  const outlineKeys = new Set(outline.map((section) => foldKey(section.title)));
  const stepTitles = collectStepTitles(pages);
  return topics.some((topic) =>
    isJunkTitle(topic.title, stepTitles, outlineKeys, outline.length > 0),
  );
}

/**
 * Öğrencinin onayladığı, elle düzenlediği ya da bir hazırlığa bağladığı
 * haritaya dokunulmaz. Yalnızca hazır ve hâlâ şişkin/kutu başlıklı,
 * henüz kullanılmamış harita yeniden katlanır.
 */
export function shouldRewriteStoredTopicMap(input: {
  status: string | null;
  studentEdited: boolean;
  /** Sınav hazırlığı bu belgenin konu düğümlerine bağlı. */
  inUse?: boolean;
  topics: { title: string }[];
  pages: FoldPage[];
  pageCount?: number;
}): boolean {
  if (input.studentEdited) return false;
  if (input.inUse) return false;
  if (input.status !== "ready") return false;
  return storedTopicsNeedRefold(
    input.topics,
    input.pages,
    input.pageCount ?? input.pages.length,
  );
}
