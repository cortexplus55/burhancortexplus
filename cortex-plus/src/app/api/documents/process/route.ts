import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isFeatureEnabled, PDF_LEARNING_V2_FLAG } from "@/lib/admin/feature-flags";
import { processDocument } from "@/lib/rag/pipeline";
import { runPdfLearningV2 } from "@/lib/documents/pdf-learning-v2";
import { clampExamLabel, pickProcessPhase } from "@/lib/documents/process-session";
import {
  commitCredits,
  refundCredits,
  reserveCredits,
} from "@/lib/credits/service";
import { PHOTO_QUOTA_CODE } from "@/lib/documents/process-errors";
import { photoPageLimit, planTier } from "@/lib/documents/photo-quota";
import {
  processPdfDocumentStep,
  PDF_STEP_DEADLINE_MS,
  PDF_CHAIN_BUDGET_MS,
} from "@/lib/documents/pdf-ingestion";
import { userMessageForProcessError } from "@/lib/documents/process-user-message";
import {
  getIngestionError,
  isRetryableIngestionCode,
  userFacingIngestionMessage,
} from "@/lib/documents/ingestion-errors";
import { isAdminUser } from "@/lib/auth/roles";

const bodySchema = z.object({
  documentId: z.string().uuid(),
  maxOcrPages: z.number().int().positive().optional(),
  /** Exam type/subject for oneshot teacher perspective (optional). */
  examType: z.unknown().optional().transform(clampExamLabel),
  examDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});
export const maxDuration = 300;

async function markDocumentFailed(
  service: Parameters<typeof processPdfDocumentStep>[0],
  documentId: string,
  userId: string,
  code: string,
) {
  await service
    .from("documents")
    .update({ status: "failed", error_message: code })
    .eq("id", documentId)
    .eq("user_id", userId);
  await service
    .from("processing_jobs")
    .update({ status: "failed", error_message: code })
    .eq("document_id", documentId);
}

