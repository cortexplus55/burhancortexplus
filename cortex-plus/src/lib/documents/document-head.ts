import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { missingColumn } from "@/lib/learning/missing-column";

/**
 * Büyük belgede hızlı başlatma (31 Ekim 2026, ürün sahibi: "150 sayfalık tek PDF'te de öğrenci 3 dk beklemesin").
 *
 * Belge (D) her zamanki gibi baştan sona okunur ve haritalanır; hiçbir şeyi değişmez. İlk adımda okunan ilk sayfalar
 * (ve parçaları; gömmeler D'de kalır, arama onları H'nin sayfalarında kullanır) gizli bir "baş kopyasına" (H)
 * kopyalanır: H okunmuş, bitmiş, küçük bir belgedir. Kurulum
 * haritayı H ile çıkarır, öğrenci hazırlığa girer. D bitince "materyal ekle" yolundan hazırlığa eklenir ve yalnız
 * H'nin sayfalarından SONRAKİ konular eklenir (add-source `fromPage`). Neden ayrı satır: kullanılan bir haritaya
 * sonradan konu eklemek (in-use koruması) harita kodunu derinden değiştirirdi; D'nin kendi haritası ve içeriği
 * (sohbet, stüdyo) hep tam kalır.
 *
 * H, D'nin dosyasını paylaşır (`storage_path` aynı, sayfa numaraları aynı): kaynak sayfa önizlemesi doğru sayfayı
 * açar. Belgelerim, stüdyo ve sohbet listeleri `part_of` olanı göstermez; silmede depolamaya dokunulmaz (dosya D'nin).
 * Kopya bedavadır: okuma ve kredi D'de bir kez.
 *
 * Pencereli işleme (31 Ekim 2026): baş kopyası, parçaların ilki. Kalan sayfalar 40'ar sayfalık pencere kopyalarıyla
 * (`ensureDocumentPart`) hazırlığa girer; D'nin kendisi eklenmez (document-windows.ts, pending-windows.ts).
 */

/** Bu kadar ya da daha çok sayfalı PDF'te kurulum ilk adımı kısa tutar ve baş kopyası çıkarır. */
export const FAST_START_MIN_PAGES = 24;
/** Baş kopyasının sayfa sayısı (ilk okuma adımı): harita bu sayfalardan çıkar. */
export const HEAD_PAGES = 12;

export type DocumentHead = { documentId: string; fileName: string; pageCount: number };

/** D'nin bir parçası: baş kopyası (1..12) ya da pencere kopyası (document-windows.ts). Sayfa numaraları D'ninkiyle aynı. */
export type DocumentPart = { documentId: string; fileName: string; firstPage: number; lastPage: number };

/** `.in()` süzgeci URL'de gider: çok kimlik tek istekte uzun adres olur. */
const IN_BATCH = 100;

function batches<T>(items: readonly T[], size = IN_BATCH): T[][] {
  const out: T[][] = [];
  for (let index = 0; index < items.length; index += size) out.push(items.slice(index, index + size));
  return out;
}

/**
 * D'nin parçaları, ilk sayfaya göre sıralı. Parçanın sayfaları kesintisizdir (kopyalanırken denetlenir): ilk sayfa
 * bir sorguyla, son sayfa `page_count`'tan. Sütun yoksa (göç uygulanmadan) "unsupported".
 */
export async function listDocumentParts(
  service: SupabaseClient,
  input: { userId: string; documentId: string },
): Promise<DocumentPart[] | "unsupported"> {
  const { data, error } = await service
    .from("documents")
    .select("id, file_name, page_count")
    .eq("user_id", input.userId)
    .eq("part_of", input.documentId)
    .is("deleted_at", null)
    .order("created_at");
  if (error) return missingColumn(error) ? "unsupported" : [];
  const parts = await Promise.all(
    (data ?? []).map(async (row) => {
      const { data: first } = await service
        .from("document_pages")
        .select("page_number")
        .eq("document_id", row.id as string)
        .order("page_number")
        .limit(1)
        .maybeSingle();
      const firstPage = Number(first?.page_number ?? 0);
      const count = Number(row.page_count ?? 0);
      if (!firstPage || count < 1) return null;
      return {
        documentId: row.id as string,
        fileName: String(row.file_name ?? ""),
        firstPage,
        lastPage: firstPage + count - 1,
      } satisfies DocumentPart;
    }),
  );
  return parts.filter((part): part is DocumentPart => part !== null).sort((a, b) => a.firstPage - b.firstPage);
}

/** D'nin var olan baş kopyası (1. sayfadan başlayan parça; yoksa null). Sütun yoksa hızlı başlatma kapalıdır. */
export async function findDocumentHead(
  service: SupabaseClient,
  input: { userId: string; documentId: string },
): Promise<DocumentHead | null | "unsupported"> {
  const parts = await listDocumentParts(service, input);
  if (parts === "unsupported") return "unsupported";
  const head = parts.find((part) => part.firstPage === 1);
  return head ? { documentId: head.documentId, fileName: head.fileName, pageCount: head.lastPage } : null;
}

function withoutId<T extends Record<string, unknown>>(row: T): Omit<T, "id"> {
  const { id: _id, ...rest } = row;
  void _id;
  return rest;
}

