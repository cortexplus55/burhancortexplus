import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { schedulePriorityForTopic } from "@/lib/learning/exam-coverage";
import type {
  ScheduleBuildResult,
  ScheduleLessonGroup,
  ScheduleSession,
  ScheduleTopicInput,
} from "@/lib/learning/exam-schedule-v2";
import { missingColumn } from "@/lib/learning/missing-column";
import type { TopicSourceRef } from "@/lib/learning/topic-merge";
import type { MeasuredLevel } from "@/lib/learning/diagnostic";
import { examWeightToEmphasis, isHighExamWeight, unpackTopicPerspective } from "@/lib/documents/outline-topic-meta";
import { parseTopicSourceRefs, toTopicSourceRef } from "@/lib/learning/topic-source-refs";
import { consolidatePrepDocuments } from "@/lib/learning/consolidate-documents";
import {
  loadConsolidationDocuments,
  loadIntakeMainUnits,
  loadOneshotIntakeTopics,
  type IntakeMainTopic,
} from "@/lib/learning/intake-outline";
import { priorityFromImportance, priorityFromWeight } from "@/lib/learning/cross-material-topics";
import { orderTopicsForPath } from "@/lib/learning/topic-order";
import { parseTeacherAnalysis, type TeacherAnalysis } from "@/lib/learning/teacher-brain";
import { readScopeExclusionPhrases } from "@/lib/learning/scope-exclusion-read";
import { unitLessonGroups, type UnitLessonPart } from "@/lib/learning/topic-consolidation";
import { parseSubtopics } from "@/lib/learning/unit-topic-row";
import { parseUnitSources } from "@/lib/learning/teaching-standards";

export type PrepScheduleTopics = {
  titles: string[];
  nodeIds: (string | null)[];
  scheduleTopics: ScheduleTopicInput[];
  /**
   * Konular sihirbazın gösterdiği haritadan geldi: sıra öğretim sırasıdır, yeniden dizilmez.
   */
  fromOutline?: boolean;
  /** Ana ünite modeli (Faz 10): her konu bir ana ünite, ince konular `subtopics`. */
  mainUnits?: boolean;
};

/**
 * Ana ünitelerin takvim girdisi (Faz 10). Sıra birleştirmenin sırasıdır (belge sırası ya da öğrenme basamağı); kimlik
 * ünitenin ilk yaprağı (eski konu satırı gibi `document_topic_node_id`). Ünite 12 öğretilebilir sayfayı aşıyorsa
 * `lessonGroups` ardışık dersleri taşır.
 */
function mainUnitScheduleTopics(
  topics: readonly IntakeMainTopic[],
  hardSet: ReadonlySet<string>,
  groups: { documentId: string; analysis: TeacherAnalysis }[],
): PrepScheduleTopics {
  const scheduleTopics: ScheduleTopicInput[] = topics.map((topic) => ({
    id: topic.nodeIds[0] ?? topic.title,
    title: topic.title,
    objective: topic.subtopics.join(" · ") || null,
    prerequisites: topic.prerequisites,
    pageNumbers: topic.pages,
    measuredLevel: "unknown",
    selfHard: [topic.title, ...topic.subtopics].some((title) => hardSet.has(fold(title))),
    priority:
      priorityFromWeight(topic) ??
      priorityFromImportance(topic.importance) ??
      schedulePriorityForTopic(groups, topic.title),
    weightPercent: topic.weightPercent,
    examHeavy: topic.examHeavy,
    importance: topic.importance,
    sourceRefs: topic.sources,
    subtopics: [...topic.subtopics],
    ...(topic.lessonGroups.length > 1 ? { lessonGroups: topic.lessonGroups.map((group) => ({ ...group })) } : {}),
  }));
  return {
    titles: topics.map((topic) => topic.title),
    nodeIds: topics.map((topic) => topic.nodeIds[0] ?? null),
    scheduleTopics,
    fromOutline: true,
    mainUnits: true,
  };
}

/**
 * Hazırlıktaki bütün belgelerin konularını tek listeye indirir.
 *
 * Müfredat varsa pay ve "sınavda ağırlıklı" işareti süreye ve sıraya girer.
 * Model burada çağrılmaz: konu listesini öğrenci sihirbazda gördüğü
 * deterministik birleştirmeyle eşleriz, ikinci bir kredi harcanmaz.
 */
