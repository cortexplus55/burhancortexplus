import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, istanbulDay } from "@/lib/istanbul-day";
import { clozeFromFact, type ClozeCard } from "@/lib/learning/remember-facts";

/**
 * Genel tekrar destesi (8 Kasım 2026). Sohbetin "Akılda kalsın" maddeleri boşluk doldurma kartı olur; kart
 * 1-3-7-14 gün sonra geri gelir. "Bildim" bir basamak ilerletir (14. günde bilinen kart öğrenildi), "Bilemedim"
 * 1. güne döndürür. Tablo canlıda yoksa okumalar boş, yazmalar `unavailable` döner (göç koddan önce gelir).
 */
export const GENERAL_REVIEW_STEPS = [1, 3, 7, 14] as const;
export const GENERAL_REVIEW_SESSION_MAX = 20;

export type GeneralReviewCard = {
  id: string;
  front: string;
  back: string;
  interval_step: number;
  due_on: string;
  ask_count: number;
};

export function cardKey(card: ClozeCard): string {
  const normalized = `${card.front}\u0000${card.back}`.toLocaleLowerCase("tr-TR").replace(/\s+/g, " ").trim();
  return createHash("sha256").update(normalized).digest("hex").slice(0, 16);
}

/** Yanıta göre sonraki basamak ve gün. `null` dönerse kart öğrenildi. */
export function nextGeneralStep(step: number, knew: boolean, today: string): { step: number; dueOn: string } | null {
  if (!knew) return { step: 0, dueOn: addDays(today, GENERAL_REVIEW_STEPS[0]) };
  const next = step + 1;
  if (next >= GENERAL_REVIEW_STEPS.length) return null;
  return { step: next, dueOn: addDays(today, GENERAL_REVIEW_STEPS[next]) };
}

function missingTable(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  return error.code === "42P01" || error.code === "PGRST205" || /general_review_cards/.test(error.message ?? "");
}

export type AddResult =
  | { ok: true; added: number; skipped: number; firstDue: string }
  | { ok: false; reason: "unavailable" | "no_cards" | "error" };

/** Maddeleri karta çevirip ekler; aynı kart ikinci kez eklenmez (yeniden eklemek basamağı sıfırlamaz). */
export async function addGeneralReviewCards(
  service: SupabaseClient,
  userId: string,
  facts: string[],
  now = new Date(),
): Promise<AddResult> {
  const cards = facts.map(clozeFromFact).filter((card): card is ClozeCard => Boolean(card));
  if (!cards.length) return { ok: false, reason: "no_cards" };
  const today = istanbulDay(now);
  const firstDue = addDays(today, GENERAL_REVIEW_STEPS[0]);
  const rows = cards.map((card) => ({
    user_id: userId,
    source: "chat",
    front: card.front,
    back: card.back,
    card_key: cardKey(card),
    interval_step: 0,
    due_on: firstDue,
  }));
  const { data, error } = await service
    .from("general_review_cards")
    .upsert(rows, { onConflict: "user_id,card_key", ignoreDuplicates: true })
    .select("id");
  if (missingTable(error)) return { ok: false, reason: "unavailable" };
  if (error) return { ok: false, reason: "error" };
  const added = data?.length ?? 0;
  return { ok: true, added, skipped: facts.length - added, firstDue };
}

/** Bugün günü gelen kartlar (en eski önce) ve destenin büyüklüğü. Tablo yoksa boş. */
export async function loadGeneralReviewDue(
  service: SupabaseClient,
  userId: string,
  now = new Date(),
): Promise<{ due: GeneralReviewCard[]; dueCount: number; total: number }> {
  const today = istanbulDay(now);
  const [dueRes, totalRes] = await Promise.all([
    service
      .from("general_review_cards")
      .select("id, front, back, interval_step, due_on, ask_count", { count: "exact" })
      .eq("user_id", userId)
      .eq("status", "active")
      .lte("due_on", today)
      .order("due_on", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(GENERAL_REVIEW_SESSION_MAX),
    service
      .from("general_review_cards")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("status", "active"),
  ]);
  if (dueRes.error || totalRes.error) return { due: [], dueCount: 0, total: 0 };
  return {
    due: (dueRes.data ?? []) as GeneralReviewCard[],
    dueCount: dueRes.count ?? dueRes.data?.length ?? 0,
    total: totalRes.count ?? 0,
  };
}

export type AnswerResult = { ok: true; learned: boolean; dueOn: string | null } | { ok: false; reason: "not_found" | "error" };

/** Kartın yanıtını yazar. Aynı gün ikinci yanıt basamağı yeniden oynatmaz (çift dokunuş). */
export async function answerGeneralReviewCard(
  service: SupabaseClient,
  userId: string,
  cardId: string,
  knew: boolean,
  now = new Date(),
): Promise<AnswerResult> {
  const today = istanbulDay(now);
  const { data: row, error } = await service
    .from("general_review_cards")
    .select("id, interval_step, ask_count, correct_count, last_answered_on, due_on, status")
    .eq("id", cardId)
    .eq("user_id", userId)
    .maybeSingle();
  if (error) return { ok: false, reason: "error" };
  if (!row || row.status !== "active") return { ok: false, reason: "not_found" };
  if (row.last_answered_on === today) return { ok: true, learned: false, dueOn: row.due_on as string };
  const next = nextGeneralStep(Number(row.interval_step) || 0, knew, today);
  const { error: updateError } = await service
    .from("general_review_cards")
    .update({
      interval_step: next ? next.step : 3,
      due_on: next ? next.dueOn : today,
      status: next ? "active" : "learned",
      ask_count: (Number(row.ask_count) || 0) + 1,
      correct_count: (Number(row.correct_count) || 0) + (knew ? 1 : 0),
      last_answered_on: today,
      updated_at: now.toISOString(),
    })
    .eq("id", cardId)
    .eq("user_id", userId);
  if (updateError) return { ok: false, reason: "error" };
  return { ok: true, learned: !next, dueOn: next ? next.dueOn : null };
}
