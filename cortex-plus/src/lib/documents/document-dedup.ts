import "server-only";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { missingColumn } from "@/lib/learning/missing-column";

/*
  Aynı belgeyi tekrar okumama (5 Kasım 2026, lansman zırhı). Bir sınıfın 50 öğrencisi aynı PDF'i yükler ya da bir
  öğrenci aynı dosyayı yeniden seçer: dosyanın SHA-256 özeti daha önce BAŞARIYLA işlenmiş (`completed`) bir belgeyle
  aynıysa Vision/OCR ve gömme çağrısı yapılmaz; kaynağın sayfa metinleri, parçaları ve gömmeleri veritabanında
  kopyalanır (`clone_document_content`, tek SQL çağrısı). Kopya öğrenciye aittir ve kendi haritasını alır; kaynak
  belge ve sahibi hiçbir yerde görünmez. Özet SUNUCUDA, yüklenen baytlardan hesaplanır — istemcinin söylediği
  özete güvenilmez (başkasının belgesinin metnini "aynı dosya" diyerek almak mümkün olmasın).

  Kaynak önce aynı kullanıcıda aranır, sonra herkeste. Kaynağın gömmeleri tahliye edilmişse (soğuk bellek) yalnız
  metin kopyalanır ve eksik gömmeler yeniden üretilir (`ensureDocumentEmbeddings`; yalnız gömme çağrısı — OCR yok).
  Göç uygulanmamışsa (sütun ya da fonksiyon yok) tekilleştirme sessizce atlanır, belge eskisi gibi okunur.
*/

export type DuplicateSource = { id: string; userId: string; pageCount: number; evicted: boolean };
export type CloneCounts = { pages: number; chunks: number; embeddings: number };
export type EmbedFn = (texts: string[]) => Promise<number[][]>;

export function sha256Hex(buffer: Buffer | Uint8Array): string {
  return createHash("sha256").update(buffer).digest("hex");
}

function missingSchema(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false;
  if (missingColumn(error)) return true;
  return error.code === "PGRST202" || error.code === "42883" || /clone_document_content/.test(error.message ?? "");
}

/** Belgenin özetini yazar; sütun yoksa (göç uygulanmamış) sessizce geçer. */
export async function stampDocumentSha(service: SupabaseClient, documentId: string, sha256: string): Promise<boolean> {
  const { error } = await service.from("documents").update({ sha256 }).eq("id", documentId);
  if (!error) return true;
  if (missingSchema(error)) return false;
  console.warn("document_sha_stamp_failed", { documentId, code: error.code });
  return false;
}

type SourceRow = { id: string; user_id: string; page_count: number | null; embeddings_evicted_at: string | null };

async function firstSource(
  service: SupabaseClient,
  sha256: string,
  excludeId: string,
  userId: string | null,
): Promise<SourceRow | null | "missing"> {
  let query = service
    .from("documents")
    .select("id, user_id, page_count, embeddings_evicted_at")
    .eq("sha256", sha256)
    .eq("status", "completed")
    .is("part_of", null)
    .is("deleted_at", null)
    .neq("id", excludeId)
    .gt("page_count", 0)
    .order("created_at", { ascending: true })
    .limit(1);
  if (userId) query = query.eq("user_id", userId);
  const { data, error } = await query;
  if (error) return missingSchema(error) ? "missing" : null;
  return ((data ?? [])[0] as SourceRow | undefined) ?? null;
}

/** Aynı özetle bitmiş kaynak: önce aynı öğrenci, sonra herkes. Sayfası olmayan kaynak sayılmaz. */
export async function findDuplicateSource(
  service: SupabaseClient,
  input: { sha256: string; excludeId: string; userId: string },
): Promise<DuplicateSource | null> {
  const own = await firstSource(service, input.sha256, input.excludeId, input.userId);
  if (own === "missing") return null;
  const row = own ?? (await firstSource(service, input.sha256, input.excludeId, null));
  if (!row || row === "missing") return null;
  const { count } = await service.from("document_pages").select("id", { count: "exact", head: true }).eq("document_id", row.id);
  if (!count) return null;
  return { id: row.id, userId: row.user_id, pageCount: Number(row.page_count ?? count), evicted: row.embeddings_evicted_at != null };
}

/** Kaynağın içeriğini hedefe kopyalar (tek SQL). Fonksiyon yoksa null: çağıran normal yola düşer. */
export async function cloneDocumentContent(
  service: SupabaseClient,
  input: { sourceId: string; targetId: string },
): Promise<CloneCounts | null> {
  const { data, error } = await service.rpc("clone_document_content", { p_source: input.sourceId, p_target: input.targetId });
  if (error) {
    if (!missingSchema(error)) console.warn("document_clone_failed", { targetId: input.targetId, code: error.code });
    return null;
  }
  const counts = (data ?? {}) as Partial<Record<keyof CloneCounts, unknown>>;
  return { pages: Number(counts.pages) || 0, chunks: Number(counts.chunks) || 0, embeddings: Number(counts.embeddings) || 0 };
}

export const EMBED_BATCH = 64;

/**
 * Gömmesi olmayan parçaları gömer (tahliye sonrası yeniden indeksleme ve tahliyeli kaynaktan klon). Yalnız gömme
 * çağrısı; metin yeniden okunmaz. Dönen sayı yazılan gömme.
 */
export async function ensureDocumentEmbeddings(service: SupabaseClient, documentId: string, embed: EmbedFn): Promise<number> {
  const { data: chunks, error } = await service
    .from("document_chunks")
    .select("id, content")
    .eq("document_id", documentId)
    .order("chunk_index", { ascending: true });
  if (error || !chunks?.length) return 0;
  const ids = (chunks as { id: string }[]).map((row) => row.id);
  const have = new Set<string>();
  for (let i = 0; i < ids.length; i += 500) {
    const { data } = await service.from("document_embeddings").select("chunk_id").in("chunk_id", ids.slice(i, i + 500));
    for (const row of (data ?? []) as { chunk_id: string }[]) have.add(row.chunk_id);
  }
  const missing = (chunks as { id: string; content: string }[]).filter((row) => !have.has(row.id));
  let written = 0;
  for (let i = 0; i < missing.length; i += EMBED_BATCH) {
    const batch = missing.slice(i, i + EMBED_BATCH);
    const vectors = await embed(batch.map((row) => row.content));
    const { error: insertError } = await service.from("document_embeddings").insert(
      batch.map((row, index) => ({ chunk_id: row.id, embedding: vectors[index] as unknown as string })),
    );
    if (insertError) throw new Error("embedding_insert_failed");
    written += batch.length;
  }
  return written;
}
