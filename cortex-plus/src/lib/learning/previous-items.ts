import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Aynı hazırlıkta daha önce sorulan sorular ve yazılan kartlar (25 Ekim 2026, canlı test P1-2).
 *
 * Canlıda ikinci ve üçüncü test birincinin sorularını kelimesi kelimesine tekrar etti; sonraki konunun
 * kartları öncekinin kartlarıyla aynıydı. Yazar önceki işleri hiç görmüyordu. Şimdi kayıtlı denemelerin
 * ve hazır bekleyen önceden yazımların kökleri okunur: yazara "tekrarlanmaz" listesi olarak gider,
 * üretimden sonra `dropNearDuplicates` aynı bilgiyi soran maddeyi eler.
 */
export const PREVIOUS_ITEMS_LIMIT = 40;

type Payload = Record<string, unknown> | null | undefined;

function texts(list: unknown, pick: (row: Record<string, unknown>) => unknown): string[] {
  if (!Array.isArray(list)) return [];
  return list
    .map((row) => (row && typeof row === "object" ? pick(row as Record<string, unknown>) : null))
    .filter((text): text is string => typeof text === "string" && text.trim().length > 0)
    .map((text) => text.trim());
}

/** Test, tuzak, odaklı pratik ve son kontrol kayıtlarının soru kökleri. */
export function quizStemsFromPayload(payload: Payload): string[] {
  if (!payload || payload.type !== "quiz") return [];
  return texts(payload.questions, (row) => row.text);
}

/** Kart destelerinin ön yüzleri (ön + arka birlikte: aynı bilgi başka ön yüzle de tekrar sayılır). */
export function cardTextsFromPayload(payload: Payload): string[] {
  return cardsFromPayload(payload).map((card) => `${card.front} ${card.back}`.trim());
}

export function cardsFromPayload(payload: Payload): { front: string; back: string }[] {
  if (!payload || payload.type !== "cards" || !Array.isArray(payload.cards)) return [];
  return payload.cards.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const card = row as { front?: unknown; back?: unknown };
    const front = typeof card.front === "string" ? card.front.trim() : "";
    const back = typeof card.back === "string" ? card.back.trim() : "";
    return front && back ? [{ front, back }] : [];
  });
}

export function questionsFromPayload(payload: Payload): { text: string; options: string[]; correct: string[] }[] {
  if (!payload || payload.type !== "quiz" || !Array.isArray(payload.questions)) return [];
  return payload.questions.flatMap((row) => {
    if (!row || typeof row !== "object") return [];
    const question = row as { text?: unknown; options?: unknown; correct?: unknown };
    const text = typeof question.text === "string" ? question.text.trim() : "";
    const options = Array.isArray(question.options) ? question.options.filter((item): item is string => typeof item === "string") : [];
    const correct = Array.isArray(question.correct) ? question.correct.filter((item): item is string => typeof item === "string") : [];
    return text && options.length >= 2 && correct.length ? [{ text, options, correct }] : [];
  });
}

/** Yeniden eskiye, tekrarsız, en çok `limit`. */
export function collectPreviousItems(
  payloads: readonly Payload[],
  pick: (payload: Payload) => string[],
  limit = PREVIOUS_ITEMS_LIMIT,
): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const payload of payloads) {
    for (const text of pick(payload)) {
      const key = text.toLocaleLowerCase("tr");
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(text);
      if (out.length >= limit) return out;
    }
  }
  return out;
}

/** Hazırlığın kayıtlı denemeleri ve hazır bekleyen önceden yazımları; okunamazsa boş liste. */
export async function loadPreviousItems(
  service: SupabaseClient,
  input: { userId: string; prepId: string; kind: "quiz" | "cards"; excludeNodeId?: string | null },
): Promise<string[]> {
  try {
    let attempts = service
      .from("exam_prep_node_attempts")
      .select("payload")
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.prepId)
      .not("payload", "is", null);
    let ready = service
      .from("exam_prep_prefetch")
      .select("payload")
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.prepId)
      .eq("status", "ready");
    if (input.excludeNodeId) ready = ready.neq("node_id", input.excludeNodeId);
    attempts = attempts.order("created_at", { ascending: false }).limit(30);
    const [done, waiting] = await Promise.all([attempts, ready.limit(10)]);
    const payloads = [...(done.data ?? []), ...(waiting.data ?? [])].map((row) => row.payload as Payload);
    return collectPreviousItems(payloads, input.kind === "quiz" ? quizStemsFromPayload : cardTextsFromPayload);
  } catch {
    return [];
  }
}

async function loadPayloads(
  service: SupabaseClient,
  input: { userId: string; prepId: string },
): Promise<Payload[]> {
  const [done, waiting] = await Promise.all([
    service
      .from("exam_prep_node_attempts")
      .select("payload")
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.prepId)
      .not("payload", "is", null)
      .order("created_at", { ascending: false })
      .limit(30),
    service
      .from("exam_prep_prefetch")
      .select("payload")
      .eq("user_id", input.userId)
      .eq("exam_prep_id", input.prepId)
      .eq("status", "ready")
      .limit(10),
  ]);
  return [...(done.data ?? []), ...(waiting.data ?? [])].map((row) => row.payload as Payload);
}

/** Üretim düşünce son tekrar bu desteden açılır. */
export async function loadStoredCards(
  service: SupabaseClient,
  input: { userId: string; prepId: string },
): Promise<{ front: string; back: string }[]> {
  try {
    const payloads = await loadPayloads(service, input);
    const seen = new Set<string>();
    const cards: { front: string; back: string }[] = [];
    for (const payload of payloads) {
      for (const card of cardsFromPayload(payload)) {
        const key = card.front.toLocaleLowerCase("tr");
        if (seen.has(key)) continue;
        seen.add(key);
        cards.push(card);
        if (cards.length >= 8) return cards;
      }
    }
    return cards;
  } catch {
    return [];
  }
}

/** Üretim düşünce son kontrol bu sorulardan açılır. */
export async function loadStoredQuiz(
  service: SupabaseClient,
  input: { userId: string; prepId: string },
): Promise<{ text: string; options: string[]; correct: string[] }[]> {
  try {
    const payloads = await loadPayloads(service, input);
    const seen = new Set<string>();
    const questions: { text: string; options: string[]; correct: string[] }[] = [];
    for (const payload of payloads) {
      for (const question of questionsFromPayload(payload)) {
        const key = question.text.toLocaleLowerCase("tr");
        if (seen.has(key)) continue;
        seen.add(key);
        questions.push(question);
        if (questions.length >= 12) return questions;
      }
    }
    return questions;
  } catch {
    return [];
  }
}
