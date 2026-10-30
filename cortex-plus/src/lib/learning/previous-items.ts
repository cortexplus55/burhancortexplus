import type { SupabaseClient } from "@supabase/supabase-js";
import { topicLabelsMatch } from "@/lib/learning/study-tools";

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

export type AskedItem = {
  /** Sorulan bilgi: soru kökü, önerme, kart, sözlü sorusu ya da yoklanan "Sınavda sorulur" maddesi. */
  text: string;
  /** Öğenin kendi konusu (son kontrol gibi çok konulu içerikte); yoksa içeriğin sorduğu konu. */
  topic: string | null;
};

function itemTopic(row: Record<string, unknown>, fallback: string | null): string | null {
  const own = typeof row.topic === "string" ? row.topic.trim() : "";
  return own || fallback;
}

/**
 * Bir etkinliğin sorduğu bilgiler, türden bağımsız (30 Ekim 2026, Paket I #8). Canlıda aynı 3-4 bilgi test,
 * odaklı pratik, doğru/yanlış ve kartlarda 4-5 kez soruldu: tekrar yasağı yalnız aynı türün köklerini görüyordu
 * (test testi, kart kartı). Şimdi her tür bütün türlerin sorduğunu görür; testin `point` alanı (yoklanan sınav
 * maddesi) da listeye girer ki yazar konunun başka alt başlığına gitsin.
 */
export function askedItemsFromPayload(payload: Payload): AskedItem[] {
  if (!payload) return [];
  const tested = typeof payload.testedTopic === "string" && payload.testedTopic.trim() ? payload.testedTopic.trim() : null;
  const out: AskedItem[] = [];
  const push = (text: unknown, topic: string | null) => {
    if (typeof text === "string" && text.trim()) out.push({ text: text.trim(), topic });
  };
  const rows = (list: unknown) => (Array.isArray(list) ? list : []).filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object");
  if (payload.type === "quiz") {
    for (const row of rows(payload.questions)) {
      const topic = itemTopic(row, tested);
      push(row.text, topic);
      // `point` ya madde numarası ("3": bağlamı olmadan anlamsız, alınmaz) ya da kaynak bölümünün başlığıdır.
      if (typeof row.point === "string" && /\p{L}{3}/u.test(row.point)) push(`Yoklanan bölüm: ${row.point.trim()}`, topic);
    }
  } else if (payload.type === "true_false") {
    for (const row of rows(payload.items)) push(row.text, itemTopic(row, tested));
  } else if (payload.type === "cards") {
    for (const card of cardsFromPayload(payload)) push(`${card.front} ${card.back}`, tested);
  } else if (payload.type === "oral") {
    for (const row of rows(payload.questions)) push(row.prompt, itemTopic(row, tested));
  } else if (payload.type === "podcast") {
    for (const row of rows(payload.check)) push(row.text, itemTopic(row, tested));
  }
  return out;
}

/**
 * Önceki etkinliklerin sorduğu bilgiler: önce bu konunun (öğenin konusu, içeriğin `testedTopic`'i ya da kaydın
 * `topic_id`'si tutuyorsa), sonra öbürleri; tekrarsız, en çok `limit`. Konu verilmezse sıra kayıt sırasıdır.
 */
export function collectAskedItems(
  rows: readonly { payload: Payload; topicId?: string | null }[],
  input: { topic?: string | null; topicId?: string | null; limit?: number } = {},
): string[] {
  const limit = input.limit ?? PREVIOUS_ITEMS_LIMIT;
  const wanted = input.topic?.trim() || "";
  const own: string[] = [];
  const other: string[] = [];
  for (const row of rows) {
    for (const item of askedItemsFromPayload(row.payload)) {
      const sameTopic = item.topic
        ? Boolean(wanted) && topicLabelsMatch(item.topic, wanted)
        : Boolean(input.topicId) && row.topicId === input.topicId;
      (sameTopic ? own : other).push(item.text);
    }
  }
  const seen = new Set<string>();
  const out: string[] = [];
  for (const text of [...own, ...other]) {
    const key = text.toLocaleLowerCase("tr");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(text);
    if (out.length >= limit) break;
  }
  return out;
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

/**
 * Hazırlığın kayıtlı denemeleri ve hazır bekleyen önceden yazımları; okunamazsa boş liste.
 *
 * Etkinlikler arası (30 Ekim 2026, Paket I #8): `kind` yalnız çağıranın türünü söyler; liste bütün türlerin
 * sorduğunu taşır (test kökü, yoklanan bölüm, önerme, kart, sözlü sorusu, dinleme kontrolü). `topic` verilirse
 * bu konunun öğeleri önce gelir: 40'lık liste başka konuların öğeleriyle dolup bu konunun tekrarını kaçırmasın.
 */
export async function loadPreviousItems(
  service: SupabaseClient,
  input: {
    userId: string;
    prepId: string;
    kind: "quiz" | "cards" | "true_false" | "oral";
    excludeNodeId?: string | null;
    topic?: string | null;
    topicId?: string | null;
  },
): Promise<string[]> {
  try {
    let attempts = service
      .from("exam_prep_node_attempts")
      .select("payload, topic_id")
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
    const rows = [
      ...(done.data ?? []).map((row) => ({
        payload: row.payload as Payload,
        topicId: typeof (row as { topic_id?: unknown }).topic_id === "string" ? ((row as { topic_id: string }).topic_id) : null,
      })),
      ...(waiting.data ?? []).map((row) => ({ payload: row.payload as Payload, topicId: null })),
    ];
    return collectAskedItems(rows, { topic: input.topic ?? null, topicId: input.topicId ?? null });
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
