import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import { processDocument } from "@/lib/rag/pipeline";
import { runPdfLearningV2 } from "@/lib/documents/pdf-learning-v2";
import { pickProcessPhase } from "@/lib/documents/process-session";
import {
  commitCredits,
  refundCredits,
  reserveCredits,
} from "@/lib/credits/service";
import { PHOTO_QUOTA_CODE } from "@/lib/documents/process-errors";
import { photoPageLimit, planTier } from "@/lib/documents/photo-quota";
import { processPdfDocumentStep } from "@/lib/documents/pdf-ingestion";
import { userMessageForProcessError } from "@/lib/documents/process-user-message";

const bodySchema = z.object({ documentId: z.string().uuid() });
export const maxDuration = 300;

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "doc-process", limit: 90, dailyLimit: 600 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: doc } = await service
    .from("documents")
    .select("id, user_id, status, mime_type, topic_map_status, page_count")
    .eq("id", parsed.data.documentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!doc) return errorResponse(404, "not_found");
  if (doc.user_id !== userId) return errorResponse(403, "forbidden");
  if (doc.status === "pending") {
    return NextResponse.json({ error: "Dosya yüklemesi henüz tamamlanmadı." }, { status: 409 });
  }

  const learningV2 = await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG);
  const { count: chunkCount } = await service
    .from("document_chunks")
    .select("id", { count: "exact", head: true })
    .eq("document_id", doc.id);
  if (doc.mime_type === "application/pdf" && (doc.status !== "completed" || !chunkCount)) {
    const { data: state } = await service.from("document_ingestion_state")
      .select("status,total_pages")
      .eq("document_id", doc.id).maybeSingle();
    if (state?.status === "ready" && !chunkCount) {
      // A stale "ready" flag with no search index must never expose a blank
      // document. Rebuild from the source file using the durable cursor.
      await service.from("document_ingestion_state").update({
        status: "extracting", next_page: 1, initialized: false,
        lease_token: null, lease_until: null,
      }).eq("document_id", doc.id);
    }
    if (state?.status !== "ready" || !chunkCount) {
      const indexed = await processPdfDocumentStep(service, doc.id, userId);
      if (indexed.status === "failed") {
        if (indexed.code === "insufficient_credits") return errorResponse(402, "insufficient_credits");
        if (indexed.code === "operation_in_progress") {
          return NextResponse.json({ documentId: doc.id, status: "processing", phase: "extract" }, { status: 202 });
        }
        if (indexed.code === PHOTO_QUOTA_CODE) {
          const tier = await planTier(service, userId);
          return NextResponse.json({
            error: `Bu ayki fotoğraf hakkın doldu (${photoPageLimit(tier)}). Taranmış PDF sayfaları bu hakkı kullanır.`,
            code: PHOTO_QUOTA_CODE,
          }, { status: 402 });
        }
        return NextResponse.json({ error: processFailureMessage(indexed.code) }, { status: 422 });
      }
      if (indexed.status === "processing") {
        return NextResponse.json({
          documentId: doc.id, status: "processing", phase: "extract",
          pageCount: indexed.pageCount, nextPage: indexed.nextPage,
        }, { status: 202 });
      }
      if (learningV2) {
        return NextResponse.json({
          documentId: doc.id, status: "processing", phase: "map",
          pageCount: indexed.pageCount,
        }, { status: 202 });
      }
      await service.from("documents").update({ status: "completed", error_message: null }).eq("id", doc.id);
      await service.from("processing_jobs").update({ status: "completed", progress: 100 }).eq("document_id", doc.id);
      return NextResponse.json({ documentId: doc.id, status: "completed", pageCount: indexed.pageCount });
    }
    if (!learningV2) {
      await service.from("documents").update({ status: "completed", error_message: null }).eq("id", doc.id);
      await service.from("processing_jobs").update({ status: "completed", progress: 100 }).eq("document_id", doc.id);
      return NextResponse.json({ documentId: doc.id, status: "completed", pageCount: state.total_pages });
    }
  }
  const phase = pickProcessPhase({
    status: (doc.status as string | null) ?? null,
    chunkCount: chunkCount ?? 0,
    topicMapStatus: (doc.topic_map_status as string | null) ?? null,
    learningV2,
  });
  if (phase === "done") {
    return NextResponse.json({
      documentId: doc.id,
      status: "completed",
      pageCount: typeof doc.page_count === "number" ? doc.page_count : null,
    });
  }

  if (phase === "map") {
    const mapped = await runPdfLearningV2(service, doc.id);
    if ((mapped as { pending?: boolean }).pending) {
      return NextResponse.json({
        documentId: doc.id, status: "processing", phase: "map",
        pageCount: typeof doc.page_count === "number" ? doc.page_count : null,
      }, { status: 202 });
    }
    if (!mapped.ok) {
      return NextResponse.json(
        { error: "Konu haritası bu turda tamamlanamadı. Yeniden denenebilir." },
        { status: 422 },
      );
    }
    await service
      .from("documents")
      .update({ status: "completed", error_message: null })
      .eq("id", doc.id);
    await service
      .from("processing_jobs")
      .update({ status: "completed", progress: 100 })
      .eq("document_id", doc.id);
    return NextResponse.json({
      documentId: doc.id,
      status: "completed",
      pageCount: typeof doc.page_count === "number" ? doc.page_count : null,
      topicMap: { ok: true, topics: mapped.topics, coverageStatus: mapped.coverage?.status },
      notice: null,
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
    if (reservation.reason === "operation_in_progress" || reservation.reason === "operation_completed") {
      return NextResponse.json({ documentId: doc.id, status: "processing", phase: "extract" }, { status: 202 });
    }
    if (reservation.reason === "insufficient_credits") {
      await service.from("documents").update({ status: "failed", error_message: "insufficient_credits" })
        .eq("id", doc.id).eq("user_id", userId);
      await service.from("processing_jobs").update({ status: "failed", error_message: "insufficient_credits" })
        .eq("document_id", doc.id);
    }
    return errorResponse(
      reservation.reason === "insufficient_credits" ? 402 : 400,
      reservation.reason,
    );
  }

  const result = await processDocument(service, doc.id, {
    deferTopicMap: learningV2,
  });

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

  if (result.deferred) {
    return NextResponse.json(
      {
        documentId: doc.id,
        status: "processing",
        phase: "map",
        chunks: result.chunks,
        pageCount: result.pageCount ?? null,
        notice: result.notice ?? null,
      },
      { status: 202 },
    );
  }

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
      return userMessageForProcessError(error);
  }
}
