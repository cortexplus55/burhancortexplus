/**
 * Bugünkü çalışma planı — statik takvim değil; overdue görevleri bugüne çeker.
 */

export type TodaysPlanTaskKind =
  | "review"
  | "mistakes"
  | "quiz"
  | "oral"
  | "prep_node"
  | "study_plan"
  | "other";

export type TodaysPlanTask = {
  id: string;
  title: string;
  minutes: number;
  href: string;
  kind: TodaysPlanTaskKind;
  /** True if originally due before today and rescheduled in memory. */
  wasOverdue?: boolean;
};

export type StudyPlanTaskRow = {
  id: string;
  title: string;
  due_date: string | null;
  completed: boolean;
};

function istanbulToday(from = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(from);
}

/** Overdue incomplete tasks get due_date = today (pure; persist separately). */
export function rescheduleOverdueTasks(
  tasks: StudyPlanTaskRow[],
  today = istanbulToday(),
): { tasks: StudyPlanTaskRow[]; movedIds: string[] } {
  const movedIds: string[] = [];
  const next = tasks.map((task) => {
    if (task.completed || !task.due_date || task.due_date >= today) return task;
    movedIds.push(task.id);
    return { ...task, due_date: today };
  });
  return { tasks: next, movedIds };
}

const KIND_MINUTES: Record<TodaysPlanTaskKind, number> = {
  review: 8,
  mistakes: 12,
  quiz: 10,
  oral: 5,
  prep_node: 15,
  study_plan: 10,
  other: 8,
};

export function estimateMinutes(kind: TodaysPlanTaskKind, override?: number): number {
  if (override != null && override > 0) return override;
  return KIND_MINUTES[kind];
}

/**
 * Builds ordered today's task list for the dashboard.
 * Caller supplies candidate slots; this function caps and totals minutes.
 */
export function buildTodaysStudyPlan(input: {
  studyPlanTasks?: { id: string; title: string; href?: string }[];
  openMistakes?: number;
  weakTopicLabels?: string[];
  prepNode?: { id: string; title: string; href: string } | null;
  includeOral?: boolean;
  maxTasks?: number;
  /**
   * Öğrencinin günlük süre bütçesi (exam_preps.daily_minutes). Verilirse liste
   * bu tavanı aşmayacak şekilde sondan kırpılır; ilk görev her zaman kalır.
   */
  dailyMinutesCap?: number | null;
}): { tasks: TodaysPlanTask[]; totalMinutes: number } {
  const max = input.maxTasks ?? 4;
  const tasks: TodaysPlanTask[] = [];

  for (const row of input.studyPlanTasks ?? []) {
    if (tasks.length >= max) break;
    tasks.push({
      id: `plan-${row.id}`,
      title: row.title,
      minutes: estimateMinutes("study_plan"),
      href: row.href ?? "/calisma-plani",
      kind: "study_plan",
    });
  }

  if (input.prepNode && tasks.length < max) {
    tasks.push({
      id: `prep-${input.prepNode.id}`,
      title: input.prepNode.title,
      minutes: estimateMinutes("prep_node"),
      href: input.prepNode.href,
      kind: "prep_node",
    });
  }

  const weak = (input.weakTopicLabels ?? []).slice(0, 2);
  for (const label of weak) {
    if (tasks.length >= max) break;
    tasks.push({
      id: `weak-${label}`,
      title: `${label} — kısa tekrar`,
      minutes: estimateMinutes("review"),
      href: `/studio/quiz?topic=${encodeURIComponent(label)}`,
      kind: "review",
    });
  }

  if ((input.openMistakes ?? 0) > 0 && tasks.length < max) {
    const n = Math.min(10, input.openMistakes ?? 0);
    tasks.push({
      id: "mistakes-daily",
      title: `Yanlış defterinden ${n} soru`,
      minutes: estimateMinutes("mistakes"),
      href: "/gunluk",
      kind: "mistakes",
    });
  }

  if (input.includeOral && tasks.length < max) {
    tasks.push({
      id: "oral-mini",
      title: "Sözlü tekrar",
      minutes: estimateMinutes("oral"),
      href: "/studio/sozlu",
      kind: "oral",
    });
  }

  if (tasks.length === 0) {
    tasks.push({
      id: "quiz-default",
      title: "Paragraf mini quiz",
      minutes: estimateMinutes("quiz"),
      href: "/studio/quiz",
      kind: "quiz",
    });
  }

  const cap = input.dailyMinutesCap ?? null;
  if (cap != null && cap > 0) {
    while (tasks.length > 1 && sumMinutes(tasks) > cap) tasks.pop();
  }

  return { tasks, totalMinutes: sumMinutes(tasks) };
}

function sumMinutes(tasks: TodaysPlanTask[]): number {
  return tasks.reduce((sum, t) => sum + t.minutes, 0);
}
