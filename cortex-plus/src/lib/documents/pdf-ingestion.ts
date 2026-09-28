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
export const PDF_PAGES_PER_STEP = 40;
/** Soft wall-clock budget for one Vercel invocation (leave margin under 300s). */
export const PDF_STEP_DEADLINE_MS = 250_000;
/**
 * Parallel OCR pages per wave — claim/retry/blocked stay per-page.
 * Raised for Astra-parity speed (211-page scan target ≈4 min).
 */
export const OCR_PAGE_CONCURRENCY = 24;
/** How long one process/route invocation may chain extract steps. */
export const PDF_CHAIN_BUDGET_MS = 250_000;
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

export type PagePersist = {
  text: string;
  extractionOk: boolean;
  extractionMethod: "text_layer" | "ocr" | "none";
  /** Always set — PostgREST bulk upsert nulls missing keys. */
  pageKind: "content" | "blank" | "unreadable";
};

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

/** Contiguous prefix of finished pages — unfinished slots must not advance nextPage. */
export function contiguousDonePrefix(done: boolean[]): number {
  let length = 0;
  while (length < done.length && done[length]) length += 1;
  return length;
}

/**
 * Rows for document_pages upsert. Every row includes page_kind so PostgREST
 * never inserts NULL when a mixed batch has optional keys on only some rows.
 */
export function buildDocumentPageRows(
  documentId: string,
  firstPage: number,
  pages: PagePersist[],
): Record<string, unknown>[] {
  return pages.map((page, index) => ({
    document_id: documentId,
    page_number: firstPage + index,
    text_content: page.text,
    extraction_ok: page.extractionOk,
    extraction_method: page.extractionMethod,
    char_count: page.text.length,
    page_kind: page.pageKind ?? "content",
  }));
}

async function ocrOneBlankPage(input: {
  service: SupabaseClient;
  documentId: string;
  userId: string;
  pageNumber: number;
  png: Buffer;
  inkRatio: number;
  founder: boolean;
  limit: number;
  deadlineMs: number;
  maxOcrPages?: number | null;
  /** Fired as soon as claim_document_ocr_page returns true — before OCR. */
  onClaimed?: (pageNumber: number) => void;
  /** Fired after release_document_ocr_page so the pool does not double-release. */
  onReleased?: (pageNumber: number) => void;
}): Promise<{
  page: PagePersist;
  claimed: boolean;
  ocrSuccess: boolean;
  failed: boolean;
  tokensIn: number;
  tokensOut: number;
}> {
  const {
    service, documentId, userId, pageNumber, png, inkRatio,
    founder, limit, deadlineMs, maxOcrPages, onClaimed, onReleased,
  } = input;

  if (typeof maxOcrPages === "number" && maxOcrPages >= 0) {
    const { count } = await service.from("document_ocr_claims")
      .select("page_number", { count: "exact", head: true })
      .eq("document_id", documentId);
    if ((count ?? 0) >= maxOcrPages) {
      return {
        page: {
          text: "",
          extractionOk: false,
          extractionMethod: "ocr",
          pageKind: "unreadable",
        },
        claimed: false,
        ocrSuccess: false,
        failed: true,
        tokensIn: 0,
        tokensOut: 0,
      };
    }
  }

  let claimed = false;
  if (!founder) {
    const { data, error } = await service.rpc("claim_document_ocr_page", {
      p_document_id: documentId, p_user_id: userId,
      p_page_number: pageNumber, p_limit: limit,
    });
    if (error) throw new Error("photo_quota_unavailable");
    if (data !== true) throw new Error("photo_quota_exhausted");
    claimed = true;
    onClaimed?.(pageNumber);
  }

  const releaseClaim = async () => {
    if (!claimed) return;
    await service.rpc("release_document_ocr_page", {
      p_document_id: documentId, p_user_id: userId, p_page_number: pageNumber,
    });
    claimed = false;
    onReleased?.(pageNumber);
  };

  let read = await extractImageText(png, "image/png", { deadlineMs });
  if (!read.ok && read.reason === "unreadable" && Date.now() + 20_000 < deadlineMs) {
    read = await extractImageText(png, "image/png", { deadlineMs });
  }

  if (read.reason === "blocked") {
    await releaseClaim();
    return {
      page: {
        text: "",
        extractionOk: false,
        extractionMethod: "ocr",
        pageKind: "unreadable",
      },
      claimed: false,
      ocrSuccess: false,
      failed: true,
      tokensIn: read.tokensIn,
      tokensOut: read.tokensOut,
    };
  }

  const text = read.ok && read.pages[0] ? read.pages[0].trim() : "";
  if (text) {
    return {
      page: { text, extractionOk: true, extractionMethod: "ocr", pageKind: "content" },
      claimed,
      ocrSuccess: true,
      failed: false,
      tokensIn: read.tokensIn,
      tokensOut: read.tokensOut,
    };
  }

  const blank = inkRatio < BLANK_INK_RATIO;
  await releaseClaim();
  return {
    page: {
      text: "",
      extractionOk: blank,
      extractionMethod: blank ? "none" : "ocr",
      pageKind: blank ? "blank" : "unreadable",
    },
    claimed: false,
    ocrSuccess: false,
    failed: !blank,
    tokensIn: read.tokensIn,
    tokensOut: read.tokensOut,
  };
}

