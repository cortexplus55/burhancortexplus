/**
 * Stage 6 — program progress ≠ topic mastery ≠ exam readiness.
 * Pure helpers; runtime writes only when pdf_learning_v2 is ON.
 */

import {
  sameOptionSet,
  selectedOptions,
  type QuizQuestion,
} from "@/lib/learning/exam-quiz";
import type { PlanNodeKind, NodeStatus } from "@/lib/learning/exam-prep-plan";
import { nodeProgress, readinessScore } from "@/lib/learning/exam-prep-plan";

export type AnswerEvidenceDraft = {
  topicKey: string;
  learningObjective: string | null;
  questionIndex: number;
  correct: boolean;
  isFirstAttempt: boolean;
  hintAssisted: boolean;
  independentSuccess: boolean;
  wrongType: string | null;
  sourceKind: string;
  questionPreview: string | null;
};

export type TopicMasterySnapshot = {
  topicKey: string;
  measured: boolean;
  level: "unmeasured" | "weak" | "emerging" | "solid";
  /** 0 when unmeasured — never inflate confidence. */
  confidence: number;
  evidenceCount: number;
  firstAttemptCorrect: number;
  firstAttemptTotal: number;
  independentCorrect: number;
  independentTotal: number;
  lastPracticedAt: string | null;
};

export type LearningIndicators = {
  programProgress: {
    pct: number;
    done: number;
    total: number;
    label: string;
  };
  topicMastery: {
    /** null when nothing measured yet. */
    pct: number | null;
    label: string;
    measuredCount: number;
    unmeasuredCount: number;
    topics: TopicMasterySnapshot[];
  };
  examReadiness: {
    pct: number;
    label: string;
    /** True only when estimate is genuinely maxed with evidence. */
    claimFullyReady: boolean;
    components: {
      measuredSuccessPct: number | null;
      mockPct: number | null;
      coveragePct: number;
      programPct: number;
      openMisconceptions: number;
    };
  };
};

export type TrackingPersisted = {
  version: 1;
  updatedAt: string;
  programProgressPct: number;
  topicMasteryPct: number | null;
  examReadinessPct: number;
  claimFullyReady: boolean;
  measuredTopicCount: number;
  unmeasuredTopicCount: number;
  openMisconceptions: number;
};

const STALE_MS = 7 * 24 * 60 * 60 * 1000;

export function normalizeTopicKey(raw: string | null | undefined): string {
  const t = (raw ?? "").trim().toLowerCase().replace(/\s+/g, " ");
  return t || "genel";
}

/**
 * Build per-answer evidence from a scored attempt payload.
 * Flashcards never count as mastery evidence (participation only).
 */
