import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractText } from "@/lib/documents/extract-text";
import { renderPdfPages } from "@/lib/documents/render-pdf-pages";
import { extractImagePages } from "@/lib/documents/extract-image-text";
import { photoPageLimit, planTier } from "@/lib/documents/photo-quota";
import { isAdminUser } from "@/lib/auth/roles";
import { reserveCredits, commitCredits, refundCredits, recordUsage } from "@/lib/credits/service";
import { chunkText, embedTexts } from "@/lib/rag/pipeline";
import { env } from "@/lib/env";
import { logOpsEvent } from "@/lib/observability/ops-log";

/** Small enough for OCR, embeddings and database writes in one Vercel call. */
export const PDF_PAGES_PER_STEP = 6;
const EMBED_BATCH = 24;

type Lease = {
  state: "claimed" | "ready" | "busy" | "missing";
  token?: string;
  nextPage?: number;
  totalPages?: number | null;
  initialized?: boolean;
  reservationId?: string | null;
};

export type PdfIngestionResult =
  | { status: "processing"; pageCount: number | null; nextPage: number | null }
  | { status: "ready"; pageCount: number }
  | { status: "failed"; code: string };

async function updateLease(
  service: SupabaseClient,
  documentId: string,
  token: string,
  values: Record<string, unknown>,
) {
  const { data, error } = await service.from("document_ingestion_state")
    .update({ ...values, updated_at: new Date().toISOString() })
    .eq("document_id", documentId).eq("lease_token", token)
    .select("document_id").maybeSingle();
  if (error || !data) throw new Error("ingestion_lease_lost");
}

async function assertLease(service: SupabaseClient, documentId: string, token: string) {
  const { data, error } = await service.from("document_ingestion_state")
    .select("lease_token,lease_until")
    .eq("document_id", documentId).maybeSingle();
  if (error || data?.lease_token !== token || !data.lease_until ||
      new Date(data.lease_until).getTime() <= Date.now()) {
    throw new Error("ingestion_lease_lost");
  }
}

async function ensureReservation(
  service: SupabaseClient, userId: string, documentId: string, lease: Lease,
): Promise<string> {
  if (lease.reservationId) return lease.reservationId;
  const key = `document_process_${documentId}`;
  const reservation = await reserveCredits(service, userId, "DOCUMENT_PAGE_PROCESS", key);
  let id: string | null = reservation.ok ? reservation.reservationId : null;
  // A process may have stopped after reserving but before persisting the id.
  if (!reservation.ok && (reservation.reason === "operation_in_progress" ||
      reservation.reason === "operation_completed")) {
    const { data } = await service.from("credit_reservations")
      .select("id")
      .eq("user_id", userId).eq("idempotency_key", key)
      .in("status", ["pending", "committed"])
      .maybeSingle();
    id = data?.id ?? null;
  }
  if (!id) throw new Error(reservation.ok ? "credit_unavailable" : reservation.reason);
  await updateLease(service, documentId, lease.token!, { reservation_id: id });
  return id;
}