export async function loadScheduleTopics(
  service: SupabaseClient,
  documentIds: string[],
  hardTopics: string[],
  /**
   * Zorunlu (31 Ekim 2026): varsayılan boş kimlikle "Materyal ekle" 27 Eylül'den beri hep düşüyordu — belge sorgusu
   * kullanıcıya göre süzülüyor (#134), boş kimlik hiçbir belge bulamayıp `documents_unavailable` fırlatıyordu.
   */
  userId: string,
  /**
   * Ana ünite modeli (Faz 10): yeni hazırlığın kurulumu ve ünite modelli hazırlığa materyal ekleme. Verilmezse (eski
   * hazırlığa ekleme) ince konular bugünkü gibi ayrı konu.
   */
  options: {
    mainUnits?: boolean;
    /** İnce konu süzgeci, ünite kurulmadan önce (sonradan eklenen büyük belgenin baş sayfaları). */
    keepLeaf?: (leaf: { sources: TopicSourceRef[] }) => boolean;
  } = {},
): Promise<PrepScheduleTopics> {
  const hardSet = new Set(hardTopics.map((topic) => topic.trim().toLocaleLowerCase("tr")));
  const groups: { documentId: string; analysis: TeacherAnalysis }[] = [];
  const { data: analyses, error: analysisError } = await service
    .from("document_teacher_analyses")
    .select("document_id, status, analysis")
    .in("document_id", documentIds);
  if (!analysisError) {
    for (const row of analyses ?? []) {
      if (row.status !== "ready") continue;
      const analysis = parseTeacherAnalysis(row.analysis);
      if (!analysis) continue;
      groups.push({ documentId: row.document_id as string, analysis });
    }
  }

  // Ana ünite modeli (Faz 10): sihirbazın gösterdiği üniteler aynı işlevden; belgenin kapsam dışı dediği ince konu
  // üniteye girmez. Harita hazır değilse (eski / düz harita) aşağıdaki eski yol.
  if (options.mainUnits && userId) {
    const phrases = await readScopeExclusionPhrases(service, documentIds).catch(() => [] as string[]);
    const main = await loadIntakeMainUnits(service, userId, documentIds, {
      exclusionPhrases: phrases,
      ...(options.keepLeaf ? { keepLeaf: options.keepLeaf } : {}),
    }).catch(() => null);
    if (main) return mainUnitScheduleTopics(main.topics, hardSet, groups);
  }

  // Sihirbaz konuları kurs haritasından gösteriyor (intake: loadOneshotIntakeTopics, "model sırası
  // esas"). Kurulum aynı haritayı okur. 19 Ekim 2026'ya kadar burada eski birleştirme çalışıyordu:
  // 7 dosyalık AYT Biyoloji setinde 29 konunun 9'u sayfasız kaldı ("Sinir Dokusu, Nöron Yapısı"
  // s.1–4 yerine hiç), "İnce Bağırsakta Sindirim" nefron sayfalarını (61–62) aldı ve yol
  // öğrencinin onayladığı sıradan başka bir sırayla kuruldu.
  const outline = userId ? await loadOneshotIntakeTopics(service, userId, documentIds).catch(() => null) : null;
  const consolidated = outline
    ? { topics: outline.topics }
    : await consolidatePrepDocuments(service, userId, documentIds, {
        allowModel: false,
      });
  const weighted = consolidated.topics.map((topic) => ({
    ...topic,
    priority:
      priorityFromWeight(topic) ??
      priorityFromImportance(topic.importance) ??
      schedulePriorityForTopic(groups, topic.title),
  }));
  const ordered = orderTopicsForPath(weighted, { manualOrder: Boolean(outline) });
  const titles = ordered.map((topic) => topic.title);
  const nodeIds = ordered.map((topic) => topic.nodeIds[0] ?? null);

  // Kavram birimleri (2 Ekim 2026): tek düğümlü konuda haritanın birimleri
  // ders ders plana gider. Birleşmiş (çok belgeli) konuda sayfa kümesi
  // değiştiği için mekanik bölmede kalınır.
  const singleNodeIds = ordered.filter((topic) => topic.nodeIds.length === 1).map((topic) => topic.nodeIds[0]!);
  const nodes = await loadTopicNodeExtras(service, singleNodeIds);
  const unitsFor = (topic: (typeof ordered)[number]) =>
    topic.nodeIds.length === 1 ? unitsWithin(nodes.get(topic.nodeIds[0]!)?.units, topic.pages) : undefined;
  const scheduleTopics: ScheduleTopicInput[] = ordered.map((topic) => ({
    id: topic.nodeIds[0] ?? topic.title,
    title: topic.title,
    objective:
      topic.sections
        .map((section) => section.title)
        .filter(Boolean)
        .join(" · ") || topic.summary || null,
    prerequisites: topic.prerequisites,
    pageNumbers: topic.pages,
    measuredLevel: "unknown",
    selfHard: hardSet.has(topic.title.trim().toLocaleLowerCase("tr")),
    priority: topic.priority,
    weightPercent: topic.weightPercent,
    examHeavy: topic.examHeavy,
    importance: topic.importance,
    sourceRefs: topic.sources,
    units: unitsFor(topic),
  }));

  return { titles, nodeIds, scheduleTopics, fromOutline: Boolean(outline) };
}

