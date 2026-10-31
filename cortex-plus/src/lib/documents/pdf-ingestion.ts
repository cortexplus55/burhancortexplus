import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { extractText } from "@/lib/documents/extract-text";
import { renderPdfPages, BLANK_INK_RATIO, FIGURE_VECTOR_MIN } from "@/lib/documents/render-pdf-pages";

type RenderedPage = Awaited<ReturnType<typeof renderPdfPages>>["pages"][number];
import { appendFigureTranscript, extractImageText, mergeUsage, type ModelUsage } from "@/lib/documents/extract-image-text";
import { fastAllowedFor } from "@/lib/learning/fast-access";
import { photoPageLimit, planTier } from "@/lib/documents/photo-quota";
import { AdminCheckError } from "@/lib/auth/roles";
import { billingExempt } from "@/lib/billing/free-preview";
import { getActionCost, reserveCredits, refundCredits, recordUsage } from "@/lib/credits/service";
import { chargeNow } from "@/lib/credits/charge-now";
import { spendableCredits } from "@/lib/credits/spendable-server";
import { chunkText, embedTexts } from "@/lib/rag/pipeline";
import { logOpsEvent } from "@/lib/observability/ops-log";
import { isRetryableIngestionCode } from "@/lib/documents/ingestion-errors";
import { cappedPageTotal, freePagesRemaining } from "@/lib/documents/free-pages";
import { photoSetRenderedPages } from "@/lib/documents/photo-set-read";
import { documentReservationKey } from "@/lib/documents/document-reservation-key";

/** Default pages per step; shrinks when the deadline is near. */
export const PDF_PAGES_PER_STEP = 40;
/** Soft wall-clock budget for one Vercel invocation (leave margin under 300s). */
export const PDF_STEP_DEADLINE_MS = 250_000;
/**
 * OCR pages in flight — claim/retry/blocked stay per-page. The pool starts at
 * OCR_START_CONCURRENCY, halves on a 429 (never below OCR_MIN_CONCURRENCY)
 * and grows by one per clean page up to OCR_PAGE_CONCURRENCY. A high-detail
 * page image is ~37k input tokens for gpt-4o-mini, so the provider's TPM
 * limit, not a fixed number, decides the real speed.
 */
export const OCR_PAGE_CONCURRENCY = 24;
export const OCR_START_CONCURRENCY = 12;
export const OCR_MIN_CONCURRENCY = 4;
/**
 * The pool keeps its size across 40-page steps of the same document (the
 * route chains steps in one process), so each step does not fall back to
 * OCR_START_CONCURRENCY. A cold instance starts over at the start value.
 */
/** Metin katmanı bundan kısaysa sayfa taranmış sayılır ve okunur (boş el yazısı dahil). */
export const TEXT_LAYER_MIN_CHARS = 40;

export function textLayerNeedsOcr(text: string): boolean {
  return text.trim().length < TEXT_LAYER_MIN_CHARS;
}

/**
 * Metin katmanı dolu olsa da şeklin okunması gerekir.
 * "tablo" yalnız "yandaki/aşağıdaki tablo" gibi bir işaretle; tek başına her sayfayı çizmez.
 */
const FIGURE_WORD = /şekil|sekil|grafik|diyagram|diagram|şema|sema|harita|figure|chart|graph/iu;
const FIGURE_POINTER =
  /(?:yandaki|aşağıdaki|asagidaki).{0,48}(?:şekil|sekil|grafik|diyagram|diagram|şema|sema|harita|tablo|figure|chart)/iu;

export function pageNeedsFigureRead(text: string): boolean {
  return FIGURE_WORD.test(text) || FIGURE_POINTER.test(text);
}

const OCR_POOL_MEMORY_MS = 15 * 60_000;
const ocrPoolMemory = new Map<string, { limit: number; at: number }>();

export function rememberedOcrLimit(documentId: string, now = Date.now()): number | null {
  const hit = ocrPoolMemory.get(documentId);
  if (!hit) return null;
  if (now - hit.at > OCR_POOL_MEMORY_MS) {
    ocrPoolMemory.delete(documentId);
    return null;
  }
  return hit.limit;
}

