import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { OfficeEmbeddedImage } from "@/lib/documents/extract-office-text";
import type { ModelUsage } from "@/lib/documents/extract-image-text";
import { attachOfficeFigures } from "@/lib/documents/office-figures";
import { chunkText } from "@/lib/rag/chunk";

/*
  Büyük sunu ve Word belgesinde hızlı başlatma (31 Ekim 2026, ürün sahibi: "60 slaytlık sunumda 2 dakika beklemesin").
  Slaytın ya da sayfanın YAZISI resim okunmadan hazır (XML'den gelir); süreyi gömülü resimlerin okunması belirliyor.
  Çok resimli belgede yalnız ilk 12 slaytın resimleri ve yazısı az olan slaytların resimleri (yalnız resimden ibaret
  slayt yazısız kalıp haritadan düşmesin) öğrenci beklerken okunur; geri kalan resimler belge hazır olduktan sonra
  arkada okunup kendi sayfasının sonuna eklenir, o sayfanın parçaları ve gömmeleri yenilenir. Ertelenen resim yalnız
  yazısı olan sayfada durduğu için konu haritası o sayfanın konusunu yazısından yine bulur.
*/

/** Bundan az resimde bölmeye değmez: hepsi beklerken okunur. */
export const OFFICE_HEAD_START_MIN_IMAGES = 13;
/** Öğrenci beklerken resimleri okunan ilk slayt/sayfa sayısı. */
export const OFFICE_HEAD_PAGES = 12;
/** Bundan kısa yazılı slayt "yazısız" sayılır: resmi beklerken okunur. */
export const OFFICE_TEXT_RICH_CHARS = 200;

export function splitOfficeFigures(
  pages: readonly string[],
  images: readonly OfficeEmbeddedImage[],
): { head: OfficeEmbeddedImage[]; tail: OfficeEmbeddedImage[] } {
  if (images.length < OFFICE_HEAD_START_MIN_IMAGES) return { head: [...images], tail: [] };
  const head: OfficeEmbeddedImage[] = [];
  const tail: OfficeEmbeddedImage[] = [];
  for (const image of images) {
    const text = (pages[image.pageIndex] ?? "").trim();
    if (image.pageIndex < OFFICE_HEAD_PAGES || text.length < OFFICE_TEXT_RICH_CHARS) head.push(image);
    else tail.push(image);
  }
  return { head, tail };
}

export type LateFigureResult = { readCount: number; updatedPages: number; usage: ModelUsage[]; blocked: boolean };

/**
 * Ertelenen resimleri okur ve sayfalarına ekler. `basePages` başta okunan resimlerin eklendiği hâl (özgün sıra);
 * `pageNumberOf` özgün sıradan kayıtlı sayfa numarasına. Sayfanın temiz metni (`clean_text`) silinir: ders onu yeniden
 * üretir. Bir sayfanın yazımı düşerse öbürleri sürer.
 */
export async function fillLateOfficeFigures(
  service: SupabaseClient,
  input: {
    documentId: string;
    basePages: readonly string[];
    pageNumberOf: ReadonlyMap<number, number>;
    tail: readonly OfficeEmbeddedImage[];
    fast: boolean;
    embed: (texts: string[]) => Promise<number[][]>;
  },
): Promise<LateFigureResult> {
  const late = await attachOfficeFigures([...input.basePages], [...input.tail], {
    fast: input.fast,
    deadlineMs: Date.now() + 240_000,
  });
  let updatedPages = 0;
  const indices = [...new Set(input.tail.map((image) => image.pageIndex))];
  for (const index of indices) {
    const text = late.pages[index] ?? "";
    const pageNumber = input.pageNumberOf.get(index);
    if (!pageNumber || text === (input.basePages[index] ?? "")) continue;
    try {
      const { data: page } = await service
        .from("document_pages")
        .update({ text_content: text.slice(0, 200_000), clean_text: null })
        .eq("document_id", input.documentId)
        .eq("page_number", pageNumber)
        .select("id")
        .maybeSingle();
      if (!page) continue;
      await service.from("document_chunks").delete().eq("document_id", input.documentId).eq("page_id", page.id);
      const chunks = chunkText(text);
      const vectors = chunks.length ? await input.embed(chunks) : [];
      for (const [i, content] of chunks.entries()) {
        const { data: inserted } = await service
          .from("document_chunks")
          .insert({
            document_id: input.documentId,
            page_id: page.id,
            // Kurulumda parçalar sırayla (0, 1, 2 …) numaralanır; geç gelen sayfa PDF düzeniyle (sayfa × 10.000) ayrışır.
            chunk_index: pageNumber * 10_000 + i,
            content,
            token_count: Math.ceil(content.length / 4),
          })
          .select("id")
          .single();
        const vector = vectors[i];
        if (inserted && vector) {
          await service.from("document_embeddings").insert({ chunk_id: inserted.id, embedding: vector as unknown as string });
        }
      }
      updatedPages += 1;
    } catch (error) {
      console.error("office_late_figure_page_failed", {
        documentId: input.documentId,
        pageNumber,
        cause: error instanceof Error ? error.message.slice(0, 160) : "unknown",
      });
    }
  }
  return { readCount: late.readCount, updatedPages, usage: late.usage, blocked: late.blocked };
}
