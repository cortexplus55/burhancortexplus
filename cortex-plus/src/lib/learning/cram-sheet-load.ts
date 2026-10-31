import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { readLessonV3, type LessonV3 } from "@/lib/learning/lesson-v3";
import { prepDocumentIds } from "@/lib/learning/exam-coverage";
import { examPointsForTopic, parseTeacherAnalysis, type TeacherAnalysis } from "@/lib/learning/teacher-brain";
import { MASTERY_ROW_COLUMNS, masteryByPlannedTopic, masterySnapshotFromRow } from "@/lib/learning/learning-tracking";
import { rankFinalStepTopics } from "@/lib/learning/prep-wide-target";
import { withOpenMisconceptions } from "@/lib/learning/misconception-store";
import { readableGap } from "@/lib/learning/prep-progress-view";
import { createTopicIndex } from "@/lib/learning/topic-identity";
import {
  buildCramSheet,
  mistakeCramText,
  reviewItemCramText,
  type CramSheet,
  type CramWeakSpot,
} from "@/lib/learning/cram-sheet";

/**
 * Sınav sabahı kâğıdının verisi (31 Ekim 2026, Paket J3 #14). Yalnız kayıtlı veriden; model çağrısı yok.
 * Çağıran hazırlığın sahibini doğrulamış olmalı (sayfa `exam_preps`'i `user_id` ile okur); buradaki her sorgu
 * hazırlığa ve öğrenciye süzülü. Her kaynak ayrı düşer: biri okunamazsa kâğıt öbürleriyle çıkar.
 */

/** Konu başına en çok bu kadar kayıtlı ders (kavram birimli konu: "Ders 1/3" …). */
const LESSONS_PER_TOPIC = 3;
const LESSON_ROWS = 60;
const ANALYSIS_DOCS = 12;

type TopicRow = { id: string; label: string; documentTopicNodeId: string | null };

async function settle<T>(run: () => PromiseLike<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    return fallback;
  }
}

async function loadTopics(service: SupabaseClient, prepId: string): Promise<TopicRow[]> {
  const rich = await service
    .from("exam_prep_topics")
    .select("id, label, sort_order, document_topic_node_id")
    .eq("exam_prep_id", prepId)
    .order("sort_order");
  const rows = rich.error
    ? (await service.from("exam_prep_topics").select("id, label, sort_order").eq("exam_prep_id", prepId).order("sort_order")).data
    : rich.data;
  return ((rows ?? []) as { id?: unknown; label?: unknown; document_topic_node_id?: unknown }[])
    .map((row) => ({
      id: String(row.id ?? ""),
      label: String(row.label ?? "").trim(),
      documentTopicNodeId: typeof row.document_topic_node_id === "string" ? row.document_topic_node_id : null,
    }))
    .filter((row) => row.id && row.label);
}

/** Konu başına en yeni dersler (aynı başlıktan en yenisi), eskiden yeniye. */
async function loadLessons(service: SupabaseClient, prepId: string): Promise<{ topicId: string | null; lesson: LessonV3 }[]> {
  const { data, error } = await service
    .from("exam_prep_lessons")
    .select("topic_id, title, content_json, created_at")
    .eq("exam_prep_id", prepId)
    .not("content_json", "is", null)
    .order("created_at", { ascending: false })
    .limit(LESSON_ROWS);
  if (error || !Array.isArray(data)) return [];
  const seen = new Set<string>();
  const perTopic = new Map<string, number>();
  const picked: { topicId: string | null; lesson: LessonV3 }[] = [];
  for (const row of data as { topic_id?: unknown; title?: unknown; content_json?: unknown }[]) {
    const topicId = typeof row.topic_id === "string" ? row.topic_id : null;
    const title = String(row.title ?? "").trim().toLocaleLowerCase("tr");
    const key = `${topicId ?? "-"}|${title}`;
    if (seen.has(key)) continue;
    const bucket = topicId ?? `-${title}`;
    if ((perTopic.get(bucket) ?? 0) >= LESSONS_PER_TOPIC) continue;
    // Kayıtta iki biçim var: doğrudan V2 ayrıştırma V3 dersi boş sayardı (AGENTS: `readLessonV3`).
    const lesson = readLessonV3(row.content_json);
    if (!lesson) continue;
    seen.add(key);
    perTopic.set(bucket, (perTopic.get(bucket) ?? 0) + 1);
    picked.push({ topicId, lesson });
  }
  return picked.reverse();
}

async function loadAnalyses(service: SupabaseClient, prepId: string, topics: TopicRow[]): Promise<TeacherAnalysis[]> {
  const { data: prep } = await service
    .from("exam_preps")
    .select("document_id, source_document_ids")
    .eq("id", prepId)
    .maybeSingle();
  const ids = prepDocumentIds(prep as { document_id?: string | null; source_document_ids?: string[] | null } | null);
  const nodeIds = topics.map((topic) => topic.documentTopicNodeId).filter((id): id is string => Boolean(id));
  if (nodeIds.length) {
    const { data: nodes } = await service.from("document_topic_nodes").select("document_id").in("id", nodeIds.slice(0, 200));
    for (const node of (nodes ?? []) as { document_id?: unknown }[]) {
      if (typeof node.document_id === "string") ids.push(node.document_id);
    }
  }
  const unique = [...new Set(ids)].slice(0, ANALYSIS_DOCS);
  if (!unique.length) return [];
  const { data, error } = await service
    .from("document_teacher_analyses")
    .select("document_id, status, analysis")
    .in("document_id", unique);
  if (error || !Array.isArray(data)) return [];
  return (data as { status?: unknown; analysis?: unknown }[])
    .filter((row) => row.status === "ready")
    .map((row) => parseTeacherAnalysis(row.analysis))
    .filter((analysis): analysis is TeacherAnalysis => Boolean(analysis));
}

