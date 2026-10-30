import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { missingColumn } from "@/lib/learning/missing-column";

/**
 * Büyük belgede hızlı başlatma (31 Ekim 2026, ürün sahibi: "150 sayfalık tek PDF'te de öğrenci 3 dk beklemesin").
 *
 * Belge (D) her zamanki gibi baştan sona okunur ve haritalanır; hiçbir şeyi değişmez. İlk adımda okunan ilk sayfalar
 * (ve parçaları, gömmeleri) gizli bir "baş kopyasına" (H) kopyalanır: H okunmuş, bitmiş, küçük bir belgedir. Kurulum
 * haritayı H ile çıkarır, öğrenci hazırlığa girer. D bitince "materyal ekle" yolundan hazırlığa eklenir ve yalnız
 * H'nin sayfalarından SONRAKİ konular eklenir (add-source `fromPage`). Neden ayrı satır: kullanılan bir haritaya
 * sonradan konu eklemek (in-use koruması) harita kodunu derinden değiştirirdi; D'nin kendi haritası ve içeriği
 * (sohbet, stüdyo) hep tam kalır.
 *
 * H, D'nin dosyasını paylaşır (`storage_path` aynı, sayfa numaraları aynı): kaynak sayfa önizlemesi doğru sayfayı
 * açar. Belgelerim, stüdyo ve sohbet listeleri `part_of` olanı göstermez; silmede depolamaya dokunulmaz (dosya D'nin).
 * Kopya bedavadır: okuma ve kredi D'de bir kez.
 */

/** Bu kadar ya da daha çok sayfalı PDF'te kurulum ilk adımı kısa tutar ve baş kopyası çıkarır. */
export const FAST_START_MIN_PAGES = 24;
/** Baş kopyasının sayfa sayısı (ilk okuma adımı): harita bu sayfalardan çıkar. */
export const HEAD_PAGES = 12;

export type DocumentHead = { documentId: string; fileName: string; pageCount: number };

/** D'nin var olan baş kopyası (yoksa null). Sütun yoksa (göç uygulanmadan) hızlı başlatma kapalıdır. */
export async function findDocumentHead(
  service: SupabaseClient,
  input: { userId: string; documentId: string },
): Promise<DocumentHead | null | "unsupported"> {
  const { data, error } = await service
    .from("documents")
    .select("id, file_name, page_count")
    .eq("user_id", input.userId)
    .eq("part_of", input.documentId)
    .is("deleted_at", null)
    .order("created_at")
    .limit(1)
    .maybeSingle();
  if (error) return missingColumn(error) ? "unsupported" : null;
  if (!data) return null;
  return {
    documentId: data.id as string,
    fileName: String(data.file_name ?? ""),
    pageCount: Number(data.page_count ?? 0),
  };
}

function withoutId<T extends Record<string, unknown>>(row: T): Omit<T, "id"> {
  const { id: _id, ...rest } = row;
  void _id;
  return rest;
}

/**
 * D'nin 1..lastPage sayfalarından baş kopyası. Var olanı döndürür (aynı istek iki kez gelirse ikinci kopya olmaz).
 * Kopyalamanın herhangi bir adımı düşerse yarım kopya silinir ve null döner: hızlı başlatma olmaz, D her zamanki
 * gibi sürer.
 */
