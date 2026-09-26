import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { loadDocumentGenerationContext } from "@/lib/documents/generation-context";
import { verifyFlashcard } from "@/lib/learning/question-verifier";

const bodySchema = z.object({
  topic: z.string().min(3).max(300),
  count: z.number().int().min(4).max(20).default(10),
  /** "Belgem" kaynağı: kartlar yalnızca bu belgeden. */
  documentId: z.string().uuid().optional(),
});

const resultSchema = z.object({
  title: z.string().min(1),
  cards: z
    .array(z.object({ front: z.string().min(1), back: z.string().min(1) }))
    .min(1),
});

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

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "FLASHCARD_GENERATE",
    isPremium: await isPremiumUser(service, userId),
    schemaHint:
      'Yalnızca şu JSON şemasını döndür: {"title": string, "cards": [{"front": string, "back": string}]}' +
      (docContext
        ? " Kartları YALNIZCA verilen belge alıntısındaki bilgiden üret."
        : ""),
    userPrompt: docContext
      ? `Belge: ${docContext.fileName}. Konu: ${topic}. ${count} adet çift yönlü kart üret. Ön yüz kısa soru/kavram, arka yüz net açıklama olsun.\n\nBelge alıntısı:\n${docContext.excerpt}`
      : `Konu: ${topic}. ${count} adet çift yönlü kart üret. Ön yüz kısa soru/kavram, arka yüz net açıklama olsun.`,
    parse: (raw) => {
      const result = resultSchema.safeParse(raw);
      if (!result.success) return null;
      const cards = result.data.cards.flatMap((card) => {
        const checked = verifyFlashcard(card.front, card.back);
        return checked ? [checked] : [];
      });
      return cards.length >= 4 ? { ...result.data, cards } : null;
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

  return NextResponse.json({
    setId: set.id,
    title: outcome.data.title,
    source: docContext
      ? { kind: "document", documentId, fileName: docContext.fileName }
      : { kind: "topic" },
    count: outcome.data.cards.length,
    creditsUsed: outcome.cost,
    cards: (rows ?? []).map((card) => ({
      id: card.id,
      front: card.front_text,
      back: card.back_text,
    })),
  });
}
