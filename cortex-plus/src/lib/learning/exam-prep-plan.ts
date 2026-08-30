export type PlanNodeKind =
  | "podcast"
  | "qa"
  | "quiz"
  | "true_false"
  | "oral"
  | "spaced"
  | "gaps"
  | "flashcards"
  | "written_exam";

export type NodeStatus = "locked" | "ready" | "done";

export type PlanNodeDraft = {
  kind: PlanNodeKind;
  title: string;
  dayIndex: number;
  sortOrder: number;
};

export const PLAN_NODE_META: Record<
  PlanNodeKind,
  { title: string; blurb: string; setupLabel: string; voice: boolean }
> = {
  podcast: {
    title: "Podcast dinle",
    blurb: "Konuyu sesli özetle dinle.",
    setupLabel: "Podcast",
    voice: false,
  },
  qa: {
    title: "Soru-Cevap",
    blurb: "Yapay zeka öğretmenle alıştırma.",
    setupLabel: "Alıştırma",
    voice: true,
  },
  quiz: {
    title: "Quiz",
    blurb: "Çoktan seçmeli pratik.",
    setupLabel: "Quiz",
    voice: false,
  },
  true_false: {
    title: "Doğru / Yanlış",
    blurb: "Kısa iddialarla hızlan.",
    setupLabel: "Doğru / Yanlış",
    voice: false,
  },
  oral: {
    title: "Sözlü deneme",
    blurb: "Açık uçlu sözlü sorular.",
    setupLabel: "Sözlü",
    voice: true,
  },
  spaced: {
    title: "Aralıklı tekrar",
    blurb: "Öğrendiklerini tekrar et.",
    setupLabel: "Tekrar",
    voice: false,
  },
  gaps: {
    title: "Zayıf nokta",
    blurb: "Boşlukları kapat, odaklı pratik.",
    setupLabel: "Odaklı pratik",
    voice: false,
  },
  flashcards: {
    title: "Kartlarla tekrar",
    blurb: "Kısa kartlarla son tur.",
    setupLabel: "Kartlar",
    voice: false,
  },
  written_exam: {
    title: "Yazılı deneme",
    blurb: "Gerçek sınav simülasyonu, yardım yok.",
    setupLabel: "Yazılı deneme",
    voice: false,
  },
};

const CORE_ORDER: PlanNodeKind[] = [
  "podcast",
  "qa",
  "quiz",
  "true_false",
  "oral",
  "spaced",
  "gaps",
  "flashcards",
  "written_exam",
];

const FILL_ORDER: PlanNodeKind[] = ["spaced", "gaps", "flashcards", "quiz", "qa"];

export function daysUntilExam(examDate: string, from = new Date()): number {
  const start = new Date(from);
  start.setHours(0, 0, 0, 0);
  const exam = new Date(`${examDate}T00:00:00`);
  const diff = Math.ceil((exam.getTime() - start.getTime()) / 86_400_000);
  return Math.max(1, diff);
}

export function buildExamPlan(days: number): PlanNodeDraft[] {
  const span = Math.max(1, Math.min(120, Math.floor(days)));
  const nodes: PlanNodeDraft[] = [];

  CORE_ORDER.forEach((kind, index) => {
    const dayIndex =
      span >= CORE_ORDER.length
        ? index + 1
        : Math.min(span, Math.floor((index * span) / CORE_ORDER.length) + 1);
    nodes.push({
      kind,
      title: PLAN_NODE_META[kind].title,
      dayIndex,
      sortOrder: index,
    });
  });

  if (span > CORE_ORDER.length) {
    for (let day = CORE_ORDER.length + 1; day <= span; day += 1) {
      const kind = FILL_ORDER[(day - CORE_ORDER.length - 1) % FILL_ORDER.length];
      nodes.push({
        kind,
        title: PLAN_NODE_META[kind].title,
        dayIndex: day,
        sortOrder: nodes.length,
      });
    }
  }

  return nodes;
}

export function nodeProgress(nodes: { status: NodeStatus }[]) {
  const total = nodes.length;
  const done = nodes.filter((node) => node.status === "done").length;
  return {
    done,
    total,
    pct: total ? Math.round((done / total) * 100) : 0,
  };
}

export function nextReadyNode<T extends { status: NodeStatus; sortOrder: number }>(
  nodes: T[],
) {
  return (
    nodes.find((node) => node.status === "ready") ??
    nodes.find((node) => node.status !== "done") ??
    null
  );
}