export async function ensureDocumentHead(
  service: SupabaseClient,
  input: { userId: string; documentId: string; lastPage: number },
): Promise<DocumentHead | null> {
  const existing = await findDocumentHead(service, input);
  if (existing === "unsupported") return null;
  if (existing) return existing;
  if (input.lastPage < 1) return null;

  const { data: doc } = await service
    .from("documents")
    .select("id, user_id, file_name, storage_path, mime_type, size_bytes, part_of")
    .eq("id", input.documentId)
    .eq("user_id", input.userId)
    .is("deleted_at", null)
    .maybeSingle();
  if (!doc || doc.part_of) return null;

  const { data: pages, error: pagesError } = await service
    .from("document_pages")
    .select("*")
    .eq("document_id", input.documentId)
    .lte("page_number", input.lastPage)
    .order("page_number");
  if (pagesError || !pages?.length) return null;
  // Okuma sırası kesintisiz olmalı: eksik sayfalı baş kopyası yanlış harita verir.
  if (pages.length !== input.lastPage) return null;

  const headId = crypto.randomUUID();
  const { error: docError } = await service.from("documents").insert({
    id: headId,
    user_id: input.userId,
    file_name: doc.file_name,
    storage_path: doc.storage_path,
    mime_type: doc.mime_type,
    size_bytes: doc.size_bytes,
    status: "completed",
    page_count: pages.length,
    source_page_count: pages.length,
    part_of: input.documentId,
  });
  if (docError) return null;

  const drop = async () => {
    await service.from("documents").delete().eq("id", headId).eq("user_id", input.userId);
  };
  try {
    const { data: newPages, error: insertPagesError } = await service
      .from("document_pages")
      .insert(pages.map((page) => ({ ...withoutId(page as Record<string, unknown>), document_id: headId })))
      .select("id, page_number");
    if (insertPagesError || newPages?.length !== pages.length) throw new Error("head_pages");
    const newPageByNumber = new Map(newPages.map((row) => [Number(row.page_number), String(row.id)]));
    const oldPageNumber = new Map(pages.map((page) => [String(page.id), Number(page.page_number)]));

    const { data: chunks, error: chunksError } = await service
      .from("document_chunks")
      .select("*")
      .eq("document_id", input.documentId)
      .in("page_id", [...oldPageNumber.keys()]);
    if (chunksError) throw new Error("head_chunks");
    if (chunks?.length) {
      const { data: newChunks, error: insertChunksError } = await service
        .from("document_chunks")
        .insert(chunks.map((chunk) => ({
          ...withoutId(chunk as Record<string, unknown>),
          document_id: headId,
          page_id: newPageByNumber.get(oldPageNumber.get(String(chunk.page_id))!)!,
        })))
        .select("id, chunk_index");
      if (insertChunksError || newChunks?.length !== chunks.length) throw new Error("head_chunks");
      const newChunkByIndex = new Map(newChunks.map((row) => [Number(row.chunk_index), String(row.id)]));
      const indexOfOld = new Map(chunks.map((chunk) => [String(chunk.id), Number(chunk.chunk_index)]));
      const { data: vectors, error: vectorsError } = await service
        .from("document_embeddings")
        .select("chunk_id, embedding")
        .in("chunk_id", [...indexOfOld.keys()]);
      if (vectorsError) throw new Error("head_embeddings");
      if (vectors?.length) {
        const { error: insertVectorsError } = await service.from("document_embeddings").insert(
          vectors.map((row) => ({
            chunk_id: newChunkByIndex.get(indexOfOld.get(String(row.chunk_id))!)!,
            embedding: row.embedding,
          })),
        );
        if (insertVectorsError) throw new Error("head_embeddings");
      }
    }
    return { documentId: headId, fileName: String(doc.file_name ?? ""), pageCount: pages.length };
  } catch (error) {
    console.error("document_head_failed", { documentId: input.documentId, step: error instanceof Error ? error.message : "unknown" });
    await drop();
    return null;
  }
}

/** Baş kopyasının kapsadığı son sayfa: D hazırlığa eklenirken bu sayfalardaki konular eklenmez. */
export async function headCoverageFor(
  service: SupabaseClient,
  input: { userId: string; sourceDocumentIds: string[]; documentIds: string[] },
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!input.sourceDocumentIds.length || !input.documentIds.length) return out;
  const { data, error } = await service
    .from("documents")
    .select("id, part_of, page_count")
    .eq("user_id", input.userId)
    .in("id", input.sourceDocumentIds)
    .in("part_of", input.documentIds);
  if (error) return out;
  for (const row of data ?? []) {
    const parent = row.part_of as string;
    out.set(parent, Math.max(out.get(parent) ?? 0, Number(row.page_count ?? 0)));
  }
  return out;
}

/**
 * Baş kopyası hazırlıktaysa ana belgenin konularından yalnız baş kopyasının sayfalarından SONRAKİLER eklenir: konunun
 * sayfalarının çoğu kapsanan sayfadaysa (o konu hazırlıkta baş kopyasından zaten var) eklenmez. Sınırı aşan konu
 * çoğunluğa göre karar verir; sayfası olmayan ya da başka belgeden gelen konu her zaman kalır.
 */
export function topicPastHead(
  topic: { sourceRefs?: { documentId: string; pages: number[] }[] },
  coverage: ReadonlyMap<string, number>,
): boolean {
  let covered = 0;
  let beyond = 0;
  for (const ref of topic.sourceRefs ?? []) {
    const last = coverage.get(ref.documentId);
    for (const page of ref.pages) {
      if (last != null && page <= last) covered += 1;
      else beyond += 1;
    }
  }
  return covered === 0 || beyond > covered;
}
