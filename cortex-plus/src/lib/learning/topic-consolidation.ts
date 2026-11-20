import { foldTr } from "@/lib/text/math-normalize";
import { topicMatchKey, type TopicSourceRef } from "@/lib/learning/topic-merge";
import type { UnitStage } from "@/lib/documents/outline-topic-meta";

/**
 * Ana ünite modeli (Faz 10, 20 Kasım 2026, ürün sahibinin kararı). Yeni hazırlığın yolu az sayıda tam ANA ÜNİTEDEN
 * kurulur; konu haritasının bulduğu ince konular o ünitenin ALT BAŞLIKLARI olur (`subtopics`). Her ana ünite tek derin
 * ders alır. 19 Ekim'in "konu sayısı gevşetilmez" kararı YENİ hazırlıklar için bilerek değişti; eski hazırlıkların
 * satırları (alt başlıksız) bugünkü gibi çalışır.
 *
 * Saf ve belirlenimci: model çağrısı yok, sıra ve sonuç yalnız girdiden. Kod başlık YAZMAZ: ünite adı modelin ünite adı;
 * iki ünite birleşince büyüğünün adı kalır, öbürünün adı alt başlık olur; ünite bölünürse ikinci parçanın adı onun ilk
 * konusunun (modelin yazdığı) adıdır. Hiçbir kaynak, sayfa ya da alt başlık kaybolmaz; yalnız bütün sayfaları gürültü
 * (kapak, boş, içindekiler, kaynakça, yalnız başlık) olan konu ünite açmaz.
 */

export type ConsolidationDocumentKind = "pdf" | "office" | "photo" | "other";

/** Bir belgenin ölçüsü: öğretilebilir sayfalar (gürültü sayfası yok) ve sayfa başına öğretilebilir karakter. */
export type ConsolidationDocument = {
  documentId: string;
  kind: ConsolidationDocumentKind;
  usablePages: readonly number[];
  /** Öğretilebilir sayfanın karakteri; verilmeyen sayfa ölçülmemiş sayılır (sayfa sayısıyla tartılır). */
  pageChars?: Readonly<Record<number, number>>;
};

export type ConsolidationTopic = {
  title: string;
  documentId: string;
  fileName: string;
  nodeId: string | null;
  pages: readonly number[];
  examWeight?: "high" | "medium" | "low";
};

/** Modelin ünitesi; `topics` girdi konularının sırası (kurs sırası). Hiçbir üniteye girmeyen konu kendi ünitesidir. */
export type ConsolidationUnit = {
  title: string;
  examWeight?: "high" | "medium" | "low";
  stage?: UnitStage | null;
  topics: readonly number[];
};

export type ConsolidationInput = {
  topics: readonly ConsolidationTopic[];
  units: readonly ConsolidationUnit[];
  documents: readonly ConsolidationDocument[];
  /** Verilmezse belgelerin öğretilebilir sayfalarının toplamı. */
  effectivePageCount?: number;
};

export type MainUnit = {
  title: string;
  subtopics: string[];
  /** Yaprak başına kaynak (belge + düğüm); aynı çiftin sayfaları birleşir, sıra korunur. */
  sourceRefs: TopicSourceRef[];
  /** Bütün kaynakların sayfaları (belgeler karışık; belge başına sayfa için `sourceRefs`). */
  pages: number[];
  topicNodeIds: string[];
  /** Girdi konularının sırası (ünitenin içindeki sırayla). */
  topicIndexes: number[];
  /** Ünitenin parçaları sırayla: konu (girdi sırası) ya da birleşen ünitenin adı (`topicIndex` null, sayfasız). */
  items: { title: string; topicIndex: number | null }[];
  examWeight: "high" | "medium" | "low";
  stage?: UnitStage;
};

export type ConsolidationResult = {
  units: MainUnit[];
  effectivePageCount: number;
  band: UnitCountBand;
  /** Bütün sayfaları gürültü olduğu için ünite açmayan konular (girdi sırası). */
  droppedNoise: number[];
  /** Fotoğraf seti ya da çok belgeli kurs: üniteler öğrenme basamağına göre dizildi. */
  stageOrdered: boolean;
};

export type UnitCountBand = { min: number; max: number };

