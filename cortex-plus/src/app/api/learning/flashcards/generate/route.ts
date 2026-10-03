import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { getCreditCost } from "@/lib/credits/rules";
import { teacherCardsLoop } from "@/lib/learning/teacher-cards";
import { runWithTeacherModel } from "@/lib/learning/teacher-engine-run";
import { studioTeacherSource } from "@/lib/learning/studio-teacher-source";

const bodySchema = z.object({
  topic: z.string().min(3).max(300),
  count: z.number().int().min(4).max(20).default(10),
  /** "Belgem" kaynağı: kartlar yalnızca bu belgeden. */
  documentId: z.string().uuid().optional(),
});

/**
 * Araçlar > Kartlar (3 Ekim 2026): sınav hazırlığındaki öğretmen kart
 * motoru — konunun temiz çekirdek sayfaları (belge seçildiyse), her kartı
 * kendisi cevaplayan denetim, sorunlu kartın düzeltilmesi ya da elenmesi.
 * Eski taslak + doğrulayıcı zinciri kalktı.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "flashcards", limit: 10 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsedBody = bodySchema.safeParse(await request.json());
  if (!parsedBody.success) return errorResponse(400, "invalid_input");
  const { topic, count, documentId } = parsedBody.data;

  // Kredi ayrılmadan önce: belge hazır değilse net sebep, kayıp yok.
  const source = await studioTeacherSource(service, { userId, topic, documentId });
  if (!source) return errorResponse(409, "document_not_ready");

  const minimum = Math.min(4, count);
  const outcome = await runWithTeacherModel(service, {
    userId,
    actionCode: "FLASHCARD_GENERATE",
    idempotencyKey: `studio-cards:${userId}:${crypto.randomUUID()}`,
    label: "studio_cards",
    topic,
    work: async (ask, started) => {
      const loop = await teacherCardsLoop(
        ask,
        {
          topicLabel: topic,
          prepTitle: source.fileName ?? topic,
          pages: source.pages,
          mode: source.mode,
          count,
          runningHeaders: source.edges,
        },
        started,
      );
      const log = { kept: loop.cards.length, rejected: loop.rejected.length, rounds: loop.rounds };
      return loop.cards.length >= minimum
        ? { ok: true as const, result: loop.cards, log }
        : { ok: false as const, reasons: loop.rejected.slice(0, 4).map((row) => row.problems[0] ?? "sorun"), log };
    },
  });
  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  const title = topic.trim();
  const { data: set, error } = await service
    .from("flashcard_sets")
    .insert({
      user_id: userId,
      title,
      ...(documentId ? { document_id: documentId } : {}),
    })
    .select("id")
    .single();

  if (error || !set) return errorResponse(500, "generation_failed");

  await service.from("flashcards").insert(
    outcome.result.map((card, index) => ({
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
    title,
    source: documentId
      ? { kind: "document", documentId, fileName: source.fileName }
      : { kind: "topic" },
    count: outcome.result.length,
    creditsUsed: await getCreditCost("FLASHCARD_GENERATE"),
    cards: (rows ?? []).map((card) => ({
      id: card.id,
      front: card.front_text,
      back: card.back_text,
    })),
  });
}