function rememberOcrLimit(documentId: string, limit: number) {
  ocrPoolMemory.delete(documentId);
  ocrPoolMemory.set(documentId, { limit, at: Date.now() });
  while (ocrPoolMemory.size > 500) {
    const oldest = ocrPoolMemory.keys().next().value;
    if (oldest === undefined) break;
    ocrPoolMemory.delete(oldest);
  }
}

/** How long one process/route invocation may chain extract steps. */
export const PDF_CHAIN_BUDGET_MS = 250_000;
const EMBED_BATCH = 24;
const EMBED_LANES = 3;
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
      /** Başka bir istek bu belgeyi okuyor (kira dolu): zincir beklemeden döner, istemci biraz sonra yeniden sorar. */
      busy?: boolean;
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
  service: SupabaseClient, userId: string, documentId: string, lease: Lease, pages: number, firstPage = 1,
): Promise<string> {
  if (lease.reservationId) return lease.reservationId;
  // Duraklayıp kaldığı yerden süren okuma (pencereli işleme) kalan sayfalar için kendi anahtarıyla ayırır.
  const key = documentReservationKey(documentId, firstPage);
  // Sayfa başına kredi (8 Ekim 2026): işlenecek sayfa sayısı kadar.
  const reservation = await reserveCredits(service, userId, "DOCUMENT_PAGE_PROCESS", key, pages);
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
  image: Buffer;
  mime: string;
  inkRatio: number;
  founder: boolean;
  /** Hızlı işlem (31 Ekim 2026): yalnız Plus/Sigma ve kurucu (`fastAllowedFor`). */
  fast?: boolean;
  limit: number;
  deadlineMs: number;
  maxOcrPages?: number | null;
  /** Fired as soon as claim_document_ocr_page returns true — before OCR. */
  onClaimed?: (pageNumber: number) => void;
  /** Fired after release_document_ocr_page so the pool does not double-release. */
  onReleased?: (pageNumber: number) => void;
  /** Figure pages use the coordinate prompt. Blank scans stay on the transcription prompt. */
  purpose?: "page" | "figure";
  /** Text layer to keep. Figure values are appended; a miss does not wipe the page. */
  keepText?: string;
}): Promise<{
  page: PagePersist;
  claimed: boolean;
  ocrSuccess: boolean;
  failed: boolean;
  /** Resim sayfası hakkı dolduğu için okunmadı (belge düşmez, 3 Ekim 2026). */
  quotaSkipped?: boolean;
  /** Bütün okuma denemelerinin jetonları, model model (ikinci deneme dahil). */
  usage: ModelUsage[];
  rateLimited?: boolean;
}> {
  const {
    service, documentId, userId, pageNumber, image, mime, inkRatio,
    founder, limit, deadlineMs, maxOcrPages, onClaimed, onReleased,
    purpose = "page", keepText,
  } = input;
  const preserved = keepText
    ? {
        text: keepText,
        extractionOk: true,
        extractionMethod: "text_layer" as const,
        pageKind: "content" as const,
      }
    : null;

  if (typeof maxOcrPages === "number" && maxOcrPages >= 0) {
    const { count } = await service.from("document_ocr_claims")
      .select("page_number", { count: "exact", head: true })
      .eq("document_id", documentId);
    if ((count ?? 0) >= maxOcrPages) {
      // Tavan (kredi ya da istek) doldu: bu resim sayfası okunmadan atlanır.
      return {
        page: preserved ?? {
          text: "",
          extractionOk: false,
          extractionMethod: "ocr",
          pageKind: "unreadable",
        },
        claimed: false,
        ocrSuccess: false,
        failed: !preserved,
        quotaSkipped: true,
        usage: [],
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
    if (data !== true) {
      // Eskiden belgenin tamamı reddediliyordu (27 Eylül 2026: ücretsiz
      // hesabın KPSS PDF'i birkaç resim sayfası yüzünden düştü). Artık
      // yalnız bu sayfa okunmuyor; metinli sayfalar işleniyor.
      return {
        page: preserved ?? { text: "", extractionOk: false, extractionMethod: "ocr", pageKind: "unreadable" },
        claimed: false,
        ocrSuccess: false,
        failed: !preserved,
        quotaSkipped: true,
        usage: [],
      };
    }
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

  // Şekil okumasına metin katmanı gider (29 Ekim 2026): sayfada zaten yazan satır eke girmez.
  const readOptions = { deadlineMs, scanOrdinal: pageNumber, purpose, textLayer: keepText ?? null, fast: input.fast === true };
  let read = await extractImageText(image, mime, readOptions);
  let usage = read.usage;
  if (!read.ok && read.reason === "unreadable" && Date.now() + 20_000 < deadlineMs) {
    read = await extractImageText(image, mime, readOptions);
    usage = mergeUsage(usage, read.usage);
  }

  if (read.reason === "blocked") {
    await releaseClaim();
    return {
      page: preserved ?? {
        text: "",
        extractionOk: false,
        extractionMethod: "ocr",
        pageKind: "unreadable",
      },
      claimed: false,
      ocrSuccess: false,
      failed: !preserved,
      usage,
    };
  }

  const transcript = read.ok && read.pages[0] ? read.pages[0].trim() : "";
  if (preserved) {
    if (!transcript) {
      await releaseClaim();
      return {
        page: preserved,
        claimed: false,
        ocrSuccess: false,
        failed: false,
        usage,
        rateLimited: read.rateLimited,
      };
    }
    return {
      page: {
        text: appendFigureTranscript(preserved.text, transcript),
        extractionOk: true,
        extractionMethod: "text_layer",
        pageKind: "content",
      },
      claimed,
      ocrSuccess: true,
      failed: false,
      usage,
      rateLimited: read.rateLimited,
    };
  }
  const text = transcript;
  if (text) {
    return {
      page: { text, extractionOk: true, extractionMethod: "ocr", pageKind: "content" },
      claimed,
      ocrSuccess: true,
      failed: false,
      usage,
      rateLimited: read.rateLimited,
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
    usage,
    rateLimited: read.rateLimited,
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
  scanSkipped: number[];
}> {
  const extracted = await extractText(buffer, "application/pdf", firstPage, pageBudget);
  if (extracted.total <= 0 || !extracted.pages.length) throw new Error("empty_content");

  const pages: PagePersist[] = extracted.pages.map((text) => ({
    text,
    extractionOk: Boolean(text.trim()) && !textLayerNeedsOcr(text),
    extractionMethod: text.trim() && !textLayerNeedsOcr(text) ? "text_layer" as const : "none" as const,
    pageKind: text.trim() && !textLayerNeedsOcr(text) ? "content" as const : "unreadable" as const,
  }));
  const done = pages.map((page) => page.extractionMethod === "text_layer");
  const failedPages: number[] = [];
  const ocrPageNumbers: number[] = [];
  const scanSkipped: number[] = [];

  const blankIndexes = pages.flatMap((page, index) => (textLayerNeedsOcr(page.text) ? [index] : []));
  // Şekil ipucu olan sayfa, metin katmanı dolu olsa da bitmiş sayılmaz.
  for (let index = 0; index < pages.length; index += 1) {
    if (pageNeedsFigureRead(pages[index]!.text)) done[index] = false;
  }

  let founder = false;
  try {
    founder = await billingExempt(service, userId);
  } catch (error) {
    if (error instanceof AdminCheckError) throw new Error("admin_check_failed");
    throw error;
  }
  // Taranmış sayfa okuması ücretli hesapta ve kurucuda hızlı işlemle (31 Ekim 2026; ölçüm: sayfa 18-20 sn → 8-9 sn).
  const fast = await fastAllowedFor(service, userId);
  const limit = founder ? 0 : photoPageLimit(await planTier(service, userId));
  /** Pages with an open OCR claim; recorded immediately on successful claim. */
  const claimed = new Set<number>();

  try {
    // Render and OCR are pipelined: a page goes to OCR as soon as it is painted.
    const blank = new Set(blankIndexes);
    const metas = new Map<number, RenderedPage>();
    const queue: number[] = [];
    const visionMode = new Map<number, { purpose: "page" | "figure"; keepText?: string }>();
    let wake: (() => void) | null = null;
    const notify = () => {
      const resume = wake;
      wake = null;
      resume?.();
    };
    const enqueue = (index: number, purpose: "page" | "figure", keepText?: string) => {
      if (visionMode.has(index)) return;
      visionMode.set(index, { purpose, keepText });
      done[index] = false;
      queue.push(index);
      notify();
    };
    const takePage = (meta: RenderedPage, index: number) => {
      if (metas.has(index)) return;
      const original = pages[index]?.text ?? "";
      const isBlank = blank.has(index);
      // Boş taramadaki tek resim operatörü sayfanın kendisidir; şık kuralı bozulmasın.
      // Metinli sayfada gömülü resim veya yoğun çizim şekil okumasıdır.
      const figure = pageNeedsFigureRead(original)
        || (!isBlank && meta.figureGraphics === true)
        || (isBlank && (meta.vectorOps ?? 0) >= FIGURE_VECTOR_MIN);
      if (!isBlank && !figure) {
        done[index] = true;
        return;
      }
      metas.set(index, meta);
      if (!isBlank && figure && meta.scanRenderFailed) {
        done[index] = true;
        return;
      }
      if (isBlank && !figure && meta.inkRatio < BLANK_INK_RATIO && !meta.hasImageContent) {
        pages[index] = { text: "", extractionOk: true, extractionMethod: "none", pageKind: "blank" };
        done[index] = true;
        return;
      }
      if (isBlank && !figure && meta.scanRenderFailed) {
        pages[index] = { text: "", extractionOk: false, extractionMethod: "ocr", pageKind: "unreadable" };
        done[index] = true;
        failedPages.push(firstPage + index);
        return;
      }
      // Boş sayfa da şekilse tek okuma, şekil istemiyle. Metinli sayfada değerler eklenir.
      enqueue(index, figure ? "figure" : "page", isBlank ? undefined : original);
    };
    const renderStarted = Date.now();
    let renderMs = 0;
    let renderError: unknown = null;
    let renderDone = false;
    // Fotoğraf seti (31 Ekim 2026, `photo-set-pdf.ts`): sayfa zaten tek JPEG; çizilmeden okumaya gider.
    const photoPages = photoSetRenderedPages(buffer, firstPage, pages.length);
    const rendering = (photoPages
      ? Promise.resolve({ pages: photoPages })
      : renderPdfPages(buffer, pages.length, firstPage, { onPage: takePage }))
      .then((rendered) => {
        if (rendered.pages.length !== pages.length) throw new Error("scan_unreadable");
        rendered.pages.forEach(takePage);
      })
      .catch((error) => {
        renderError = error;
      })
      .finally(() => {
        renderDone = true;
        renderMs = Date.now() - renderStarted;
        notify();
      });

    const ocrStarted = Date.now();
    const maxLimit = Math.max(1, Math.min(OCR_PAGE_CONCURRENCY, ocrConcurrency));
    // Fotoğraf setinin sayfaları küçük (1600 piksel) ve hepsi okunacak: havuz tavandan başlar, 429'da yine yarıya iner.
    let limitNow = Math.max(1, Math.min(
      rememberedOcrLimit(documentId) ?? (photoPages ? OCR_PAGE_CONCURRENCY : OCR_START_CONCURRENCY),
      maxLimit,
    ));
    const limitStart = limitNow;
    let rateLimitedPages = 0;
    let poolError: unknown = null;
    const inFlight = new Map<number, Promise<void>>();
    const startOne = (index: number) => {
      const meta = metas.get(index)!;
      const number = firstPage + index;
      const work = (async () => {
        const mode = visionMode.get(index);
        const result = await ocrOneBlankPage({
          service, documentId, userId, pageNumber: number,
          image: meta.image, mime: meta.mime, inkRatio: meta.inkRatio,
          founder, fast, limit, deadlineMs, maxOcrPages,
          purpose: mode?.purpose ?? "page",
          keepText: mode?.keepText,
          onClaimed: (pageNumber) => { claimed.add(pageNumber); },
          onReleased: (pageNumber) => { claimed.delete(pageNumber); },
        });
        pages[index] = result.page;
        done[index] = true;
        if (result.rateLimited) {
          rateLimitedPages += 1;
          limitNow = Math.max(Math.min(OCR_MIN_CONCURRENCY, maxLimit), Math.floor(limitNow / 2));
        } else if (result.ocrSuccess) {
          limitNow = Math.min(maxLimit, limitNow + 1);
        }
        if (result.ocrSuccess) ocrPageNumbers.push(number);
        if (result.failed) failedPages.push(number);
        if (result.quotaSkipped) scanSkipped.push(number);
        for (const entry of result.usage) {
          if (!entry.tokensIn && !entry.tokensOut) continue;
          await recordUsage(service, {
            userId, actionCode: "DOCUMENT_PAGE_PROCESS",
            model: entry.model,
            tokensIn: entry.tokensIn, tokensOut: entry.tokensOut,
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
          notify();
        });
    };

    // Honour the deadline before each start so a near-budget step returns a
    // contiguous prefix.
    let ocrPages = 0;
    for (;;) {
      while (!poolError && inFlight.size < limitNow && queue.length && Date.now() < deadlineMs - 5_000) {
        startOne(queue.shift()!);
        ocrPages += 1;
      }
      if (poolError || renderError) break;
      const canStart = queue.length > 0 && Date.now() < deadlineMs - 5_000;
      if (renderDone && !inFlight.size && !canStart) break;
      await new Promise<void>((resolve) => {
        wake = resolve;
      });
    }
    if (inFlight.size) await Promise.allSettled([...inFlight.values()]);
    if (ocrPages > 0) rememberOcrLimit(documentId, limitNow);
    await rendering;
    console.info("pipeline_timing", {
      documentId, stage: "render", ms: renderMs, pages: pages.length, firstPage, photoSet: Boolean(photoPages),
    });
    console.info("pipeline_timing", {
      documentId, stage: "ocr", ms: Date.now() - ocrStarted, pages: ocrPages,
      concurrencyStart: limitStart, concurrencyEnd: limitNow, rateLimitedPages,
    });
    if (poolError) throw poolError;
    if (renderError) {
      const pendingBlank = pages.some((page, index) => textLayerNeedsOcr(page.text) && !done[index]);
      if (pendingBlank) throw renderError;
      for (let index = 0; index < pages.length; index += 1) {
        if (!textLayerNeedsOcr(pages[index]!.text)) done[index] = true;
      }
    }
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
    scanSkipped: scanSkipped.filter((n) => n < firstPage + prefixLen),
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
  // Parçalar birkaç şeritte (31 Ekim 2026): 150 sayfalık belgede ~13 ardışık gömme çağrısı vardı.
  const batches: (typeof chunks)[] = [];
  for (let offset = 0; offset < chunks.length; offset += EMBED_BATCH) batches.push(chunks.slice(offset, offset + EMBED_BATCH));
  let next = 0;
  let failed = false;
  const lane = async () => {
    for (;;) {
      const batch = batches[next];
      next += 1;
      // Bir şerit düşünce öbürleri yeni parça yazmaz (yeniden deneme temiz başlasın).
      if (!batch || failed) return;
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
  };
  await Promise.all(Array.from({ length: Math.min(EMBED_LANES, batches.length) }, () => lane().catch((error) => {
    failed = true;
    throw error;
  })));
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
  options?: {
    deadlineMs?: number;
    maxOcrPages?: number | null;
    /** Hızlı başlatma (31 Ekim 2026): ilk adım yalnız bu kadar sayfa okur; baş kopyası hemen çıkarılır. */
    firstStepPages?: number;
    /**
     * Pencereli işleme (31 Ekim 2026): adım bu sayfadan öteye okumaz. Pencere işçisi bir sonraki pencereyi okutur;
     * taranmış kitapta öğrencinin henüz gelmediği sayfalar okunmaz (kredisi de düşmez).
     */
    untilPage?: number;
  },
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
    status: "processing", pageCount: lease.totalPages ?? null, nextPage: lease.nextPage ?? null, busy: true,
  };
  if (lease.state !== "claimed" || !lease.token) {
    return { status: "failed", code: "ingestion_state_unavailable", retryable: true };
  }

  // Pencereli işleme: istenen sayfaya varıldıysa okunmaz (ayırma da açılmaz); pencere işçisi sonrasını okutur.
  if (options?.untilPage && (lease.nextPage ?? 1) > options.untilPage) {
    await updateLease(service, documentId, lease.token, { lease_token: null, lease_until: null }).catch(() => undefined);
    const next = lease.nextPage ?? 1;
    return { status: "processing", pageCount: lease.totalPages ?? null, nextPage: next, pagesDone: next - 1, failedPages: [], ocrPages: 0 };
  }

  let reservationId: string | null = lease.reservationId ?? null;
  let ocrPageNumbers: number[] = [];
  try {
    // Ücretsiz katman: hesap başına toplam 5 sayfa (3 Ekim 2026). Bu belge
    // kalan hak kadar işlenir; hak hiç yoksa belge reddedilir. Ücretsizde
    // belge işleme günlük ders hakkından yemez — sınırı bu 5 sayfa koyar.
    const remaining = await freePagesRemaining(service, userId, documentId);
    if (remaining === 0) throw new Error("free_page_limit");
    await renewLease(service, documentId, lease.token);

    const { data: doc, error: docError } = await service.from("documents")
      .select("storage_path, scan_pages_skipped")
      .eq("id", documentId).eq("user_id", userId).is("deleted_at", null).maybeSingle();
    if (docError || !doc) throw new Error("not_found");
    const { data: file, error: downloadError } = await service.storage.from("documents")
      .download(doc.storage_path);
    if (downloadError || !file) throw new Error("download_failed");
    const buffer = Buffer.from(await file.arrayBuffer());

    // Ücretli hesap, sayfa başına kredi (8 Ekim 2026): ilk adımda belgenin
    // sayfa sayısı kadar ayrılır; hak yetmezse yettiği kadar sayfa işlenir
    // (ücretsizdeki 5 sayfa sınırıyla aynı yol). Sınır sonraki adımlarda
    // `total_pages`'ten okunur. Sayfa sayısında ürün sınırı yok (31 Ekim 2026: önceki 1.000 sayfa tavanı kalktı;
    // 1.200 sayfalık kitabı yalnız öğrencinin hakkı sınırlar). Duraklayıp süren okumada (pencereli işleme,
    // document-credits.ts) ayırma yalnız kalan sayfalar için açılır.
    const firstPage = lease.nextPage ?? 1;
    let paidCap: number | null = null;
    let maxOcrPages = options?.maxOcrPages ?? null;
    if (remaining === null) {
      if (!reservationId) {
        const pageCount = (await extractText(buffer, "application/pdf", 1, 0)).total || 1;
        const known = firstPage > 1 && lease.totalPages ? Math.min(lease.totalPages, pageCount) : pageCount;
        const toRead = Math.max(1, known - firstPage + 1);
        const spendable = await spendableCredits(service, userId);
        const pageCost = Math.max(1, (await getActionCost(service, "DOCUMENT_PAGE_PROCESS")) ?? 2);
        const affordable = Math.min(toRead, Number.isFinite(spendable) ? Math.floor(spendable / pageCost) : toRead);
        if (affordable < 1) throw new Error("insufficient_credits");
        reservationId = await ensureReservation(service, userId, documentId, lease, affordable, firstPage);
        paidCap = firstPage - 1 + affordable;
        await updateLease(service, documentId, lease.token, { total_pages: paidCap });
      } else {
        paidCap = lease.totalPages ?? null;
      }
      // Taranmış sayfa ayrıca 6 kredi: hakkın yettiğinden fazlası okunmaz, atlanır.
      const spendable = await spendableCredits(service, userId);
      if (Number.isFinite(spendable)) {
        const scanCost = Math.max(1, (await getActionCost(service, "DOCUMENT_SCAN_PAGE")) ?? 6);
        const { count } = await service.from("document_ocr_claims")
          .select("page_number", { count: "exact", head: true })
          .eq("document_id", documentId);
        const allowed = (count ?? 0) + Math.floor(spendable / scanCost);
        maxOcrPages = maxOcrPages == null ? allowed : Math.min(maxOcrPages, allowed);
      }
    }
    const pageCap = remaining ?? paidCap;

    const firstStep = options?.firstStepPages && firstPage === 1
      ? Math.max(1, Math.min(adaptivePageBudget(deadlineMs), options.firstStepPages))
      : adaptivePageBudget(deadlineMs);
    const stepBudget = options?.untilPage && options.untilPage >= firstPage
      ? Math.max(1, Math.min(firstStep, options.untilPage - firstPage + 1))
      : firstStep;
    const pageBudget = pageCap == null
      ? stepBudget
      : Math.max(1, Math.min(stepBudget, pageCap - firstPage + 1));
    const read = await readPdfBatch(
      service, buffer, documentId, userId, firstPage, pageBudget, deadlineMs, maxOcrPages,
    );
    ocrPageNumbers = read.ocrPageNumbers;
    const total = cappedPageTotal(read.total, pageCap);
    if (read.pages.length > total - firstPage + 1) read.pages.length = Math.max(0, total - firstPage + 1);

    // Deadline with zero finished pages — retryable, do not advance cursor.
    if (!read.pages.length) {
      await updateLease(service, documentId, lease.token, {
        lease_token: null,
        lease_until: null,
      });
      return {
        status: "processing",
        pageCount: total,
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
      await updateLease(service, documentId, lease.token, { initialized: true, total_pages: total });
    }

    await assertLease(service, documentId, lease.token);
    await saveBatch(service, documentId, firstPage, read.pages);
    if (remaining === null && ocrPageNumbers.length) {
      await chargeNow(service, userId, "DOCUMENT_SCAN_PAGE", `document_scan_${documentId}_${firstPage}`, ocrPageNumbers.length);
    }
    const nextPage = firstPage + read.pages.length;
    const complete = nextPage > total;

    if (complete) {
      const { count, error: countError } = await service.from("document_chunks")
        .select("id", { count: "exact", head: true }).eq("document_id", documentId);
      if (countError) throw new Error("empty_content");
      if (!count) {
        const anyOk = read.pages.some((page) => page.extractionOk && page.text.trim());
        if (!anyOk) throw new Error(read.scanSkipped.length ? "photo_quota_exhausted" : "empty_content");
      }
    }

    const nowIso = new Date().toISOString();
    const { error: documentError } = await service.from("documents")
      .update({
        status: "processing",
        page_count: total,
        source_page_count: read.total,
        scan_pages_skipped: Number(doc.scan_pages_skipped ?? 0) + read.scanSkipped.length,
        error_message: null,
        updated_at: nowIso,
      })
      .eq("id", documentId).eq("user_id", userId);
    if (documentError) throw new Error("completion_update_failed");
    await service.from("processing_jobs").update({
      status: "processing",
      progress: Math.min(complete ? 40 : 39, Math.floor((nextPage - 1) / total * 40)),
      error_message: null,
    }).eq("document_id", documentId);

    await updateLease(service, documentId, lease.token, {
      next_page: nextPage,
      total_pages: total,
      status: complete ? "ready" : "extracting",
      lease_token: null,
      lease_until: null,
    });

    if (complete) {
      return { status: "ready", pageCount: total, failedPages: read.failedPages };
    }
    return {
      status: "processing",
      pageCount: total,
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