/** Ana ünite sayısının sert tavanı. */
export const MAX_MAIN_UNITS = 15;
/** Tek sayfalık ve bu kadar karakterden kısa ünite/konu kendi başına ders olmaz, en yakın üniteye katılır. */
export const MICRO_UNIT_CHARS = 600;
/** Bir dersin en çok öğretilebilir sayfası; daha büyük ünite alt başlık gruplarına göre ardışık derslere bölünür. */
export const UNIT_LESSON_MAX_PAGES = 12;
/** Sayfa karakteri ölçülmemişse sayfa başına varsayılan hacim. */
const UNMEASURED_PAGE_CHARS = 1_000;

/** Etkin sayfa sayısına göre hedef ünite aralığı: 1–6 → 1–3; 7–15 → 3–5; 16–35 → 5–8; 36–80 → 8–12; 81+ → 10–15. */
export function unitCountBand(effectivePages: number): UnitCountBand {
  const pages = Math.max(0, Math.floor(effectivePages));
  if (pages <= 6) return { min: 1, max: 3 };
  if (pages <= 15) return { min: 3, max: 5 };
  if (pages <= 35) return { min: 5, max: 8 };
  if (pages <= 80) return { min: 8, max: 12 };
  return { min: 10, max: MAX_MAIN_UNITS };
}

/** Belgelerin öğretilebilir sayfalarının toplamı (kapak, boş, içindekiler, kaynakça, yalnız başlık sayılmaz). */
export function effectivePageCount(documents: readonly Pick<ConsolidationDocument, "usablePages">[]): number {
  return documents.reduce((sum, doc) => sum + new Set(doc.usablePages).size, 0);
}

type Item = { title: string; topic: number | null };

type Work = {
  title: string;
  items: Item[];
  examWeight: "high" | "medium" | "low";
  /** null: basamağı bilinmeyen parça var (sıra değişmez). */
  stage: UnitStage | null;
  /** Kurs sırasındaki yeri (ilk konusunun girdi sırası). */
  position: number;
};

const WEIGHT_RANK = { low: 0, medium: 1, high: 2 } as const;
const heavier = (a: Work["examWeight"], b: Work["examWeight"]) => (WEIGHT_RANK[a] >= WEIGHT_RANK[b] ? a : b);

const STRUCTURE_WORDS = new Set([
  "bolum", "kisim", "part", "section", "unite", "unit", "chapter", "konu", "ders", "lecture", "hafta", "week",
]);
const ROMAN = /^(?:i{1,3}|iv|vi{0,3}|ix|x)$/;

function words(text: string): string[] {
  return foldTr(text)
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((word) => word.length >= 3 && !/^\d+$/.test(word) && !STRUCTURE_WORDS.has(word));
}

function stems(text: string): Set<string> {
  return new Set(words(text).map((word) => (word.length > 6 ? word.slice(0, 6) : word)));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let shared = 0;
  for (const value of a) if (b.has(value)) shared += 1;
  return shared / (a.size + b.size - shared);
}

/** İki başlık aynı konu mu: eşleme anahtarı aynı ya da (en az iki sözcükte) sözcük kümeleri neredeyse aynı. */
function sameKey(left: string, right: string): boolean {
  const a = topicMatchKey(left);
  const b = topicMatchKey(right);
  if (!a || !b) return false;
  if (a === b) return true;
  const ta = new Set(a.split(" "));
  const tb = new Set(b.split(" "));
  return ta.size >= 2 && tb.size >= 2 && jaccard(ta, tb) >= 0.75;
}

/**
 * Bir üst başlığın numaralı ya da harfli parçası mı: "1.1 …" / "1.2 …" (aynı ana numara), "… Bölüm A" / "… Kısım 2",
 * "… I" / "… II", "Ortak Kök: A" / "Ortak Kök: B". Kök, yapı sözcükleri (bölüm, kısım, part …) ve numaralar atılınca
 * içerik sözcüğü taşımalı: "Bölüm 1" ile "Bölüm 2" aynı kökten sayılmaz.
 */