export function extractAnswerEvidence(input: {
  kind: PlanNodeKind;
  payload: unknown;
  answers: Record<string, unknown>;
  topicLabel?: string | null;
  sessionObjective?: string | null;
  isFirstAttempt: boolean;
  /** Per question index — true if student used a hint before / with the answer. */
  hintsUsed?: Record<string, boolean>;
}): AnswerEvidenceDraft[] {
  const data = (input.payload ?? {}) as Record<string, unknown>;
  const topicKey = normalizeTopicKey(input.topicLabel);
  const hints = input.hintsUsed ?? parseHintsUsed(input.answers);
  const out: AnswerEvidenceDraft[] = [];

  if (data.type === "quiz") {
    const questions =
      (data.questions as (QuizQuestion & {
        misconceptionTag?: string;
        learningObjective?: string;
      })[]) ?? [];
    questions.forEach((question, index) => {
      const correct = sameOptionSet(
        selectedOptions(input.answers[String(index)]),
        question.correct ?? [],
      );
      const hintAssisted = Boolean(hints[String(index)]);
      out.push({
        topicKey,
        learningObjective:
          question.learningObjective?.trim() ||
          input.sessionObjective?.trim() ||
          null,
        questionIndex: index,
        correct,
        isFirstAttempt: input.isFirstAttempt,
        hintAssisted,
        independentSuccess: correct && !hintAssisted,
        wrongType: correct
          ? null
          : question.misconceptionTag?.trim() || "quiz_miss",
        sourceKind: input.kind,
        questionPreview: question.text?.slice(0, 160) ?? null,
      });
    });
  }

  if (data.type === "true_false") {
    const items =
      (data.items as {
        text: string;
        correct: boolean;
        misconceptionTag?: string;
      }[]) ?? [];
    items.forEach((item, index) => {
      const value = input.answers[String(index)];
      const correct = value === item.correct || value === String(item.correct);
      const hintAssisted = Boolean(hints[String(index)]);
      out.push({
        topicKey,
        learningObjective: input.sessionObjective?.trim() || null,
        questionIndex: index,
        correct,
        isFirstAttempt: input.isFirstAttempt,
        hintAssisted,
        independentSuccess: correct && !hintAssisted,
        wrongType: correct
          ? null
          : item.misconceptionTag?.trim() || "true_false_miss",
        sourceKind: "true_false",
        questionPreview: item.text?.slice(0, 160) ?? null,
      });
    });
  }

  if (data.type === "oral") {
    const questions =
      (data.questions as {
        prompt?: string;
        hint?: string;
        learningObjective?: string;
      }[]) ?? [];
    const gradeMeta = data.gradeMeta as
      | { correctIndices?: number[]; correctCount?: number }
      | undefined;
    questions.forEach((question, index) => {
      const hasAnswer = String(input.answers[String(index)] ?? "").trim().length > 8;
      // Without per-item grades, credit length-checked answers as provisional.
      let correct = hasAnswer;
      if (Array.isArray(gradeMeta?.correctIndices)) {
        correct = gradeMeta.correctIndices.includes(index);
      } else if (typeof gradeMeta?.correctCount === "number") {
        // Conservative: only first N length-ok answers count when only a count is known.
        correct = hasAnswer && index < gradeMeta.correctCount;
      }
      const hintAssisted =
        Boolean(hints[String(index)]);
      out.push({
        topicKey,
        learningObjective:
          question.learningObjective?.trim() ||
          input.sessionObjective?.trim() ||
          null,
        questionIndex: index,
        correct,
        isFirstAttempt: input.isFirstAttempt,
        hintAssisted,
        independentSuccess: correct && !hintAssisted,
        wrongType: correct ? null : "oral_miss",
        sourceKind: "oral",
        questionPreview: question.prompt?.slice(0, 160) ?? null,
      });
    });
  }

  // Flashcards / podcast / lesson: no mastery evidence rows.
  return out.slice(0, 40);
}

export function parseHintsUsed(
  answers: Record<string, unknown>,
): Record<string, boolean> {
  const meta = answers.__meta;
  if (meta && typeof meta === "object" && !Array.isArray(meta)) {
    const hints = (meta as { hintsUsed?: unknown }).hintsUsed;
    if (hints && typeof hints === "object" && !Array.isArray(hints)) {
      const out: Record<string, boolean> = {};
      for (const [k, v] of Object.entries(hints as Record<string, unknown>)) {
        out[k] = Boolean(v);
      }
      return out;
    }
  }
  const direct = answers.__hints;
  if (direct && typeof direct === "object" && !Array.isArray(direct)) {
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(direct as Record<string, unknown>)) {
      out[k] = Boolean(v);
    }
    return out;
  }
  return {};
}

/** Strip tracking meta before persisting raw student answers. */
export function stripAnswerMeta(
  answers: Record<string, unknown>,
): Record<string, unknown> {
  const { __meta, __hints, ...rest } = answers;
  void __meta;
  void __hints;
  return rest;
}

export function foldTopicMastery(
  evidence: AnswerEvidenceDraft[],
  prior: TopicMasterySnapshot[] = [],
  nowIso = new Date().toISOString(),
): TopicMasterySnapshot[] {
  const map = new Map<string, TopicMasterySnapshot>();
  for (const p of prior) {
    map.set(normalizeTopicKey(p.topicKey), { ...p });
  }

  for (const row of evidence) {
    const key = normalizeTopicKey(row.topicKey);
    const cur =
      map.get(key) ??
      ({
        topicKey: key,
        measured: false,
        level: "unmeasured",
        confidence: 0,
        evidenceCount: 0,
        firstAttemptCorrect: 0,
        firstAttemptTotal: 0,
        independentCorrect: 0,
        independentTotal: 0,
        lastPracticedAt: null,
      } satisfies TopicMasterySnapshot);

    cur.measured = true;
    cur.evidenceCount += 1;
    cur.lastPracticedAt = nowIso;

    if (row.isFirstAttempt) {
      cur.firstAttemptTotal += 1;
      if (row.correct) cur.firstAttemptCorrect += 1;
    }
    // Independent successes are counted against all graded items that were not hint-assisted.
    if (!row.hintAssisted) {
      cur.independentTotal += 1;
      if (row.correct) cur.independentCorrect += 1;
    }

    map.set(key, cur);
  }

  return [...map.values()].map(scoreTopicMastery);
}