type ConceptUnits = { title: string; pages: number[] }[];

type TopicNodeExtras = {
  units: ConceptUnits | undefined;
  examHeavy: boolean;
  importance: "important" | "medium" | "less";
  prerequisites: string[];
};

/** Harita düğümlerinin kavram birimleri ve öğretmen bakışı (sınav ağırlığı, ön koşullar). */
async function loadTopicNodeExtras(service: SupabaseClient, nodeIds: string[]): Promise<Map<string, TopicNodeExtras>> {
  const out = new Map<string, TopicNodeExtras>();
  if (!nodeIds.length) return out;
  const { data, error } = await service
    .from("document_topic_nodes")
    .select("id, units, learning_objective, prerequisites, key_definitions, key_relations")
    .in("id", [...new Set(nodeIds)]);
  if (error) return out;
  for (const row of data ?? []) {
    const raw = Array.isArray(row.units) ? (row.units as { title?: unknown; pages?: unknown }[]) : [];
    const units = raw.flatMap((unit) =>
      typeof unit.title === "string" && Array.isArray(unit.pages)
        ? [{ title: unit.title, pages: unit.pages.filter((page): page is number => Number.isInteger(page)) }]
        : [],
    );
    const perspective = unpackTopicPerspective({
      learning_objective: row.learning_objective as string | null,
      prerequisites: row.prerequisites,
      key_definitions: row.key_definitions,
      key_relations: row.key_relations,
    });
    const emphasis = examWeightToEmphasis(perspective.examWeight);
    out.set(row.id as string, {
      units: units.length > 1 ? units : undefined,
      examHeavy: isHighExamWeight(perspective.examWeight),
      importance: emphasis === "core" ? "important" : emphasis === "skim" ? "less" : "medium",
      prerequisites: perspective.prerequisiteTitles,
    });
  }
  return out;
}

/** Birimler konunun sayfalarının içindeyse geçerli; değilse mekanik bölme. */
function unitsWithin(units: ConceptUnits | undefined, pages: number[]): ConceptUnits | undefined {
  if (!units) return undefined;
  const own = new Set(pages);
  return units.every((unit) => unit.pages.every((page) => own.has(page))) ? units : undefined;
}

const MEASURED: readonly MeasuredLevel[] = ["unknown", "weak", "emerging", "solid"];
const fold = (title: string) => title.trim().toLocaleLowerCase("tr");

/**
 * Var olan hazırlığın takvim konuları: yeniden planlamanın TEK kaynağı (sınav tarihi ya da ayarlar
 * değişince, gün kaçırılınca, uyarlamalı plan).
 *
 * 19 Ekim 2026'ya kadar dört yer konuları eski oturumlardan kendi kuruyordu: sayfalar, dosya etiketi
 * ("· AYT-Biyoloji s.5–6"), kavram birimleri ve sınav ağırlığı kayboluyor, çok dersli konu tek derse
 * iniyordu; yeniden kurulan yol da öğrencinin "zorlandığım" dediği konuları başa alıyordu. Kaçırılan
 * gün kendiliğinden tetiklendiği için doğru kurulmuş plan sessizce bozuluyordu.
 *
 * Sıra hazırlığın konu sırası (`exam_prep_topics.sort_order`). Kimlik eski oturumlarınkiyle eşlenir:
 * biten etkinlik böyle tanınır. Konu tablosunda karşılığı olmayan eski oturum konusu sona eklenir.
 */