async function reservationIdForDocument(
  service: Parameters<typeof processPdfDocumentStep>[0],
  userId: string,
  documentId: string,
): Promise<string | null> {
  const key = `document_process_${documentId}`;
  const { data } = await service
    .from("credit_reservations")
    .select("id, status")
    .eq("user_id", userId)
    .eq("idempotency_key", key)
    .in("status", ["pending", "committed"])
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

async function commitDocumentCredits(
  service: Parameters<typeof processPdfDocumentStep>[0],
  userId: string,
  documentId: string,
) {
  const id = await reservationIdForDocument(service, userId, documentId);
  if (id) await commitCredits(service, id);
}

async function refundDocumentCredits(
  service: Parameters<typeof processPdfDocumentStep>[0],
  userId: string,
  documentId: string,
) {
  const id = await reservationIdForDocument(service, userId, documentId);
  if (id) await refundCredits(service, id).catch(() => {});
}

export async function POST(request: Request) {
  // Long documents poll often; raise daily ceiling so 211-page books never 429.
  const guard = await withUser(request, { scope: "doc-process", limit: 120, dailyLimit: 2_400 });
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

  const isPdf = doc.mime_type === "application/pdf";
  const needsExtract =
    isPdf && (doc.status !== "completed" || !chunkCount);

  if (needsExtract) {
    const { data: state } = await service.from("document_ingestion_state")
      .select("status,total_pages,reservation_id")
      .eq("document_id", doc.id).maybeSingle();
    if (state?.status === "ready" && !chunkCount) {
      await service.from("document_ingestion_state").update({
        status: "extracting", next_page: 1, initialized: false,
        lease_token: null, lease_until: null,
      }).eq("document_id", doc.id);
    }
    if (state?.status !== "ready" || !chunkCount) {
      // Chain extract steps inside maxDuration — fewer client round-trips.
      const chainStarted = Date.now();
      const chainDeadline = chainStarted + PDF_CHAIN_BUDGET_MS;
      let indexed = await processPdfDocumentStep(service, doc.id, userId, {
        deadlineMs: Math.min(Date.now() + PDF_STEP_DEADLINE_MS, chainDeadline),
        maxOcrPages: parsed.data.maxOcrPages ?? null,
      });
      let extractSteps = 1;
      while (
        indexed.status === "processing" &&
        Date.now() + 15_000 < chainDeadline
      ) {
        const stepStarted = Date.now();
        indexed = await processPdfDocumentStep(service, doc.id, userId, {
          deadlineMs: Math.min(Date.now() + PDF_STEP_DEADLINE_MS, chainDeadline),
          maxOcrPages: parsed.data.maxOcrPages ?? null,
        });
        extractSteps += 1;
        const stepPages =
          indexed.status === "processing"
            ? (indexed.pagesDone ?? indexed.nextPage ?? null)
            : indexed.status === "ready"
              ? indexed.pageCount
              : null;
        console.info("pipeline_timing", {
          documentId: doc.id,
          stage: "extract_step",
          ms: Date.now() - stepStarted,
          pages: stepPages,
          nextPage: indexed.status === "processing" ? indexed.nextPage : null,
          ocrPages: indexed.status === "processing" ? (indexed.ocrPages ?? null) : null,
        });
        if (indexed.status === "failed") break;
      }
      console.info("pipeline_timing", {
        documentId: doc.id,
        stage: "extract_chain",
        ms: Date.now() - chainStarted,
        steps: extractSteps,
        status: indexed.status,
        pages:
          indexed.status === "ready" || indexed.status === "processing"
            ? indexed.pageCount
            : null,
      });
      if (indexed.status === "failed") {
        if (indexed.code === "insufficient_credits") {
          return errorResponse(402, "insufficient_credits");
        }
        if (indexed.code === "operation_in_progress") {
          return NextResponse.json({
            documentId: doc.id, status: "processing", phase: "extract",
            pageCount: null, nextPage: null,
          }, { status: 202 });
        }
        if (indexed.retryable || isRetryableIngestionCode(indexed.code)) {
          const def = getIngestionError(indexed.code);
          return NextResponse.json({
            code: indexed.code,
            retryable: true,
            retryAfterMs: 2_000,
            error: userFacingIngestionMessage(indexed.code),
            action: def.action,
            pageCount: null,
            nextPage: null,
          }, { status: 503 });
        }
        if (indexed.code === PHOTO_QUOTA_CODE) {
          const admin = await isAdminUser(service, userId);
          if (admin) {
            return NextResponse.json({
              code: "admin_check_failed",
              error: userFacingIngestionMessage("admin_check_failed"),
            }, { status: 503 });
          }
          const tier = await planTier(service, userId);
          return NextResponse.json({
            error: `Bu ayki fotoğraf hakkın doldu (${photoPageLimit(tier)}). Taranmış PDF sayfaları bu hakkı kullanır.`,
            code: PHOTO_QUOTA_CODE,
          }, { status: 402 });
        }
        // Terminal — already marked failed + refunded inside the step.
        return NextResponse.json({
          error: processFailureMessage(indexed.code),
          code: indexed.code,
          retryable: false,
          action: getIngestionError(indexed.code).action,
        }, { status: 422 });
      }
      if (indexed.status === "processing") {
        return NextResponse.json({
          documentId: doc.id,
          status: "processing",
          phase: "extract",
          pageCount: indexed.pageCount,
          nextPage: indexed.nextPage,
          pagesDone: indexed.pagesDone ?? (typeof indexed.nextPage === "number" ? indexed.nextPage - 1 : null),
          failedPages: indexed.failedPages ?? [],
          ocrPages: indexed.ocrPages ?? null,
        }, { status: 202 });
      }
      if (learningV2) {
        return NextResponse.json({
          documentId: doc.id, status: "processing", phase: "map",
          pageCount: indexed.pageCount,
          pagesDone: indexed.pageCount,
          failedPages: indexed.failedPages ?? [],
        }, { status: 202 });
      }
      await commitDocumentCredits(service, userId, doc.id);
      await service.from("documents").update({ status: "completed", error_message: null }).eq("id", doc.id);
      await service.from("processing_jobs").update({ status: "completed", progress: 100 }).eq("document_id", doc.id);
      return NextResponse.json({
        documentId: doc.id,
        status: "completed",
        pageCount: indexed.pageCount,
        failedPages: indexed.failedPages ?? [],
      });
    }
    if (!learningV2) {
      await commitDocumentCredits(service, userId, doc.id);
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
    // Ensure failed status can re-enter map.
    if (doc.status === "failed") {
      await service.from("documents")
        .update({ status: "processing", error_message: null })
        .eq("id", doc.id)
        .eq("user_id", userId);
    }
    const mapped = await runPdfLearningV2(service, doc.id, {
      examLabel: parsed.data.examType ?? null,
      examDate: parsed.data.examDate ?? null,
    });
    if ((mapped as { pending?: boolean }).pending) {
      return NextResponse.json({
        documentId: doc.id,
        status: "processing",
        phase: "map",
        pageCount: typeof doc.page_count === "number" ? doc.page_count : null,
        windowsDone: (mapped as { windowsDone?: number }).windowsDone ?? null,
        windowsTotal: (mapped as { windowsTotal?: number }).windowsTotal ?? null,
        stage: (mapped as { stage?: string }).stage ?? null,
        leaseBusy: (mapped as { leaseBusy?: boolean }).leaseBusy === true,
      }, { status: 202 });
    }
    if (!mapped.ok) {
      const code = mapped.error || "topic_map_failed";
      if (isRetryableIngestionCode(code) || mapped.retryable) {
        return NextResponse.json({
          code,
          retryable: true,
          retryAfterMs: 2_000,
          error: userFacingIngestionMessage(code),
          phase: "map",
        }, { status: 503 });
      }
      await markDocumentFailed(service, doc.id, userId, code);
      await refundDocumentCredits(service, userId, doc.id);
      return NextResponse.json({
        error: userFacingIngestionMessage(code),
        code,
        retryable: false,
        action: getIngestionError(code).action,
      }, { status: 422 });
    }
    await commitDocumentCredits(service, userId, doc.id);
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
    Non-PDF path. PDFs must not land here — stepped ingestion owns them.
  */
  if (isPdf) {
    return NextResponse.json({
      error: processFailureMessage("empty_content"),
      code: "empty_content",
    }, { status: 422 });
  }

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
      await markDocumentFailed(service, doc.id, userId, "insufficient_credits");
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

    if (isRetryableIngestionCode(result.error)) {
      return NextResponse.json({
        code: result.error,
        retryable: true,
        retryAfterMs: 2_000,
        error: userFacingIngestionMessage(result.error),
      }, { status: 503 });
    }

    await markDocumentFailed(service, doc.id, userId, result.error || "processing_failed");
    return NextResponse.json(
      {
        error: processFailureMessage(result.error),
        code: result.error,
        retryable: false,
      },
      { status: 422 },
    );
  }

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

  await commitCredits(service, reservation.reservationId);

  return NextResponse.json({
    documentId: doc.id,
    status: "completed",
    chunks: result.chunks,
    creditsUsed: reservation.cost,
    notice: result.notice ?? null,
    topicMap: result.topicMap ?? null,
    pageCount: result.pageCount ?? null,
  });
}

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
    case "scan_render_failed":
      return userFacingIngestionMessage("scan_render_failed");
    case "text_extraction_unsupported":
    case "empty_content":
      return "Bu dosyadan metin çıkarılamadı. Metin katmanı olan bir PDF veya TXT deneyin.";
    default:
      return userMessageForProcessError(error);
  }
}