export function scoreTopicMastery(topic: TopicMasterySnapshot): TopicMasterySnapshot {
  if (!topic.measured || topic.evidenceCount === 0) {
    return {
      ...topic,
      measured: false,
      level: "unmeasured",
      confidence: 0,
    };
  }

  const rate =
    topic.independentTotal > 0
      ? topic.independentCorrect / topic.independentTotal
      : topic.firstAttemptTotal > 0
        ? topic.firstAttemptCorrect / topic.firstAttemptTotal
        : 0;

  let level: TopicMasterySnapshot["level"] = "weak";
  if (rate >= 0.85 && topic.evidenceCount >= 3) level = "solid";
  else if (rate >= 0.55) level = "emerging";
  else level = "weak";

  // Confidence scales with evidence; unmeasured stays 0.
  const sampleFactor = Math.min(1, topic.evidenceCount / 5);
  const confidence = Math.round(rate * 100 * sampleFactor);

  return { ...topic, level, confidence };
}

export function computeProgramProgress(
  nodes: { status: NodeStatus }[],
): LearningIndicators["programProgress"] {
  const progress = nodeProgress(nodes);
  let label = "Henüz başlamadın";
  if (progress.pct >= 100) label = "Planlanan etkinlikler tamamlandı";
  else if (progress.pct >= 80) label = "Etkinliklerin çoğu tamamlandı";
  else if (progress.pct > 0) label = "Program ilerliyor";
  return { ...progress, label };
}

/**
 * Exam readiness estimate — never equals program completion alone.
 * Completing everything with wrong answers cannot yield 100 / "fully ready".
 */
