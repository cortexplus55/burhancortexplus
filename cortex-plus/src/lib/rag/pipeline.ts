import "server-only";
import { extractText } from "@/lib/documents/extract-text";
import {
  extractImagePages,
  extractImageText,
  isImageDocument,
} from "@/lib/documents/extract-image-text";
import { visionReadyImage } from "@/lib/documents/vision-image";
import { renderPdfPages } from "@/lib/documents/render-pdf-pages";
import {
  extractOfficeText,
  isOfficeDocument,
} from "@/lib/documents/extract-office-text";
import {
  claimPhotoPages,
  planTier,
  releasePhotoPages,
} from "@/lib/documents/photo-quota";
import { recordUsage } from "@/lib/credits/service";
import { recordAbuse } from "@/lib/abuse/record";
import { chunkText } from "@/lib/rag/chunk";
export { chunkText } from "@/lib/rag/chunk";
export { extractText } from "@/lib/documents/extract-text";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";
import {
  isFeatureEnabled,
  PDF_LEARNING_V2_FLAG,
} from "@/lib/admin/feature-flags";
import { runPdfLearningV2 } from "@/lib/documents/pdf-learning-v2";
import { logOpsEvent } from "@/lib/observability/ops-log";
import { mapExtractFailure, userMessageForProcessError } from "@/lib/documents/process-user-message";

export const EMBEDDING_MODEL = "text-embedding-3-small";

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  if (!env.OPENAI_API_KEY) throw new Error("embedding_unavailable");
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  const ordered = [...response.data].sort((a, b) => a.index - b.index);
  if (ordered.length !== texts.length || ordered.some((item, index) => item.index !== index || !item.embedding?.length || item.embedding.some((n) => !Number.isFinite(n)))) {
    throw new Error("embedding_incomplete");
  }
  return ordered.map((item) => item.embedding);
}

