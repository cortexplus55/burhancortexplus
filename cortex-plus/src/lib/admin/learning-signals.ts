import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, istanbulDay } from "@/lib/istanbul-day";

/**
 * Gerçek öğrenme ölçüleri (23 Ekim 2026, ürün sahibinin kararı). Yapay zekâ yargıçlarının kör ölçümü
 * "hangisi daha iyi anlatıyor"u söylüyordu; bu üç ölçü "öğrenci gerçekten öğreniyor mu"yu canlı veriden söyler:
 *
 * 1. Günü gelen tekrarın doğru oranı basamak basamak (1., 3., 7., 14. gün) ve en zayıf konular.
 * 2. Ders sonu anketinin ("Bu dersi nasıl buldun?") dağılımı; "Mantıklı değildi" diyen dersler.
 * 3. Ders kalitesi örnekleri: denetçinin yazım sırasındaki öğretim puanı ve günlük bağımsız yargıç.
 *
 * Tablolar yoksa (göç uygulanmadan önce) ölçü "veri yok" döner; sayfa düşmez.
 */

export const REVIEW_STEP_LABELS = ["1. gün", "3. gün", "7. gün", "14. gün"] as const;

export type ReviewAnswerRow = { step: number; correct: boolean; topic_label: string | null };

export type StepAccuracy = { step: number; label: string; answered: number; correct: number; share: number | null };

export function reviewAccuracyByStep(rows: readonly ReviewAnswerRow[]): StepAccuracy[] {
  return REVIEW_STEP_LABELS.map((label, step) => {
    const at = rows.filter((row) => row.step === step);
    const correct = at.filter((row) => row.correct).length;
    return { step, label, answered: at.length, correct, share: at.length ? correct / at.length : null };
  });
}

export type TopicAccuracy = { topic: string; answered: number; correct: number; share: number };

/** En az `min` cevabı olan konulardan doğru oranı en düşük olanlar. */
export function weakestReviewTopics(rows: readonly ReviewAnswerRow[], min = 5, limit = 5): TopicAccuracy[] {
  const byTopic = new Map<string, { answered: number; correct: number }>();
  for (const row of rows) {
    const topic = row.topic_label?.trim();
    if (!topic) continue;
    const cell = byTopic.get(topic) ?? { answered: 0, correct: 0 };
    cell.answered += 1;
    if (row.correct) cell.correct += 1;
    byTopic.set(topic, cell);
  }
  return [...byTopic.entries()]
    .filter(([, cell]) => cell.answered >= min)
    .map(([topic, cell]) => ({ topic, ...cell, share: cell.correct / cell.answered }))
    .sort((a, b) => a.share - b.share || b.answered - a.answered)
    .slice(0, limit);
}

export const LESSON_RATING_LABELS: Record<string, string> = {
  great: "Harikaydı",
  too_easy: "Çok kolaydı",
  too_hard: "Çok zordu",
  confusing: "Mantıklı değildi",
  other: "Başka bir şey yanlış gitti",
};

export type RatingRow = { rating: string; kind: string | null; title: string | null };

export type RatingSummary = {
  total: number;
  counts: { id: string; label: string; count: number }[];
  /** "Harikaydı" payı. */
  great: number | null;
  /** "Mantıklı değildi" + "Başka bir şey yanlış gitti" payı. */
  unclear: number | null;
};

export function summarizeRatings(rows: readonly RatingRow[]): RatingSummary {
  const total = rows.length;
  const counts = Object.entries(LESSON_RATING_LABELS).map(([id, label]) => ({
    id,
    label,
    count: rows.filter((row) => row.rating === id).length,
  }));
  const count = (id: string) => counts.find((row) => row.id === id)?.count ?? 0;
  return {
    total,
    counts,
    great: total ? count("great") / total : null,
    unclear: total ? (count("confusing") + count("other")) / total : null,
  };
}

export type QualityRow = {
  source: "verifier" | "judge";
  total: number | null;
  topic_label: string | null;
  note: string | null;
  sampled_on: string;
};

export type QualitySummary = {
  judged: number;
  /** Yargıcın ortalaması (0-100). */
  judgeAverage: number | null;
  scored: number;
  /** Denetçinin kısım puanlarının ortalaması (1-5). */
  verifierAverage: number | null;
  latest: { topic: string; total: number; note: string; day: string }[];
};

export function summarizeQuality(rows: readonly QualityRow[]): QualitySummary {
  const judge = rows.filter((row) => row.source === "judge" && typeof row.total === "number");
  const verifier = rows.filter((row) => row.source === "verifier" && typeof row.total === "number");
  const mean = (values: number[]) => (values.length ? values.reduce((a, b) => a + b, 0) / values.length : null);
  return {
    judged: judge.length,
    judgeAverage: mean(judge.map((row) => Number(row.total))),
    scored: verifier.length,
    verifierAverage: mean(verifier.map((row) => Number(row.total))),
    latest: [...judge]
      .sort((a, b) => b.sampled_on.localeCompare(a.sampled_on))
      .slice(0, 5)
      .map((row) => ({ topic: row.topic_label ?? "—", total: Number(row.total), note: row.note ?? "", day: row.sampled_on })),
  };
}

export type LearningSignals = {
  days: number;
  steps: StepAccuracy[];
  weakTopics: TopicAccuracy[];
  ratings: RatingSummary;
  unclearLessons: { title: string; rating: string }[];
  quality: QualitySummary;
};

function windowStart(now: Date, days: number): string {
  return addDays(istanbulDay(now), -(Math.max(1, days) - 1));
}

async function safeRows<T>(query: PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  try {
    const { data, error } = await query;
    return !error && Array.isArray(data) ? (data as T[]) : [];
  } catch {
    return [];
  }
}

export async function collectLearningSignals(
  service: SupabaseClient,
  input: { now: Date; days: number },
): Promise<LearningSignals> {
  const start = windowStart(input.now, input.days);
  const startIso = `${start}T00:00:00+03:00`;
  const [answers, rated, quality] = await Promise.all([
    safeRows<ReviewAnswerRow>(
      service.from("exam_prep_review_answers").select("step, correct, topic_label").gte("answered_on", start).limit(20000),
    ),
    safeRows<{ payload: { studentRating?: { value?: string } } | null; exam_prep_nodes: { kind: string | null; title: string | null } | null }>(
      service
        .from("exam_prep_node_attempts")
        .select("payload, exam_prep_nodes(kind, title)")
        .gte("created_at", startIso)
        .not("payload->studentRating", "is", null)
        .limit(5000),
    ),
    safeRows<QualityRow>(
      service.from("lesson_quality_samples").select("source, total, topic_label, note, sampled_on").gte("sampled_on", start).limit(5000),
    ),
  ]);
  const ratingRows: RatingRow[] = rated.flatMap((row) => {
    const rating = row.payload?.studentRating?.value;
    return typeof rating === "string" ? [{ rating, kind: row.exam_prep_nodes?.kind ?? null, title: row.exam_prep_nodes?.title ?? null }] : [];
  });
  return {
    days: input.days,
    steps: reviewAccuracyByStep(answers),
    weakTopics: weakestReviewTopics(answers),
    ratings: summarizeRatings(ratingRows),
    unclearLessons: ratingRows
      .filter((row) => row.rating === "confusing" || row.rating === "other")
      .slice(0, 10)
      .map((row) => ({ title: row.title ?? "—", rating: LESSON_RATING_LABELS[row.rating] ?? row.rating })),
    quality: summarizeQuality(quality),
  };
}