export function computeExamReadiness(input: {
  programPct: number;
  topics: TopicMasterySnapshot[];
  /** Planned topic keys from schedule / topic map; unlisted evidence still counts. */
  plannedTopicKeys?: string[];
  mockScorePct?: number | null;
  targetScore?: number | null;
  openMisconceptions?: number;
}): LearningIndicators["examReadiness"] {
  const planned = (input.plannedTopicKeys ?? []).map(normalizeTopicKey);
  const byKey = new Map(input.topics.map((t) => [normalizeTopicKey(t.topicKey), t]));
  const keys =
    planned.length > 0
      ? [...new Set([...planned, ...byKey.keys()])]
      : [...byKey.keys()];

  let measured = 0;
  let unmeasured = 0;
  let successSum = 0;
  let successN = 0;
  let anyWrong = false;
  let evidenceItems = 0;

  for (const key of keys.length ? keys : ["genel"]) {
    const t = byKey.get(key);
    if (!t || !t.measured || t.evidenceCount === 0) {
      unmeasured += 1;
      continue;
    }
    measured += 1;
    evidenceItems += t.evidenceCount;
    const rate =
      t.independentTotal > 0
        ? t.independentCorrect / t.independentTotal
        : t.firstAttemptTotal > 0
          ? t.firstAttemptCorrect / t.firstAttemptTotal
          : 0;
    successSum += rate;
    successN += 1;
    if (
      (t.independentTotal > 0 && t.independentCorrect < t.independentTotal) ||
      (t.firstAttemptTotal > 0 && t.firstAttemptCorrect < t.firstAttemptTotal)
    ) {
      anyWrong = true;
    }
  }

  const measuredSuccessPct =
    successN > 0 ? Math.round((successSum / successN) * 100) : null;
  const coveragePct =
    keys.length > 0 ? Math.round((measured / keys.length) * 100) : measured > 0 ? 100 : 0;
  const mockPct =
    input.mockScorePct == null || Number.isNaN(input.mockScorePct)
      ? null
      : Math.max(0, Math.min(100, Math.round(input.mockScorePct)));
  const openMisconceptions = Math.max(0, input.openMisconceptions ?? 0);

  // No measured evidence → low readiness, never high confidence.
  if (measured === 0 || measuredSuccessPct == null) {
    const pct = Math.min(15, Math.round(input.programPct * 0.1));
    return {
      pct,
      label: "Henüz ölçülmüş konu yok — hazırlık tahmini düşük",
      claimFullyReady: false,
      components: {
        measuredSuccessPct: null,
        mockPct,
        coveragePct,
        programPct: input.programPct,
        openMisconceptions,
      },
    };
  }

  const target = input.targetScore ?? 70;
  const mockFactor =
    mockPct == null ? measuredSuccessPct : Math.round(0.6 * measuredSuccessPct + 0.4 * mockPct);

  let pct = Math.round(
    0.45 * measuredSuccessPct +
      0.25 * mockFactor +
      0.2 * coveragePct +
      0.1 * input.programPct,
  );

  // Hard caps — completion ≠ readiness.
  if (anyWrong || openMisconceptions > 0) {
    pct = Math.min(pct, 85);
  }
  if (measuredSuccessPct < 100) {
    pct = Math.min(pct, measuredSuccessPct);
  }
  if (coveragePct < 100) {
    pct = Math.min(pct, 90);
  }
  if (input.programPct >= 100 && measuredSuccessPct < 70) {
    pct = Math.min(pct, Math.max(10, measuredSuccessPct - 5));
  }
  // Absolute: all activities done with mostly wrongs → not "ready".
  if (input.programPct >= 100 && measuredSuccessPct <= 40) {
    pct = Math.min(pct, 25);
  }
  if (mockPct != null && mockPct < target) {
    pct = Math.min(pct, Math.max(mockPct, measuredSuccessPct - 10));
  }

  pct = Math.max(0, Math.min(100, pct));

  const claimFullyReady =
    pct >= 100 &&
    measuredSuccessPct >= 100 &&
    coveragePct >= 100 &&
    openMisconceptions === 0 &&
    !anyWrong &&
    (mockPct == null || mockPct >= target) &&
    evidenceItems >= 3;

  if (!claimFullyReady && pct >= 100) {
    pct = 99;
  }

  let label = "Hazırlık tahmini oluşuyor";
  if (claimFullyReady) label = "Ölçülen konulara göre hedefe yakınsın";
  else if (pct >= 80) label = "İyi gidiyorsun; eksikler var";
  else if (pct >= 50) label = "Orta hazırlık — zayıf konulara dön";
  else if (pct > 0) label = "Hazırlık henüz düşük";
  else label = "Hazırlık ölçülmedi";

  return {
    pct,
    label,
    claimFullyReady,
    components: {
      measuredSuccessPct,
      mockPct,
      coveragePct,
      programPct: input.programPct,
      openMisconceptions,
    },
  };
}

export function computeTopicMasterySummary(
  topics: TopicMasterySnapshot[],
  plannedTopicKeys: string[] = [],
): LearningIndicators["topicMastery"] {
  const planned = plannedTopicKeys.map(normalizeTopicKey);
  const byKey = new Map(topics.map((t) => [normalizeTopicKey(t.topicKey), t]));
  const keys =
    planned.length > 0
      ? [...new Set([...planned, ...byKey.keys()])]
      : [...byKey.keys()];

  const snapshots: TopicMasterySnapshot[] = keys.length
    ? keys.map((key) => {
        const t = byKey.get(key);
        if (t) return scoreTopicMastery(t);
        return {
          topicKey: key,
          measured: false,
          level: "unmeasured" as const,
          confidence: 0,
          evidenceCount: 0,
          firstAttemptCorrect: 0,
          firstAttemptTotal: 0,
          independentCorrect: 0,
          independentTotal: 0,
          lastPracticedAt: null,
        };
      })
    : topics.map(scoreTopicMastery);

  const measured = snapshots.filter((t) => t.measured);
  const unmeasuredCount = snapshots.length - measured.length;
  const pct =
    measured.length === 0
      ? null
      : Math.round(
          measured.reduce((sum, t) => sum + t.confidence, 0) / measured.length,
        );

  let label = "Konu hâkimiyeti henüz ölçülmedi";
  if (pct == null) label = "Ölçülmemiş konular — yüksek güven yok";
  else if (pct >= 80) label = "Ölçülen konularda güçlü sinyal";
  else if (pct >= 50) label = "Ölçülen konularda karışık sinyal";
  else label = "Ölçülen konularda zayıf sinyal";

  return {
    pct,
    label,
    measuredCount: measured.length,
    unmeasuredCount,
    topics: snapshots,
  };
}

