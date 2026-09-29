/**
 * Hazırlığın "İlerleme" sekmesi — Astra düzeni (29 Eylül 2026).
 *
 * Astra'da sekme şunları gösteriyor: hazırlık puanı ve hedef işareti,
 * "bu hafta" değişimi, hedefe ulaşan konu ve ders sayısı; altında Hazırlık
 * düzeyi / Denemeler / Tempo. Burada yalnızca elimizdeki gerçek kayıtlardan
 * hesaplanabileni hesaplıyoruz; uydurma bir tahmin göstermiyoruz.
 *
 * Saf fonksiyon: sayfa kayıtları okur, bu modül görünümü kurar.
 */

import {
  readinessScore,
  type NodeStatus,
  type PlanNodeKind,
} from "@/lib/learning/exam-prep-plan";

export type ProgressNode = {
  id: string;
  kind: PlanNodeKind;
  title: string;
  status: NodeStatus;
  sessionMeta?: { topicTitle?: string; durationMinutes?: number } | null;
};

export type ProgressAttempt = {
  nodeId: string;
  score: number | null;
  total: number | null;
  createdAt: string;
};

export type ProgressGap = {
  claim: string;
  topicLabel: string | null;
};

export type PrepProgressView = {
  /** Hazırlık puanı (%). Ölçüm varsa sınava hazırlık tahmini, yoksa tamamlama. */
  scorePct: number;
  /** Puanın neye dayandığı — öğrenciye aynen yazılıyor. */
  scoreBasis: string;
  targetPct: number;
  /** Bu hafta biten etkinlik sayısı; Astra'nın "bu hafta" çipinin karşılığı. */
  weekActivities: number;
  topicsAtTarget: number;
  topicCount: number;
  lessonsDone: number;
  forecast:
    | { kind: "waiting"; reason: string }
    | { kind: "ready"; pct: number; text: string };
  gaps: ProgressGap[];
  topics: { label: string; pct: number; solved: number; lessons: number }[];
  weeks: {
    labels: string[];
    rows: { label: string; counts: number[]; pct: number }[];
  };
  mocks: { title: string; date: string; pct: number }[];
  tempo: {
    weeks: { label: string; activities: number; minutes: number }[];
    dailyGoalMinutes: number | null;
    thisWeekMinutes: number;
  };
};

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;
/** Astra'nın "Hedef ustalık %75"i. Hazırlıkta hedef puan yoksa bu. */
export const DEFAULT_TARGET_PCT = 75;
/** Sınav günü tahmini kaç biten dersten sonra görünür (Astra: ilk iki ders). */
const FORECAST_MIN_LESSONS = 2;
const WEEK_COUNT = 5;

const LESSON_KINDS = new Set<PlanNodeKind>(["lesson", "focused", "gaps", "spaced"]);
const MOCK_KINDS = new Set<PlanNodeKind>(["written_exam", "final_check"]);

function topicOf(node: ProgressNode | undefined): string | null {
  const title = node?.sessionMeta?.topicTitle?.trim();
  return title || null;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}

/** H1…H4, şimdi: en eski hafta başta. `index` 0 = bu hafta. */
function weekIndex(createdAt: string, now: number): number | null {
  const time = Date.parse(createdAt);
  if (!Number.isFinite(time) || time > now) return null;
  const index = Math.floor((now - time) / WEEK_MS);
  return index < WEEK_COUNT ? index : null;
}

function weekLabels(): string[] {
  return Array.from({ length: WEEK_COUNT }, (_, i) =>
    i === WEEK_COUNT - 1 ? "şimdi" : `H${i + 1}`,
  );
}