export function partParentKey(title: string): string | null {
  const text = title.trim();
  const dotted = /^(\d{1,2})\.\d{1,2}(?:\.\d{1,2})*[.)]?\s+\S/.exec(text);
  if (dotted) return `num:${dotted[1]}`;
  const colon = /^(.{3,}?)\s*[:–—]\s+\S/.exec(text);
  if (colon) {
    const stem = words(colon[1]!).join(" ");
    if (stem) return `stem:${stem}`;
  }
  const folded = foldTr(text).replace(/[()[\]]/g, " ").replace(/\s+/g, " ").trim();
  const marker = /^(.*?)[\s,–—-]+(?:(?:bolum|kisim|part|section)\s+)?([a-h]|\d{1,2}|[ivx]{1,4})$/.exec(folded);
  if (marker && (ROMAN.test(marker[2]!) || /^\d+$/.test(marker[2]!) || /^[a-h]$/.test(marker[2]!))) {
    const stem = words(marker[1]!).join(" ");
    if (stem) return `stem:${stem}`;
  }
  return null;
}

function addPages(into: Map<string, Set<number>>, documentId: string, pages: readonly number[]) {
  const set = into.get(documentId) ?? new Set<number>();
  for (const page of pages) if (Number.isInteger(page) && page > 0) set.add(page);
  into.set(documentId, set);
}