async function readPdfBatch(
  service: SupabaseClient,
  buffer: Buffer,
  documentId: string,
  userId: string,
  firstPage: number,
) {
  const extracted = await extractText(buffer, "application/pdf", firstPage, PDF_PAGES_PER_STEP);
  if (extracted.total <= 0 || !extracted.pages.length) throw new Error("empty_content");
  const pages = [...extracted.pages];
  const blankIndexes = pages.flatMap((page, index) => page.trim() ? [] : [index]);
  if (blankIndexes.length) {
    const founder = await isAdminUser(service, userId);
    const limit = founder ? 0 : photoPageLimit(await planTier(service, userId));
    const claimed: number[] = [];
    try {
      for (const index of blankIndexes) {
        const number = firstPage + index;
        if (!founder) {
          const { data, error } = await service.rpc("claim_document_ocr_page", {
            p_document_id: documentId, p_user_id: userId,
            p_page_number: number, p_limit: limit,
          });
          if (error) throw new Error("photo_quota_unavailable");
          if (data !== true) throw new Error("photo_quota_exhausted");
        }
        claimed.push(number);
      }
      const rendered = await renderPdfPages(buffer, pages.length, firstPage);
      if (rendered.pages.length !== pages.length) throw new Error("scan_unreadable");
      const read = await extractImagePages(blankIndexes.map((index) => rendered.pages[index]));
      if (read.blocked) throw new Error("image_blocked");
      if (read.tokensIn || read.tokensOut) {
        await recordUsage(service, {
          userId, actionCode: "DOCUMENT_PAGE_PROCESS",
          model: env.OPENAI_STANDARD_MODEL,
          tokensIn: read.tokensIn, tokensOut: read.tokensOut,
        });
      }
      for (const [offset, index] of blankIndexes.entries()) {
        const text = read.pages[offset]?.trim() ?? "";
        pages[index] = text;
        if (!text && !founder) {
          await service.rpc("release_document_ocr_page", {
            p_document_id: documentId, p_user_id: userId,
            p_page_number: firstPage + index,
          });
          claimed.splice(claimed.indexOf(firstPage + index), 1);
        }
      }
    } catch (error) {
      // The current batch was not checkpointed. A retry may repeat OCR, but
      // photo allowance is restored and previous durable pages remain intact.
      if (!founder) {
        for (const number of claimed) {
          await service.rpc("release_document_ocr_page", {
            p_document_id: documentId, p_user_id: userId, p_page_number: number,
          });
        }
      }
      throw error;
    }
  }
  return { pages, total: extracted.total, ocrPageNumbers: blankIndexes
    .filter((index) => Boolean(pages[index].trim()))
    .map((index) => firstPage + index) };
}

async function saveBatch(
  service: SupabaseClient,
  documentId: string,
  firstPage: number,
  pages: string[],
) {
  if (pages.some((text) => text.length > 200_000)) throw new Error("page_text_too_large");
  const rows = pages.map((text, index) => ({
    document_id: documentId,
    page_number: firstPage + index,
    text_content: text,
  }));
  const { data: pageRows, error: pageError } = await service.from("document_pages")
    .upsert(rows, { onConflict: "document_id,page_number" })
    .select("id,page_number");
  if (pageError || !pageRows || pageRows.length !== pages.length) throw new Error("page_insert_failed");
  const ids = pageRows.map((row) => row.id as string);
  const { error: cleanupError } = await service.from("document_chunks")
    .delete().eq("document_id", documentId).in("page_id", ids);
  if (cleanupError) throw new Error("cleanup_failed");
  const pageIdByNumber = new Map(pageRows.map((row) => [Number(row.page_number), String(row.id)]));
  const chunks = pages.flatMap((text, offset) => chunkText(text).map((content, index) => ({
    document_id: documentId,
    page_id: pageIdByNumber.get(firstPage + offset)!,
    chunk_index: (firstPage + offset) * 10_000 + index,
    content,
    token_count: Math.ceil(content.length / 4),
  })));
  for (let offset = 0; offset < chunks.length; offset += EMBED_BATCH) {
    const batch = chunks.slice(offset, offset + EMBED_BATCH);
    const vectors = await embedTexts(batch.map((chunk) => chunk.content));
    const { data: inserted, error: chunkError } = await service.from("document_chunks")
      .insert(batch).select("id,chunk_index");
    if (chunkError || !inserted || inserted.length !== batch.length) throw new Error("chunk_insert_failed");
    const idByIndex = new Map(inserted.map((row) => [Number(row.chunk_index), String(row.id)]));
    const { error: embeddingError } = await service.from("document_embeddings")
      .insert(batch.map((chunk, index) => ({
        chunk_id: idByIndex.get(chunk.chunk_index)!,
        embedding: vectors[index] as unknown as string,
      })));
    if (embeddingError) throw new Error("embedding_insert_failed");
  }
  return chunks.length;
}