export function buildPrepProgressView(input: {
  nodes: ProgressNode[];
  attempts: ProgressAttempt[];
  topicLabels: string[];
  gaps: ProgressGap[];
  examDate: string | null;
  targetScore: number | null;
  dailyMinutes: number | null;
  /** Ölçülen sınava hazırlık tahmini (pdf_learning_v2). Yoksa null. */
  measuredReadinessPct: number | null;
  now?: Date;
}): PrepProgressView {
  const now = (input.now ?? new Date()).getTime();
  const nodeById = new Map(input.nodes.map((node) => [node.id, node]));
  const completed = input.attempts.filter((attempt) => nodeById.has(attempt.nodeId));

  const measured = input.measuredReadinessPct;
  const scorePct =
    typeof measured === "number" ? Math.max(0, Math.min(100, Math.round(measured))) : readinessScore(input.nodes);
  const scoreBasis =
    typeof measured === "number"
      ? "Ölçülen başarı, konu kapsamı ve deneme sonuçlarına göre."
      : "Tamamlanan etkinliklere göre; konu hakimiyetini ölçmez.";
  const targetPct =
    typeof input.targetScore === "number" && input.targetScore > 0 && input.targetScore <= 100
      ? Math.round(input.targetScore)
      : DEFAULT_TARGET_PCT;

  const labels = input.topicLabels.length
    ? input.topicLabels
    : [...new Set(input.nodes.map(topicOf).filter((t): t is string => Boolean(t)))];

  const topics = labels.map((label) => {
    const topicNodes = input.nodes.filter((node) => topicOf(node) === label);
    const done = topicNodes.filter((node) => node.status === "done").length;
    const ids = new Set(topicNodes.map((node) => node.id));
    const solved = completed
      .filter((attempt) => ids.has(attempt.nodeId))
      .reduce((sum, attempt) => sum + Math.max(0, attempt.total ?? 0), 0);
    return {
      label,
      pct: pct(done, topicNodes.length),
      solved,
      lessons: topicNodes.filter((node) => LESSON_KINDS.has(node.kind)).length,
    };
  });

  const lessonsDone = input.nodes.filter(
    (node) => LESSON_KINDS.has(node.kind) && node.status === "done",
  ).length;

  // Haftalara göre konular: son beş haftada konu başına biten etkinlik.
  const rows = labels.map((label) => ({ label, counts: Array(WEEK_COUNT).fill(0) as number[], pct: 0 }));
  const rowByLabel = new Map(rows.map((row) => [row.label, row]));
  const tempoWeeks = Array.from({ length: WEEK_COUNT }, () => ({ activities: 0, minutes: 0 }));
  for (const attempt of completed) {
    const index = weekIndex(attempt.createdAt, now);
    if (index === null) continue;
    const column = WEEK_COUNT - 1 - index;
    const node = nodeById.get(attempt.nodeId);
    const row = rowByLabel.get(topicOf(node) ?? "");
    if (row) row.counts[column] += 1;
    tempoWeeks[column].activities += 1;
    tempoWeeks[column].minutes += Math.max(0, node?.sessionMeta?.durationMinutes ?? 0);
  }
  for (const row of rows) {
    row.pct = topics.find((topic) => topic.label === row.label)?.pct ?? 0;
  }

  const weekActivities = tempoWeeks[WEEK_COUNT - 1].activities;

  // Sınav günü tahmini: yalnızca tamamlama temposundan, açıkça öyle yazarak.
  let forecast: PrepProgressView["forecast"];
  const total = input.nodes.length;
  const done = input.nodes.filter((node) => node.status === "done").length;
  const examTime = input.examDate ? Date.parse(input.examDate) : Number.NaN;
  if (lessonsDone < FORECAST_MIN_LESSONS) {
    forecast = {
      kind: "waiting",
      reason: "İlerleme eğilimin ve tahminin, bu hazırlıktaki ilk iki dersten sonra görünür.",
    };
  } else if (!Number.isFinite(examTime)) {
    forecast = { kind: "waiting", reason: "Sınav tarihi girilince tahmin görünür." };
  } else {
    const recent = completed.filter((attempt) => {
      const time = Date.parse(attempt.createdAt);
      return Number.isFinite(time) && now - time <= 14 * DAY_MS;
    }).length;
    const perDay = recent / 14;
    const daysLeft = Math.max(0, Math.ceil((examTime - now) / DAY_MS));
    const projected = Math.min(total, done + Math.round(perDay * daysLeft));
    const projectedPct = pct(projected, total);
    forecast = {
      kind: "ready",
      pct: projectedPct,
      text: `Son iki haftanın temposu sürerse sınav günü çalışma yolunda %${projectedPct} tamamlanmış olur.`,
    };
  }

  const mocks = completed
    .filter((attempt) => MOCK_KINDS.has(nodeById.get(attempt.nodeId)?.kind as PlanNodeKind))
    .filter((attempt) => (attempt.total ?? 0) > 0)
    .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
    .map((attempt) => {
      const node = nodeById.get(attempt.nodeId)!;
      return {
        title: topicOf(node) ?? node.title,
        date: attempt.createdAt,
        pct: pct(Math.max(0, attempt.score ?? 0), attempt.total ?? 0),
      };
    });

  return {
    scorePct,
    scoreBasis,
    targetPct,
    weekActivities,
    topicsAtTarget: topics.filter((topic) => topic.pct >= targetPct).length,
    topicCount: labels.length,
    lessonsDone,
    forecast,
    gaps: input.gaps.slice(0, 5),
    topics,
    weeks: { labels: weekLabels(), rows },
    mocks,
    tempo: {
      weeks: weekLabels().map((label, i) => ({ label, ...tempoWeeks[i] })),
      dailyGoalMinutes:
        typeof input.dailyMinutes === "number" && input.dailyMinutes > 0 ? input.dailyMinutes : null,
      thisWeekMinutes: tempoWeeks[WEEK_COUNT - 1].minutes,
    },
  };
}