/**
 * Read one PDF window. On deadline, returns only the contiguous finished
 * prefix so nextPage never skips unprocessed pages.
 */
export async function readPdfBatch(
  service: SupabaseClient,
  buffer: Buffer,
  documentId: string,
  userId: string,
  firstPage: number,
  pageBudget: number,
  deadlineMs: number,
  maxOcrPages?: number | null,
  ocrConcurrency = OCR_PAGE_CONCURRENCY,
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
    pageKind: text.trim() ? "content" as const : "unreadable" as const,
  }));
  const done = pages.map((page) => Boolean(page.text.trim()));
  const failedPages: number[] = [];
  const ocrPageNumbers: number[] = [];

  const blankIndexes = pages.flatMap((page, index) => page.text.trim() ? [] : [index]);
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
  /** Pages with an open OCR claim; recorded immediately on successful claim. */
  const claimed = new Set<number>();

  try {
    const rendered = await renderPdfPages(buffer, pages.length, firstPage);
    if (rendered.pages.length !== pages.length) throw new Error("scan_unreadable");

    // Classify without OCR first — blank / render-failed are done immediately.
    const needsOcr: number[] = [];
    for (const index of blankIndexes) {
      const meta = rendered.pages[index]!;
      const number = firstPage + index;
      if (meta.inkRatio < BLANK_INK_RATIO && !meta.hasImageContent) {
        pages[index] = {
          text: "",
          extractionOk: true,
          extractionMethod: "none",
          pageKind: "blank",
        };
        done[index] = true;
        continue;
      }
      if (meta.scanRenderFailed) {
        pages[index] = {
          text: "",
          extractionOk: false,
          extractionMethod: "ocr",
          pageKind: "unreadable",
        };
        done[index] = true;
        failedPages.push(number);
        continue;
      }
      needsOcr.push(index);
    }

    // Bounded pool: up to OCR_PAGE_CONCURRENCY pages in flight. Honour the
    // deadline before each start so a near-budget step returns a contiguous prefix.
    let cursor = 0;
    let poolError: unknown = null;
    const inFlight = new Map<number, Promise<void>>();
    const startOne = (index: number) => {
      const meta = rendered.pages[index]!;
      const number = firstPage + index;
      const work = (async () => {
        const result = await ocrOneBlankPage({
          service, documentId, userId, pageNumber: number,
          png: meta.png, inkRatio: meta.inkRatio,
          founder, limit, deadlineMs, maxOcrPages,
          onClaimed: (pageNumber) => { claimed.add(pageNumber); },
          onReleased: (pageNumber) => { claimed.delete(pageNumber); },
        });
        pages[index] = result.page;
        done[index] = true;
        if (result.ocrSuccess) ocrPageNumbers.push(number);
        if (result.failed) failedPages.push(number);
        if (result.tokensIn || result.tokensOut) {
          await recordUsage(service, {
            userId, actionCode: "DOCUMENT_PAGE_PROCESS",
            model: env.OPENAI_STANDARD_MODEL,
            tokensIn: result.tokensIn, tokensOut: result.tokensOut,
          });
        }
      })();
      inFlight.set(index, work);
      work
        .catch((error) => {
          poolError = poolError ?? error;
        })
        .finally(() => {
          inFlight.delete(index);
        });
    };

    const concurrency = Math.max(1, Math.min(OCR_PAGE_CONCURRENCY, ocrConcurrency));
    while (cursor < needsOcr.length || inFlight.size) {
      while (
        !poolError &&
        inFlight.size < concurrency &&
        cursor < needsOcr.length &&
        Date.now() < deadlineMs - 5_000
      ) {
        startOne(needsOcr[cursor]!);
        cursor += 1;
      }
      if (poolError) {
        await Promise.allSettled([...inFlight.values()]);
        break;
      }
      if (!inFlight.size) break;
      await Promise.race(inFlight.values()).catch(() => undefined);
    }
    if (inFlight.size) await Promise.allSettled([...inFlight.values()]);
    if (poolError) throw poolError;
  } catch (error) {
    if (!founder) {
      // Batch is abandoning — release every held claim (text was not saved).
      for (const number of [...claimed]) {
        await service.rpc("release_document_ocr_page", {
          p_document_id: documentId, p_user_id: userId, p_page_number: number,
        });
        claimed.delete(number);
      }
    }
    throw error;
  }

  const prefixLen = contiguousDonePrefix(done);
  return {
    pages: pages.slice(0, prefixLen),
    total: extracted.total,
    ocrPageNumbers: ocrPageNumbers.filter((n) => n < firstPage + prefixLen),
    failedPages: failedPages.filter((n) => n < firstPage + prefixLen),
  };
}

