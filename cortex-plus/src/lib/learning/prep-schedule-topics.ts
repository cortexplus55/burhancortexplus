import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { schedulePriorityForTopic } from "@/lib/learning/exam-coverage";
import type { ScheduleBuildResult, ScheduleTopicInput } from "@/lib/learning/exam-schedule-v2";
import type { MeasuredLevel } from "@/lib/learning/diagnostic";
import { examWeightToEmphasis, isHighExamWeight, unpackTopicPerspective } from "@/lib/documents/outline-topic-meta";
import { parseTopicSourceRefs, toTopicSourceRef } from "@/lib/learning/topic-source-refs";
import { consolidatePrepDocuments } from "@/lib/learning/consolidate-documents";
import { loadOneshotIntakeTopics } from "@/lib/learning/intake-outline";
import { priorityFromImportance, priorityFromWeight } from "@/lib/learning/cross-material-topics";
import { orderTopicsForPath } from "@/lib/learning/topic-order";
import { parseTeacherAnalysis, type TeacherAnalysis } from "@/lib/learning/teacher-brain";

export type PrepScheduleTopics = {
  titles: string[];
  nodeIds: (string | null)[];
  scheduleTopics: ScheduleTopicInput[];
  /**
   * Konular sihirbazın gösterdiği haritadan geldi: sıra öğretim sırasıdır, yeniden dizilmez.
   */
  fromOutline?: boolean;
};

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
  userId = "",
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

  const { data: rows } = await service
    .from("exam_prep_topics")
    .select("id, label, sort_order, document_topic_node_id, source_refs, measured_level")
    .eq("exam_prep_id", input.prepId)
    .order("sort_order");
  const nodeIds = (rows ?? [])
    .map((row) => row.document_topic_node_id)
    .filter((id): id is string => typeof id === "string");
  const extras = await loadTopicNodeExtras(service, nodeIds);

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
