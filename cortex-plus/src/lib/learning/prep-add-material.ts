import {
  type MergedTopic,
  type TopicSourceRef,
  topicMatchKey,
} from "@/lib/learning/topic-merge";
import { orderTopicsForPath } from "@/lib/learning/topic-order";
import {
  type TopicContradiction,
  formatContradictions,
} from "@/lib/learning/source-contradictions";
import {
  MAX_MAIN_UNITS,
  UNIT_LESSON_MAX_PAGES,
  mergeSubtopics,
  mergeUnitSourceRefs,
  sameUnitTheme,
  unitRelatedness,
} from "@/lib/learning/topic-consolidation";
import { unitSourcesOf, type ScheduleLessonGroup } from "@/lib/learning/exam-schedule-v2";

/**
 * Var olan hazırlığa yeni dosya ekleme.
 *
 * Bitmiş düğüm, deneme, puan ve hazırlık skoru silinmez ve sıfırlanmaz.
 * Eski dosyalar yeniden analiz edilmez. Yeni konu yola eklenir; aynı konu
 * yeni kaynağı alır.
 *
 * Ana ünite modeli (Faz 10, 20 Kasım 2026): yeni belgenin üniteleri var olan ünitelerle adından ya da alt başlık
 * örtüşmesinden eşlenir; eşleşen ünite yeni alt başlıkları ve kaynakları alır (küçük bir ünite açılmaz), eşleşmeyen
 * ünite önkoşul yerine yeni ünite olarak girer. Eski hazırlık (alt başlıksız) bugünkü kuralla.
 *
 * Ünite tavanı (Faz 10): hazırlıkta en çok `MAX_MAIN_UNITS` (15) ana ünite. Tavanı aşacak yeni ünite açılmaz, en ilgili
 * üniteye (sözcük örtüşmesi; örtüşme yoksa yolun son ünitesine) katılır. Katılan içerik ünitenin açık son dersine ancak
 * o dersin kaynağı `UNIT_LESSON_MAX_PAGES` (12) sayfayı geçmeyecekse eklenir; geçecekse ya da ünitenin bütün dersleri
 * bitmişse ünitenin son dersinden (ve son bitmiş adımından) sonra yeni ders adımları açılır. Hiçbir sayfa düşmez.
 */

export type ExistingPrepTopic = {
  id: string;
  label: string;
  sortOrder: number;
  status: string;
  sourceRefs: TopicSourceRef[];
  /** Ana ünitenin alt başlıkları (Faz 10); eski satırda yok. */
  subtopics?: string[];
};

export type ExistingPrepNode = {
  id: string;
  title: string;
  sortOrder: number;
  status: string;
  kind: string;
  dayIndex: number;
  /** Düğümün ana ünitesinin satır kimliği (Faz 10; çağıran düğümün konu kimliğinden ya da adından çözer). */
  topicId?: string | null;
  /** Ders düğümünün belge sayfası sayısı (`session_meta.unitSources`); yoksa yeni kaynak bu derse eklenmez. */
  lessonPages?: number | null;
};

/** Gelen konu; ana ünite modelinde alt başlıkları ve dersleriyle. */
export type IncomingPrepTopic = MergedTopic & {
  subtopics?: string[];
  lessonGroups?: ScheduleLessonGroup[];
};

