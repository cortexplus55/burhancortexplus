import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { processDocument } from "@/lib/rag/pipeline";
import {
  commitCredits,
  newIdempotencyKey,
  refundCredits,
  reserveCredits,
} from "@/lib/credits/service";

const bodySchema = z.object({ documentId: z.string().uuid() });

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "doc-process", limit: 12 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: doc } = await service
    .from("documents")
    .select("id, user_id, status")
    .eq("id", parsed.data.documentId)
    .maybeSingle();

  if (!doc) return errorResponse(404, "not_found");
  if (doc.user_id !== userId) return errorResponse(403, "forbidden");

  const reservation = await reserveCredits(
    service,
    userId,
    "DOCUMENT_PAGE_PROCESS",
    newIdempotencyKey(`doc_${doc.id}`),
  );
  if (!reservation.ok) {
    return errorResponse(
      reservation.reason === "insufficient_credits" ? 402 : 400,
      reservation.reason,
    );
  }

  const result = await processDocument(service, doc.id);

  if (!result.ok) {
    await refundCredits(service, reservation.reservationId);
    return NextResponse.json(
      {
        error:
          result.error === "text_extraction_unsupported"
            ? "Bu dosyadan metin çıkarılamadı. Metin katmanı olan bir PDF veya TXT deneyin."
            : "Doküman işlenemedi.",
      },
      { status: 422 },
    );
  }

  await commitCredits(service, reservation.reservationId);

  return NextResponse.json({
    documentId: doc.id,
    status: "completed",
    chunks: result.chunks,
    creditsUsed: reservation.cost,
  });
}
