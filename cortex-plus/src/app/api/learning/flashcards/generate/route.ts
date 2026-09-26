import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { loadDocumentGenerationContext } from "@/lib/documents/generation-context";
import { makeCardKey, type FlashcardKind } from "@/lib/learning/flashcard-model";
import { verifyFlashcard } from "@/lib/learning/question-verifier";
import { validateFlashcardPedagogy } from "@/lib/learning/teaching-standards";
import { repairTurkishSurface } from "@/lib/learning/learner-fluency";

const KINDS = [
  "definition",
  "formula",
  "fact",
  "process",
  "cause_effect",
  "numeric",
] as const;

const bodySchema = z.object({
  topic: z.string().min(3).max(300),
  count: z.number().int().min(4).max(20).default(10),
  /** "Belgem" kaynağı: kartlar yalnızca bu belgeden. */
  documentId: z.string().uuid().optional(),
});

const resultSchema = z.object({
  title: z.string().min(1),
  cards: z
    .array(
      z.object({
        front: z.string().min(1),
        back: z.string().min(1),
        kind: z.enum(KINDS).optional(),
        difficulty: z.enum(["easy", "medium", "hard"]).optional(),
      }),
    )
    .min(1),
});

function coerceKind(raw: string | undefined): FlashcardKind {
  if (raw && (KINDS as readonly string[]).includes(raw)) return raw as FlashcardKind;
  return "definition";
}

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "flashcards", limit: 10 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsedBody = bodySchema.safeParse(await request.json());
  if (!parsedBody.success) return errorResponse(400, "invalid_input");
  const { topic, count, documentId } = parsedBody.data;

  // Kredi ayrılmadan önce: belge hazır değilse net sebep, kayıp yok.
  const docContext = documentId
    ? await loadDocumentGenerationContext(service, userId, documentId, topic, {
        maxChars: 9_000,
      })
    : null;
  if (documentId && !docContext) return errorResponse(409, "document_not_ready");

  const sourceBlock = docContext?.excerpt?.trim() ?? "";
  const grounded = Boolean(sourceBlock);

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "FLASHCARD_GENERATE",
    isPremium: await isPremiumUser(service, userId),
    schemaHint:
      'Yalnızca şu JSON şemasını döndür: {"title": string, "cards": [{"front": string, "back": string, "kind": "definition"|"formula"|"fact"|"process"|"cause_effect"|"numeric", "difficulty": "easy"|"medium"|"hard"}]}' +
      (grounded
        ? " Kartları YALNIZCA verilen belge alıntısındaki bilgiden üret. Kaynakta olmayan sayı, tarih veya formül yazma."
        : ""),
    userPrompt: grounded
      ? `Belge: ${docContext!.fileName}. Konu: ${topic}. ${count} adet çift yönlü kart üret. Ön yüz kısa soru/kavram (cevabı sızdırma), arka yüz en fazla 40 kelime. kind alanını doldur.\n\nBelge alıntısı:\n${sourceBlock}`
      : `Konu: ${topic}. ${count} adet çift yönlü kart üret. Ön yüz kısa soru/kavram, arka yüz en fazla 40 kelime. kind alanını doldur.`,
    parse: (raw) => {
      const result = resultSchema.safeParse(raw);
      if (!result.success) return null;
      const cards = result.data.cards.flatMap((card) => {
        const checked = verifyFlashcard(
          repairTurkishSurface(card.front),
          repairTurkishSurface(card.back),
          sourceBlock,
        );
        if (!checked) return [];
        return [
          {
            ...checked,
            kind: coerceKind(card.kind),
            difficulty: card.difficulty ?? "medium",
          },
        ];
      });
      if (cards.length < 4) return null;
      const issues = validateFlashcardPedagogy(cards);
      if (issues.length) return null;
      return { ...result.data, cards };
    },
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  const { data: set, error } = await service
    .from("flashcard_sets")
    .insert({
      user_id: userId,
      title: outcome.data.title,
      ...(documentId ? { document_id: documentId } : {}),
    })
    .select("id")
    .single();

  if (error || !set) return errorResponse(500, "generation_failed");

  await service.from("flashcards").insert(
    outcome.data.cards.map((card, index) => ({
      set_id: set.id,
      front_text: card.front,
      back_text: card.back,
      sort_order: index,
    })),
  );

  const { data: rows } = await service
    .from("flashcards")
    .select("id, front_text, back_text, sort_order")
    .eq("set_id", set.id)
    .order("sort_order");

  const sourceLabel = grounded && docContext ? docContext.fileName : null;

  return NextResponse.json({
    setId: set.id,
    title: outcome.data.title,
    grounded,
    sourceNote: grounded ? null : "Bu kartlar materyaline dayanmıyor",
    source: grounded
      ? { kind: "document", documentId, fileName: docContext!.fileName }
      : { kind: "topic" },
    count: outcome.data.cards.length,
    creditsUsed: outcome.cost,
    cards: (rows ?? []).map((card, index) => {
      const meta = outcome.data.cards[index];
      return {
        id: card.id,
        front: card.front_text,
        back: card.back_text,
        kind: meta?.kind ?? "definition",
        difficulty: meta?.difficulty ?? "medium",
        sourceLabel,
        cardKey: makeCardKey("studio", card.id as string),
        cardSource: "studio" as const,
      };
    }),
  });
}