export type AddMaterialPlan = {
  sourceDocumentIds: string[];
  topicUpdates: {
    id: string;
    sourceRefs: TopicSourceRef[];
    contradictions: TopicContradiction[];
    warning: string;
    /** Ana ünite (Faz 10): ünitenin birleşmiş alt başlıkları ve bu eklemenin getirdiği kaynaklar. */
    subtopics?: string[];
    /** Ünitenin açık son dersine eklenecek kaynak ve alt başlıklar (yalnız o derse sığanlar). */
    addedSources?: TopicSourceRef[];
    refreshSubtopics?: string[];
  }[];
  topicInserts: {
    label: string;
    sortOrder: number;
    sourceRefs: TopicSourceRef[];
    contradictions: TopicContradiction[];
    warning: string;
    status: "ready";
    subtopics?: string[];
  }[];
  topicSortUpdates: { id: string; sortOrder: number }[];
  nodeInserts: {
    title: string;
    kind: "lesson";
    sortOrder: number;
    dayIndex: number;
    status: "locked" | "ready";
    topicTitle: string;
    /** Var olan ünitenin yeni dersi (Faz 10): ünitenin satır kimliği. Yeni ünitede çağıran eklemeden sonra çözer. */
    topicId?: string;
    /** Ana ünite dersinin alanları (Faz 10; `session_meta`). */
    lessonSubtopics?: string[];
    unitSources?: { documentId: string; pages: number[] }[];
    lessonPart?: number;
    lessonParts?: number;
  }[];
  nodeSortUpdates: { id: string; sortOrder: number }[];
  keptTopicStatuses: { id: string; status: string }[];
  keptNodeStatuses: { id: string; status: string }[];
  readinessScore: number;
};

function dedupeSources(sources: TopicSourceRef[]): TopicSourceRef[] {
  const out: TopicSourceRef[] = [];
  for (const source of sources) {
    const have = out.find((item) => item.documentId && item.documentId === source.documentId);
    if (!have) {
      out.push({ ...source, pages: [...source.pages] });
      continue;
    }
    const pages = new Set([...have.pages, ...source.pages]);
    have.pages = [...pages].sort((a, b) => a - b);
    if (!have.fileName && source.fileName) have.fileName = source.fileName;
    if (!have.nodeId && source.nodeId) have.nodeId = source.nodeId;
  }
  return out;
}

function placeIncoming(
  existing: ExistingPrepTopic[],
  incoming: IncomingPrepTopic[],
): { label: string; sortOrder: number; id: string | null }[] {
  const placed = existing.map((topic) => ({
    id: topic.id as string | null,
    label: topic.label,
    sortOrder: topic.sortOrder,
    subtopics: topic.subtopics ?? [],
  }));
  const ordered = orderTopicsForPath(incoming, { manualOrder: false });
  for (const topic of ordered) {
    let after = -1;
    for (const prereq of topic.prerequisites) {
      const key = topicMatchKey(prereq);
      // Ana ünitede (Faz 10) önkoşul bir alt başlığın adı olabilir: o alt başlığın ünitesinin ardına.
      const hit = placed.find(
        (row) => topicMatchKey(row.label) === key || row.subtopics.some((title) => topicMatchKey(title) === key),
      );
      if (hit && hit.sortOrder > after) after = hit.sortOrder;
    }
    const at =
      after < 0 ? placed.reduce((max, row) => Math.max(max, row.sortOrder), -1) + 1 : after + 1;
    for (const row of placed) {
      if (row.sortOrder >= at) row.sortOrder += 1;
    }
    placed.push({ id: null, label: topic.title, sortOrder: at, subtopics: topic.subtopics ?? [] });
  }
  return placed;
}

function pageCount(sources: readonly { pages: readonly number[] }[]): number {
  return sources.reduce((sum, source) => sum + new Set(source.pages).size, 0);
}

/** Ünitenin bütün dersleri grup olarak (tek dersli ünitede tek grup); birleştirmede iki ünitenin dersleri uç uca. */
function lessonGroupsOf(topic: IncomingPrepTopic): ScheduleLessonGroup[] {
  const groups = (topic.lessonGroups ?? []).filter((group) => group.sourceRefs.some((ref) => ref.pages.length));
  if (groups.length) {
    return groups.map((group) => ({
      subtopics: [...group.subtopics],
      sourceRefs: group.sourceRefs.map((ref) => ({ ...ref, pages: [...ref.pages] })),
    }));
  }
  const subtopics = topic.subtopics?.length ? [...topic.subtopics] : [topic.title];
  return [{ subtopics, sourceRefs: unitSourcesOf({ sourceRefs: topic.sources }) }];
}

