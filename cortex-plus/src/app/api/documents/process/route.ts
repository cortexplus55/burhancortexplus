import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { processDocument } from "@/lib/rag/pipeline";
import {
  commitCredits,
  refundCredits,
  reserveCredits,
} from "@/lib/credits/service";
import { isImageDocument } from "@/lib/documents/extract-image-text";
import { PHOTO_QUOTA_CODE } from "@/lib/documents/process-errors";
import {
  claimPhotoPages,
  photoPageLimit,
  planTier,
  releasePhotoPages,
} from "@/lib/documents/photo-quota";

const bodySchema = z.object({ documentId: z.string().uuid() });
export const maxDuration = 120;

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "doc-process", limit: 12 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: doc } = await service
    .from("documents")
    .select("id, user_id, status, mime_type")
    .eq("id", parsed.data.documentId)
    .maybeSingle();

  if (!doc) return errorResponse(404, "not_found");
  if (doc.user_id !== userId) return errorResponse(403, "forbidden");
  if (doc.status === "completed") {
    return NextResponse.json({ documentId: doc.id, status: "completed" });
  }

  /*
    Fotoğrafın kredinin yanında bir de sayfa kotası var (`photo-quota.ts`).

    Sıra önemli: kota KREDİDEN ÖNCE soruluyor. Tersi olsaydı kotası dolmuş
    öğrencinin kredisi ayrılır, sonra iade edilirdi — cüzdanda gidip gelen
    bir hareket ve defterde iki gereksiz satır.

    Bir fotoğraf bir sayfa.
  */
  const isPhoto = isImageDocument(doc.mime_type as string | null);
  let photoPages = 0;
  if (isPhoto) {
    const tier = await planTier(service, userId);
    if (!(await claimPhotoPages(service, userId, 1, tier))) {
      return NextResponse.json(
        {
          error: `Bu ayki fotoğraf hakkın doldu (${photoPageLimit(tier)}). PDF ve metin belgeleri etkilenmiyor.`,
          code: PHOTO_QUOTA_CODE,
        },
        { status: 402 },
      );
    }
    photoPages = 1;
  }

  const reservation = await reserveCredits(
    service,
    userId,
    "DOCUMENT_PAGE_PROCESS",
    `document_process_${doc.id}`,
  );
  if (!reservation.ok) {
    if (photoPages) await releasePhotoPages(service, userId, photoPages);
    return errorResponse(
      reservation.reason === "insufficient_credits" ? 402 : 400,
      reservation.reason,
    );
  }

  const result = await processDocument(service, doc.id);

  if (!result.ok) {
    await refundCredits(service, reservation.reservationId);
    // Okunamayan fotoğraf kota yakmıyor: hak geri veriliyor.
    if (photoPages) await releasePhotoPages(service, userId, photoPages);
    return NextResponse.json(
      { error: processFailureMessage(result.error) },
      { status: 422 },
    );
  }

  await commitCredits(service, reservation.reservationId);

  return NextResponse.json({
    documentId: doc.id,
    status: "completed",
    chunks: result.chunks,
    creditsUsed: reservation.cost,
    topicMap: result.topicMap ?? null,
  });
}

/**
 * Hata kodunu öğrencinin okuyacağı cümleye çevirir.
 *
 * Fotoğrafın kendi cümleleri var: "metin katmanı olan bir PDF deneyin" öğüdü,
 * telefonundan bir ders notu çeken öğrenciye hiçbir şey anlatmıyor — ne
 * yaptığını yanlış anladığımızı gösteriyor.
 */
function processFailureMessage(error?: string): string {
  switch (error) {
    case "image_unreadable":
      return "Fotoğraftaki yazı okunamadı. Daha yakından, düz ve iyi ışıkta çekilmiş bir kare dener misin?";
    case "image_too_large":
      return "Fotoğraf çok büyük. 10 MB'ın altında bir kare gönder.";
    case "image_blocked":
      return "Bu görsel işlenemedi. Ders içeriği olan bir fotoğraf yükle.";
    case "text_extraction_unsupported":
    case "empty_content":
      return "Bu dosyadan metin çıkarılamadı. Metin katmanı olan bir PDF veya TXT deneyin.";
    default:
      return "Doküman işlenemedi.";
  }
}
