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
import {
  buildReadinessForecastSeries,
  type ReadinessForecastSeries,
} from "@/lib/learning/prep-radar";
import type { TopicMasteryState } from "@/lib/learning/learning-tracking";

export type ProgressNode = {
  id: string;
  kind: PlanNodeKind;
  title: string;
  status: NodeStatus;
  sessionMeta?: { topicTitle?: string; durationMinutes?: number } | null;
};

export type SolvedQuestion = {
  /** Konusu yazılıysa sayaç o konuya gider; yoksa düğümün konusuna. */
  topic: string | null;
  key: string;
};

function questionText(row: unknown): string {
  if (!row || typeof row !== "object") return "";
  const bag = row as { text?: unknown; prompt?: unknown };
  const text = typeof bag.text === "string" ? bag.text : typeof bag.prompt === "string" ? bag.prompt : "";
  return text.trim();
}

/** Quiz kökü, sözlü sorusu ve doğru/yanlış maddesi. Yüzde paydası (100) soru değildir. */
export function attemptStems(payload: unknown): string[] {
  return solvedQuestions(payload).map((item) => item.key);
}

function rowTopic(row: unknown): string | null {
  if (!row || typeof row !== "object") return null;
  const topic = (row as { topic?: unknown }).topic;
  return typeof topic === "string" && topic.trim() ? topic.trim() : null;
}

export function solvedQuestions(payload: unknown): SolvedQuestion[] {
  if (!payload || typeof payload !== "object") return [];
  const data = payload as { type?: unknown; questions?: unknown; items?: unknown };
  if (data.type === "mock_exam" && Array.isArray(data.items)) {
    return data.items.map((row, index) => ({
      topic: rowTopic(row),
      key: `mock:${index}:${rowTopic(row) ?? ""}`,
    }));
  }
  const rows = [
    ...(Array.isArray(data.questions) ? data.questions : []),
    ...(Array.isArray(data.items) ? data.items : []),
  ];
  return rows.flatMap((row) => {
    const text = questionText(row);
    if (!text) return [];
    return [{ topic: rowTopic(row), key: text }];
  });
}

export type ProgressAttempt = {
  nodeId: string;
  score: number | null;
  total: number | null;
  createdAt: string;
  /** Varsa aynı soru kökü bir kez sayılır. */
  stems?: string[];
  /** Konusu belli sorular. Yazılı denemenin 100'lük paydası burada sayılmaz. */
  solved?: SolvedQuestion[];
};