/** Tavanı aşan yeni üniteyi (`guest`) aynı eklemenin yeni ünitesine (`host`) katar: ad host'un, guest alt başlık olur. */
function absorbIncoming(host: IncomingPrepTopic, guest: IncomingPrepTopic): IncomingPrepTopic {
  const ownTitle = topicMatchKey(guest.title) === topicMatchKey(host.title) ? [] : [guest.title];
  return {
    ...host,
    pages: [...new Set([...host.pages, ...guest.pages])].sort((a, b) => a - b),
    sources: mergeUnitSourceRefs(host.sources, guest.sources),
    prerequisites: [...new Set([...host.prerequisites, ...guest.prerequisites])],
    nodeIds: [...new Set([...host.nodeIds, ...guest.nodeIds])],
    subtopics: mergeSubtopics(host.subtopics ?? [], [...ownTitle, ...(guest.subtopics ?? [])]),
    lessonGroups: [...lessonGroupsOf(host), ...lessonGroupsOf(guest)],
  };
}

/** Ana ünitenin dersleri: alt başlık grupları (iki ya da daha çok) ya da ünitenin tek dersi. */
function unitLessons(topic: IncomingPrepTopic): { subtopics: string[]; sources: { documentId: string; pages: number[] }[] }[] {
  const groups = (topic.lessonGroups ?? []).filter((group) => group.sourceRefs.some((ref) => ref.pages.length));
  if (groups.length > 1) return groups.map((group) => ({ subtopics: [...group.subtopics], sources: group.sourceRefs }));
  return [{ subtopics: [...(topic.subtopics ?? [])], sources: unitSourcesOf({ sourceRefs: topic.sources }) }];
}

