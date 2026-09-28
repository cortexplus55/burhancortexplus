import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractText } from "@/lib/documents/extract-text";
import { renderPdfPages, BLANK_INK_RATIO } from "@/lib/documents/render-pdf-pages";
import { extractImageText } from "@/lib/documents/extract-image-text";
import { photoPageLimit, planTier } from "@/lib/documents/photo-quota";
import { isAdminUser, AdminCheckError } from "@/lib/auth/roles";
import { reserveCredits, refundCredits, recordUsage } from "@/lib/credits/service";
import { chunkText, embedTexts } from "@/lib/rag/pipeline";
import { env } from "@/lib/env";
import { logOpsEvent } from "@/lib/observability/ops-log";
import { isRetryableIngestionCode } from "@/lib/documents/ingestion-errors";

/** Default pages per step; shrinks when the deadline is near. */
export const PDF_PAGES_PER_STEP = 6;
/** Soft wall-clock budget for one Vercel invocation (leave margin under 300s). */
export const PDF_STEP_DEADLINE_MS = 200_000;
const EMBED_BATCH = 24;
const LEASE_RENEW_MS = 240_000;

type Lease = {
  state: "claimed" | "ready" | "busy" | "missing";
  token?: string;
  nextPage?: number;
  totalPages?: number | null;
  initialized?: boolean;
  reservationId?: string | null;
};

export type PdfIngestionResult =
  | {
      status: "processing";
      pageCount: number | null;
      nextPage: number | null;
      pagesDone?: number;
      failedPages?: number[];
      ocrPages?: number;
      retryable?: boolean;
      code?: string;
    }
  | { status: "ready"; pageCount: number; failedPages?: number[] }
  | { status: "failed"; code: string; retryable?: boolean };

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