export async function processDocument(
  service: SupabaseClient,
  documentId: string,
  options?: { deferTopicMap?: boolean },
): Promise<{
  ok: boolean;
  chunks: number;
  error?: string;
  /** Öğrenciye söylenecek, hata olmayan durum — örn. uzun belge kesildi. */
  notice?: string;
  topicMap?: { ok: boolean; topics: number; coverageStatus?: string };
  pageCount?: number;
  /** Konu haritası bu istekte çalışmadı; sonraki tur sürdürür. */
  deferred?: boolean;
}> {
  const { data: doc } = await service
    .from("documents")
    .select("id, user_id, storage_path, mime_type")
    .eq("id", documentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!doc) return { ok: false, chunks: 0, error: "not_found" };

  const fail = async (code: string) => {
    const message = userMessageForProcessError(code);
    logOpsEvent("document_parse_failed", { documentId, code });
    await service
      .from("documents")
      .update({ status: "failed", error_message: message })
      .eq("id", documentId);
    await service
      .from("processing_jobs")
      .update({ status: "failed", error_message: message })
      .eq("document_id", documentId);
    return { ok: false, chunks: 0, error: message };
  };

  await service
    .from("processing_jobs")
    .update({ status: "processing", progress: 0, error_message: null })
    .eq("document_id", documentId);

  const download = await service.storage
    .from("documents")
    .download(doc.storage_path);

  if (download.error || !download.data) return fail("download_failed");

  const userId = doc.user_id as string;

  /**
   * Bu belgenin yaktığı fotoğraf sayfası kotası.
   *
   * `try` bloğunun DIŞINDA duruyor: beklenmeyen bir hata da kota yakmamalı.
   * İçeride olsaydı `catch` ona erişemez ve düşen her istek öğrencinin
   * hakkından bir sayfa götürürdü.
   */
  let claimedPages = 0;
  const failAndRelease = async (message: string) => {
    if (claimedPages) {
      await releasePhotoPages(service, userId, claimedPages);
      claimedPages = 0;
    }
    return fail(message);
  };

  try {
  const buffer = Buffer.from(await download.data.arrayBuffer());

  /*
    Görüntüden okuma iki yerden giriyor: yüklenen fotoğraf ve METİN KATMANI
    OLMAYAN PDF.

    İkincisi 18 Eylül 2026'da geldi. Tarayıcıdan ya da telefondan çıkmış bir
    ders notu PDF'inde metin katmanı yok; `extractText` boş dönüyordu ve
    öğrenci "metin katmanı olan bir PDF deneyin" uyarısı alıyordu. Türkiye'de
    dolaşan ders PDF'lerinin büyük kısmı tam olarak bu.

    KOTA BURADA İŞLİYOR, uçta değil. Sebebi: bir belgenin kaç fotoğraf
    sayfası yakacağını ancak burada biliyoruz — PDF'in metin katmanı olup
    olmadığı açılmadan belli olmuyor. Uç noktada tahmin etmek, taranmış bir
    PDF'i ya bedavaya geçirir ya da metin katmanı olan bir PDF'ten haksız
    yere kota keserdi.
  */
  const claim = async (count: number): Promise<boolean> => {
    if (count <= 0) return true;
    const tier = await planTier(service, userId);
    const ok = await claimPhotoPages(service, userId, count, tier);
    if (ok) claimedPages += count;
    return ok;
  };

  const recordVision = (
    tokensIn: number,
    tokensOut: number,
    model: string | null,
  ) => {
    // Okunamayan denemenin faturası da bize geliyor; kayıt ikisini de
    // taşısın, yoksa kademeli okumanın gerçek bedeli görünmez.
    if (!tokensIn && !tokensOut) return;
    void recordUsage(service, {
      userId,
      actionCode: "DOCUMENT_PAGE_PROCESS",
      model: model ?? env.OPENAI_STANDARD_MODEL,
      tokensIn,
      tokensOut,
    });
  };

  const reportBlocked = () => {
    void recordAbuse({
      signal: "moderation",
      severity: "high",
      scope: "document-image",
      userId,
      // Görselin kendisi kaydedilmiyor; hangi belgede olduğu yeterli.
      metadata: { documentId },
    });
  };

  let pages: string[];
  let notice: string | undefined;

  if (isImageDocument(doc.mime_type)) {
    if (!(await claim(1))) return fail("photo_quota_exhausted");

    const prepared = await visionReadyImage(buffer, doc.mime_type);
    if (!prepared) return failAndRelease("image_unreadable");
    const read = await extractImageText(prepared.buffer, prepared.mimeType);
    recordVision(read.tokensIn, read.tokensOut, read.model);

    if (read.reason === "blocked") {
      reportBlocked();
      return failAndRelease("image_blocked");
    }
    if (!read.ok || !read.pages.length) {
      if (read.reason === "too_large") return failAndRelease("image_too_large");
      return failAndRelease("image_unreadable");
    }
    pages = read.pages;
  } else if (isOfficeDocument(doc.mime_type)) {
    /*
      Slayt ve Word. Model çağrısı yok, kota yok: metin dosyanın içinde zaten
      duruyor, okunması yeter — PDF'in metin katmanını okumaktan farkı yok.
    */
    const read = extractOfficeText(buffer, doc.mime_type);
    if (!read.ok) {
      return fail(read.reason === "too_large" ? "office_too_large" : "office_unreadable");
    }
    pages = read.pages;
  } else {
    let extracted;
    try {
      extracted = await extractText(buffer, doc.mime_type);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg === "encrypted_pdf") return fail("encrypted_pdf");
      return fail(mapExtractFailure(msg));
    }

    if (extracted.ok && extracted.pages.length) {
      pages = extracted.pages;
    } else if (doc.mime_type === "application/pdf") {
      /*
        Metin katmanı yok — taranmış say ve sayfaları çizerek oku.

        Çizim bize hiçbir şeye mal olmuyor (model çağrısı yok), o yüzden kota
        ÇİZİMDEN SONRA isteniyor: kaç sayfa okunacağını ancak o zaman
        biliyoruz ve öğrenci gerçekten okunacak sayfa kadar ödüyor.
      */
      const rendered = await renderPdfPages(buffer);
      if (!rendered.pages.length) return fail("text_extraction_unsupported");

      if (!(await claim(rendered.pages.length))) {
        return fail("photo_quota_exhausted");
      }

      const read = await extractImagePages(rendered.pages);
      recordVision(read.tokensIn, read.tokensOut, null);

      if (read.blocked) {
        reportBlocked();
        return failAndRelease("image_blocked");
      }
      if (!read.readCount) return failAndRelease("scan_unreadable");

      /*
        Okunamayan tek sayfa belgeyi düşürmüyor ama boş sayfa da kaydedilmiyor:
        gömülü boş bir parça, alakasız sorularda bağlam diye geri gelirdi.
      */
      pages = read.pages.filter((page) => page.trim().length > 0);

      // Okunamayan sayfalar kota yakmasın.
      const unread = rendered.pages.length - read.readCount;
      if (unread > 0) {
        await releasePhotoPages(service, userId, unread);
        claimedPages -= unread;
      }

      if (rendered.total > rendered.pages.length) {
        notice = `${rendered.total} sayfalık belgenin ilk ${rendered.pages.length} sayfası okundu.`;
      }
    } else {
      return fail("text_extraction_unsupported");
    }
  }

  await service
    .from("documents")
    .update({ status: "processing", page_count: pages.length })
    .eq("id", documentId);

  // A request can be interrupted after writing only part of the derived data.
  // Retrying starts from a clean derived-data set; the source file stays intact.
  const { error: cleanupError } = await service
    .from("document_pages")
    .delete()
    .eq("document_id", documentId);
  if (cleanupError) return failAndRelease("cleanup_failed");

  // Topic links cascade from pages; clear topic nodes so rebuilds never orphan.
  await service
    .from("document_topic_nodes")
    .delete()
    .eq("document_id", documentId);
  await service
    .from("document_coverage_reports")
    .delete()
    .eq("document_id", documentId);
  await service
    .from("documents")
    .update({
      topic_map_status: "none",
      topic_map_error: null,
      topic_map_updated_at: null,
    })
    .eq("id", documentId);

  let chunkIndex = 0;
  const allChunks: { pageId: string; content: string }[] = [];

  for (const [pageNumber, pageText] of pages.entries()) {
    const { data: page, error: pageError } = await service
      .from("document_pages")
      .insert({
        document_id: documentId,
        page_number: pageNumber + 1,
        text_content: pageText.slice(0, 200000),
      })
      .select("id")
      .single();

    if (pageError || !page) {
      console.error("document page insert failed", { code: pageError?.code });
      return failAndRelease("page_insert_failed");
    }

    for (const content of chunkText(pageText)) {
      allChunks.push({ pageId: page.id, content });
    }
  }

  if (!allChunks.length) return failAndRelease("empty_content");

  // Tek seferde gömmek uzun belgede isteği zaman aşımına bırakıyordu.
  const EMBED_BATCH = 24;
  const embeddings: number[][] = [];
  for (let offset = 0; offset < allChunks.length; offset += EMBED_BATCH) {
    const slice = allChunks.slice(offset, offset + EMBED_BATCH).map((chunk) => chunk.content);
    embeddings.push(...(await embedTexts(slice)));
  }

  for (const [index, chunk] of allChunks.entries()) {
    const { data: inserted, error: chunkError } = await service
      .from("document_chunks")
      .insert({
        document_id: documentId,
        page_id: chunk.pageId,
        chunk_index: chunkIndex++,
        content: chunk.content,
        token_count: Math.ceil(chunk.content.length / 4),
      })
      .select("id")
      .single();

    if (chunkError || !inserted) return failAndRelease("chunk_insert_failed");

    const vector = embeddings[index];
    if (inserted && vector) {
      const { error: embeddingError } = await service.from("document_embeddings").insert({
        chunk_id: inserted.id,
        embedding: vector as unknown as string,
      });
      if (embeddingError) return failAndRelease("embedding_insert_failed");
    }
  }

  if (options?.deferTopicMap) {
    const { error: deferError } = await service
      .from("documents")
      .update({ status: "processing", error_message: null, page_count: pages.length })
      .eq("id", documentId);
    if (deferError) return failAndRelease("completion_update_failed");
    await service
      .from("processing_jobs")
      .update({ status: "processing", progress: 40, error_message: null })
      .eq("document_id", documentId);
    return {
      ok: true,
      chunks: allChunks.length,
      notice,
      pageCount: pages.length,
      deferred: true,
    };
  }

  const { error: completedError } = await service
    .from("documents")
    .update({ status: "completed", error_message: null })
    .eq("id", documentId);
  if (completedError) return failAndRelease("completion_update_failed");
  await service
    .from("processing_jobs")
    .update({ status: "completed", progress: 100 })
    .eq("document_id", documentId);

  // Stage 2 path is opt-in. Flag off → classic RAG complete, no topic map.
  let topicMap:
    | { ok: boolean; topics: number; coverageStatus?: string }
    | undefined;
  if (await isFeatureEnabled(service, PDF_LEARNING_V2_FLAG)) {
    const v2 = await runPdfLearningV2(service, documentId);
    topicMap = {
      ok: v2.ok,
      topics: v2.topics,
      coverageStatus: v2.coverage?.status,
    };
  } else {
    console.info(JSON.stringify({
      event: "teacher_analysis",
      documentId,
      status: "not_started",
      error: "pdf_learning_v2_off",
    }));
  }

  return { ok: true, chunks: allChunks.length, notice, topicMap, pageCount: pages.length };
  } catch (error) {
    console.error("document processing failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return failAndRelease("processing_failed");
  }
}

