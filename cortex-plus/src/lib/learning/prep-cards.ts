import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExamPrepCard } from "@/components/parity/exam-prep";
import { mapPrepTopics, topicProgress, type PrepTopic } from "@/lib/learning/exam-prep-progress";
import { loadOrBackfillTopics } from "@/lib/learning/exam-prep-topics";
import { examRelativeLabel, nodeProgress } from "@/lib/learning/exam-prep-plan";
import { istanbulDay } from "@/lib/chat/chat-display";

type PrepRow = {
  id: string;
  title: string | null;
  exam_type: string;
  target_score: number | null;
  exam_date?: string | null;
  study_plan_id?: string | null;
  view_count?: number | null;
};

export function toPrepCard(
  prep: PrepRow,
  topics: PrepTopic[],
  nodes: { status: "locked" | "ready" | "done" }[],
  today = istanbulDay(),
): ExamPrepCard {
  // Çubuk ve "X / Y konu" aynı birimi kullanır: konu. Düğüm sayısı
  // etkinliktir; kartta konu diye yazılmaz.
  const progress = topics.length ? topicProgress(topics) : nodeProgress(nodes);
  const next = nodes.find((node) => node.status === "ready");
  return {
    id: prep.id,
    title: prep.title ?? prep.exam_type,
    examType: prep.exam_type,
    progressPct: progress.pct,
    daysLabel: prep.exam_date
      ? examRelativeLabel(prep.exam_date)
      : next
        ? "Devam et"
        : "Yola başla",
    topicsDone: progress.done,
    topicsTotal: progress.total,
    targetScore: prep.target_score,
    continueHref: `/deneme-sinavlari/${prep.id}`,
    // "Geçmiş" sekmesi: sınav günü geride kalanlar (İstanbul günü).
    past: Boolean(prep.exam_date && prep.exam_date < today),
    joinCount: Number(prep.view_count ?? 0),
  };
}

/** Öğrencinin hazırlık kartları, en yeni önce. Liste ve "Hazırlıklarım" ortak. */
export async function loadPrepCards(
  supabase: SupabaseClient,
  userId: string,
  limit: number,
): Promise<ExamPrepCard[]> {
  const { data: prepRows } = await supabase
    .from("exam_preps")
    .select("id, title, exam_type, target_score, created_at, study_plan_id, exam_date, view_count")
    .eq("user_id", userId)
    .order("created_at", { ascending: false })
    .limit(limit);
  const preps = (prepRows ?? []) as PrepRow[];
  const prepIds = preps.map((prep) => prep.id);

  const { data: allTopics } = prepIds.length
    ? await supabase
        .from("exam_prep_topics")
        .select("id, label, sort_order, status, lesson_id, exam_prep_id")
        .in("exam_prep_id", prepIds)
        .order("sort_order")
    : { data: [] as { exam_prep_id: string }[] };

  const topicMap = new Map<string, PrepTopic[]>();
  for (const prep of preps) {
    topicMap.set(
      prep.id,
      mapPrepTopics(
        (allTopics ?? []).filter((row) => row.exam_prep_id === prep.id) as Parameters<
          typeof mapPrepTopics
        >[0],
      ),
    );
  }
  for (const prep of preps) {
    if ((topicMap.get(prep.id) ?? []).length) continue;
    topicMap.set(prep.id, await loadOrBackfillTopics(supabase, prep.id, prep.study_plan_id ?? null));
  }

  const { data: allNodes } = prepIds.length
    ? await supabase.from("exam_prep_nodes").select("exam_prep_id, status").in("exam_prep_id", prepIds)
    : { data: [] as { exam_prep_id: string; status: string }[] };

  const today = istanbulDay();
  return preps.map((prep) =>
    toPrepCard(
      prep,
      topicMap.get(prep.id) ?? [],
      (allNodes ?? [])
        .filter((row) => row.exam_prep_id === prep.id)
        .map((row) => ({ status: (row.status as "locked" | "ready" | "done") ?? "locked" })),
      today,
    ),
  );
}