export async function loadPrepScheduleTopics(
  service: SupabaseClient,
  input: { prepId: string; previous: ScheduleBuildResult | null; hardTopics: string[] },
): Promise<ScheduleTopicInput[]> {
  const hardSet = new Set(input.hardTopics.map(fold));
  const sessions = input.previous?.sessions ?? [];
  const sessionIds = new Set(sessions.map((session) => session.topicId));
  const sessionIdByTitle = new Map<string, string>();
  const sessionPages = new Map<string, number[]>();
  for (const session of sessions) {
    const key = fold(session.topicTitle);
    if (!sessionIdByTitle.has(key)) sessionIdByTitle.set(key, session.topicId);
    if (session.sourcePages?.length && !sessionPages.has(session.topicId)) {
      sessionPages.set(session.topicId, [...session.sourcePages]);
    }
  }

  // Ana ünite satırı (Faz 10) alt başlıklarıyla okunur; sütun yoksa (göç uygulanmadı) eski seçim.
  const select = "id, label, sort_order, document_topic_node_id, source_refs, measured_level";
  const rich = await service
    .from("exam_prep_topics")
    .select(`${select}, subtopics`)
    .eq("exam_prep_id", input.prepId)
    .order("sort_order");
  const rows = (
    rich.error && missingColumn(rich.error)
      ? (await service.from("exam_prep_topics").select(select).eq("exam_prep_id", input.prepId).order("sort_order")).data
      : rich.data
  ) as Record<string, unknown>[] | null;
  const nodeIds = (rows ?? [])
    .map((row) => row.document_topic_node_id)
    .filter((id): id is string => typeof id === "string");
  const extras = await loadTopicNodeExtras(service, nodeIds);
  const unitLessons = previousUnitLessons(sessions);

  const out: ScheduleTopicInput[] = [];
  const used = new Set<string>();
  for (const row of rows ?? []) {
    const title = String(row.label ?? "").trim();
    if (!title) continue;
    const nodeId = typeof row.document_topic_node_id === "string" ? row.document_topic_node_id : null;
    const rowId = row.id as string;
    const id =
      [nodeId, rowId].find((candidate): candidate is string => Boolean(candidate && sessionIds.has(candidate))) ??
      sessionIdByTitle.get(fold(title)) ??
      nodeId ??
      rowId;
    if (used.has(id)) continue;
    used.add(id);
    const refs = parseTopicSourceRefs(row.source_refs);
    const primary = refs.find((ref) => nodeId !== null && ref.nodeId === nodeId) ?? refs[0];
    const pages = primary?.pages.length ? primary.pages : (sessionPages.get(id) ?? []);
    const node = nodeId ? extras.get(nodeId) : undefined;
    const measured = MEASURED.includes(row.measured_level as MeasuredLevel)
      ? (row.measured_level as MeasuredLevel)
      : "unknown";
    // Ana ünite (Faz 10): alt başlıklar satırdan (göçten önce kurulduysa önceki ders oturumlarından); ünitenin bütün
    // sayfaları; dersler önceki takvimin grupları (kaynak değişmediyse) ya da yeniden hesaplanır. Kavram birimi yok.
    const previousUnit = unitLessons.get(id);
    const subtopics = parseSubtopics(row.subtopics).length ? parseSubtopics(row.subtopics) : (previousUnit?.subtopics ?? []);
    if (subtopics.length) {
      const unitPages = [...new Set(refs.flatMap((ref) => ref.pages))].sort((a, b) => a - b);
      const lessonGroups = await unitLessonGroupsForRow(service, refs, previousUnit?.groups ?? []);
      out.push({
        id,
        title,
        objective: subtopics.join(" · "),
        pageNumbers: unitPages.length ? unitPages : pages,
        sourceRefs: refs.map(toTopicSourceRef),
        measuredLevel: measured,
        selfHard: [title, ...subtopics].some((item) => hardSet.has(fold(item))),
        subtopics,
        ...(lessonGroups.length > 1 ? { lessonGroups } : {}),
        ...(node ? { examHeavy: node.examHeavy, importance: node.importance, prerequisites: node.prerequisites } : {}),
      });
      continue;
    }
    out.push({
      id,
      title,
      pageNumbers: pages,
      sourceRefs: refs.map(toTopicSourceRef),
      measuredLevel: measured,
      selfHard: hardSet.has(fold(title)),
      ...(node
        ? {
            examHeavy: node.examHeavy,
            importance: node.importance,
            prerequisites: node.prerequisites,
            units: unitsWithin(node.units, pages),
          }
        : {}),
    });
  }
  // Konu tablosunda karşılığı olmayan eski oturum konusu (eski hazırlık): oturum sırasıyla sona.
  for (const session of sessions) {
    if (used.has(session.topicId)) continue;
    used.add(session.topicId);
    out.push({
      id: session.topicId,
      title: session.topicTitle,
      pageNumbers: sessionPages.get(session.topicId) ?? [],
      selfHard: hardSet.has(fold(session.topicTitle)),
    });
  }
  return out;
}