/**
 * Alakasız sorularda bağlam enjekte etmemek için taban eşik.
 *
 * Ölçüm: kaynak içi sorular 0,35-0,38; tamamen alakasız bir soru 0,20 verdi.
 * Eşik bunları ayırıyor. Ayıramadığı şey, konuya yakın ama belgede olmayan
 * soru — o da 0,35 civarı veriyor. Kaynak dışına çıkıldığını söylemek eşiğin
 * değil, prompt'un işi.
 */
export const MIN_CHUNK_SIMILARITY = 0.25;

export type DocumentMatch = {
  chunkId: string;
  documentId: string;
  content: string;
  documentName: string;
  similarity: number;
  pageNumber: number | null;
  chunkIndex: number | null;
};

export async function searchDocumentChunks(
  service: SupabaseClient,
  userId: string,
  query: string,
  limit = 5,
  options: { documentId?: string | null; minSimilarity?: number } = {},
): Promise<DocumentMatch[]> {
  const [embedding] = await embedTexts([query]);
  if (!embedding) return [];

  const { data, error } = await service.rpc("match_document_chunks", {
    p_user_id: userId,
    p_query_embedding: embedding as unknown as string,
    p_match_count: limit,
    p_min_similarity: options.minSimilarity ?? MIN_CHUNK_SIMILARITY,
    p_document_id: options.documentId ?? null,
  });
  if (error) throw new Error("retrieval_unavailable");

  return (data ?? []).map(mapChunkRow);
}