/** One idempotent PDF page range. Route/client repeat until ready. */
export async function processPdfDocumentStep(
  service: SupabaseClient,
  documentId: string,
  userId: string,
): Promise<PdfIngestionResult> {
  const { data: rawLease, error: claimError } = await service.rpc("claim_document_ingestion", {
    p_document_id: documentId, p_user_id: userId,
  });
  if (claimError) return { status: "failed", code: "ingestion_state_unavailable" };
  const lease = rawLease as Lease;
  if (lease.state === "missing") return { status: "failed", code: "not_found" };
  if (lease.state === "ready") return { status: "ready", pageCount: lease.totalPages ?? 0 };
  if (lease.state === "busy") return {
    status: "processing", pageCount: lease.totalPages ?? null, nextPage: lease.nextPage ?? null,
  };
  if (lease.state !== "claimed" || !lease.token) return { status: "failed", code: "ingestion_state_unavailable" };

  let reservationId: string | null = lease.reservationId ?? null;
  let ocrPageNumbers: number[] = [];
  try {
    reservationId = await ensureReservation(service, userId, documentId, lease);
    const { data: doc, error: docError } = await service.from("documents")
      .select("storage_path")
      .eq("id", documentId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
    if (docError || !doc) throw new Error("not_found");
    const { data: file, error: downloadError } = await service.storage.from("documents")
      .download(doc.storage_path);
    if (downloadError || !file) throw new Error("download_failed");
    const buffer = Buffer.from(await file.arrayBuffer());
    const firstPage = lease.nextPage ?? 1;
    const read = await readPdfBatch(service, buffer, documentId, userId, firstPage);
    ocrPageNumbers = read.ocrPageNumbers;

    if (!lease.initialized) {
      // Legacy interrupted attempts may have only some chunks. Clear once,
      // before the first durable checkpoint, then never clear earlier batches.
      const { error: clearError } = await service.from("document_pages")
        .delete().eq("document_id", documentId);
      if (clearError) throw new Error("cleanup_failed");
      await service.from("document_topic_nodes").delete().eq("document_id", documentId);
      await service.from("document_coverage_reports").delete().eq("document_id", documentId);
      await service.from("documents").update({
        topic_map_status: "none", topic_map_error: null, topic_map_updated_at: null,
      }).eq("id", documentId).eq("user_id", userId);
      await updateLease(service, documentId, lease.token, { initialized: true, total_pages: read.total });
    }

    await assertLease(service, documentId, lease.token);
    await saveBatch(service, documentId, firstPage, read.pages);
    const nextPage = firstPage + read.pages.length;
    const complete = nextPage > read.total;
    if (complete) {
      const { count, error: countError } = await service.from("document_chunks")
        .select("id", { count: "exact", head: true }).eq("document_id", documentId);
      if (countError || !count) throw new Error("empty_content");
    }
    const { error: documentError } = await service.from("documents")
      .update({ status: "processing", page_count: read.total, error_message: null })
      .eq("id", documentId).eq("user_id", userId);
    if (documentError) throw new Error("completion_update_failed");
    await service.from("processing_jobs").update({
      status: "processing",
      progress: Math.min(complete ? 40 : 39, Math.floor((nextPage - 1) / read.total * 40)),
      error_message: null,
    }).eq("document_id", documentId);
    if (complete) {
      await commitCredits(service, reservationId);
    }
    await updateLease(service, documentId, lease.token, {
      next_page: nextPage,
      total_pages: read.total,
      status: complete ? "ready" : "extracting",
      lease_token: null,
      lease_until: null,
    });
    if (complete) return { status: "ready", pageCount: read.total };
    return { status: "processing", pageCount: read.total, nextPage };
  } catch (error) {
    const code = error instanceof Error ? error.message : "processing_failed";
    logOpsEvent("document_parse_failed", { documentId, code });
    const { data: released } = await service.from("document_ingestion_state").update({
      lease_token: null, lease_until: null, reservation_id: null,
    }).eq("document_id", documentId).eq("lease_token", lease.token)
      .select("document_id").maybeSingle();
    // A newer worker owns this document. It will settle the credit and OCR
    // claims; the timed-out worker must not rewrite its status or quota.
    if (!released) return {
      status: "processing", pageCount: lease.totalPages ?? null,
      nextPage: lease.nextPage ?? null,
    };
    for (const pageNumber of ocrPageNumbers) {
      await service.rpc("release_document_ocr_page", {
        p_document_id: documentId, p_user_id: userId, p_page_number: pageNumber,
      });
    }
    if (reservationId) await refundCredits(service, reservationId).catch(() => {});
    await service.from("documents").update({ status: "failed", error_message: code })
      .eq("id", documentId).eq("user_id", userId);
    await service.from("processing_jobs").update({ status: "failed", error_message: code })
      .eq("document_id", documentId);
    return { status: "failed", code };
  }
}
