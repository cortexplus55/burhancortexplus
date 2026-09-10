/**
 * Stage 4 — exam-date / daily-time / topic-scope schedule builder (pure).
 * Legacy buildExamPlan stays for pdf_learning_v2 OFF.
 */

import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import type { MeasuredLevel } from "@/lib/learning/diagnostic";

export type ScheduleSessionRole = "learn" | "practice" | "review" | "mock";

export type ScheduleTopicInput = {
  id: string;
  title: string;
  objective?: string | null;
  prerequisites?: string[];
  pageNumbers?: number[];
  /** Measured diagnostic; unknown if unmeasured. */
  measuredLevel?: MeasuredLevel | null;
  /** Self-report hard topic — priority boost only, not measured. */
  selfHard?: boolean;
  /** Explicit priority 1 (high) .. 5 (low). */
  priority?: number | null;
};

export type ScheduleBuildInput = {
  daysToExam: number;
  dailyMinutes: number;
  /** ISO weekday 1=Mon .. 7=Sun */
  studyDays: number[];
  topics: ScheduleTopicInput[];
  targetScore?: number | null;
  /** Calendar start (local date); defaults to today. */
  fromDate?: Date;
};

export type ScheduleSession = {
  dayIndex: number;
  calendarDate: string;
  topicId: string;
  topicTitle: string;
  objective: string;
  sourcePages: number[];
  durationMinutes: number;
  role: ScheduleSessionRole;
  kind: PlanNodeKind;
  sortOrder: number;
};

export type ScheduleFitOption =
  | "increase_daily_time"
  | "prioritize_topics"
  | "cut_scope"
  | "extend_days";

export type ScheduleBuildResult = {
  sessions: ScheduleSession[];
  availableMinutes: number;
  requiredMinutes: number;
  fits: boolean;
  cutTopicIds: string[];
  optionsIfTight: ScheduleFitOption[];
  orderedTopicIds: string[];
  studyDayDates: string[];
  summary: string;
};

const ROLE_KIND: Record<ScheduleSessionRole, PlanNodeKind> = {
  learn: "podcast",
  practice: "quiz",
  review: "spaced",
  mock: "written_exam",
};

/**
 * Sıkıştırmanın tabanı. Bunun altına inen bir konu, planda görünse de
 * öğrenciye bir şey öğretemeyecek kadar kısa kalır.
 */
const MIN_TOPIC_MINUTES = 12;