export function planAddedMaterial(input: {
  existingTopics: ExistingPrepTopic[];
  existingNodes: ExistingPrepNode[];
  incoming: IncomingPrepTopic[];
  existingDocumentIds: string[];
  newDocumentId?: string;
  /** Toplu ekleme (31 Ekim 2026): sonradan seçilen bütün dosyalar tek planda, seçim sırasıyla. */
  newDocumentIds?: string[];
  contradictionsByTitle: Map<string, TopicContradiction[]>;
  readinessScore: number;
  /** Ana ünite modelli hazırlık (Faz 10). Verilmezse eski kural. */
  units?: boolean;
}): AddMaterialPlan {
  const sourceDocumentIds = [...input.existingDocumentIds];
  for (const id of [...(input.newDocumentId ? [input.newDocumentId] : []), ...(input.newDocumentIds ?? [])]) {
    if (id && !sourceDocumentIds.includes(id)) sourceDocumentIds.push(id);
  }

  const byKey = new Map(
    input.existingTopics.map((topic) => [topicMatchKey(topic.label), topic]),
  );
  const fresh: IncomingPrepTopic[] = [];
  const topicUpdates: AddMaterialPlan["topicUpdates"] = [];
  /** Aynı eklemede iki ünite aynı var olan üniteye katılırsa ikinci güncelleme birincinin üstüne kurulur. */
  const updated = new Map<string, AddMaterialPlan["topicUpdates"][number]>();
  /** Var olan ünitenin yeni dersleri: açık son dersine sığmayan (ya da bütün dersleri bitmiş ünitenin) içerik. */
  const extraLessons = new Map<string, ScheduleLessonGroup[]>();
  /** Bu eklemede ünitenin açık son dersine giden sayfa: iki ekleme o dersin sınırını birlikte aşmasın. */
  const refreshPages = new Map<string, number>();
  /** Tavan yüzünden bu eklemenin yeni ünitesine katılan ünitelerin çelişki notları (ünitenin adıyla). */
  const absorbedContradictions = new Map<string, TopicContradiction[]>();
  // Ünite tavanı (Faz 10): hazırlıkta en çok MAX_MAIN_UNITS ana ünite.
  const capacity = input.units ? Math.max(0, MAX_MAIN_UNITS - input.existingTopics.length) : Number.POSITIVE_INFINITY;
  const unitLessonNodes = (topicId: string) =>
    input.existingNodes
      .filter((node) => node.kind === "lesson" && node.topicId === topicId)
      .sort((a, b) => a.sortOrder - b.sortOrder);
  const subtopicsOf = (topic: ExistingPrepTopic) => updated.get(topic.id)?.subtopics ?? topic.subtopics ?? [];

  const mergeIntoExisting = (topic: IncomingPrepTopic, have: ExistingPrepTopic, contradictions: TopicContradiction[]) => {
    const previous = updated.get(have.id);
    const baseRefs = previous?.sourceRefs ?? have.sourceRefs;
    const ownTitle = topicMatchKey(topic.title) === topicMatchKey(have.label) ? [] : [topic.title];
    const added = [...ownTitle, ...(topic.subtopics ?? [])];
    const groups = lessonGroupsOf(topic);
    const lastOpen = [...unitLessonNodes(have.id)].reverse().find((node) => node.status !== "done");
    const pending = refreshPages.get(have.id) ?? 0;
    const addedPages = pageCount(groups.flatMap((group) => group.sourceRefs));
    // Açık son derse yalnız tek dersi olan ve o dersin sınırını aşmayan içerik eklenir; bu eklemede ünitenin yeni dersi
    // açıldıysa sonraki içerik de onların arkasına (sıra bozulmasın).
    const fits =
      !extraLessons.has(have.id) &&
      groups.length === 1 &&
      lastOpen != null &&
      typeof lastOpen.lessonPages === "number" &&
      lastOpen.lessonPages + pending + addedPages <= UNIT_LESSON_MAX_PAGES;
    if (fits) refreshPages.set(have.id, pending + addedPages);
    else extraLessons.set(have.id, [...(extraLessons.get(have.id) ?? []), ...groups]);
    const refreshSources = [
      ...(previous?.addedSources ?? []),
      ...(fits ? topic.sources.map((source) => ({ ...source, pages: [...source.pages] })) : []),
    ];
    const allContradictions = [...(previous?.contradictions ?? []), ...contradictions];
    const entry: AddMaterialPlan["topicUpdates"][number] = {
      id: have.id,
      sourceRefs: mergeUnitSourceRefs(baseRefs, topic.sources),
      contradictions: allContradictions,
      warning: formatContradictions(allContradictions),
      subtopics: mergeSubtopics(subtopicsOf(have), added),
      ...(refreshSources.length
        ? { addedSources: refreshSources, refreshSubtopics: mergeSubtopics(previous?.refreshSubtopics ?? [], fits ? added : []) }
        : {}),
    };
    if (!previous) topicUpdates.push(entry);
    else topicUpdates.splice(topicUpdates.indexOf(previous), 1, entry);
    updated.set(have.id, entry);
  };

  /** Tavanı aşan ünitenin yeri: sözcük örtüşmesi en yüksek ünite; eşitlikte (örtüşme yoksa da) yolun sonuna yakın olan. */
  const closestUnit = (topic: IncomingPrepTopic): { fresh: number } | { existing: ExistingPrepTopic } | null => {
    const subject = { title: topic.title, subtopics: topic.subtopics ?? [] };
    let best: { score: number; pick: { fresh: number } | { existing: ExistingPrepTopic } } | null = null;
    for (const existing of [...input.existingTopics].sort((a, b) => a.sortOrder - b.sortOrder)) {
      const score = unitRelatedness(subject, { title: existing.label, subtopics: subtopicsOf(existing) });
      if (!best || score >= best.score) best = { score, pick: { existing } };
    }
    fresh.forEach((unit, index) => {
      const score = unitRelatedness(subject, { title: unit.title, subtopics: unit.subtopics ?? [] });
      if (!best || score >= best.score) best = { score, pick: { fresh: index } };
    });
    return best?.pick ?? null;
  };

  for (const topic of input.incoming) {
    const contradictions = input.contradictionsByTitle.get(topic.title) ?? [];
    if (input.units) {
      const incomingSubtopics = topic.subtopics ?? [];
      const have = input.existingTopics.find((existing) =>
        sameUnitTheme(
          { title: topic.title, subtopics: incomingSubtopics },
          { title: existing.label, subtopics: subtopicsOf(existing) },
        ),
      );
      if (have) {
        mergeIntoExisting(topic, have, contradictions);
        continue;
      }
      if (fresh.length < capacity) {
        fresh.push(topic);
        continue;
      }
      const target = closestUnit(topic);
      if (target && "fresh" in target) {
        const host = fresh[target.fresh]!;
        absorbedContradictions.set(host.title, [...(absorbedContradictions.get(host.title) ?? []), ...contradictions]);
        fresh[target.fresh] = absorbIncoming(host, topic);
      } else if (target) mergeIntoExisting(topic, target.existing, contradictions);
      else fresh.push(topic);
      continue;
    }
    const have = byKey.get(topicMatchKey(topic.title));
    if (!have) {
      fresh.push(topic);
      continue;
    }
    topicUpdates.push({
      id: have.id,
      sourceRefs: dedupeSources([...have.sourceRefs, ...topic.sources]),
      contradictions,
      warning: formatContradictions(contradictions),
    });
  }

  const placed = placeIncoming(input.existingTopics, fresh);
  const sortById = new Map(
    placed.filter((row) => row.id).map((row) => [row.id as string, row.sortOrder]),
  );
  const topicSortUpdates = input.existingTopics
    .filter((topic) => sortById.get(topic.id) !== topic.sortOrder)
    .map((topic) => ({ id: topic.id, sortOrder: sortById.get(topic.id) ?? topic.sortOrder }));

  const topicInserts: AddMaterialPlan["topicInserts"] = fresh.map((topic) => {
    const row = placed.find((item) => item.id == null && item.label === topic.title);
    const contradictions = [
      ...(input.contradictionsByTitle.get(topic.title) ?? []),
      ...(absorbedContradictions.get(topic.title) ?? []),
    ];
    return {
      label: topic.title,
      sortOrder: row?.sortOrder ?? placed.length,
      // Ana ünitede kaynak yaprak başına kalır (ünitenin dersleri alt başlık gruplarından kurulur).
      sourceRefs: input.units ? mergeUnitSourceRefs([], topic.sources) : dedupeSources(topic.sources),
      contradictions,
      warning: formatContradictions(contradictions),
      status: "ready" as const,
      ...(input.units && topic.subtopics?.length ? { subtopics: [...topic.subtopics] } : {}),
    };
  });

  const allDone =
    input.existingNodes.length > 0 &&
    input.existingNodes.every((node) => node.status === "done");
  const dayIndex = input.existingNodes.reduce((max, node) => Math.max(max, node.dayIndex), 0);
  type VirtualNode = {
    id: string | null;
    title: string;
    sortOrder: number;
    fresh: boolean;
    topicTitle: string;
    topicId?: string | null;
    kind?: string;
    done?: boolean;
    lesson?: { subtopics: string[]; sources: { documentId: string; pages: number[] }[]; part: number; parts: number };
  };
  const virtual: VirtualNode[] = input.existingNodes.map((node) => ({
    id: node.id as string | null,
    title: node.title,
    sortOrder: node.sortOrder,
    fresh: false,
    topicTitle: node.title,
    topicId: node.topicId ?? null,
    kind: node.kind,
    done: node.status === "done",
  }));
  const orderedFresh = orderTopicsForPath(fresh, { manualOrder: false });
  let readyGiven = false;
  for (const topic of orderedFresh) {
    let after = -1;
    for (const prereq of topic.prerequisites) {
      const key = topicMatchKey(prereq);
      for (const node of virtual) {
        if (topicMatchKey(node.title) === key && node.sortOrder > after) after = node.sortOrder;
      }
    }
    const at =
      after < 0
        ? virtual.reduce((max, node) => Math.max(max, node.sortOrder), -1) + 1
        : after + 1;
    // Ana ünite 12 öğretilebilir sayfayı aşıyorsa dersleri ardışık (alt başlık grupları); eski konu tek ders.
    const lessons = input.units && topic.subtopics?.length ? unitLessons(topic) : [null];
    for (const node of virtual) {
      if (node.sortOrder >= at) node.sortOrder += lessons.length;
    }
    lessons.forEach((lesson, index) => {
      virtual.push({
        id: null,
        title: lesson && lessons.length > 1 ? `${topic.title} · Ders ${index + 1}/${lessons.length}` : topic.title,
        sortOrder: at + index,
        fresh: true,
        topicTitle: topic.title,
        ...(lesson ? { lesson: { ...lesson, part: index + 1, parts: lessons.length } } : {}),
      });
    });
  }
  // Var olan ünitenin yeni dersleri: ünitenin son dersinden ve son bitmiş adımından sonra (bitmemiş testi, kartları
  // yeni içeriğin arkasında kalır); ünitenin hiç adımı yoksa yolun sonunda.
  for (const [unitId, groups] of extraLessons) {
    const unit = input.existingTopics.find((topic) => topic.id === unitId);
    if (!unit || !groups.length) continue;
    const anchors = virtual
      .filter((node) => !node.fresh && node.topicId === unitId && (node.kind === "lesson" || node.done))
      .map((node) => node.sortOrder);
    const at = anchors.length
      ? Math.max(...anchors) + 1
      : virtual.reduce((max, node) => Math.max(max, node.sortOrder), -1) + 1;
    for (const node of virtual) {
      if (node.sortOrder >= at) node.sortOrder += groups.length;
    }
    const before = unitLessonNodes(unitId).length;
    const parts = before + groups.length;
    groups.forEach((group, index) => {
      const part = before + index + 1;
      const named = group.subtopics.map((title) => title.trim()).filter(Boolean).slice(0, 2).join(" · ");
      virtual.push({
        id: null,
        title: `${unit.label} · Ders ${part}${named ? `: ${named}` : ""}`.slice(0, 200),
        sortOrder: at + index,
        fresh: true,
        topicTitle: unit.label,
        topicId: unitId,
        lesson: {
          subtopics: [...group.subtopics],
          sources: group.sourceRefs.map((ref) => ({ documentId: ref.documentId, pages: [...ref.pages] })),
          part,
          parts,
        },
      });
    });
  }
  // Yol boşsa ya da bitmişse yolda en öndeki yeni ders açık başlar.
  const firstFresh = virtual
    .filter((node) => node.fresh)
    .reduce<VirtualNode | null>((first, node) => (!first || node.sortOrder < first.sortOrder ? node : first), null);
  const nodeSortUpdates = input.existingNodes.flatMap((node) => {
    const next = virtual.find((item) => item.id === node.id);
    if (!next || next.sortOrder === node.sortOrder) return [];
    return [{ id: node.id, sortOrder: next.sortOrder }];
  });
  const nodeInserts: AddMaterialPlan["nodeInserts"] = virtual
    .filter((node) => node.fresh)
    .map((node) => {
      const open = input.existingNodes.length === 0 || allDone;
      const status = open && !readyGiven && node === firstFresh ? "ready" : "locked";
      if (status === "ready") readyGiven = true;
      return {
        title: node.title,
        kind: "lesson" as const,
        sortOrder: node.sortOrder,
        dayIndex,
        status,
        topicTitle: node.topicTitle,
        ...(node.topicId ? { topicId: node.topicId } : {}),
        ...(node.lesson
          ? {
              ...(node.lesson.subtopics.length ? { lessonSubtopics: node.lesson.subtopics } : {}),
              ...(node.lesson.sources.length ? { unitSources: node.lesson.sources } : {}),
              ...(node.lesson.parts > 1 ? { lessonPart: node.lesson.part, lessonParts: node.lesson.parts } : {}),
            }
          : {}),
      };
    });

  return {
    sourceDocumentIds,
    topicUpdates,
    topicInserts,
    topicSortUpdates,
    nodeInserts,
    nodeSortUpdates,
    keptTopicStatuses: input.existingTopics.map((topic) => ({
      id: topic.id,
      status: topic.status,
    })),
    keptNodeStatuses: input.existingNodes.map((node) => ({
      id: node.id,
      status: node.status,
    })),
    readinessScore: input.readinessScore,
  };
}
