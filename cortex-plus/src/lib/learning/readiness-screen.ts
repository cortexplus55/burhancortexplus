import {
  computeExamReadiness,
  computeProgramProgress,
  normalizeTopicKey,
  type TopicMasterySnapshot,
} from "@/lib/learning/learning-tracking";
import type { NodeStatus, PlanNodeKind } from "@/lib/learning/exam-prep-plan";

export type ReadinessTopicState = "ready" | "needs_work" | "unmeasured";

export type ReadinessTopicRow = {
  topic: string;
  state: ReadinessTopicState;
  detail: string;
};

export type ReadinessAction = {
  label: string;
  href: string;
};

export type ReadinessScreen = {
  /** Yalnızca ölçüm bunu destekliyorsa "Hazırsın". */
  headline: string;
  ready: boolean;
  lead: string;
  topics: ReadinessTopicRow[];
  actions: ReadinessAction[];
  mockLine: string;
};

const LEVEL_TR: Record<TopicMasterySnapshot["level"], string> = {
  unmeasured: "ölçülmedi",
  weak: "zayıf",
  emerging: "gelişiyor",
  solid: "sağlam",
};

function detailFor(topic: TopicMasterySnapshot, openMisses: number): string {
  if (!topic.measured || topic.evidenceCount === 0) return "Bu konuda kayıtlı cevap yok.";
  const parts: string[] = [];
  if (topic.independentTotal > 0) {
    parts.push(
      `${topic.independentTotal} bağımsız denemeden ${topic.independentCorrect} doğru`,
    );
  } else if (topic.firstAttemptTotal > 0) {
    parts.push(`${topic.firstAttemptTotal} ilk denemeden ${topic.firstAttemptCorrect} doğru`);
  } else {
    parts.push(`${topic.evidenceCount} kayıtlı cevap`);
  }
  if (openMisses > 0) parts.push(`${openMisses} açık yanlış`);
  parts.push(`seviye: ${LEVEL_TR[topic.level]}`);
  return parts.join(" · ");
}

function topicState(topic: TopicMasterySnapshot, openMisses: number): ReadinessTopicState {
  if (!topic.measured || topic.evidenceCount === 0) return "unmeasured";
  const cleanAttempts =
    (topic.independentTotal === 0 || topic.independentCorrect === topic.independentTotal) &&
    (topic.firstAttemptTotal === 0 || topic.firstAttemptCorrect === topic.firstAttemptTotal);
  if (topic.level === "solid" && openMisses === 0 && cleanAttempts) return "ready";
  return "needs_work";
}

export function buildReadinessScreen(input: {
  plannedTopics: string[];
  mastery: TopicMasterySnapshot[];
  openMissesByTopic: { topic: string; count: number }[];
  mockScorePct: number | null;
  targetScore: number | null;
  nodes: { kind: PlanNodeKind; status: NodeStatus }[];
  links: { focused?: string | null; written?: string | null; quiz?: string | null; home: string };
}): ReadinessScreen {
  const planned = input.plannedTopics.map((topic) => topic.trim()).filter(Boolean);
  const byKey = new Map(
    input.mastery.map((topic) => [normalizeTopicKey(topic.topicKey), topic]),
  );
  const misses = new Map(
    input.openMissesByTopic.map((row) => [normalizeTopicKey(row.topic), row.count]),
  );
  const labels = planned.length
    ? planned
    : input.mastery.map((topic) => topic.topicKey).filter((topic) => topic && topic !== "genel");

  const topics: ReadinessTopicRow[] = labels.map((label) => {
    const snapshot = byKey.get(normalizeTopicKey(label)) ?? {
      topicKey: label,
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
    const open = misses.get(normalizeTopicKey(label)) ?? 0;
    return {
      topic: label,
      state: topicState(snapshot, open),
      detail: detailFor(snapshot, open),
    };
  });

  const program = computeProgramProgress(input.nodes);
  const openMisconceptions = input.openMissesByTopic.reduce((sum, row) => sum + row.count, 0);
  const verdict = computeExamReadiness({
    programPct: program.pct,
    topics: input.mastery,
    plannedTopicKeys: planned,
    mockScorePct: input.mockScorePct,
    targetScore: input.targetScore,
    openMisconceptions,
  });

  const ready = verdict.claimFullyReady;
  const needsWork = topics.filter((topic) => topic.state === "needs_work");
  const unmeasured = topics.filter((topic) => topic.state === "unmeasured");
  const readyTopics = topics.filter((topic) => topic.state === "ready");

  let headline = "Henüz hazırsın diyemeyiz";
  let lead = "Bu ekran kayıtlı cevaplarından hesaplanır.";
  if (ready) {
    headline = "Hazırsın";
    lead = "Ölçülen konular, hedef ve açık yanlışlar bunu destekliyor.";
  } else if (!topics.length || (readyTopics.length === 0 && needsWork.length === 0 && unmeasured.length === topics.length && input.mockScorePct == null)) {
    headline = "Henüz ölçüm yok";
    lead = "Hazır demek için önce konu konu cevap görmemiz gerekir.";
  } else {
    const left = [
      needsWork.length ? `${needsWork.length} konu çalışılacak` : "",
      unmeasured.length ? `${unmeasured.length} konu ölçülmedi` : "",
    ].filter(Boolean);
    lead = left.length
      ? `${left.join(", ")}. Etkinlik bitirmek tek başına hazır olmak değildir.`
      : verdict.label;
  }

  const actions: ReadinessAction[] = [];
  if (!ready && needsWork.length && input.links.focused) {
    actions.push({
      label: `Odaklı pratik: ${needsWork
        .slice(0, 2)
        .map((topic) => topic.topic)
        .join(", ")}`,
      href: input.links.focused,
    });
  }
  if (!ready && input.mockScorePct == null && input.links.written) {
    actions.push({ label: "Yazılı denemeyi çöz", href: input.links.written });
  } else if (
    !ready &&
    input.mockScorePct != null &&
    input.targetScore != null &&
    input.mockScorePct < input.targetScore &&
    input.links.written
  ) {
    actions.push({
      label: `Deneme hedefin altında (%${input.mockScorePct}). Bir tur daha çöz`,
      href: input.links.written,
    });
  }
  if (!ready && unmeasured.length && input.links.quiz) {
    actions.push({
      label: `Ölçülmeyen konu için test: ${unmeasured[0].topic}`,
      href: input.links.quiz,
    });
  }
  if (!actions.length) {
    actions.push({ label: "Çalışma yoluna dön", href: input.links.home });
  }

  const target = input.targetScore == null ? null : Math.round(input.targetScore);
  const mockLine =
    input.mockScorePct == null
      ? "Yazılı deneme henüz çözülmedi."
      : target == null
        ? `Yazılı deneme skoru %${input.mockScorePct}.`
        : `Yazılı deneme skoru %${input.mockScorePct}. Hedef %${target}.`;

  return { headline, ready, lead, topics, actions, mockLine };
}
