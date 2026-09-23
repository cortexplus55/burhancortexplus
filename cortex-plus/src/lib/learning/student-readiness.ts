/**
 * Öğrenci hazırlık skoru — dashboard yüzdesi.
 *
 * Aktif prep varsa Stage 6 computeExamReadiness; yoksa mistake + weak composite.
 * Shallow node-completion readinessScore kullanılmaz.
 */

import {
  computeExamReadiness,
  type TopicMasterySnapshot,
} from "@/lib/learning/learning-tracking";

export type StudentReadiness = {
  pct: number;
  label: string;
  explanation: string;
  onTargetTopics: number;
  totalTopics: number;
  source: "exam_prep" | "composite";
};

export function explainReadiness(input: {
  pct: number;
  onTargetTopics: number;
  totalTopics: number;
  openMistakes: number;
  measuredSuccessPct: number | null;
}): string {
  const parts: string[] = [];
  if (input.totalTopics > 0) {
    parts.push(
      `${input.totalTopics} konudan ${input.onTargetTopics}'inde hedef seviyedesin.`,
    );
  } else if (input.measuredSuccessPct != null) {
    parts.push(`Ölçülen başarı yaklaşık %${input.measuredSuccessPct}.`);
  } else {
    parts.push("Henüz ölçülmüş konu yok — tahmin düşük tutuldu.");
  }
  if (input.openMistakes > 0) {
    parts.push(`${input.openMistakes} yanlış tekrar bekliyor.`);
  }
  parts.push(`Hazırlık seviyesi %${input.pct}.`);
  return parts.join(" ");
}

function onTargetCount(topics: TopicMasterySnapshot[]): number {
  return topics.filter(
    (t) => t.measured && (t.level === "solid" || t.level === "emerging"),
  ).length;
}

export function readinessFromExamPrep(input: {
  programPct: number;
  topics: TopicMasterySnapshot[];
  plannedTopicKeys?: string[];
  mockScorePct?: number | null;
  targetScore?: number | null;
  openMisconceptions?: number;
  openMistakes?: number;
}): StudentReadiness {
  const readiness = computeExamReadiness({
    programPct: input.programPct,
    topics: input.topics,
    plannedTopicKeys: input.plannedTopicKeys,
    mockScorePct: input.mockScorePct,
    targetScore: input.targetScore,
    openMisconceptions: input.openMisconceptions,
  });
  const totalTopics = input.topics.length || (input.plannedTopicKeys?.length ?? 0);
  const onTarget = onTargetCount(input.topics);
  return {
    pct: readiness.pct,
    label: readiness.label,
    explanation: explainReadiness({
      pct: readiness.pct,
      onTargetTopics: onTarget,
      totalTopics: totalTopics || input.topics.length,
      openMistakes: input.openMistakes ?? 0,
      measuredSuccessPct: readiness.components.measuredSuccessPct,
    }),
    onTargetTopics: onTarget,
    totalTopics: totalTopics || input.topics.length,
    source: "exam_prep",
  };
}

/**
 * Prep yokken: açık yanlışlar ve weak_topics severity'sinden düşük güvenli tahmin.
 */
export function readinessFromComposite(input: {
  openMistakes: number;
  masteredMistakes: number;
  weakTopics: { severity: number }[];
  recentQuizAccuracy?: number | null;
}): StudentReadiness {
  const totalMistakes = input.openMistakes + input.masteredMistakes;
  const mistakePct =
    totalMistakes > 0
      ? Math.round((input.masteredMistakes / totalMistakes) * 100)
      : 0;

  const severities = input.weakTopics.map((w) =>
    Math.max(0, Math.min(1, Number(w.severity) || 0)),
  );
  const avgWeak =
    severities.length > 0
      ? severities.reduce((a, b) => a + b, 0) / severities.length
      : 0;
  const weakPct = Math.round((1 - avgWeak) * 100);

  const quizPct =
    input.recentQuizAccuracy == null
      ? null
      : Math.max(0, Math.min(100, Math.round(input.recentQuizAccuracy)));

  let pct: number;
  if (totalMistakes === 0 && severities.length === 0 && quizPct == null) {
    pct = 0;
  } else {
    const parts = [mistakePct * 0.4, weakPct * 0.35];
    let weight = 0.75;
    if (quizPct != null) {
      parts.push(quizPct * 0.25);
      weight = 1;
    }
    pct = Math.round(parts.reduce((a, b) => a + b, 0) / weight);
    // No measured quiz/exam evidence → cap low.
    if (quizPct == null && totalMistakes === 0) {
      pct = Math.min(pct, 20);
    }
  }

  pct = Math.max(0, Math.min(85, pct));
  const onTarget = input.weakTopics.filter((w) => (w.severity ?? 1) < 0.35).length;
  const totalTopics = input.weakTopics.length;

  return {
    pct,
    label:
      pct === 0
        ? "Henüz ölçüm yok"
        : pct < 40
          ? "Hazırlık erken aşamada"
          : "Çalışmaya devam ediyorsun",
    explanation: explainReadiness({
      pct,
      onTargetTopics: onTarget,
      totalTopics,
      openMistakes: input.openMistakes,
      measuredSuccessPct: quizPct,
    }),
    onTargetTopics: onTarget,
    totalTopics,
    source: "composite",
  };
}