type UnitLessonRecord = { subtopics: string[]; groups: ScheduleLessonGroup[] };

/** Önceki takvimin ana ünite dersleri (konu kimliği → alt başlıklar ve ders grupları, ders sırasıyla). */
function previousUnitLessons(sessions: readonly ScheduleSession[]): Map<string, UnitLessonRecord> {
  const out = new Map<string, UnitLessonRecord & { parts: { part: number; group: ScheduleLessonGroup }[] }>();
  for (const session of sessions) {
    if (session.role !== "learn" || !Array.isArray(session.lessonSubtopics) || !session.lessonSubtopics.length) continue;
    const record = out.get(session.topicId) ?? { subtopics: [], groups: [], parts: [] };
    for (const title of session.lessonSubtopics) {
      if (typeof title === "string" && title.trim() && !record.subtopics.includes(title.trim())) record.subtopics.push(title.trim());
    }
    const sourceRefs = parseUnitSources(session.unitSources);
    if (sourceRefs.length) {
      record.parts.push({ part: session.lessonPart ?? 1, group: { subtopics: [...session.lessonSubtopics], sourceRefs } });
    }
    out.set(session.topicId, record);
  }
  return new Map(
    [...out].map(([id, record]) => [
      id,
      { subtopics: record.subtopics, groups: record.parts.sort((a, b) => a.part - b.part).map((item) => item.group) },
    ]),
  );
}

/** Belge başına sayfa kümesi (karşılaştırma için anahtar). */
function pageSetKey(refs: readonly { documentId: string; pages: readonly number[] }[]): string {
  const byDoc = new Map<string, Set<number>>();
  for (const ref of refs) {
    const set = byDoc.get(ref.documentId) ?? new Set<number>();
    for (const page of ref.pages) set.add(page);
    byDoc.set(ref.documentId, set);
  }
  return [...byDoc]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([documentId, pages]) => `${documentId}:${[...pages].sort((x, y) => x - y).join(",")}`)
    .join("|");
}

/**
 * Ana ünitenin dersleri (yeniden planlama): önceki takvimin grupları ünitenin bugünkü kaynağını tam kapsıyorsa onlar
 * (aynı dersler, aynı adlar); kaynak değiştiyse (materyal eklendi) ya da grup yoksa yapraklardan yeniden hesaplanır
 * (kurulumla aynı işlev, `unitLessonGroups`). Okuma düşerse tek ders.
 */
async function unitLessonGroupsForRow(
  service: SupabaseClient,
  refs: ReturnType<typeof parseTopicSourceRefs>,
  previous: readonly ScheduleLessonGroup[],
): Promise<ScheduleLessonGroup[]> {
  const rowKey = pageSetKey(refs);
  if (previous.length && pageSetKey(previous.flatMap((group) => group.sourceRefs)) === rowKey) return [...previous];
  const nodeIds = [...new Set(refs.map((ref) => ref.nodeId).filter((id): id is string => Boolean(id)))];
  if (!nodeIds.length) return [];
  try {
    const [{ data: nodes }, measured] = await Promise.all([
      service.from("document_topic_nodes").select("id, title").in("id", nodeIds),
      loadConsolidationDocuments(
        service,
        [...new Set(refs.map((ref) => ref.documentId))].map((documentId) => ({ documentId, fileName: "" })),
      ),
    ]);
    const titleOf = new Map((nodes ?? []).map((row) => [row.id as string, String(row.title ?? "").trim()]));
    const usable = new Map((measured ?? []).map((doc) => [doc.documentId, new Set(doc.usablePages)]));
    const parts: UnitLessonPart[] = refs.map((ref) => ({
      title: (ref.nodeId ? titleOf.get(ref.nodeId) : "") || "",
      documentId: ref.documentId,
      pages: ref.pages,
    }));
    return unitLessonGroups(parts, (documentId) => usable.get(documentId) ?? null);
  } catch {
    return [];
  }
}
