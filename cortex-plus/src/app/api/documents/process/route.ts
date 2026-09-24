import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { processDocument } from "@/lib/rag/pipeline";
import {
  commitCredits,
  refundCredits,
  reserveCredits,
} from "@/lib/credits/service";
import { PHOTO_QUOTA_CODE } from "@/lib/documents/process-errors";
import { photoPageLimit, planTier } from "@/lib/documents/photo-quota";

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
    const { data: meta } = await service
      .from("documents")
      .select("page_count")
      .eq("id", doc.id)
      .maybeSingle();
    return NextResponse.json({
      documentId: doc.id,
      status: "completed",
      pageCount: typeof meta?.page_count === "number" ? meta.page_count : null,
    });
  }

  /*
    Fotoğraf sayfası kotası artık BORU HATTINDA işliyor, burada değil.

    Sebebi: bir belgenin kaç fotoğraf sayfası yakacağını ancak orada
    biliyoruz. Taranmış bir PDF'in metin katmanı olmadığı açılmadan belli
    olmuyor; burada tahmin etmek ya taranmış PDF'i bedavaya geçirirdi ya da
    metin katmanı olan bir PDF'ten haksız yere kota keserdi.

    Buranın işi kredi. Kota dolduğunda boru hattı `photo_quota_exhausted`
    dönüyor ve aşağıda krediyle birlikte iade ediliyor.
  */
  const reservation = await reserveCredits(
    service,
    userId,
    "DOCUMENT_PAGE_PROCESS",
    `document_process_${doc.id}`,
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

    // Kota dolduğunda kredi kapısı AÇILMIYOR: kredi satın almak o sorunu
    // çözmüyor. İstemci bunu `code` alanından ayırıyor.
    if (result.error === "photo_quota_exhausted") {
      const tier = await planTier(service, userId);
      return NextResponse.json(
        {
          error: `Bu ayki fotoğraf hakkın doldu (${photoPageLimit(tier)}). Metin katmanı olan PDF ve metin belgeleri etkilenmiyor.`,
          code: PHOTO_QUOTA_CODE,
        },
        { status: 402 },
      );
    }

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
    // Hata değil ama söylenmesi gereken şey — örn. uzun tarama kesildi.
    notice: result.notice ?? null,
    topicMap: result.topicMap ?? null,
    pageCount: result.pageCount ?? null,
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
    case "office_unreadable":
      return "Bu slayt veya Word belgesinden yazı çıkarılamadı. İçi boş olabilir ya da dosya bozulmuş olabilir.";
    case "office_too_large":
      return "Bu belge açıldığında çok büyük. Daha küçük bir bölümünü yükler misin?";
    case "scan_unreadable":
      return "Taranmış sayfalardaki yazı okunamadı. Daha net taranmış ya da metin katmanı olan bir PDF dener misin?";
    case "text_extraction_unsupported":
    case "empty_content":
      return "Bu dosyadan metin çıkarılamadı. Metin katmanı olan bir PDF veya TXT deneyin.";
    default:
      return "Doküman işlenemedi.";
  }
}