export function consolidateFragmentedTopics(input: ConsolidationInput): ConsolidationResult {
  const docs = new Map(input.documents.map((doc) => [doc.documentId, doc]));
  const usable = new Map(input.documents.map((doc) => [doc.documentId, new Set(doc.usablePages)]));
  const effective = input.effectivePageCount ?? effectivePageCount(input.documents);
  const band = unitCountBand(effective);

  const usableOf = (index: number): { documentId: string; page: number }[] => {
    const topic = input.topics[index]!;
    const pages = usable.get(topic.documentId);
    // Belge ölçülmediyse (sayfa bilgisi okunamadı) konunun bütün sayfaları öğretilebilir sayılır.
    if (!pages) return [...new Set(topic.pages)].map((page) => ({ documentId: topic.documentId, page }));
    return [...new Set(topic.pages)].filter((page) => pages.has(page)).map((page) => ({ documentId: topic.documentId, page }));
  };

  // 1) Gürültü konusu: bütün sayfaları öğretilmeyen sayfa. Hepsi gürültüyse (yalnız başlık slaytından deste) bırakılmaz.
  const noise = new Set(
    input.topics.map((_, index) => index).filter((index) => usableOf(index).length === 0 && docs.has(input.topics[index]!.documentId)),
  );
  if (noise.size === input.topics.length) noise.clear();

  // 2) Modelin üniteleri; üniteye girmeyen konu kendi ünitesi.
  const claimed = new Set<number>();
  let work: Work[] = [];
  for (const unit of input.units) {
    const members = [...new Set(unit.topics)].filter(
      (index) => index >= 0 && index < input.topics.length && !noise.has(index) && !claimed.has(index),
    );
    if (!members.length) continue;
    members.forEach((index) => claimed.add(index));
    work.push({
      title: unit.title.trim() || input.topics[members[0]!]!.title,
      items: members.map((index) => ({ title: input.topics[index]!.title, topic: index })),
      examWeight: members.reduce<Work["examWeight"]>(
        (max, index) => heavier(max, input.topics[index]!.examWeight ?? "medium"),
        unit.examWeight ?? "medium",
      ),
      stage: unit.stage ?? null,
      position: Math.min(...members),
    });
  }
  input.topics.forEach((topic, index) => {
    if (claimed.has(index) || noise.has(index)) return;
    work.push({ title: topic.title, items: [{ title: topic.title, topic: index }], examWeight: topic.examWeight ?? "medium", stage: null, position: index });
  });
  work.sort((a, b) => a.position - b.position);

  const memberIndexes = (unit: Work) => unit.items.flatMap((item) => (item.topic == null ? [] : [item.topic]));
  const measure = (unit: Work) => {
    const seen = new Set<string>();
    let chars = 0;
    for (const index of memberIndexes(unit)) {
      for (const { documentId, page } of usableOf(index)) {
        const key = `${documentId}:${page}`;
        if (seen.has(key)) continue;
        seen.add(key);
        chars += docs.get(documentId)?.pageChars?.[page] ?? UNMEASURED_PAGE_CHARS;
      }
    }
    return { pages: seen.size, chars };
  };
  const size = (unit: Work) => {
    const measured = measure(unit);
    return Math.max(measured.chars, measured.pages);
  };
  const micro = (unit: Work) => {
    const measured = measure(unit);
    return measured.pages <= 1 && measured.chars < MICRO_UNIT_CHARS;
  };
  const docsOf = (unit: Work) => new Set(memberIndexes(unit).map((index) => input.topics[index]!.documentId));
  const pagesIn = (unit: Work, documentId: string) =>
    memberIndexes(unit)
      .filter((index) => input.topics[index]!.documentId === documentId)
      .flatMap((index) => [...input.topics[index]!.pages]);
  const vocabulary = (unit: Work) => stems([unit.title, ...unit.items.map((item) => item.title)].join(" "));
  const related = (a: Work, b: Work) => jaccard(vocabulary(a), vocabulary(b));
  /** Aynı belgenin yakın sayfaları (en çok 3 sayfa ara). */
  const sameRegion = (a: Work, b: Work) =>
    [...docsOf(a)].some((documentId) => {
      if (!docsOf(b).has(documentId)) return false;
      const left = pagesIn(a, documentId);
      const right = pagesIn(b, documentId);
      return left.some((page) => right.some((other) => Math.abs(page - other) <= 3));
    });

  /** `from` ünitesini `into` ünitesine katar: büyüğün adı kalır, küçüğün adı alt başlık olur, parçalar kurs sırasıyla. */
  const merge = (into: Work, from: Work): Work => {
    const keepInto = size(into) >= size(from);
    const host = keepInto ? into : from;
    const guest = keepInto ? from : into;
    const guestItems: Item[] = guest.items.some((item) => sameKey(item.title, guest.title)) || sameKey(guest.title, host.title)
      ? guest.items
      : [{ title: guest.title, topic: null }, ...guest.items];
    const first = into.position <= from.position ? into : from;
    const ordered = first === host ? [...host.items, ...guestItems] : [...guestItems, ...host.items];
    return {
      title: host.title,
      items: ordered,
      examWeight: heavier(into.examWeight, from.examWeight),
      stage: into.stage != null && from.stage != null ? (Math.min(into.stage, from.stage) as UnitStage) : null,
      position: Math.min(into.position, from.position),
    };
  };
  const replacePair = (left: number, right: number, merged: Work) => {
    work = work.filter((_, index) => index !== left && index !== right);
    work.push(merged);
    work.sort((a, b) => a.position - b.position);
  };

  // 3) Aynı tema (çoğunlukla farklı dosyalarda): ünite adları aynı, biri öbürünün konusu, ya da konuların yarısı ortak.
  const itemKeysOf = (unit: Work) => unit.items.map((item) => item.title);
  const sameTheme = (a: Work, b: Work) => {
    if (sameKey(a.title, b.title)) return true;
    if (itemKeysOf(a).some((title) => sameKey(title, b.title)) || itemKeysOf(b).some((title) => sameKey(title, a.title))) {
      return true;
    }
    const shared = itemKeysOf(a).filter((title) => itemKeysOf(b).some((other) => sameKey(title, other))).length;
    return shared >= 1 && shared / Math.min(a.items.length, b.items.length) >= 0.5;
  };
  for (let changed = true; changed; ) {
    changed = false;
    outer: for (let i = 0; i < work.length; i += 1) {
      for (let j = i + 1; j < work.length; j += 1) {
        if (!sameTheme(work[i]!, work[j]!)) continue;
        replacePair(i, j, merge(work[i]!, work[j]!));
        changed = true;
        break outer;
      }
    }
  }

  // 4) Aynı üst başlığın numaralı parçaları (bant tabanının altına inmeden).
  for (let changed = true; changed && work.length > band.min; ) {
    changed = false;
    outer: for (let i = 0; i < work.length; i += 1) {
      const key = partParentKey(work[i]!.title);
      if (!key) continue;
      for (let j = i + 1; j < work.length; j += 1) {
        if (partParentKey(work[j]!.title) !== key) continue;
        replacePair(i, j, merge(work[i]!, work[j]!));
        changed = true;
        break outer;
      }
    }
  }

  /** `unit`a en yakın ünite: sözcük örtüşmesi, kurs sırasında komşuluk, aynı belge bölgesi; eşitlikte öndeki. */
  const nearest = (index: number): number | null => {
    let best: { index: number; score: number } | null = null;
    for (let other = 0; other < work.length; other += 1) {
      if (other === index) continue;
      const score =
        related(work[index]!, work[other]!) * 2 +
        (Math.abs(other - index) === 1 ? 0.3 : 0) +
        (sameRegion(work[index]!, work[other]!) ? 0.4 : 0) -
        (other > index ? 0.01 : 0);
      if (!best || score > best.score) best = { index: other, score };
    }
    return best?.index ?? null;
  };

  // 5) Mikro ünite: tek kısa sayfa / slayt (< 600 karakter) kendi başına ders olmaz.
  for (let changed = true; changed && work.length > 1; ) {
    changed = false;
    const index = work.findIndex(micro);
    if (index < 0) break;
    const target = nearest(index);
    if (target == null) break;
    replacePair(Math.min(index, target), Math.max(index, target), merge(work[target]!, work[index]!));
    changed = true;
  }

  // 6) Tavanın üstü: en küçük ve en ilgili iki ünite birleşir (komşu ve aynı belge bölgesi önce).
  while (work.length > band.max) {
    const total = work.reduce((sum, unit) => sum + size(unit), 0) || 1;
    const average = total / work.length;
    let best: { left: number; right: number; cost: number } | null = null;
    for (let i = 0; i < work.length; i += 1) {
      for (let j = i + 1; j < work.length; j += 1) {
        const a = work[i]!;
        const b = work[j]!;
        const cost =
          (size(a) + size(b)) / average -
          1.5 * related(a, b) -
          (j === i + 1 ? 0.5 : 0) -
          (sameRegion(a, b) ? 0.5 : 0);
        if (!best || cost < best.cost - 1e-9) best = { left: i, right: j, cost };
      }
    }
    if (!best) break;
    replacePair(best.left, best.right, merge(work[best.left]!, work[best.right]!));
  }

  // 7) Tabanın altı: en büyük çok konulu ünite konularından ikiye bölünür (iki parça da mikro olmamalı). Ünite uydurulmaz.
  while (work.length < band.min) {
    const candidates = work
      .map((unit, index) => ({ unit, index }))
      .filter(({ unit }) => memberIndexes(unit).length >= 2)
      .sort((a, b) => size(b.unit) - size(a.unit));
    let split: { index: number; left: Work; right: Work } | null = null;
    for (const { unit, index } of candidates) {
      let best: { left: Work; right: Work; gap: number } | null = null;
      for (let cut = 1; cut < unit.items.length; cut += 1) {
        const leftItems = unit.items.slice(0, cut);
        const rightItems = unit.items.slice(cut);
        if (!leftItems.some((item) => item.topic != null) || !rightItems.some((item) => item.topic != null)) continue;
        const firstRight = rightItems.find((item) => item.topic != null)!;
        const left: Work = { ...unit, items: leftItems };
        const right: Work = {
          ...unit,
          title: rightItems[0]!.title,
          items: rightItems,
          position: firstRight.topic!,
        };
        if (micro(left) || micro(right)) continue;
        const gap = Math.abs(size(left) - size(right));
        if (!best || gap < best.gap) best = { left, right, gap };
      }
      if (best) {
        split = { index, left: best.left, right: best.right };
        break;
      }
    }
    if (!split) break;
    work = work.filter((_, index) => index !== split!.index);
    work.push(split.left, split.right);
    work.sort((a, b) => a.position - b.position);
  }

  // 8) Fotoğraf seti ya da çok belgeli kurs: öğrenme basamağına göre (kararlı). Basamağı eksik ünite varsa sıra kalır.
  const documentCount = new Set(work.flatMap((unit) => [...docsOf(unit)])).size;
  const photo = work.some((unit) => [...docsOf(unit)].some((documentId) => docs.get(documentId)?.kind === "photo"));
  const wantsStage = photo || documentCount > 1;
  const stageOrdered = wantsStage && work.length > 1 && work.every((unit) => unit.stage != null);
  if (stageOrdered) {
    work = work
      .map((unit, order) => ({ unit, order }))
      .sort((a, b) => a.unit.stage! - b.unit.stage! || a.order - b.order)
      .map(({ unit }) => unit);
  }

  const units = work.map((unit): MainUnit => {
    const subtopics: string[] = [];
    for (const item of unit.items) {
      const title = item.title.trim();
      if (title && !subtopics.some((have) => sameKey(have, title))) subtopics.push(title);
    }
    const refs = new Map<string, TopicSourceRef>();
    const pageSets = new Map<string, Set<number>>();
    for (const index of memberIndexes(unit)) {
      const topic = input.topics[index]!;
      const key = `${topic.documentId}:${topic.nodeId ?? ""}`;
      if (!refs.has(key)) {
        refs.set(key, { documentId: topic.documentId, fileName: topic.fileName, pages: [], nodeId: topic.nodeId });
      }
      addPages(pageSets, key, topic.pages);
    }
    const sourceRefs = [...refs.entries()].map(([key, ref]) => ({
      ...ref,
      pages: [...(pageSets.get(key) ?? [])].sort((a, b) => a - b),
    }));
    const members = memberIndexes(unit);
    return {
      title: unit.title,
      subtopics,
      sourceRefs,
      pages: [...new Set(sourceRefs.flatMap((ref) => ref.pages))].sort((a, b) => a - b),
      topicNodeIds: [...new Set(members.map((index) => input.topics[index]!.nodeId).filter((id): id is string => Boolean(id)))],
      topicIndexes: members,
      items: unit.items.map((item) => ({ title: item.title, topicIndex: item.topic })),
      examWeight: unit.examWeight,
      ...(unit.stage != null ? { stage: unit.stage } : {}),
    };
  });

  return {
    units,
    effectivePageCount: effective,
    band,
    droppedNoise: [...noise].sort((a, b) => a - b),
    stageOrdered,
  };
}