type ChunkRow = {
  chunk_id: string;
  document_id: string;
  content: string;
  file_name: string;
  similarity: number;
  page_number?: number | null;
  chunk_index?: number | null;
};

function mapChunkRow(row: ChunkRow): DocumentMatch {
  return {
    chunkId: row.chunk_id,
    documentId: row.document_id,
    content: row.content,
    documentName: row.file_name,
    similarity: Number(row.similarity ?? 0),
    pageNumber: row.page_number ?? null,
    chunkIndex: row.chunk_index ?? null,
  };
}

/**
 * Bir gömme, hazırlıktaki her belge. Tek belgede aramak çok dosyalı
 * hazırlıkta ilgili notu kaçırıyordu.
 */
export async function searchDocumentChunksAcross(
  service: SupabaseClient,
  userId: string,
  query: string,
  documentIds: string[],
  options: { limit?: number; minSimilarity?: number; perDocument?: number } = {},
): Promise<DocumentMatch[]> {
  const ids = [...new Set(documentIds.filter(Boolean))].slice(0, 12);
  if (!ids.length) return [];
  const [embedding] = await embedTexts([query]);
  if (!embedding) return [];
  const perDocument = options.perDocument ?? 2;
  const minSimilarity = options.minSimilarity ?? MIN_CHUNK_SIMILARITY;
  const batches = await Promise.all(ids.map(async (documentId) => {
    const { data, error } = await service.rpc("match_document_chunks", {
      p_user_id: userId,
      p_query_embedding: embedding as unknown as string,
      p_match_count: perDocument,
      p_min_similarity: minSimilarity,
      p_document_id: documentId,
    });
    if (error) return [] as DocumentMatch[];
    return ((data ?? []) as ChunkRow[]).map(mapChunkRow);
  }));
  return batches
    .flat()
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, options.limit ?? 8);
}