export type ProgressGap = {
  claim: string;
  topicLabel: string | null;
  /** Öğrencinin ham cevabı. Başlık değildir. */
  detail?: string | null;
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
  /** 14 günlük (veya sınava kalan) hazırlık eğrisi — SVG çizgi grafik. */
  forecastSeries: ReadinessForecastSeries;
  /**
   * Tempo kartı (19 Ekim 2026, Astra'daki gibi): bir ders ne kazandırıyor, hedefe kaç ders kaldı,
   * günde kaç ders gerekir. Ölçülen puan ve biten ders sayısından; ikisi de yoksa null.
   */
  pace: {
    gainPerLessonPct: number;
    lessonsToTarget: number;
    perDay: number | null;
    /** `Math.ceil(kalanDers / günlükDers)` — grafikteki "~X günde" ile aynı. */
    daysToFinish: number | null;
    todayLessons: number;
  } | null;
  /** En az bir etkinlik puanlandı: "eksik yok" artık bir ölçüm sonucudur, boşluk değil. */
  gapsMeasured: boolean;
  gaps: ProgressGap[];
  topics: { label: string; pct: number; solved: number; lessons: number; state?: TopicMasteryState }[];
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
/**
 * Sınav günü tahmini kaç biten dersten sonra görünür. 29 Eylül'de "Astra: ilk iki ders" diye 2
 * yazılmıştı; 19 Ekim 2026'da Astra'da ilk dersten hemen sonra tahmin ve tempo kartı görüldü.
 */
const FORECAST_MIN_LESSONS = 1;
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

const SOLVED_KINDS = new Set<PlanNodeKind>([
  "quiz",
  "true_false",
  "final_check",
  "focused",
  "gaps",
  "oral",
  "written_exam",
  "qa",
]);

function sameTopic(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = (left ?? "").trim().toLocaleLowerCase("tr");
  const b = (right ?? "").trim().toLocaleLowerCase("tr");
  return Boolean(a) && a === b;
}

/**
 * Soru üreten düğümlerin son oturumu. Ders, kart ve podcast "çözüldü"ye girmez.
 * Aynı kök bir kez sayılır. Yazılı deneme ve sözlüdeki 100'lük yüzde paydası soru sayısı değildir.
 * Deneme maddesi, düğümün konusuna değil maddenin kendi konusuna yazılır.
 */
function uniqueSolved(
  attempts: ProgressAttempt[],
  ids: Set<string>,
  nodes: Map<string, ProgressNode>,
  topicLabel: string,
): number {
  const latest = new Map<string, ProgressAttempt>();
  for (const attempt of attempts) {
    const prev = latest.get(attempt.nodeId);
    if (!prev || Date.parse(attempt.createdAt) >= Date.parse(prev.createdAt)) latest.set(attempt.nodeId, attempt);
  }
  const seen = new Set<string>();
  let count = 0;
  for (const attempt of latest.values()) {
    const node = nodes.get(attempt.nodeId);
    const kind = node?.kind;
    if (kind && !SOLVED_KINDS.has(kind)) continue;
    const onTopicNode = ids.has(attempt.nodeId);
    const solved = attempt.solved ?? [];
    if (solved.length) {
      for (const item of solved) {
        const belongs = item.topic ? sameTopic(item.topic, topicLabel) : onTopicNode;
        const key = item.key.trim().toLocaleLowerCase("tr");
        if (!belongs || !key || seen.has(key)) continue;
        seen.add(key);
        count += 1;
      }
      continue;
    }
    if (!onTopicNode) continue;
    const stems = attempt.stems ?? [];
    if (stems.length) {
      for (const stem of stems) {
        const key = stem.trim().toLocaleLowerCase("tr");
        if (!key || seen.has(key)) continue;
        seen.add(key);
        count += 1;
      }
      continue;
    }
    const total = attempt.total ?? 0;
    if (total > 0 && total !== 100) count += total;
  }
  return count;
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
  /** Konu hâkimiyeti (0–100). Varsa çubuk tamamlanan adımdan değil buradan gelir; listede olmayan konu 0. */
  /** `confidence`: `topicMasteryPercent` (sönümlü yüzde); `state`: aynı kaynaktan "Sağlam / Çalışılacak" (29 Ekim 2026). */
  topicMastery?: { label: string; confidence: number; state?: TopicMasteryState }[];
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
    const ids = new Set(topicNodes.map((node) => node.id));
    const solved = uniqueSolved(completed, ids, nodeById, label);
    const scored = completed.filter((attempt) => ids.has(attempt.nodeId) && (attempt.total ?? 0) > 0 && attempt.total !== 100);
    const earned = scored.reduce((sum, attempt) => sum + Math.max(0, attempt.score ?? 0), 0);
    const possible = scored.reduce((sum, attempt) => sum + (attempt.total ?? 0), 0);
    const accuracy = possible > 0 ? Math.round((earned / possible) * 100) : null;
    const mastery = input.topicMastery?.find((row) => row.label === label);
    const masteryPct = typeof mastery?.confidence === "number" ? Math.round(mastery.confidence) : null;
    return {
      label,
      pct: masteryPct ?? accuracy ?? 0,
      solved,
      lessons: topicNodes.filter((node) => LESSON_KINDS.has(node.kind)).length,
      ...(mastery?.state ? { state: mastery.state } : {}),
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

  const examTime = input.examDate ? Date.parse(input.examDate) : Number.NaN;
  const daysToExam = Number.isFinite(examTime) ? Math.max(1, Math.ceil((examTime - now) / DAY_MS)) : null;
  const gainPerLessonPct = lessonsDone > 0 && scorePct > 0 ? Math.max(1, Math.round(scorePct / lessonsDone)) : 0;
  const pace: PrepProgressView["pace"] =
    gainPerLessonPct > 0
      ? (() => {
          const lessonsToTarget = Math.max(0, Math.ceil(Math.max(0, targetPct - scorePct) / gainPerLessonPct));
          const perDay = daysToExam ? Math.ceil(lessonsToTarget / daysToExam) : lessonsToTarget > 0 ? 1 : null;
          const daily = perDay && perDay > 0 ? perDay : lessonsToTarget > 0 ? 1 : null;
          const daysToFinish = lessonsToTarget === 0 ? 0 : daily ? Math.ceil(lessonsToTarget / daily) : null;
          return {
            gainPerLessonPct,
            lessonsToTarget,
            perDay,
            daysToFinish,
            // Ayrı ders sayısı: aynı dersin tekrar kayıtları bir kez sayılır — kahraman alanındaki
            // "1 ders tamamlandı" ile çelişmesin (canlıda "Bugün 4 ders" çıkmıştı, 19 Ekim 2026).
            todayLessons: new Set(
              completed
                .filter((attempt) => {
                  const node = nodeById.get(attempt.nodeId);
                  const time = Date.parse(attempt.createdAt);
                  return Boolean(node && LESSON_KINDS.has(node.kind)) && Number.isFinite(time) && now - time < DAY_MS;
                })
                .map((attempt) => attempt.nodeId),
            ).size,
          };
        })()
      : null;

  // Tahmin hazırlık yüzdesinden başlar. Gün sayısı tempo kartıyla aynı bölme: kalan ders / günde ders.
  let forecast: PrepProgressView["forecast"];
  if (lessonsDone < FORECAST_MIN_LESSONS) {
    forecast = {
      kind: "waiting",
      reason: "İlerleme eğilimin ve tahminin, bu hazırlıktaki ilk dersten sonra görünür.",
    };
  } else if (!Number.isFinite(examTime)) {
    forecast = { kind: "waiting", reason: "Sınav tarihi girilince tahmin görünür." };
  } else if (!pace || pace.daysToFinish == null) {
    forecast = {
      kind: "ready",
      pct: scorePct,
      text: `Hazırlık %${scorePct}. Hedefin %${targetPct}.`,
    };
  } else if (pace.daysToFinish === 0 || scorePct >= targetPct) {
    forecast = {
      kind: "ready",
      pct: scorePct,
      text: `Hazırlık %${scorePct}. Hedefin %${targetPct}.`,
    };
  } else {
    const daysLeft = daysToExam ?? pace.daysToFinish;
    const span = Math.max(1, pace.daysToFinish);
    const projected = Math.round(
      Math.min(targetPct, scorePct + ((targetPct - scorePct) * Math.min(daysLeft, span)) / span),
    );
    forecast = {
      kind: "ready",
      pct: projected,
      text: `Bu tempoyla yaklaşık ${pace.daysToFinish} günde hazırlık %${projected} olur. ${pace.lessonsToTarget} ders, günde ${pace.perDay}.`,
    };
  }
  const gapsMeasured = completed.some((attempt) => (attempt.total ?? 0) > 0);

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
    forecastSeries: buildReadinessForecastSeries({
      currentPct: scorePct,
      targetPct,
      gainPerDay: gainPerLessonPct > 0 ? Math.min(6, gainPerLessonPct) : 0,
      daysRemaining: daysToExam,
      daysToTarget: pace?.daysToFinish ?? null,
    }),
    pace,
    gapsMeasured,
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