export function buildLearningIndicators(input: {
  nodes: { kind: PlanNodeKind; status: NodeStatus }[];
  topics: TopicMasterySnapshot[];
  plannedTopicKeys?: string[];
  mockScorePct?: number | null;
  targetScore?: number | null;
  openMisconceptions?: number;
}): LearningIndicators {
  const programProgress = computeProgramProgress(input.nodes);
  const topicMastery = computeTopicMasterySummary(
    input.topics,
    input.plannedTopicKeys,
  );
  const examReadiness = computeExamReadiness({
    programPct: programProgress.pct,
    topics: topicMastery.topics,
    plannedTopicKeys: input.plannedTopicKeys,
    mockScorePct: input.mockScorePct,
    targetScore: input.targetScore,
    openMisconceptions: input.openMisconceptions,
  });
  return { programProgress, topicMastery, examReadiness };
}

export function toPersistedTracking(
  indicators: LearningIndicators,
  nowIso = new Date().toISOString(),
): TrackingPersisted {
  return {
    version: 1,
    updatedAt: nowIso,
    programProgressPct: indicators.programProgress.pct,
    topicMasteryPct: indicators.topicMastery.pct,
    examReadinessPct: indicators.examReadiness.pct,
    claimFullyReady: indicators.examReadiness.claimFullyReady,
    measuredTopicCount: indicators.topicMastery.measuredCount,
    unmeasuredTopicCount: indicators.topicMastery.unmeasuredCount,
    openMisconceptions: indicators.examReadiness.components.openMisconceptions,
  };
}

export function parsePersistedTracking(raw: unknown): TrackingPersisted | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  if (o.version !== 1) return null;
  return {
    version: 1,
    updatedAt: String(o.updatedAt ?? ""),
    programProgressPct: Number(o.programProgressPct ?? 0),
    topicMasteryPct:
      o.topicMasteryPct == null ? null : Number(o.topicMasteryPct),
    examReadinessPct: Number(o.examReadinessPct ?? 0),
    claimFullyReady: Boolean(o.claimFullyReady),
    measuredTopicCount: Number(o.measuredTopicCount ?? 0),
    unmeasuredTopicCount: Number(o.unmeasuredTopicCount ?? 0),
    openMisconceptions: Number(o.openMisconceptions ?? 0),
  };
}

/**
 * Prefer review/gap nodes when misconceptions or weak/stale measured topics exist.
 * Does not reorder locked chain aggressively — only chooses among ready nodes.
 */
export function preferNextNodeForTracking<
  T extends {
    id: string;
    kind: PlanNodeKind;
    status: NodeStatus;
    sortOrder: number;
    sessionMeta?: { topicTitle?: string } | null;
  },
>(
  nodes: T[],
  opts: {
    openMisconceptions: number;
    weakOrStaleTopicKeys: string[];
    now?: number;
  },
): T | null {
  const ready = nodes
    .filter((n) => n.status === "ready")
    .sort((a, b) => a.sortOrder - b.sortOrder);
  if (!ready.length) {
    return (
      nodes.find((n) => n.status !== "done") ??
      null
    );
  }

  const weak = new Set(opts.weakOrStaleTopicKeys.map(normalizeTopicKey));
  const reviewKinds = new Set<PlanNodeKind>(["gaps", "spaced", "flashcards", "quiz"]);

  if (opts.openMisconceptions > 0 || weak.size > 0) {
    const biased = ready.find((n) => {
      if (!reviewKinds.has(n.kind)) return false;
      const topic = normalizeTopicKey(n.sessionMeta?.topicTitle);
      return weak.size === 0 || weak.has(topic) || opts.openMisconceptions > 0;
    });
    if (biased) return biased;
  }

  return ready[0];
}

export function weakOrStaleTopicKeys(
  topics: TopicMasterySnapshot[],
  now = Date.now(),
): string[] {
  return topics
    .filter((t) => {
      if (!t.measured) return false;
      if (t.level === "weak" || t.confidence < 50) return true;
      if (!t.lastPracticedAt) return true;
      const age = now - new Date(t.lastPracticedAt).getTime();
      return age >= STALE_MS;
    })
    .map((t) => t.topicKey);
}

/** Legacy weighted activity % — kept for flag-OFF UI; not exam readiness. */
export function legacyActivityProgressPct(
  nodes: { kind: PlanNodeKind; status: NodeStatus }[],
): number {
  return readinessScore(nodes);
}
