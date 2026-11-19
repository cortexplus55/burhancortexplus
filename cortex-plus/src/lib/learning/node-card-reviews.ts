import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cardAnswerCredit } from "@/lib/learning/flashcard-round";
import { applySm2, clampEase, SM2_DEFAULT_EASE, type Sm2State } from "@/lib/learning/review-sm2";

/**
 * Faz 4 (19 Kasım 2026): kart düğümü bitince kartların öz bildirimi `flashcard_reviews` tablosuna SM-2 ile yazılır
 * (`review-sm2.ts`). Bildim (5) → "knew", Zorlandım (3) → "hard", Bilemedim (1) → "missed"; eski 4 "knew" sayılır.
 * Aynı kart (ön + arka yüz) kullanıcıda tek satırdır (`UNIQUE(user_id, card_key)`); tekrar turu satırı ilerletir.
 * Hata yutulmaz: okuma/yazma hatası günlüğe iner ve `ok: false` döner; düğümün tamamlanması bundan etkilenmez.
 */

export type NodeCard = { front?: unknown; back?: unknown };

export type CardRating = "knew" | "hard" | "missed";

export function nodeCardKey(front: string, back: string): string {
  const normalized = `${front}\u0000${back}`.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
  return `node:${createHash("sha256").update(normalized).digest("hex").slice(0, 24)}`;
}

/** Kart cevabının SM-2 kalitesi ve etiketi; boş cevap `null`. */
export function cardReviewGrade(answer: unknown): { quality: number; rating: CardRating } | null {
  const credit = cardAnswerCredit(answer);
  if (credit == null) return null;
  if (credit >= 0.8) return { quality: credit >= 1 ? 5 : 4, rating: "knew" };
  if (credit > 0) return { quality: 3, rating: "hard" };
  return { quality: 1, rating: "missed" };
}

type ExistingRow = { card_key: string; ease: number | string; interval_days: number | string; reps: number; lapses: number };

export type NodeCardReviewRow = {
  user_id: string;
  exam_prep_id: string;
  card_key: string;
  card_source: "node";
  topic_label: string | null;
  ease: number;
  interval_days: number;
  reps: number;
  lapses: number;
  due_at: string;
  last_rating: CardRating;
  last_reviewed_at: string;
};

/** Saf: kart + cevap + önceki satır → yazılacak satırlar. */
export function nodeCardReviewRows(input: {
  userId: string;
  prepId: string;
  topicLabel: string | null;
  cards: NodeCard[];
  answers: Record<string, unknown>;
  existing: ExistingRow[];
  now: Date;
}): NodeCardReviewRow[] {
  const prior = new Map(input.existing.map((row) => [row.card_key, row]));
  const rows = new Map<string, NodeCardReviewRow>();
  input.cards.forEach((card, index) => {
    const front = typeof card?.front === "string" ? card.front.trim() : "";
    const back = typeof card?.back === "string" ? card.back.trim() : "";
    if (!front || !back) return;
    const grade = cardReviewGrade(input.answers[String(index)]);
    if (!grade) return;
    const key = nodeCardKey(front, back);
    const before = prior.get(key);
    const state: Sm2State = before
      ? {
          easeFactor: clampEase(Number(before.ease) || SM2_DEFAULT_EASE),
          intervalDays: Math.max(0, Math.round(Number(before.interval_days) || 0)),
          repetitions: Math.max(0, Number(before.reps) || 0),
        }
      : { easeFactor: SM2_DEFAULT_EASE, intervalDays: 0, repetitions: 0 };
    const next = applySm2(state, grade.quality);
    rows.set(key, {
      user_id: input.userId,
      exam_prep_id: input.prepId,
      card_key: key,
      card_source: "node",
      topic_label: input.topicLabel?.trim() || null,
      ease: next.easeFactor,
      interval_days: next.intervalDays,
      reps: next.repetitions,
      lapses: (before?.lapses ?? 0) + (grade.rating === "missed" ? 1 : 0),
      due_at: new Date(input.now.getTime() + next.intervalDays * 86_400_000).toISOString(),
      last_rating: grade.rating,
      last_reviewed_at: input.now.toISOString(),
    });
  });
  return [...rows.values()];
}

export async function recordNodeCardReviews(
  service: SupabaseClient,
  input: {
    userId: string;
    prepId: string;
    topicLabel: string | null;
    payload: unknown;
    answers: Record<string, unknown>;
    now?: Date;
  },
): Promise<{ ok: true; written: number } | { ok: false; reason: string }> {
  const cards = (input.payload as { cards?: unknown } | null)?.cards;
  if (!Array.isArray(cards) || !cards.length) return { ok: true, written: 0 };
  const keys = (cards as NodeCard[])
    .map((card) =>
      typeof card?.front === "string" && typeof card?.back === "string" && card.front.trim() && card.back.trim()
        ? nodeCardKey(card.front.trim(), card.back.trim())
        : null,
    )
    .filter((key): key is string => Boolean(key));
  if (!keys.length) return { ok: true, written: 0 };
  const { data, error } = await service
    .from("flashcard_reviews")
    .select("card_key, ease, interval_days, reps, lapses")
    .eq("user_id", input.userId)
    .in("card_key", keys);
  if (error) {
    console.error("flashcard_reviews_read_failed", { prepId: input.prepId, message: error.message });
    return { ok: false, reason: error.message };
  }
  const rows = nodeCardReviewRows({
    userId: input.userId,
    prepId: input.prepId,
    topicLabel: input.topicLabel,
    cards: cards as NodeCard[],
    answers: input.answers,
    existing: (data ?? []) as ExistingRow[],
    now: input.now ?? new Date(),
  });
  if (!rows.length) return { ok: true, written: 0 };
  const { error: writeError } = await service.from("flashcard_reviews").upsert(rows, { onConflict: "user_id,card_key" });
  if (writeError) {
    console.error("flashcard_reviews_write_failed", { prepId: input.prepId, message: writeError.message });
    return { ok: false, reason: writeError.message };
  }
  return { ok: true, written: rows.length };
}
