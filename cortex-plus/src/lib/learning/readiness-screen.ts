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
  weightPercent: number;
  topicScore: number;
  cardMasteryRatio: number | null;
  mockTopicPct: number | null;
};

export type ReadinessAction = {
  label: string;
  href: string;
  primary?: boolean;
};

export type ReadinessScreen = {
  /** Yalnızca ölçüm bunu destekliyorsa "Hazırsın". */
  headline: string;
  ready: boolean;
  lead: string;
  topics: ReadinessTopicRow[];
  actions: ReadinessAction[];
  mockLine: string;
  readinessPct: number;
  daysLeft: number | null;
  examDateLabel: string | null;
  dueCardCount: number;
  formulaExplained: string[];
};

const LEVEL_TR: Record<TopicMasterySnapshot["level"], string> = {
  unmeasured: "ölçülmedi",
  weak: "zayıf",
  emerging: "gelişiyor",
  solid: "sağlam",
};

function detailFor(
  topic: TopicMasterySnapshot,
  openMisses: number,
  cardRatio: number | null,
): string {
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
  if (cardRatio != null) parts.push(`kart ustalığı %${Math.round(cardRatio * 100)}`);
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

export type TopicScoreInput = {
  independentCorrect: number;
  independentTotal: number;
  firstAttemptCorrect: number;
  firstAttemptTotal: number;
  measured: boolean;
  evidenceCount: number;
  mockTopicPct: number | null;
  cardMasteryRatio: number | null;
  openMisses: number;
};

/**
 * Konu skoru: ölçülmeyen bileşen formülden çıkarılır, kalan ağırlıklar oranlanır.
 * Hiç ölçüm yoksa 0. Açık yanlış başına −5 (max −20).
 */
export function topicReadinessScore(input: TopicScoreInput): number {
  if (!input.measured || input.evidenceCount === 0) return 0;

  const parts: { weight: number; value: number }[] = [];
  if (input.independentTotal > 0) {
    parts.push({
      weight: 0.5,
      value: (input.independentCorrect / input.independentTotal) * 100,
    });
  } else if (input.firstAttemptTotal > 0) {
    parts.push({
      weight: 0.5,
      value: (input.firstAttemptCorrect / input.firstAttemptTotal) * 100,
    });
  }
  if (input.mockTopicPct != null && !Number.isNaN(input.mockTopicPct)) {
    parts.push({ weight: 0.3, value: Math.max(0, Math.min(100, input.mockTopicPct)) });
  }
  if (input.cardMasteryRatio != null && !Number.isNaN(input.cardMasteryRatio)) {
    parts.push({
      weight: 0.2,
      value: Math.max(0, Math.min(1, input.cardMasteryRatio)) * 100,
    });
  }
  if (!parts.length) return 0;

  const weightSum = parts.reduce((s, p) => s + p.weight, 0);
  let score = parts.reduce((s, p) => s + (p.weight / weightSum) * p.value, 0);
  const penalty = Math.min(20, Math.max(0, input.openMisses) * 5);
  score = Math.max(0, score - penalty);
  return Math.round(score);
}

export type ReadinessPercentTopic = {
  weightPercent: number;
  score: number;
  unmeasured: boolean;
};

/**
 * Ağırlıklı hazırlık yüzdesi. Ölçülmemiş konular skoru 0 ile dahil
 * (ağırlık sayılır) — böylece kapsam eksikliği yüzdeyi düşürür.
 */
export function readinessPercent(topics: ReadinessPercentTopic[]): number {
  if (!topics.length) return 0;
  const weights = topics.map((t) =>
    t.weightPercent > 0 ? t.weightPercent : 1,
  );
  const sumW = weights.reduce((a, b) => a + b, 0);
  if (sumW <= 0) return 0;
  const weighted = topics.reduce(
    (sum, topic, i) => sum + weights[i]! * (topic.unmeasured ? 0 : topic.score),
    0,
  );
  return Math.round(weighted / sumW);
}

export function buildReadinessScreen(input: {
  plannedTopics: string[];
  mastery: TopicMasterySnapshot[];
  openMissesByTopic: { topic: string; count: number }[];
  mockScorePct: number | null;
  targetScore: number | null;
  nodes: { kind: PlanNodeKind; status: NodeStatus }[];
  links: {
    focused?: string | null;
    written?: string | null;
    quiz?: string | null;
    home: string;
    cards?: string | null;
  };
  /** Konu ağırlıkları (müfredat). Yoksa eşit. */
  topicWeights?: { topic: string; weightPercent: number }[];
  /** Son deneme konu karnesi. */
  mockTopicReport?: { topicLabel: string; percent: number }[];
  /** Konu başına usta kart / toplam. */
  cardMastery?: { topic: string; ratio: number }[];
  daysLeft?: number | null;
  examDateLabel?: string | null;
  dueCardCount?: number;
  examTips?: string[];
}): ReadinessScreen {
  const planned = input.plannedTopics.map((topic) => topic.trim()).filter(Boolean);
  const byKey = new Map(
    input.mastery.map((topic) => [normalizeTopicKey(topic.topicKey), topic]),
  );
  const misses = new Map(
    input.openMissesByTopic.map((row) => [normalizeTopicKey(row.topic), row.count]),
  );
  const weights = new Map(
    (input.topicWeights ?? []).map((row) => [
      normalizeTopicKey(row.topic),
      row.weightPercent,
    ]),
  );
  const mockByTopic = new Map(
    (input.mockTopicReport ?? []).map((row) => [
      normalizeTopicKey(row.topicLabel),
      row.percent,
    ]),
  );
  const cardByTopic = new Map(
    (input.cardMastery ?? []).map((row) => [normalizeTopicKey(row.topic), row.ratio]),
  );
  const labels = planned.length
    ? planned
    : input.mastery.map((topic) => topic.topicKey).filter((topic) => topic && topic !== "genel");

  const equalWeight = labels.length ? 100 / labels.length : 0;

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
    const cardRatio = cardByTopic.get(normalizeTopicKey(label)) ?? null;
    const mockPct = mockByTopic.get(normalizeTopicKey(label)) ?? null;
    const weight = weights.get(normalizeTopicKey(label)) ?? equalWeight;
    const score = topicReadinessScore({
      independentCorrect: snapshot.independentCorrect,
      independentTotal: snapshot.independentTotal,
      firstAttemptCorrect: snapshot.firstAttemptCorrect,
      firstAttemptTotal: snapshot.firstAttemptTotal,
      measured: snapshot.measured,
      evidenceCount: snapshot.evidenceCount,
      mockTopicPct: mockPct,
      cardMasteryRatio: cardRatio,
      openMisses: open,
    });
    return {
      topic: label,
      state: topicState(snapshot, open),
      detail: detailFor(snapshot, open, cardRatio),
      weightPercent: Math.round(weight),
      topicScore: score,
      cardMasteryRatio: cardRatio,
      mockTopicPct: mockPct,
    };
  });

  // Ağırlığa göre sıralı (yüksek önce).
  topics.sort((a, b) => b.weightPercent - a.weightPercent || a.topic.localeCompare(b.topic, "tr"));

  const readinessPct = readinessPercent(
    topics.map((row) => ({
      weightPercent: row.weightPercent,
      score: row.topicScore,
      unmeasured: row.state === "unmeasured",
    })),
  );

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

  const target = input.targetScore == null ? 80 : Math.round(input.targetScore);
  const needsWork = topics.filter((topic) => topic.state === "needs_work");
  const unmeasured = topics.filter((topic) => topic.state === "unmeasured");
  const readyTopics = topics.filter((topic) => topic.state === "ready");

  const claimReady =
    verdict.claimFullyReady &&
    readinessPct >= target &&
    unmeasured.length === 0;

  let headline = "Henüz hazırsın diyemeyiz";
  let lead = "Bu ekran kayıtlı cevaplarından hesaplanır.";
  if (claimReady) {
    headline = "Hazırsın";
    lead = "Ölçülen konular, hedef ve açık yanlışlar bunu destekliyor.";
  } else if (
    !topics.length ||
    (readyTopics.length === 0 &&
      needsWork.length === 0 &&
      unmeasured.length === topics.length &&
      input.mockScorePct == null)
  ) {
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

  const dueCardCount = input.dueCardCount ?? 0;
  const actions: ReadinessAction[] = [];

  if (claimReady) {
    if (input.links.cards) {
      actions.push({ label: "Son bir kart turu", href: input.links.cards, primary: true });
    }
    const tip = (input.examTips ?? []).find((t) => t.trim().length > 8);
    if (tip) {
      actions.push({
        label: `Sınav günü ipucu: ${tip.slice(0, 80)}${tip.length > 80 ? "…" : ""}`,
        href: input.links.home,
      });
    }
    if (!actions.length) {
      actions.push({ label: "Çalışma yoluna dön", href: input.links.home, primary: true });
    }
  } else {
    // 1. En ağır needs_work için odaklı
    const topNeeds = [...needsWork].sort((a, b) => b.weightPercent - a.weightPercent);
    if (topNeeds.length && input.links.focused) {
      actions.push({
        label: `Odaklı pratik: ${topNeeds[0]!.topic}`,
        href: input.links.focused,
        primary: true,
      });
    }
    // 2. Vadesi gelen kartlar
    if (dueCardCount > 0 && input.links.cards && actions.length < 3) {
      actions.push({
        label: `Bugün ${dueCardCount} kart tekrar bekliyor`,
        href: input.links.cards,
        primary: actions.length === 0,
      });
    }
    // 3. Deneme
    if (actions.length < 3 && input.mockScorePct == null && input.links.written) {
      actions.push({
        label: "Yazılı denemeyi çöz",
        href: input.links.written,
        primary: actions.length === 0,
      });
    } else if (
      actions.length < 3 &&
      input.mockScorePct != null &&
      input.targetScore != null &&
      input.mockScorePct < input.targetScore &&
      input.links.written
    ) {
      actions.push({
        label: `Deneme hedefin altında (%${input.mockScorePct}). Bir deneme daha çöz`,
        href: input.links.written,
        primary: actions.length === 0,
      });
    }
    // 4. Ölçülmemiş
    if (actions.length < 3 && unmeasured.length && input.links.quiz) {
      actions.push({
        label: `Ölçülmeyen konu için test: ${unmeasured[0]!.topic}`,
        href: input.links.quiz,
        primary: actions.length === 0,
      });
    }
    if (!actions.length) {
      if (headline === "Henüz ölçüm yok" && input.links.quiz) {
        actions.push({
          label: "Kısa bir test çöz",
          href: input.links.quiz,
          primary: true,
        });
      } else {
        actions.push({ label: "Çalışma yoluna dön", href: input.links.home, primary: true });
      }
    }
  }

  const mockLine =
    input.mockScorePct == null
      ? "Yazılı deneme henüz çözülmedi."
      : `Yazılı deneme skoru %${input.mockScorePct}. Hedef %${target}.`;

  return {
    headline,
    ready: claimReady,
    lead,
    topics,
    actions: actions.slice(0, 3),
    mockLine,
    readinessPct,
    daysLeft: input.daysLeft ?? null,
    examDateLabel: input.examDateLabel ?? null,
    dueCardCount,
    formulaExplained: [
      "Her konu, sınavdaki ağırlığı kadar sayılır.",
      "Konu puanı: bağımsız soru doğruluğun (%50), son denemedeki başarın (%30) ve kart ustalığın (%20).",
      "Açık yanlışlar puanı düşürür.",
      "Ölçülmemiş bir konu varsa 'Hazırsın' demeyiz.",
    ],
  };
}
