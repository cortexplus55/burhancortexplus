import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { STUDIO_EXAM_TYPE } from "@/lib/learning/studio-exam";
import { examPrepHomeHref } from "@/lib/learning/exam-prep-hrefs";
import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { buildPrepProgressView } from "@/lib/learning/prep-progress-view";
import {
  buildPrepRadarView,
  tempoFromProgress,
  type PrepRadarView,
  type ReadinessForecastSeries,
} from "@/lib/learning/prep-radar";

export type NearestPrepInsights = {
  prepId: string;
  title: string;
  href: string;
  radar: PrepRadarView;
  forecastSeries: ReadinessForecastSeries;
};

/**
 * `/ilerleme` için en yakın (veya son güncellenen) hazırlığın radar + 14 günlük tahmini.
 * Uydurma sayı yok: kayıt yoksa eksenler 0, eğri düz kalır.
 */
export async function loadNearestPrepInsights(
  supabase: SupabaseClient,
  userId: string,
): Promise<NearestPrepInsights | null> {
  const today = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());

  const upcoming = await supabase
    .from("exam_preps")
    .select("id, title, exam_date, target_score, daily_minutes")
    .eq("user_id", userId)
    .neq("exam_type", "hedef")
    .neq("exam_type", STUDIO_EXAM_TYPE)
    .not("exam_date", "is", null)
    .gte("exam_date", today)
    .order("exam_date", { ascending: true })
    .limit(1)
    .maybeSingle();

  let prep = upcoming.data;
  if (!prep) {
    const latest = await supabase
      .from("exam_preps")
      .select("id, title, exam_date, target_score, daily_minutes")
      .eq("user_id", userId)
      .neq("exam_type", "hedef")
      .neq("exam_type", STUDIO_EXAM_TYPE)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    prep = latest.data;
  }
  if (!prep?.id) return null;

  const [{ data: nodeRows }, { data: attemptRows }, { data: topicRows }] = await Promise.all([
    supabase
      .from("exam_prep_nodes")
      .select("id, kind, title, status, session_meta")
      .eq("exam_prep_id", prep.id)
      .order("sort_order"),
    supabase
      .from("exam_prep_node_attempts")
      .select("node_id, score, total, created_at")
      .eq("exam_prep_id", prep.id)
      .eq("status", "completed")
      .order("created_at", { ascending: false })
      .limit(500),
    supabase.from("exam_prep_topics").select("label").eq("exam_prep_id", prep.id),
  ]);

  const nodes = (nodeRows ?? []).map((row) => ({
    id: row.id as string,
    kind: row.kind as PlanNodeKind,
    title: (row.title as string) ?? "",
    status: row.status as "locked" | "ready" | "done",
    sessionMeta:
      row.session_meta && typeof row.session_meta === "object"
        ? (row.session_meta as { topicTitle?: string; durationMinutes?: number })
        : null,
  }));

  const topicLabels = (topicRows ?? [])
    .map((row) => String(row.label ?? "").trim())
    .filter(Boolean);
  const topicsDone = nodes.filter((node) => node.status === "done").length;

  const progress = buildPrepProgressView({
    nodes,
    attempts: (attemptRows ?? []).map((row) => ({
      nodeId: row.node_id as string,
      score: typeof row.score === "number" ? row.score : null,
      total: typeof row.total === "number" ? row.total : null,
      createdAt: row.created_at as string,
    })),
    topicLabels,
    gaps: [],
    examDate: typeof prep.exam_date === "string" ? prep.exam_date : null,
    targetScore: typeof prep.target_score === "number" ? prep.target_score : null,
    dailyMinutes: typeof prep.daily_minutes === "number" ? prep.daily_minutes : null,
    measuredReadinessPct: null,
  });

  const radar = buildPrepRadarView({
    readinessPct: progress.scorePct,
    targetScore: progress.targetPct,
    coveragePct: topicLabels.length
      ? Math.round((topicsDone / Math.max(1, nodes.length)) * 100)
      : progress.scorePct,
    accuracyPct: null,
    mockPct: progress.mocks[0]?.pct ?? null,
    retentionPct: null,
    tempoPct: tempoFromProgress({
      programPct: progress.scorePct,
      thisWeekMinutes: progress.tempo.thisWeekMinutes,
      dailyGoalMinutes: progress.tempo.dailyGoalMinutes,
      weekActivities: progress.weekActivities,
    }),
  });

  return {
    prepId: prep.id,
    title: (prep.title as string) || "Sınav hazırlığı",
    href: examPrepHomeHref(prep.id),
    radar,
    forecastSeries: progress.forecastSeries,
  };
}