/**
 * İki ünite aynı tema mı (Faz 10; birleştirmenin ve sonradan materyal eklemenin ortak ölçüsü): adlar aynı, biri öbürünün
 * alt başlığı, ya da alt başlıklarının yarısı (en az biri) ortak.
 */
export function sameUnitTheme(
  left: { title: string; subtopics: readonly string[] },
  right: { title: string; subtopics: readonly string[] },
): boolean {
  if (sameKey(left.title, right.title)) return true;
  if (left.subtopics.some((title) => sameKey(title, right.title)) || right.subtopics.some((title) => sameKey(title, left.title))) {
    return true;
  }
  if (!left.subtopics.length || !right.subtopics.length) return false;
  const shared = left.subtopics.filter((title) => right.subtopics.some((other) => sameKey(title, other))).length;
  return shared >= 1 && shared / Math.min(left.subtopics.length, right.subtopics.length) >= 0.5;
}

/** Alt başlık listelerini birleştirir: sıra korunur, aynı başlık (eşleme anahtarıyla) bir kez. */
export function mergeSubtopics(existing: readonly string[], incoming: readonly string[]): string[] {
  const out: string[] = [];
  for (const title of [...existing, ...incoming]) {
    const trimmed = title.trim();
    if (trimmed && !out.some((have) => sameKey(have, trimmed) || have === trimmed)) out.push(trimmed);
  }
  return out;
}

