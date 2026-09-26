/**
 * flashcard_reviews okuma/yazma. Servis istemcisiyle çalışır.
 */

import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { FlashcardSource } from "@/lib/learning/flashcard-model";
import {
  nextCardSchedule,
  scheduleHint,
  isCardMastered,
  type CardRating,
  type CardScheduleState,
} from "@/lib/learning/spaced-repetition";

export type FlashcardReviewRow = {
  id: string;
  user_id: string;
  exam_prep_id: string | null;
  card_key: string;
  card_source: FlashcardSource;
  topic_label: string | null;
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
  due_at: string;
  last_rating: CardRating | null;
  last_reviewed_at: string | null;
};

function toState(row: Pick<FlashcardReviewRow, "ease" | "interval_days" | "reps" | "lapses" | "last_rating">): CardScheduleState {
  return {
    ease: Number(row.ease) || 2.5,
    intervalDays: Number(row.interval_days) || 0,
    reps: row.reps ?? 0,
    lapses: row.lapses ?? 0,
    recentRatings: row.last_rating ? [row.last_rating] : [],
  };
}

export async function loadDueReviews(
  service: SupabaseClient,
  userId: string,
  opts?: { examPrepId?: string | null; topicLabel?: string | null; now?: Date },
): Promise<FlashcardReviewRow[]> {
  const now = (opts?.now ?? new Date()).toISOString();
  let query = service
    .from("flashcard_reviews")
    .select("*")
    .eq("user_id", userId)
    .lte("due_at", now)
    .order("due_at", { ascending: true })
    .limit(40);
  if (opts?.examPrepId) query = query.eq("exam_prep_id", opts.examPrepId);
  if (opts?.topicLabel) query = query.eq("topic_label", opts.topicLabel);
  const { data, error } = await query;
  if (error || !data) return [];
  return data as FlashcardReviewRow[];
}

export async function loadReviewByKey(
  service: SupabaseClient,
  userId: string,
  cardKey: string,
): Promise<FlashcardReviewRow | null> {
  const { data } = await service
    .from("flashcard_reviews")
    .select("*")
    .eq("user_id", userId)
    .eq("card_key", cardKey)
    .maybeSingle();
  return (data as FlashcardReviewRow | null) ?? null;
}

export async function upsertCardReview(
  service: SupabaseClient,
  input: {
    userId: string;
    cardKey: string;
    cardSource: FlashcardSource;
    rating: CardRating;
    examPrepId?: string | null;
    topicLabel?: string | null;
    examDate?: string | null;
    now?: Date;
  },
): Promise<{
  dueAt: string;
  intervalDays: number;
  ease: number;
  reps: number;
  lapses: number;
  mastered: boolean;
  hint: string;
}> {
  const now = input.now ?? new Date();
  const existing = await loadReviewByKey(service, input.userId, input.cardKey);
  const state = existing
    ? toState(existing)
    : { ease: 2.5, intervalDays: 0, reps: 0, lapses: 0, recentRatings: [] as CardRating[] };

  const next = nextCardSchedule(state, input.rating, now, input.examDate ?? undefined);
  const row = {
    user_id: input.userId,
    exam_prep_id: input.examPrepId ?? existing?.exam_prep_id ?? null,
    card_key: input.cardKey,
    card_source: input.cardSource,
    topic_label: input.topicLabel ?? existing?.topic_label ?? null,
    ease: next.ease,
    interval_days: next.intervalDays,
    reps: next.reps,
    lapses: next.lapses,
    due_at: next.dueAt.toISOString(),
    last_rating: input.rating,
    last_reviewed_at: now.toISOString(),
  };

  const { error } = await service.from("flashcard_reviews").upsert(row, {
    onConflict: "user_id,card_key",
  });
  if (error) throw new Error(error.message);

  return {
    dueAt: row.due_at,
    intervalDays: next.intervalDays,
    ease: next.ease,
    reps: next.reps,
    lapses: next.lapses,
    mastered: next.mastered,
    hint: scheduleHint(next),
  };
}

/** Konu başına usta / toplam kart oranı (readiness için). */
export async function cardMasteryByTopic(
  service: SupabaseClient,
  userId: string,
  examPrepId?: string | null,
): Promise<{ topic: string; mastered: number; total: number; ratio: number }[]> {
  let query = service
    .from("flashcard_reviews")
    .select("topic_label, interval_days, reps, last_rating")
    .eq("user_id", userId);
  if (examPrepId) query = query.eq("exam_prep_id", examPrepId);
  const { data, error } = await query;
  if (error || !data) return [];

  const byTopic = new Map<string, { mastered: number; total: number }>();
  for (const row of data) {
    const topic = (row.topic_label as string | null)?.trim() || "genel";
    const bucket = byTopic.get(topic) ?? { mastered: 0, total: 0 };
    bucket.total += 1;
    const mastered = isCardMastered({
      intervalDays: Number(row.interval_days) || 0,
      reps: (row.reps as number) ?? 0,
      recentRatings: row.last_rating ? [row.last_rating as CardRating] : [],
    });
    if (mastered) bucket.mastered += 1;
    byTopic.set(topic, bucket);
  }
  return [...byTopic.entries()].map(([topic, v]) => ({
    topic,
    mastered: v.mastered,
    total: v.total,
    ratio: v.total > 0 ? v.mastered / v.total : 0,
  }));
}

export async function countDueCards(
  service: SupabaseClient,
  userId: string,
  examPrepId?: string | null,
): Promise<number> {
  const now = new Date().toISOString();
  let query = service
    .from("flashcard_reviews")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .lte("due_at", now);
  if (examPrepId) query = query.eq("exam_prep_id", examPrepId);
  const { count } = await query;
  return count ?? 0;
}
