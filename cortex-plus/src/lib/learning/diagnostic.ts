/**
 * Stage 3 diagnostic helpers — pure logic for topic sampling and starting level.
 * Self-report (familiarity / hard topics) stays separate from measured_level.
 */

import {
  sameOptionSet,
  selectedOptions,
  type QuizQuestion,
} from "@/lib/learning/exam-quiz";

export const DIAGNOSTIC_SKILLS = [
  "definition",
  "concept",
  "application",
  "multi_step",
  "misconception",
] as const;

export type DiagnosticSkill = (typeof DIAGNOSTIC_SKILLS)[number];

export type MeasuredLevel = "unknown" | "weak" | "emerging" | "solid";

export type DiagnosticTopicStatus = "unmeasured" | "measured" | "unreadable";

export type DiagnosticTopicInput = {
  id: string;
  title: string;
  /** Prep topic row id when already linked. */
  examPrepTopicId?: string | null;
  pageNumbers: number[];
};

export type DiagnosticTopicPlan = {
  id: string;
  title: string;
  examPrepTopicId: string | null;
  pageNumbers: number[];
  status: DiagnosticTopicStatus;
  reason?: string;
};

export type DiagnosticQuestionMeta = {
  topicId: string;
  topicLabel: string;
  examPrepTopicId: string | null;
  skill: DiagnosticSkill;
};

export type DiagnosticQuestion = QuizQuestion & DiagnosticQuestionMeta;

export type DiagnosticEvidenceItem = {
  questionIndex: number;
  topicId: string;
  topicLabel: string;
  skill: DiagnosticSkill;
  correct: boolean;
  questionPreview: string;
};

export type TopicDiagnosticResult = {
  topicId: string;
  topicLabel: string;
  examPrepTopicId: string | null;
  status: DiagnosticTopicStatus;
  measuredLevel: MeasuredLevel;
  /** Self-report is never written here — caller keeps it separate. */
  skillHits: Partial<Record<DiagnosticSkill, { correct: boolean; questionIndex: number }>>;
  evidence: DiagnosticEvidenceItem[];
  reason?: string;
};

export type DiagnosticScoreResult = {
  score: number;
  total: number;
  overallMeasured: MeasuredLevel;
  startingLevelLabel: string;
  evidence: DiagnosticEvidenceItem[];
  topicResults: TopicDiagnosticResult[];
};

const SKILL_CYCLE: DiagnosticSkill[] = [
  "definition",
  "concept",
  "application",
  "misconception",
  "multi_step",
];

/** Cap so a short quiz cannot claim full mastery. */
export const DIAGNOSTIC_MAX_QUESTIONS = 10;

/**
 * Main topics = top-level nodes (no parent). Falls back to all nodes if none.
 * Unreadable pages that are a topic's only pages → topic not measured.
 */
export function planDiagnosticTopics(
  topics: DiagnosticTopicInput[],
  unreadablePageNumbers: number[],
): DiagnosticTopicPlan[] {
  const unread = new Set(unreadablePageNumbers);
  return topics.map((topic) => {
    const pages = topic.pageNumbers ?? [];
    if (!pages.length) {
      return {
        id: topic.id,
        title: topic.title,
        examPrepTopicId: topic.examPrepTopicId ?? null,
        pageNumbers: pages,
        status: "unmeasured" as const,
        reason: "Konuya bağlı okunabilir sayfa yok — ölçülmedi.",
      };
    }
    const readable = pages.filter((n) => !unread.has(n));
    if (readable.length === 0) {
      return {
        id: topic.id,
        title: topic.title,
        examPrepTopicId: topic.examPrepTopicId ?? null,
        pageNumbers: pages,
        status: "unreadable" as const,
        reason: "Konu sayfaları okunamadı — ölçülmedi (unknown).",
      };
    }
    return {
      id: topic.id,
      title: topic.title,
      examPrepTopicId: topic.examPrepTopicId ?? null,
      pageNumbers: readable,
      status: "unmeasured" as const,
    };
  });
}

/** Prefer parentless (main) topics; if empty, use all. */
export function pickMainTopics<T extends { id: string; parentId?: string | null }>(
  nodes: T[],
): T[] {
  const mains = nodes.filter((n) => !n.parentId);
  return mains.length ? mains : nodes;
}

/**
 * One light probe per measurable topic, cycling skill types.
 * Unreadable topics get no questions (stay unknown).
 */
export function buildDiagnosticSkillPlan(
  plans: DiagnosticTopicPlan[],
  maxQuestions = DIAGNOSTIC_MAX_QUESTIONS,
): Array<{ topic: DiagnosticTopicPlan; skill: DiagnosticSkill }> {
  const measurable = plans.filter((p) => p.status !== "unreadable" && p.pageNumbers.length > 0);
  const slots: Array<{ topic: DiagnosticTopicPlan; skill: DiagnosticSkill }> = [];
  for (let i = 0; i < measurable.length && slots.length < maxQuestions; i += 1) {
    slots.push({
      topic: measurable[i],
      skill: SKILL_CYCLE[i % SKILL_CYCLE.length],
    });
  }
  return slots;
}

