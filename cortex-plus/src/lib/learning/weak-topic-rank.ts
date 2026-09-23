/**
 * Zayıf konu sıralaması — dashboard "En çok çalışman gereken konular".
 */

export type WeakTopicSignal = {
  topicLabel: string;
  wrongCount: number;
  correctStreak: number;
  lastReviewedAt: string | null;
  /** 0–1 from weak_topics.severity if present. */
  severity: number | null;
  /** Recent quiz/exam miss rate 0–1 if known. */
  recentMissRate: number | null;
};

export type RankedWeakTopic = {
  topicLabel: string;
  score: number;
  studyHref: string;
  reason: string;
};

function recencyBoost(lastReviewedAt: string | null, now: Date): number {
  if (!lastReviewedAt) return 0.35;
  const ageMs = now.getTime() - new Date(lastReviewedAt).getTime();
  const days = ageMs / 86_400_000;
  if (days <= 1) return 0.55;
  if (days <= 7) return 0.4;
  if (days <= 30) return 0.25;
  return 0.15;
}

/**
 * Higher score = more urgent to study.
 * wrong ratio / severity / streak reset / recency.
 */
export function scoreWeakTopic(signal: WeakTopicSignal, now = new Date()): number {
  const wrong = Math.min(10, Math.max(0, signal.wrongCount));
  const wrongPart = wrong / 10;
  const severity = signal.severity == null ? 0.3 : Math.max(0, Math.min(1, signal.severity));
  const miss =
    signal.recentMissRate == null
      ? 0.25
      : Math.max(0, Math.min(1, signal.recentMissRate));
  const streakPenalty = signal.correctStreak > 0 ? 0.15 : 0;
  const recency = recencyBoost(signal.lastReviewedAt, now);

  return Math.round(
    (0.35 * wrongPart + 0.25 * severity + 0.2 * miss + 0.2 * recency - streakPenalty) *
      100,
  );
}

export function rankWeakTopics(
  signals: WeakTopicSignal[],
  limit = 3,
  now = new Date(),
): RankedWeakTopic[] {
  const byLabel = new Map<string, WeakTopicSignal>();
  for (const s of signals) {
    const key = s.topicLabel.trim() || "Konusu belirsiz";
    const prev = byLabel.get(key);
    if (!prev) {
      byLabel.set(key, { ...s, topicLabel: key });
      continue;
    }
    byLabel.set(key, {
      topicLabel: key,
      wrongCount: prev.wrongCount + s.wrongCount,
      correctStreak: Math.min(prev.correctStreak, s.correctStreak),
      lastReviewedAt:
        !prev.lastReviewedAt ||
        (s.lastReviewedAt && s.lastReviewedAt > prev.lastReviewedAt)
          ? s.lastReviewedAt
          : prev.lastReviewedAt,
      severity: Math.max(prev.severity ?? 0, s.severity ?? 0) || null,
      recentMissRate:
        prev.recentMissRate == null
          ? s.recentMissRate
          : s.recentMissRate == null
            ? prev.recentMissRate
            : (prev.recentMissRate + s.recentMissRate) / 2,
    });
  }

  return [...byLabel.values()]
    .map((signal) => {
      const score = scoreWeakTopic(signal, now);
      const reason =
        signal.wrongCount > 1
          ? `${signal.wrongCount} kez yanlış`
          : signal.severity != null && signal.severity >= 0.5
            ? "Denemede zayıf göründü"
            : "Tekrar gerektiriyor";
      return {
        topicLabel: signal.topicLabel,
        score,
        studyHref: `/studio/quiz?topic=${encodeURIComponent(signal.topicLabel)}`,
        reason,
      };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