export async function saveBatch(
  service: SupabaseClient,
  documentId: string,
  firstPage: number,
  pages: PagePersist[],
) {
  if (pages.some((page) => page.text.length > 200_000)) throw new Error("page_text_too_large");
  const rows = buildDocumentPageRows(documentId, firstPage, pages);
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
  if (remaining < 45_000) return 8;
  if (remaining < 90_000) return 16;
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

    // Deadline with zero finished pages — retryable, do not advance cursor.
    if (!read.pages.length) {
      await updateLease(service, documentId, lease.token, {
        lease_token: null,
        lease_until: null,
      });
      return {
        status: "processing",
        pageCount: read.total,
        nextPage: firstPage,
        pagesDone: firstPage - 1,
        failedPages: [],
        ocrPages: 0,
      };
    }

    if (!lease.initialized) {
      const { error: clearError } = await service.from("document_pages")
        .delete().eq("document_id", documentId);
      if (clearError) throw new Error("cleanup_failed");
      await service.from("document_topic_nodes").delete().eq("document_id", documentId);
      await service.from("document_coverage_reports").delete().eq("document_id", documentId);
      await service.from("documents").update({
        topic_map_status: "none", topic_map_error: null, topic_map_updated_at: null,
        updated_at: new Date().toISOString(),
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
      if (countError) throw new Error("empty_content");
      if (!count) {
        const anyOk = read.pages.some((page) => page.extractionOk && page.text.trim());
        if (!anyOk) throw new Error("empty_content");
      }
    }

    const nowIso = new Date().toISOString();
    const { error: documentError } = await service.from("documents")
      .update({
        status: "processing",
        page_count: read.total,
        error_message: null,
        updated_at: nowIso,
      })
      .eq("id", documentId).eq("user_id", userId);
    if (documentError) throw new Error("completion_update_failed");
    await service.from("processing_jobs").update({
      status: "processing",
      progress: Math.min(complete ? 40 : 39, Math.floor((nextPage - 1) / read.total * 40)),
      error_message: null,
    }).eq("document_id", documentId);

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
    await service.from("documents").update({
      status: "failed",
      error_message: code,
      updated_at: new Date().toISOString(),
    }).eq("id", documentId).eq("user_id", userId);
    await service.from("processing_jobs").update({ status: "failed", error_message: code })
      .eq("document_id", documentId);
    return { status: "failed", code, retryable: false };
  }
}