/**
 * D'nin firstPage..lastPage sayfalarının kopyası (sayfa, parça; gömme D'de kalır). Aynı aralığın parçası varsa onu döndürür;
 * var olan bir parçayla çakışan aralık kopyalanmaz (null). Sayfalar kesintisiz okunmuş olmalı: eksik sayfalı kopya
 * yanlış harita verir. Kopyalamanın herhangi bir adımı düşerse yarım kopya silinir ve null döner.
 */
export async function ensureDocumentPart(
  service: SupabaseClient,
  input: { userId: string; documentId: string; firstPage: number; lastPage: number },
): Promise<DocumentPart | null> {
  const { firstPage, lastPage } = input;
  if (firstPage < 1 || lastPage < firstPage) return null;
  const parts = await listDocumentParts(service, input);
  if (parts === "unsupported") return null;
  const same = parts.find((part) => part.firstPage === firstPage && part.lastPage === lastPage);
  if (same) return same;
  if (parts.some((part) => part.firstPage <= lastPage && part.lastPage >= firstPage)) return null;

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
    .gte("page_number", firstPage)
    .lte("page_number", lastPage)
    .order("page_number");
  if (pagesError || !pages?.length) return null;
  if (pages.length !== lastPage - firstPage + 1) return null;

  const partId = crypto.randomUUID();
  const { error: docError } = await service.from("documents").insert({
    id: partId,
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
    await service.from("documents").delete().eq("id", partId).eq("user_id", input.userId);
  };
  try {
    const { data: newPages, error: insertPagesError } = await service
      .from("document_pages")
      .insert(pages.map((page) => ({ ...withoutId(page as Record<string, unknown>), document_id: partId })))
      .select("id, page_number");
    if (insertPagesError || newPages?.length !== pages.length) throw new Error("part_pages");
    const newPageByNumber = new Map(newPages.map((row) => [Number(row.page_number), String(row.id)]));
    const oldPageNumber = new Map(pages.map((page) => [String(page.id), Number(page.page_number)]));

    const chunks: Record<string, unknown>[] = [];
    for (const ids of batches([...oldPageNumber.keys()])) {
      const { data, error } = await service
        .from("document_chunks")
        .select("*")
        .eq("document_id", input.documentId)
        .in("page_id", ids);
      if (error) throw new Error("part_chunks");
      chunks.push(...((data ?? []) as Record<string, unknown>[]));
    }
    // Gömme kopyalanmaz (31 Ekim 2026, lansman zırhı): parçanın araması ana belgenin gömmelerini parçanın sayfa
    // aralığında kullanır (göç 20261031160000). 50 sayfadan büyük her PDF'in gömmeleri iki kez duruyordu; veritabanı
    // ücretsiz planın 500 MB'ının üçte birini 15 kullanıcıyla doldurmuştu.
    for (const group of batches(chunks)) {
      const { data: newChunks, error: insertChunksError } = await service
        .from("document_chunks")
        .insert(group.map((chunk) => ({
          ...withoutId(chunk),
          document_id: partId,
          page_id: newPageByNumber.get(oldPageNumber.get(String(chunk.page_id))!)!,
        })))
        .select("id");
      if (insertChunksError || newChunks?.length !== group.length) throw new Error("part_chunks");
    }
    return { documentId: partId, fileName: String(doc.file_name ?? ""), firstPage, lastPage };
  } catch (error) {
    console.error("document_part_failed", {
      documentId: input.documentId,
      firstPage,
      lastPage,
      step: error instanceof Error ? error.message : "unknown",
    });
    await drop();
    return null;
  }
}

/**
 * D'nin 1..lastPage sayfalarından baş kopyası. Var olanı döndürür (aynı istek iki kez gelirse ikinci kopya olmaz).
 * Kopyalama düşerse null: hızlı başlatma olmaz, D her zamanki gibi sürer.
 */
export async function ensureDocumentHead(
  service: SupabaseClient,
  input: { userId: string; documentId: string; lastPage: number },
): Promise<DocumentHead | null> {
  const existing = await findDocumentHead(service, input);
  if (existing === "unsupported") return null;
  if (existing) return existing;
  if (input.lastPage < 1) return null;
  const part = await ensureDocumentPart(service, { ...input, firstPage: 1 });
  return part ? { documentId: part.documentId, fileName: part.fileName, pageCount: part.lastPage } : null;
}

/** Baş kopyasının kapsadığı son sayfa: D hazırlığa eklenirken bu sayfalardaki konular eklenmez. */
export async function headCoverageFor(
  service: SupabaseClient,
  input: { userId: string; sourceDocumentIds: string[]; documentIds: string[] },
): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!input.sourceDocumentIds.length || !input.documentIds.length) return out;
  // Parçalar (baş kopyası + pencereler) gerçek aralıklarıyla: kesintisiz kapsanan son sayfa (31 Ekim 2026; önce
  // parçanın 1. sayfadan başladığı varsayılıyordu).
  for (const documentId of input.documentIds) {
    const parts = await listDocumentParts(service, { userId: input.userId, documentId });
    if (parts === "unsupported") continue;
    const mine = parts.filter((part) => input.sourceDocumentIds.includes(part.documentId));
    let through = 0;
    for (const part of mine) {
      if (part.firstPage > through + 1) break;
      through = Math.max(through, part.lastPage);
    }
    if (through > 0) out.set(documentId, through);
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
