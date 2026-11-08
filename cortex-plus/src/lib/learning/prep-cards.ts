import "server-only";
import { NOT_STUDIO_EXAM_FILTER } from "@/lib/learning/studio-exam";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ExamPrepCard } from "@/components/parity/exam-prep";
import { mapPrepTopics, topicProgress, type PrepTopic } from "@/lib/learning/exam-prep-progress";
import { loadOrBackfillTopics } from "@/lib/learning/exam-prep-topics";
import { examRelativeLabel, nodeProgress, PLAN_NODE_META, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { activityDurationMinutes } from "@/lib/learning/activity-duration";
import { examPrepNodeHref } from "@/lib/learning/exam-prep-hrefs";
import { nodeHeading } from "@/lib/learning/node-heading";
import { istanbulDay } from "@/lib/chat/chat-display";
import { pathCompletion } from "@/lib/learning/prep-metrics";

type PrepRow = {
  id: string;
  title: string | null;
  exam_type: string;
  target_score: number | null;
  exam_date?: string | null;
  study_plan_id?: string | null;
  view_count?: number | null;
};

export type PrepCardNode = {
  status: "locked" | "ready" | "done";
  id?: string;
  kind?: string | null;
  title?: string | null;
  sortOrder?: number | null;
  sessionMeta?: { topicTitle?: string | null; activityMinutes?: number | null } | null;
};

/**
 * Kartın "Sıradaki" satırı (8 Kasım 2026, ürün sahibinin onayı): yolda ilk açık adım, sıra numarasıyla. Ücretsiz
 * hesapta Plus adımı atlanır (hazırlık sayfasının "Devam et"iyle aynı karar, `pathSkipKinds`).
 */
export function nextPrepStep(
  prepId: string,
  nodes: readonly PrepCardNode[],
  skipKinds: ReadonlySet<string> = new Set(),
): ExamPrepCard["next"] {
  const next = [...nodes]
    .filter((node) => node.status === "ready" && node.id && node.kind && node.kind in PLAN_NODE_META)
    .filter((node) => !skipKinds.has(node.kind as string))
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))[0];
  if (!next?.id || !next.kind) return null;
  const kind = next.kind as PlanNodeKind;
  return {
    kind,
    kindLabel: PLAN_NODE_META[kind].title,
    heading: nodeHeading({ kind, title: next.title, sessionMeta: next.sessionMeta }),
    minutes: activityDurationMinutes(kind, { known: next.sessionMeta?.activityMinutes ?? null }),
    href: examPrepNodeHref(prepId, next.id),
  };
}

export function toPrepCard(
  prep: PrepRow,
  topics: PrepTopic[],
  nodes: PrepCardNode[],
  today = istanbulDay(),
  skipKinds: ReadonlySet<string> = new Set(),
): ExamPrepCard {
  // Çubuk ve "X / Y konu" aynı birimi kullanır: konu. Düğüm sayısı
  // etkinliktir; kartta konu diye yazılmaz.
  const progress = topics.length ? topicProgress(topics) : nodeProgress(nodes);
  const next = nodes.find((node) => node.status === "ready");
  const nextStep = prep.exam_date && prep.exam_date < today ? null : nextPrepStep(prep.id, nodes, skipKinds);
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
    dated: Boolean(prep.exam_date),
    continueHref: `/deneme-sinavlari/${prep.id}`,
    next: nextStep,
    // "Geçmiş" sekmesi: sınav günü geride kalanlar (İstanbul günü).
    past: Boolean(prep.exam_date && prep.exam_date < today),
    joinCount: Number(prep.view_count ?? 0),
  };
}

type NodeRow = {
  id?: string;
  exam_prep_id: string;
  status: string;
  kind?: string | null;
  title?: string | null;
  sort_order?: number | null;
  session_meta?: unknown;
};