/** Yaprak başına kaynakları birleştirir: aynı belge + düğüm çiftinin sayfaları birleşir, sıra korunur. */
export function mergeUnitSourceRefs(existing: readonly TopicSourceRef[], incoming: readonly TopicSourceRef[]): TopicSourceRef[] {
  const out: TopicSourceRef[] = [];
  for (const ref of [...existing, ...incoming]) {
    if (!ref.documentId) continue;
    const have = out.find((item) => item.documentId === ref.documentId && (item.nodeId ?? null) === (ref.nodeId ?? null));
    if (!have) {
      out.push({ ...ref, pages: [...new Set(ref.pages)].sort((a, b) => a - b) });
      continue;
    }
    have.pages = [...new Set([...have.pages, ...ref.pages])].sort((a, b) => a - b);
    if (!have.fileName && ref.fileName) have.fileName = ref.fileName;
  }
  return out;
}

/** Bir dersin kaynağı: belge başına sayfalar ve dersin alt başlıkları. */
export type UnitLessonGroup = {
  subtopics: string[];
  sourceRefs: { documentId: string; pages: number[] }[];
};

/** Ders gruplamasının girdisi: ünitenin parçaları (alt başlık + belge sayfaları) ünite sırasıyla. */
export type UnitLessonPart = {
  title: string;
  documentId: string;
  pages: readonly number[];
};

