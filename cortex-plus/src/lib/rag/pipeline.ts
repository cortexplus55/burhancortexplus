import "server-only";
import OpenAI from "openai";
import type { SupabaseClient } from "@supabase/supabase-js";
import { env } from "@/lib/env";

export const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;

export function chunkText(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + CHUNK_SIZE, normalized.length);
    chunks.push(normalized.slice(start, end));
    if (end === normalized.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}

export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (!env.OPENAI_API_KEY || texts.length === 0) return [];
  const openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  const response = await openai.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts,
  });
  return response.data.map((item) => item.embedding);
}

export async function extractText(
  buffer: Buffer,
  mimeType: string,
): Promise<{ pages: string[]; ok: boolean }> {
  if (mimeType === "text/plain") {
    return { pages: [buffer.toString("utf8")], ok: true };
  }

  if (mimeType === "application/pdf") {
    // Text layer extraction without a native dependency: pull readable strings
    // from the PDF content streams. Scanned PDFs fall back to OCR-less failure.
    const raw = buffer.toString("latin1");
    const matches = raw.match(/\(((?:\\.|[^\\()])*)\)/g) ?? [];
    const text = matches
      .map((m) => m.slice(1, -1).replace(/\\([()\\])/g, "$1"))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
    return { pages: text ? [text] : [], ok: text.length > 40 };
  }

  return { pages: [], ok: false };
}

export async function processDocument(
  service: SupabaseClient,
  documentId: string,
): Promise<{ ok: boolean; chunks: number; error?: string }> {
  const { data: doc } = await service
    .from("documents")
    .select("id, user_id, storage_path, mime_type")
    .eq("id", documentId)
    .maybeSingle();

  if (!doc) return { ok: false, chunks: 0, error: "not_found" };

  const fail = async (message: string) => {
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

  const download = await service.storage
    .from("documents")
    .download(doc.storage_path);

  if (download.error || !download.data) return fail("download_failed");

  const buffer = Buffer.from(await download.data.arrayBuffer());
  const extracted = await extractText(buffer, doc.mime_type);

  if (!extracted.ok || !extracted.pages.length) {
    return fail("text_extraction_unsupported");
  }

  await service
    .from("documents")
    .update({ status: "processing", page_count: extracted.pages.length })
    .eq("id", documentId);

  let chunkIndex = 0;
  const allChunks: { pageId: string; content: string }[] = [];

  for (const [pageNumber, pageText] of extracted.pages.entries()) {
    const { data: page } = await service
      .from("document_pages")
      .insert({
        document_id: documentId,
        page_number: pageNumber + 1,
        text_content: pageText.slice(0, 200000),
      })
      .select("id")
      .single();

    if (!page) continue;

    for (const content of chunkText(pageText)) {
      allChunks.push({ pageId: page.id, content });
    }
  }

  if (!allChunks.length) return fail("empty_content");

  const embeddings = await embedTexts(allChunks.map((c) => c.content));

  for (const [index, chunk] of allChunks.entries()) {
    const { data: inserted } = await service
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

    const vector = embeddings[index];
    if (inserted && vector) {
      await service.from("document_embeddings").insert({
        chunk_id: inserted.id,
        embedding: vector as unknown as string,
      });
    }
  }

  await service
    .from("documents")
    .update({ status: "completed", error_message: null })
    .eq("id", documentId);
  await service
    .from("processing_jobs")
    .update({ status: "completed", progress: 100 })
    .eq("document_id", documentId);

  return { ok: true, chunks: allChunks.length };
}

export async function searchDocumentChunks(
  service: SupabaseClient,
  userId: string,
  query: string,
  limit = 5,
): Promise<{ content: string; documentName: string }[]> {
  const [embedding] = await embedTexts([query]);
  if (!embedding) return [];

  const { data } = await service.rpc("match_document_chunks", {
    p_user_id: userId,
    p_query_embedding: embedding as unknown as string,
    p_match_count: limit,
  });

  return (data ?? []).map(
    (row: { content: string; file_name: string }) => ({
      content: row.content,
      documentName: row.file_name,
    }),
  );
}