async function renewLease(
  service: SupabaseClient,
  documentId: string,
  token: string,
) {
  const until = new Date(Date.now() + LEASE_RENEW_MS).toISOString();
  await updateLease(service, documentId, token, { lease_until: until });
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

type PagePersist = {
  text: string;
  extractionOk: boolean;
  extractionMethod: "text_layer" | "ocr" | "none";
  pageKind?: "blank" | "unreadable" | null;
};

async function readPdfBatch(
  service: SupabaseClient,
  buffer: Buffer,
  documentId: string,
  userId: string,
  firstPage: number,
  pageBudget: number,
  deadlineMs: number,
  maxOcrPages?: number | null,
): Promise<{
  pages: PagePersist[];
  total: number;
  ocrPageNumbers: number[];
  failedPages: number[];
}> {
  const extracted = await extractText(buffer, "application/pdf", firstPage, pageBudget);
  if (extracted.total <= 0 || !extracted.pages.length) throw new Error("empty_content");

  const pages: PagePersist[] = extracted.pages.map((text) => ({
    text,
    extractionOk: Boolean(text.trim()),
    extractionMethod: text.trim() ? "text_layer" as const : "none" as const,
  }));
  const blankIndexes = pages.flatMap((page, index) => page.text.trim() ? [] : [index]);
  const failedPages: number[] = [];
  const ocrPageNumbers: number[] = [];

  if (!blankIndexes.length) {
    return { pages, total: extracted.total, ocrPageNumbers, failedPages };
  }

  let founder = false;
  try {
    founder = await isAdminUser(service, userId);
  } catch (error) {
    if (error instanceof AdminCheckError) throw new Error("admin_check_failed");
    throw error;
  }
  const limit = founder ? 0 : photoPageLimit(await planTier(service, userId));
  const claimed: number[] = [];

  try {
    const rendered = await renderPdfPages(buffer, pages.length, firstPage);
    if (rendered.pages.length !== pages.length) throw new Error("scan_unreadable");

    for (const index of blankIndexes) {
      if (Date.now() >= deadlineMs - 5_000) break;

      const number = firstPage + index;
      const meta = rendered.pages[index]!;

      // Truly blank back side — not a failure.
      if (meta.inkRatio < BLANK_INK_RATIO && !meta.hasImageContent) {
        pages[index] = {
          text: "",
          extractionOk: true,
          extractionMethod: "none",
          pageKind: "blank",
        };
        continue;
      }

      if (meta.scanRenderFailed) {
        pages[index] = {
          text: "",
          extractionOk: false,
          extractionMethod: "ocr",
          pageKind: "unreadable",
        };
        failedPages.push(number);
        continue;
      }

      if (typeof maxOcrPages === "number" && maxOcrPages >= 0) {
        const { count } = await service.from("document_ocr_claims")
          .select("page_number", { count: "exact", head: true })
          .eq("document_id", documentId);
        if ((count ?? 0) >= maxOcrPages) {
          pages[index] = {
            text: "",
            extractionOk: false,
            extractionMethod: "ocr",
            pageKind: "unreadable",
          };
          failedPages.push(number);
          continue;
        }
      }

      if (!founder) {
        const { data, error } = await service.rpc("claim_document_ocr_page", {
          p_document_id: documentId, p_user_id: userId,
          p_page_number: number, p_limit: limit,
        });
        if (error) throw new Error("photo_quota_unavailable");
        if (data !== true) throw new Error("photo_quota_exhausted");
        claimed.push(number);
      }

      let read = await extractImageText(meta.png, "image/png", { deadlineMs });
      // One in-step retry for transient OCR empties when budget allows.
      if (!read.ok && read.reason === "unreadable" && Date.now() + 20_000 < deadlineMs) {
        read = await extractImageText(meta.png, "image/png", { deadlineMs });
      }

      if (read.tokensIn || read.tokensOut) {
        await recordUsage(service, {
          userId, actionCode: "DOCUMENT_PAGE_PROCESS",
          model: env.OPENAI_STANDARD_MODEL,
          tokensIn: read.tokensIn, tokensOut: read.tokensOut,
        });
      }

      if (read.reason === "blocked") {
        // Page-scoped: mark and continue (do not kill the whole book).
        pages[index] = {
          text: "",
          extractionOk: false,
          extractionMethod: "ocr",
          pageKind: "unreadable",
        };
        failedPages.push(number);
        if (!founder) {
          await service.rpc("release_document_ocr_page", {
            p_document_id: documentId, p_user_id: userId, p_page_number: number,
          });
          claimed.splice(claimed.indexOf(number), 1);
        }
        continue;
      }

      const text = read.ok && read.pages[0] ? read.pages[0].trim() : "";
      if (text) {
        pages[index] = { text, extractionOk: true, extractionMethod: "ocr" };
        ocrPageNumbers.push(number);
      } else {
        pages[index] = {
          text: "",
          extractionOk: false,
          extractionMethod: "ocr",
          pageKind: meta.inkRatio < BLANK_INK_RATIO ? "blank" : "unreadable",
        };
        if (meta.inkRatio >= BLANK_INK_RATIO) failedPages.push(number);
        if (!founder) {
          await service.rpc("release_document_ocr_page", {
            p_document_id: documentId, p_user_id: userId, p_page_number: number,
          });
          claimed.splice(claimed.indexOf(number), 1);
        }
      }
    }
  } catch (error) {
    if (!founder) {
      for (const number of claimed) {
        await service.rpc("release_document_ocr_page", {
          p_document_id: documentId, p_user_id: userId, p_page_number: number,
        });
      }
    }
    throw error;
  }

  return { pages, total: extracted.total, ocrPageNumbers, failedPages };
}

async function saveBatch(
  service: SupabaseClient,
  documentId: string,
  firstPage: number,
  pages: PagePersist[],
) {
  if (pages.some((page) => page.text.length > 200_000)) throw new Error("page_text_too_large");
  const rows = pages.map((page, index) => ({
    document_id: documentId,
    page_number: firstPage + index,
    text_content: page.text,
    extraction_ok: page.extractionOk,
    extraction_method: page.extractionMethod,
    char_count: page.text.length,
    ...(page.pageKind ? { page_kind: page.pageKind } : {}),
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
  const chunks = pages.flatMap((page, offset) => {
    if (!page.text.trim() || !page.extractionOk) return [];
    return chunkText(page.text).map((content, index) => ({
      document_id: documentId,
      page_id: pageIdByNumber.get(firstPage + offset)!,
      chunk_index: (firstPage + offset) * 10_000 + index,
      content,
      token_count: Math.ceil(content.length / 4),
    }));
  });
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

function adaptivePageBudget(deadlineMs: number): number {
  const remaining = deadlineMs - Date.now();
  if (remaining < 45_000) return 2;
  if (remaining < 90_000) return 4;
  return PDF_PAGES_PER_STEP;
}

/** One idempotent PDF page range. Route/client repeat until ready. */
export async function processPdfDocumentStep(
  service: SupabaseClient,
  documentId: string,
  userId: string,
  options?: { deadlineMs?: number; maxOcrPages?: number | null },
): Promise<PdfIngestionResult> {
  const deadlineMs = options?.deadlineMs ?? Date.now() + PDF_STEP_DEADLINE_MS;
  const { data: rawLease, error: claimError } = await service.rpc("claim_document_ingestion", {
    p_document_id: documentId, p_user_id: userId,
  });
  if (claimError) return { status: "failed", code: "ingestion_state_unavailable", retryable: true };
  const lease = rawLease as Lease;
  if (lease.state === "missing") return { status: "failed", code: "not_found" };
  if (lease.state === "ready") return { status: "ready", pageCount: lease.totalPages ?? 0 };
  if (lease.state === "busy") return {
    status: "processing", pageCount: lease.totalPages ?? null, nextPage: lease.nextPage ?? null,
  };
  if (lease.state !== "claimed" || !lease.token) {
    return { status: "failed", code: "ingestion_state_unavailable", retryable: true };
  }

  let reservationId: string | null = lease.reservationId ?? null;
  let ocrPageNumbers: number[] = [];
  try {
    reservationId = await ensureReservation(service, userId, documentId, lease);
    await renewLease(service, documentId, lease.token);

    const { data: doc, error: docError } = await service.from("documents")
      .select("storage_path")
      .eq("id", documentId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
    if (docError || !doc) throw new Error("not_found");
    const { data: file, error: downloadError } = await service.storage.from("documents")
      .download(doc.storage_path);
    if (downloadError || !file) throw new Error("download_failed");
    const buffer = Buffer.from(await file.arrayBuffer());
    const firstPage = lease.nextPage ?? 1;
    const pageBudget = adaptivePageBudget(deadlineMs);
    const read = await readPdfBatch(
      service, buffer, documentId, userId, firstPage, pageBudget, deadlineMs, options?.maxOcrPages,
    );
    ocrPageNumbers = read.ocrPageNumbers;

    if (!lease.initialized) {
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
      // Allow completion with partial OCR if at least some pages were readable.
      if (countError) throw new Error("empty_content");
      if (!count) {
        const anyOk = read.pages.some((page) => page.extractionOk && page.text.trim());
        if (!anyOk) throw new Error("empty_content");
      }
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

    // Credits commit only when the document reaches completed (route).
    await updateLease(service, documentId, lease.token, {
      next_page: nextPage,
      total_pages: read.total,
      status: complete ? "ready" : "extracting",
      lease_token: null,
      lease_until: null,
    });

    if (complete) {
      return { status: "ready", pageCount: read.total, failedPages: read.failedPages };
    }
    return {
      status: "processing",
      pageCount: read.total,
      nextPage,
      pagesDone: nextPage - 1,
      failedPages: read.failedPages,
      ocrPages: ocrPageNumbers.length,
    };
  } catch (error) {
    const code = error instanceof Error ? error.message : "processing_failed";
    const retryable = isRetryableIngestionCode(code);
    logOpsEvent("document_parse_failed", { documentId, code });

    const { data: released } = await service.from("document_ingestion_state").update({
      lease_token: null, lease_until: null,
      // Keep reservation_id on retryable errors so the same key survives.
      ...(retryable ? {} : { reservation_id: null }),
    }).eq("document_id", documentId).eq("lease_token", lease.token)
      .select("document_id").maybeSingle();

    if (!released) {
      return {
        status: "processing", pageCount: lease.totalPages ?? null,
        nextPage: lease.nextPage ?? null,
      };
    }

    if (retryable) {
      return {
        status: "failed",
        code,
        retryable: true,
      };
    }

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
    return { status: "failed", code, retryable: false };
  }
}