export async function loadCramSheet(
  service: SupabaseClient,
  input: { prepId: string; userId: string; targetScore: number | null },
): Promise<CramSheet> {
  const topics = await settle(() => loadTopics(service, input.prepId), []);
  const index = createTopicIndex(topics);
  const labels = topics.map((topic) => topic.label);

  const [lessons, analyses, masteryRows, misconceptions, reviewRows, mistakeRows] = await Promise.all([
    settle(() => loadLessons(service, input.prepId), []),
    settle(() => loadAnalyses(service, input.prepId, topics), []),
    settle(
      async () =>
        (await service.from("exam_prep_topic_mastery").select(MASTERY_ROW_COLUMNS).eq("exam_prep_id", input.prepId)).data ?? [],
      [] as Record<string, unknown>[],
    ),
    settle(
      async () =>
        (
          await withOpenMisconceptions((onlyOpen) => {
            const query = service
              .from("exam_prep_misconceptions")
              .select("claim, topic_label, question_preview, source_kind")
              .eq("exam_prep_id", input.prepId)
              .eq("user_id", input.userId);
            // Yalnız açık yanılgılar; sütun yoksa hepsi (misconception-store kuralı).
            return (onlyOpen ? query.is("resolved_at", null) : query).order("created_at", { ascending: false }).limit(40);
          })
        ).data ?? [],
      [] as Record<string, unknown>[],
    ),
    settle(
      async () =>
        (
          await service
            .from("exam_prep_review_items")
            .select("topic_label, item, lapse_count")
            .eq("user_id", input.userId)
            .eq("exam_prep_id", input.prepId)
            .eq("status", "active")
            .eq("reason", "miss")
            .order("lapse_count", { ascending: false })
            .limit(20)
        ).data ?? [],
      [] as Record<string, unknown>[],
    ),
    // Yanlış defteri hazırlığa bağlı değil (kullanıcı başına); yalnız bu hazırlığın konularına düşen satırlar alınır.
    labels.length
      ? settle(
          async () =>
            (
              await service
                .from("mistake_entries")
                .select("topic_label, question_text, correct_answer, wrong_count")
                .eq("user_id", input.userId)
                .is("mastered_at", null)
                .order("wrong_count", { ascending: false })
                .limit(60)
            ).data ?? [],
          [] as Record<string, unknown>[],
        )
      : Promise.resolve([] as Record<string, unknown>[]),
  ]);

  const examPoints = topics.flatMap((topic) => {
    for (const analysis of analyses) {
      const points = examPointsForTopic(analysis, topic.label);
      if (points.length) return [{ topicKey: topic.id, points }];
    }
    return [];
  });

  const merged = [...masteryByPlannedTopic(labels, (masteryRows as Record<string, unknown>[]).map(masterySnapshotFromRow)).values()];
  const misconceptionRows = misconceptions as { claim?: unknown; topic_label?: unknown; question_preview?: unknown; source_kind?: unknown }[];
  const focusTopics = rankFinalStepTopics({
    plannedTopics: labels,
    mastery: merged,
    openMisses: misconceptionRows.map((row) => ({ topicLabel: typeof row.topic_label === "string" ? row.topic_label : null })),
    targetScore: input.targetScore,
  }).map((row) => ({ label: row.label, percent: row.percent }));

  const canonical = (label: string | null | undefined) => index.rowForKey(label)?.label ?? (label?.trim() || null);
  const weakSpots: CramWeakSpot[] = [];
  for (const row of reviewRows as { topic_label?: unknown; item?: unknown }[]) {
    const text = reviewItemCramText(row.item);
    if (text) weakSpots.push({ text, topic: canonical(typeof row.topic_label === "string" ? row.topic_label : null) });
  }
  for (const row of mistakeRows as { topic_label?: unknown; question_text?: unknown; correct_answer?: unknown }[]) {
    const topic = index.rowForKey(typeof row.topic_label === "string" ? row.topic_label : null);
    if (!topic) continue;
    const text = mistakeCramText(row.question_text, row.correct_answer);
    if (text) weakSpots.push({ text, topic: topic.label });
  }
  for (const row of misconceptionRows) {
    const gap = readableGap(
      {
        claim: String(row.claim ?? ""),
        topicLabel: typeof row.topic_label === "string" ? row.topic_label : null,
        detail: typeof row.question_preview === "string" ? row.question_preview : null,
        sourceKind: typeof row.source_kind === "string" ? row.source_kind : null,
      },
      (label) => canonical(label) ?? label,
    );
    if (gap.claim.trim()) weakSpots.push({ text: gap.claim, topic: gap.topicLabel ?? null });
  }

  return buildCramSheet({
    topics: topics.map((topic) => ({ key: topic.id, label: topic.label })),
    lessons: lessons.map(({ topicId, lesson }) => ({ topicKey: topicId ? index.rowFor(topicId)?.id ?? null : null, lesson })),
    examPoints,
    weakSpots,
    focusTopics,
  });
}
