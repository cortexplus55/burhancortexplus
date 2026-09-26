import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import {
  cardsFromMistakeEntries,
  cardsFromMisconceptions,
} from "@/lib/learning/flashcard-from-mistakes";
import { makeCardKey, type SessionFlashcard } from "@/lib/learning/flashcard-model";
import { buildSessionQueue, type QueuedCard } from "@/lib/learning/flashcard-queue";
import { loadDueReviews, countDueCards } from "@/lib/learning/flashcard-reviews";
import { loadOpenMistakes } from "@/lib/learning/mistake-notebook";

const querySchema = z.object({
  examPrepId: z.string().uuid().optional(),
  topicLabel: z.string().max(200).optional(),
  setId: z.string().uuid().optional(),
});

/**
 * Bugünkü kart oturumu kuyruğu: vadesi geçmiş + yanlışlardan + (opsiyonel) set kartları.
 */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "flashcard-session", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service, supabase } = guard.ctx;

  const url = new URL(request.url);
  const parsed = querySchema.safeParse({
    examPrepId: url.searchParams.get("examPrepId") ?? undefined,
    topicLabel: url.searchParams.get("topicLabel") ?? undefined,
    setId: url.searchParams.get("setId") ?? undefined,
  });
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const dueRows = await loadDueReviews(service, userId, {
    examPrepId: parsed.data.examPrepId,
    topicLabel: parsed.data.topicLabel,
  });

  const due: QueuedCard[] = dueRows.map((row) => ({
    front: row.card_key.replace(/^[^:]+:/, "").slice(0, 160),
    back: "",
    kind: "definition" as const,
    cardKey: row.card_key,
    cardSource: row.card_source,
    topicLabel: row.topic_label,
    fromMistake: row.card_source === "mistake" || row.card_source === "misconception",
    bucket: "due" as const,
    dueAt: row.due_at,
  }));

  const openMistakes = await loadOpenMistakes(supabase, userId);
  const flatMistakes = openMistakes.flatMap((g) => g.entries);
  const mistakeCards = cardsFromMistakeEntries(
    flatMistakes.map((e) => ({
      id: e.id,
      questionText: e.questionText,
      correctAnswer: e.correctAnswer,
      explanation: e.explanation,
      topicLabel: e.topicLabel,
    })),
  ).filter((c) => !parsed.data.topicLabel || c.topicLabel === parsed.data.topicLabel);

  let misconceptionCards: SessionFlashcard[] = [];
  if (parsed.data.examPrepId) {
    const { data: mis } = await service
      .from("exam_prep_misconceptions")
      .select("id, question_preview, corrected, claim, topic_label, wrong_type, source_kind")
      .eq("user_id", userId)
      .eq("exam_prep_id", parsed.data.examPrepId)
      .order("created_at", { ascending: false })
      .limit(24);
    misconceptionCards = cardsFromMisconceptions(
      (mis ?? []).map((row) => ({
        id: row.id as string,
        questionPreview: row.question_preview as string | null,
        corrected: row.corrected as string | null,
        claim: row.claim as string | null,
        topicLabel: row.topic_label as string | null,
        wrongType: row.wrong_type as string | null,
        sourceKind: row.source_kind as string | null,
      })),
    );
  }

  const mistakeQueued: QueuedCard[] = [...mistakeCards, ...misconceptionCards].map((c) => ({
    ...c,
    bucket: "mistake" as const,
  }));

  const fresh: QueuedCard[] = [];
  if (parsed.data.setId) {
    const { data: cards } = await service
      .from("flashcards")
      .select("id, front_text, back_text, sort_order")
      .eq("set_id", parsed.data.setId)
      .order("sort_order");
    const dueKeys = new Set(due.map((c) => c.cardKey));
    for (const row of cards ?? []) {
      const key = makeCardKey("studio", row.id as string);
      if (dueKeys.has(key)) continue;
      fresh.push({
        front: row.front_text as string,
        back: row.back_text as string,
        kind: "definition",
        cardKey: key,
        cardSource: "studio",
        topicLabel: parsed.data.topicLabel ?? null,
        bucket: "new",
      });
    }
  }

  // Due satırlarında back yoksa set/mistake içeriğini eşle.
  const contentByKey = new Map<string, SessionFlashcard>();
  for (const c of [...mistakeCards, ...misconceptionCards, ...fresh]) {
    contentByKey.set(c.cardKey, c);
  }
  if (parsed.data.setId) {
    const { data: all } = await service
      .from("flashcards")
      .select("id, front_text, back_text")
      .eq("set_id", parsed.data.setId);
    for (const row of all ?? []) {
      const key = makeCardKey("studio", row.id as string);
      contentByKey.set(key, {
        front: row.front_text as string,
        back: row.back_text as string,
        kind: "definition",
        cardKey: key,
        cardSource: "studio",
      });
    }
  }

  const enrichedDue = due.map((card) => {
    const hit = contentByKey.get(card.cardKey);
    if (!hit) return card;
    return { ...card, front: hit.front, back: hit.back, kind: hit.kind, fromMistake: hit.fromMistake };
  });

  const queue = buildSessionQueue({
    due: enrichedDue.filter((c) => c.back),
    mistakes: mistakeQueued,
    fresh,
  });

  const dueTotal = await countDueCards(service, userId, parsed.data.examPrepId);

  return NextResponse.json({
    ...queue,
    dueTotal,
  });
}