const LEVEL_LOAD: Record<MeasuredLevel, number> = {
  unknown: 1.15,
  weak: 1.35,
  emerging: 1.0,
  solid: 0.75,
};

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function startOfDay(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

/** Monday=1 .. Sunday=7 */
export function weekdayMon1(d: Date): number {
  const js = d.getDay();
  return js === 0 ? 7 : js;
}

export function listStudyDayDates(
  daysToExam: number,
  studyDays: number[],
  from = new Date(),
): string[] {
  const span = Math.max(1, Math.min(120, Math.floor(daysToExam)));
  const allowed = new Set(
    (studyDays.length ? studyDays : [1, 2, 3, 4, 5]).filter(
      (d) => d >= 1 && d <= 7,
    ),
  );
  const start = startOfDay(from);
  const dates: string[] = [];
  for (let offset = 0; offset < span; offset += 1) {
    const day = new Date(start);
    day.setDate(start.getDate() + offset);
    if (allowed.has(weekdayMon1(day))) dates.push(isoDate(day));
  }
  // Always keep at least one study slot if exam is tomorrow and filter emptied the list.
  if (!dates.length) {
    dates.push(isoDate(start));
  }
  return dates;
}

export function estimateTopicMinutes(topic: ScheduleTopicInput): number {
  const pages = topic.pageNumbers?.length ?? 2;
  const base = 25 + Math.min(40, pages * 4);
  const level = topic.measuredLevel ?? "unknown";
  const hardBoost = topic.selfHard ? 1.2 : 1;
  const priority =
    topic.priority && topic.priority >= 1 && topic.priority <= 5
      ? 1.25 - (topic.priority - 1) * 0.05
      : 1;
  return Math.round(base * LEVEL_LOAD[level] * hardBoost * priority);
}

/**
 * Topological order by prerequisites (titles), then priority / weakness.
 */
export function orderTopicsByPrerequisites(
  topics: ScheduleTopicInput[],
): ScheduleTopicInput[] {
  const byTitle = new Map(
    topics.map((t) => [t.title.trim().toLocaleLowerCase("tr"), t]),
  );
  const remaining = new Set(topics.map((t) => t.id));
  const ordered: ScheduleTopicInput[] = [];
  const score = (t: ScheduleTopicInput) => {
    const pri = t.priority ?? 3;
    const weak =
      t.measuredLevel === "weak" || t.selfHard
        ? 0
        : t.measuredLevel === "emerging"
          ? 1
          : 2;
    return weak * 10 + pri;
  };

  while (remaining.size) {
    const ready = topics.filter((t) => {
      if (!remaining.has(t.id)) return false;
      const prereqs = t.prerequisites ?? [];
      return prereqs.every((p) => {
        const node = byTitle.get(p.trim().toLocaleLowerCase("tr"));
        return !node || !remaining.has(node.id);
      });
    });
    const pick = (ready.length ? ready : topics.filter((t) => remaining.has(t.id))).sort(
      (a, b) => score(a) - score(b) || a.title.localeCompare(b.title, "tr"),
    )[0];
    if (!pick) break;
    remaining.delete(pick.id);
    ordered.push(pick);
  }
  return ordered;
}

function roleMinutes(role: ScheduleSessionRole, topicMinutes: number): number {
  if (role === "learn") return Math.round(topicMinutes * 0.45);
  if (role === "practice") return Math.round(topicMinutes * 0.35);
  if (role === "review") return Math.round(topicMinutes * 0.2);
  return Math.min(45, Math.max(20, Math.round(topicMinutes * 0.3)));
}

function objectiveFor(topic: ScheduleTopicInput, role: ScheduleSessionRole): string {
  if (topic.objective?.trim()) {
    if (role === "learn") return topic.objective.trim();
    if (role === "practice") return `Uygula: ${topic.objective.trim()}`;
    if (role === "review") return `Tekrar: ${topic.objective.trim()}`;
    return `Deneme hazırlığı: ${topic.objective.trim()}`;
  }
  if (role === "learn") return `${topic.title} konusunu öğren`;
  if (role === "practice") return `${topic.title} alıştırması`;
  if (role === "review") return `${topic.title} tekrarı`;
  return "Kapsamlı yazılı deneme";
}

/**
 * Build a real calendar: prereq order, load vs available time, honest cuts.
 * Never stacks brand-new learn sessions on the last study day.
 */
export function buildExamScheduleV2(input: ScheduleBuildInput): ScheduleBuildResult {
  const daily = Math.max(5, Math.min(480, Math.floor(input.dailyMinutes || 45)));
  const studyDayDates = listStudyDayDates(
    input.daysToExam,
    input.studyDays,
    input.fromDate,
  );
  const availableMinutes = studyDayDates.length * daily;
  const ordered = orderTopicsByPrerequisites(input.topics);
  const loads = ordered.map((t) => ({
    topic: t,
    minutes: estimateTopicMinutes(t),
  }));

  const mockBuffer = Math.min(45, daily);
  let required = loads.reduce((s, x) => s + x.minutes, 0) + mockBuffer;
  // Mock exam buffer on last day.
  const kept = [...loads];
  const cutTopicIds: string[] = [];
  const optionsIfTight: ScheduleFitOption[] = [];

  /**
   * Süre yetmediğinde konu ATILMAZ, sıkıştırılır.
   *
   * Eskiden en düşük öncelikli konular plandan çıkarılıyordu: öğrenci sekiz
   * konu onaylayıp dördünü alıyordu. Sınavda o dört konu da çıkacağı için
   * plan, kapsamı daraltarak değil yalnızca kendi vaadini daraltarak
   * "sığıyor" hâline geliyordu. Konu başına süreyi kısmak dürüst olan:
   * her konu planda kalır, dar zamanda her birine daha az yer düşer.
   */
  if (required > availableMinutes) {
    optionsIfTight.push("increase_daily_time", "prioritize_topics");
    if (input.daysToExam < 60) optionsIfTight.push("extend_days");

    const topicTotal = required - mockBuffer;
    const budget = Math.max(0, availableMinutes - mockBuffer);
    const factor = topicTotal > 0 ? budget / topicTotal : 1;
    for (const load of kept) {
      // Zorlandığı ve ölçülmemiş konular sıkıştırmadan daha az etkilenir.
      const shield =
        load.topic.selfHard || (load.topic.measuredLevel ?? "unknown") === "unknown"
          ? 1.1
          : 1;
      load.minutes = Math.max(
        MIN_TOPIC_MINUTES,
        Math.round(load.minutes * factor * shield),
      );
    }
    required = kept.reduce((s, x) => s + x.minutes, 0) + mockBuffer;
  }

  // Taban süreye rağmen sığmıyorsa gerçekten süre yetmiyor — yine de kapsam
  // daraltılmaz, durum olduğu gibi bildirilir.
  const fits = required <= availableMinutes;
  const sessions: ScheduleSession[] = [];
  let sortOrder = 0;

  // Day budgets
  const dayBudget = studyDayDates.map(() => daily);
  const lastIdx = studyDayDates.length - 1;

  const place = (
    dayIndex: number,
    topic: ScheduleTopicInput,
    role: ScheduleSessionRole,
    minutes: number,
  ) => {
    const duration = Math.max(10, Math.min(dayBudget[dayIndex], minutes));
    if (duration < 10 || dayBudget[dayIndex] < 10) return false;
    dayBudget[dayIndex] -= duration;
    sessions.push({
      dayIndex: dayIndex + 1,
      calendarDate: studyDayDates[dayIndex],
      topicId: topic.id,
      topicTitle: topic.title,
      objective: objectiveFor(topic, role),
      sourcePages: [...(topic.pageNumbers ?? [])],
      durationMinutes: duration,
      role,
      kind: ROLE_KIND[role],
      sortOrder: sortOrder++,
    });
    return true;
  };

  // Place learn+practice early; reviews mid/late; mock only on last day.
  for (const { topic, minutes } of kept) {
    const learnM = roleMinutes("learn", minutes);
    const practiceM = roleMinutes("practice", minutes);
    const reviewM = roleMinutes("review", minutes);

    let learnDay = -1;
    for (let d = 0; d < Math.max(0, lastIdx); d += 1) {
      if (dayBudget[d] >= learnM) {
        if (place(d, topic, "learn", learnM)) {
          learnDay = d;
          break;
        }
      }
    }
    if (learnDay < 0) {
      for (let d = 0; d < lastIdx; d += 1) {
        if (place(d, topic, "learn", Math.min(learnM, dayBudget[d]))) {
          learnDay = d;
          break;
        }
      }
    }
    if (learnDay < 0) {
      // Günlük bütçeler tükendi. Konuyu plandan düşürmek yerine en boş güne
      // taşımayı seçiyoruz: o gün hedeflenen süreyi aşar ama konu sınavda
      // çıkacağı için planda görünmesi gerekir. `fits` zaten false, öğrenci
      // planın sıkıştığını görüyor.
      let target = 0;
      for (let d = 1; d < Math.max(1, lastIdx); d += 1) {
        if (dayBudget[d] > dayBudget[target]) target = d;
      }
      dayBudget[target] -= MIN_TOPIC_MINUTES;
      sessions.push({
        dayIndex: target + 1,
        calendarDate: studyDayDates[target],
        topicId: topic.id,
        topicTitle: topic.title,
        objective: objectiveFor(topic, "learn"),
        sourcePages: [...(topic.pageNumbers ?? [])],
        durationMinutes: MIN_TOPIC_MINUTES,
        role: "learn",
        kind: ROLE_KIND.learn,
        sortOrder: sortOrder++,
      });
      learnDay = target;
    }

    const practiceStart = Math.max(0, learnDay);
    for (let d = practiceStart; d < lastIdx; d += 1) {
      if (place(d, topic, "practice", practiceM)) break;
    }

    // Reviews prefer later days but not only last if we need mock room.
    for (let d = Math.max(learnDay + 1, 0); d <= lastIdx; d += 1) {
      if (d === lastIdx && dayBudget[d] < reviewM + 20) continue;
      if (place(d, topic, "review", reviewM)) break;
    }
  }

  // Last day: mock only (no new learn). Use a synthetic topic if needed.
  const mockTopic: ScheduleTopicInput = kept[0]?.topic ?? {
    id: "mock",
    title: "Genel deneme",
    pageNumbers: [],
  };
  place(lastIdx, mockTopic, "mock", Math.min(45, dayBudget[lastIdx] || daily));

  // Ensure we never left a learn on last day.
  for (const session of sessions) {
    if (session.dayIndex === lastIdx + 1 && session.role === "learn") {
      session.role = "review";
      session.kind = ROLE_KIND.review;
      session.objective = objectiveFor(
        { id: session.topicId, title: session.topicTitle },
        "review",
      );
    }
  }

  const summary = fits
    ? `${loads.length} konu · ${studyDayDates.length} çalışma günü × ${daily} dk`
    : `${loads.length} konu planda, ama süre dar: ~${required} dk gerekir, ` +
      `${studyDayDates.length} çalışma gününde ${availableMinutes} dk var`;

  return {
    sessions: sessions.sort(
      (a, b) => a.dayIndex - b.dayIndex || a.sortOrder - b.sortOrder,
    ),
    availableMinutes,
    requiredMinutes: required,
    fits,
    cutTopicIds,
    optionsIfTight: fits ? [] : optionsIfTight,
    orderedTopicIds: kept.map((k) => k.topic.id),
    studyDayDates,
    summary,
  };
}

export type CompletedSessionRef = {
  sortOrder: number;
  calendarDate: string;
};

/**
 * Missed days: keep completed sessions; redistribute remaining onto future study days.
 * Does not rewrite past calendar dates of completed work.
 */
export function redistributeRemainingSchedule(input: {
  previous: ScheduleBuildResult;
  completed: CompletedSessionRef[];
  fromDate?: Date;
  dailyMinutes: number;
  studyDays: number[];
  daysToExam: number;
  topics: ScheduleTopicInput[];
}): ScheduleBuildResult {
  const completedKeys = new Set(
    input.completed.map((c) => `${c.calendarDate}:${c.sortOrder}`),
  );
  const keptCompleted = input.previous.sessions.filter((s) =>
    completedKeys.has(`${s.calendarDate}:${s.sortOrder}`),
  );
  const remainingTopicIds = new Set(
    input.previous.sessions
      .filter((s) => !completedKeys.has(`${s.calendarDate}:${s.sortOrder}`))
      .map((s) => s.topicId),
  );
  const topics = input.topics.filter((t) => remainingTopicIds.has(t.id));
  const rebuilt = buildExamScheduleV2({
    daysToExam: input.daysToExam,
    dailyMinutes: input.dailyMinutes,
    studyDays: input.studyDays,
    topics,
    fromDate: input.fromDate,
  });
  const completedMaxSort = keptCompleted.reduce(
    (m, s) => Math.max(m, s.sortOrder),
    -1,
  );
  const merged = [
    ...keptCompleted,
    ...rebuilt.sessions.map((s, i) => ({
      ...s,
      sortOrder: completedMaxSort + 1 + i,
    })),
  ];
  return {
    ...rebuilt,
    sessions: merged,
    summary: `Kaçırılan günler yeniden dağıtıldı · tamamlanan ${keptCompleted.length} oturum korundu · ${rebuilt.summary}`,
  };
}

/** Map schedule sessions to legacy node drafts for create_exam_prep_graph. */
export function scheduleSessionsToNodeDrafts(sessions: ScheduleSession[]) {
  return sessions.map((s) => ({
    kind: s.kind,
    title: `${s.topicTitle} · ${
      s.role === "learn"
        ? "Öğren"
        : s.role === "practice"
          ? "Pratik"
          : s.role === "review"
            ? "Tekrar"
            : "Deneme"
    }`,
    dayIndex: s.dayIndex,
    sortOrder: s.sortOrder,
    meta: {
      topicId: s.topicId,
      topicTitle: s.topicTitle,
      objective: s.objective,
      sourcePages: s.sourcePages,
      durationMinutes: s.durationMinutes,
      role: s.role,
      calendarDate: s.calendarDate,
    },
  }));
}