export function measuredLevelFromAccuracy(correct: number, total: number): MeasuredLevel {
  if (total <= 0) return "unknown";
  const ratio = correct / total;
  if (ratio < 0.34) return "weak";
  if (ratio < 0.67) return "emerging";
  return "solid";
}

export function overallMeasuredFromTopics(results: TopicDiagnosticResult[]): MeasuredLevel {
  const measured = results.filter((r) => r.status === "measured");
  if (!measured.length) return "unknown";
  const rank: Record<MeasuredLevel, number> = {
    unknown: 0,
    weak: 1,
    emerging: 2,
    solid: 3,
  };
  const avg =
    measured.reduce((sum, r) => sum + rank[r.measuredLevel], 0) / measured.length;
  if (avg < 1.34) return "weak";
  if (avg < 2.34) return "emerging";
  return "solid";
}

export function startingLevelLabel(level: MeasuredLevel, measuredCount: number, totalTopics: number) {
  const base =
    level === "weak"
      ? "Başlangıç: güçlendirilecek konular önde"
      : level === "emerging"
        ? "Başlangıç: karışık — bazı konular sağlam"
        : level === "solid"
          ? "Başlangıç: ölçülen konularda iyi sinyal"
          : "Başlangıç: henüz yeterli ölçüm yok";
  return `${base} (${measuredCount}/${totalTopics} konu ölçüldü; kısa test ustalığı kanıtlamaz).`;
}

export function scoreDiagnosticAnswers(
  questions: DiagnosticQuestion[],
  answers: Record<string, unknown>,
  plannedTopics: DiagnosticTopicPlan[],
): DiagnosticScoreResult {
  const byTopic = new Map<string, TopicDiagnosticResult>();

  for (const plan of plannedTopics) {
    byTopic.set(plan.id, {
      topicId: plan.id,
      topicLabel: plan.title,
      examPrepTopicId: plan.examPrepTopicId,
      status: plan.status === "unreadable" ? "unreadable" : "unmeasured",
      measuredLevel: "unknown",
      skillHits: {},
      evidence: [],
      reason: plan.reason,
    });
  }

  const evidence: DiagnosticEvidenceItem[] = [];
  let score = 0;

  questions.forEach((question, index) => {
    const correct = sameOptionSet(
      selectedOptions(answers[String(index)]),
      question.correct,
    );
    if (correct) score += 1;

    const item: DiagnosticEvidenceItem = {
      questionIndex: index,
      topicId: question.topicId,
      topicLabel: question.topicLabel,
      skill: question.skill,
      correct,
      questionPreview: question.text.slice(0, 120),
    };
    evidence.push(item);

    let topic = byTopic.get(question.topicId);
    if (!topic) {
      topic = {
        topicId: question.topicId,
        topicLabel: question.topicLabel,
        examPrepTopicId: question.examPrepTopicId,
        status: "unmeasured",
        measuredLevel: "unknown",
        skillHits: {},
        evidence: [],
      };
      byTopic.set(question.topicId, topic);
    }
    if (topic.status === "unreadable") return;
    topic.status = "measured";
    topic.skillHits[question.skill] = { correct, questionIndex: index };
    topic.evidence.push(item);
  });

  for (const topic of byTopic.values()) {
    if (topic.status !== "measured") {
      topic.measuredLevel = "unknown";
      continue;
    }
    const hits = Object.values(topic.skillHits);
    const ok = hits.filter((h) => h.correct).length;
    topic.measuredLevel = measuredLevelFromAccuracy(ok, hits.length);
    topic.reason = undefined;
  }

  const topicResults = [...byTopic.values()];
  const overallMeasured = overallMeasuredFromTopics(topicResults);
  const measuredCount = topicResults.filter((t) => t.status === "measured").length;

  return {
    score,
    total: questions.length || 1,
    overallMeasured,
    startingLevelLabel: startingLevelLabel(
      overallMeasured,
      measuredCount,
      topicResults.length,
    ),
    evidence,
    topicResults,
  };
}

export function isDiagnosticSkill(value: unknown): value is DiagnosticSkill {
  return (
    typeof value === "string" &&
    (DIAGNOSTIC_SKILLS as readonly string[]).includes(value)
  );
}

export function attachQuestionMeta(
  questions: QuizQuestion[],
  slots: Array<{ topic: DiagnosticTopicPlan; skill: DiagnosticSkill }>,
): DiagnosticQuestion[] {
  return questions.slice(0, slots.length).map((q, i) => ({
    ...q,
    topicId: slots[i].topic.id,
    topicLabel: slots[i].topic.title,
    examPrepTopicId: slots[i].topic.examPrepTopicId,
    skill: slots[i].skill,
  }));
}