/**
 * Ünitenin dersleri (Faz 10): öğretilebilir sayfası `maxPages`'i (12) geçmeyen ünite tek derstir; geçen ünite alt
 * başlık gruplarına göre ardışık derslere bölünür (her ders en çok `maxPages` öğretilebilir sayfa). Tek başına sınırı
 * geçen alt başlık kendi sayfalarında ardışık parçalara bölünür. Başlığı olup sayfası olmayan parça (birleşen ünitenin
 * adı) sonraki parçanın dersine girer. Hiçbir sayfa düşmez.
 */
export function unitLessonGroups(
  parts: readonly UnitLessonPart[],
  usablePages: (documentId: string) => ReadonlySet<number> | null,
  maxPages: number = UNIT_LESSON_MAX_PAGES,
): UnitLessonGroup[] {
  const usableCount = (documentId: string, pages: readonly number[]) => {
    const set = usablePages(documentId);
    return set ? pages.filter((page) => set.has(page)).length : pages.length;
  };
  type Draft = { subtopics: string[]; refs: Map<string, Set<number>>; usable: number };
  const groups: Draft[] = [];
  const open = (): Draft => {
    const draft: Draft = { subtopics: [], refs: new Map(), usable: 0 };
    groups.push(draft);
    return draft;
  };
  const addTitle = (draft: Draft, title: string) => {
    if (title.trim() && !draft.subtopics.includes(title.trim())) draft.subtopics.push(title.trim());
  };
  let current: Draft | null = null;
  let pendingTitles: string[] = [];
  for (const part of parts) {
    const pages = [...new Set(part.pages)].filter((page) => Number.isInteger(page) && page > 0).sort((a, b) => a - b);
    if (!pages.length) {
      pendingTitles.push(part.title);
      continue;
    }
    const count = usableCount(part.documentId, pages);
    const chunks: number[][] = [];
    if (count > maxPages) {
      const set = usablePages(part.documentId);
      let chunk: number[] = [];
      let used = 0;
      for (const page of pages) {
        const counts = !set || set.has(page);
        if (counts && used >= maxPages) {
          chunks.push(chunk);
          chunk = [];
          used = 0;
        }
        chunk.push(page);
        if (counts) used += 1;
      }
      if (chunk.length) chunks.push(chunk);
    } else {
      chunks.push(pages);
    }
    for (const chunk of chunks) {
      const chunkUsable = usableCount(part.documentId, chunk);
      if (!current || (current.usable > 0 && current.usable + chunkUsable > maxPages)) current = open();
      for (const title of pendingTitles) addTitle(current, title);
      pendingTitles = [];
      addTitle(current, part.title);
      addPages(current.refs, part.documentId, chunk);
      current.usable += chunkUsable;
    }
  }
  if (pendingTitles.length) {
    const target = current ?? open();
    for (const title of pendingTitles) addTitle(target, title);
  }
  return groups.map((draft) => ({
    subtopics: draft.subtopics,
    sourceRefs: [...draft.refs.entries()].map(([documentId, pages]) => ({
      documentId,
      pages: [...pages].sort((a, b) => a - b),
    })),
  }));
}

/**
 * Oturumun ana kaynağı: en çok sayfası olan belge (eşitlikte ilk). Takvim oturumun `sourcePages`'ini ve düğüm açılışı
 * öğretmen motorunun çekirdek belgesini aynı kuraldan seçer; öbür belgelerin sayfaları yardımcı kaynak olur.
 */
export function mainSessionSource<T extends { documentId: string; pages: readonly number[] }>(
  refs: readonly T[] | null | undefined,
): T | null {
  let best: T | null = null;
  for (const ref of refs ?? []) {
    if (!ref.documentId || !ref.pages.length) continue;
    if (!best || ref.pages.length > best.pages.length) best = ref;
  }
  return best;
}