/** Öğrencinin hazırlık kartları, en yeni önce. Liste ve "Hazırlıklarım" ortak. */
export async function loadPrepCards(
  supabase: SupabaseClient,
  userId: string,
  limit: number,
  skipKinds: ReadonlySet<string> = new Set(),
): Promise<ExamPrepCard[]> {
  const { data: prepRows } = await supabase
    .from("exam_preps")
    .select("id, title, exam_type, target_score, created_at, study_plan_id, exam_date, view_count")
    .eq("user_id", userId)
    .or(NOT_STUDIO_EXAM_FILTER)
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
    ? await supabase
        .from("exam_prep_nodes")
        .select("id, exam_prep_id, status, kind, title, sort_order, session_meta")
        .in("exam_prep_id", prepIds)
    : { data: [] as NodeRow[] };

  const today = istanbulDay();
  return preps.map((prep) =>
    toPrepCard(
      prep,
      topicMap.get(prep.id) ?? [],
      (allNodes ?? [])
        .filter((row) => row.exam_prep_id === prep.id)
        .map((row: NodeRow) => ({
          status: (row.status as "locked" | "ready" | "done") ?? "locked",
          id: row.id,
          kind: row.kind,
          title: row.title,
          sortOrder: row.sort_order,
          sessionMeta: (row.session_meta as PrepCardNode["sessionMeta"]) ?? null,
        })),
      today,
      skipKinds,
    ),
  );
}

export type ContinueStep = {
  prepId: string;
  prepTitle: string;
  next: NonNullable<ExamPrepCard["next"]>;
  /** Dersin adı (hazırlığın `exam_type`); kartta dersin simgesi buradan. */
  subject?: string | null;
  /** Yolun tamamlaması (İlerleme'deki "Tamamlama" ile aynı hesap, `pathCompletion`). */
  progress?: { done: number; total: number; pct: number } | null;
  /** Sınava kalan gün (İstanbul günüyle); tarih yoksa null. */
  daysLeft?: number | null;
};

/**
 * Ana ekranın "Kaldığın yerden devam" satırı (8 Kasım 2026, ürün sahibinin onayı): en son çalışılan hazırlığın
 * sıradaki adımı. Hiç çalışılmadıysa en yeni hazırlık. Sınavı geçmiş ya da açık adımı olmayan hazırlıkta satır yok.
 */
export async function loadContinueStep(
  supabase: SupabaseClient,
  userId: string,
  skipKinds: ReadonlySet<string> = new Set(),
): Promise<ContinueStep | null> {
  const { data: lastAttempt } = await supabase
    .from("exam_prep_node_attempts")
    .select("exam_prep_id")
    .eq("user_id", userId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  let query = supabase
    .from("exam_preps")
    .select("id, title, exam_type, exam_date")
    .eq("user_id", userId)
    .neq("exam_type", "hedef")
    .or(NOT_STUDIO_EXAM_FILTER);
  query = lastAttempt?.exam_prep_id
    ? query.eq("id", String(lastAttempt.exam_prep_id))
    : query.order("created_at", { ascending: false });
  const { data: prep } = await query.limit(1).maybeSingle();
  if (!prep?.id) return null;
  if (prep.exam_date && String(prep.exam_date) < istanbulDay()) return null;
  // Bütün adımlar (yalnız açık olanlar değil): kart yolun ne kadarının bittiğini de gösterir (8 Kasım 2026).
  const { data: nodes } = await supabase
    .from("exam_prep_nodes")
    .select("id, status, kind, title, sort_order, session_meta")
    .eq("exam_prep_id", prep.id);
  const steps = (nodes ?? []).filter((row) => !skipKinds.has(String(row.kind)));
  const next = nextPrepStep(
    String(prep.id),
    (nodes ?? []).map((row) => ({
      status: (row.status as PrepCardNode["status"]) ?? "locked",
      id: String(row.id),
      kind: row.kind as string | null,
      title: row.title as string | null,
      sortOrder: row.sort_order as number | null,
      sessionMeta: (row.session_meta as PrepCardNode["sessionMeta"]) ?? null,
    })),
    skipKinds,
  );
  if (!next) return null;
  const today = istanbulDay();
  const daysLeft = prep.exam_date
    ? Math.round((Date.parse(`${String(prep.exam_date).slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000)
    : null;
  return {
    prepId: String(prep.id),
    prepTitle: String(prep.title ?? prep.exam_type),
    next,
    subject: (prep.exam_type as string | null) ?? null,
    progress: pathCompletion(
      steps.map((row) => ({ status: (row.status as PrepCardNode["status"]) ?? "locked", kind: row.kind as string | null })),
    ),
    daysLeft,
  };
}
