import "server-only";
import type { RenderedPdfPage } from "@/lib/documents/render-pdf-pages";
import { PHOTO_SET_PRODUCER, pdfString } from "@/lib/documents/photo-set-pdf";

/**
 * Fotoğraf seti PDF'inin sunucu tarafı (31 Ekim 2026). Taranmış PDF'te en yavaş adım sayfayı çizmekti (Paket B:
 * 20 sayfa 12 sn, tek çekirdek). Bizim yazdığımız fotoğraf setinde her sayfa zaten tek bir JPEG: çizmeden, gömülü
 * resim doğrudan okumaya gider. Yalnız kendi biçimimizi tanırız; biçim tutmazsa boş döner ve sayfa eskisi gibi çizilir.
 */

/** Bu PDF bizim fotoğraf setimiz mi (üretici damgası, dosyanın başında). */
export function isPhotoSetPdf(buffer: Uint8Array): boolean {
  const head = Buffer.from(buffer.buffer, buffer.byteOffset, Math.min(buffer.byteLength, 4096)).toString("latin1");
  return head.includes(`/Producer ${pdfString(PHOTO_SET_PRODUCER)}`);
}

/** Fotoğraf setinin sayfa JPEG'leri, sayfa numarasıyla (1'den), [firstPage, firstPage + count) aralığında. */
export function photoSetPages(
  buffer: Uint8Array,
  firstPage = 1,
  count = Number.MAX_SAFE_INTEGER,
): { pageNumber: number; jpeg: Buffer }[] {
  const bytes = Buffer.from(buffer.buffer, buffer.byteOffset, buffer.byteLength);
  const text = bytes.toString("latin1");
  const out: { pageNumber: number; jpeg: Buffer }[] = [];
  const marker = /\/CortexPage (\d+) >>\nstream\n/g;
  for (let match = marker.exec(text); match; match = marker.exec(text)) {
    const pageNumber = Number(match[1]);
    if (pageNumber < firstPage || pageNumber >= firstPage + count) continue;
    const dict = text.slice(text.lastIndexOf("<<", match.index), match.index);
    const declared = /\/Length (\d+)/.exec(dict);
    if (!declared || !/\/Filter \/DCTDecode/.test(dict)) return [];
    const start = match.index + match[0].length;
    const jpeg = bytes.subarray(start, start + Number(declared[1]));
    // JPEG başı (FFD8) ve sonu (FFD9): kesik ya da bozuk akış sayfayı çizime bırakır.
    if (
      jpeg.length < 4 || jpeg[0] !== 0xff || jpeg[1] !== 0xd8 ||
      jpeg[jpeg.length - 2] !== 0xff || jpeg[jpeg.length - 1] !== 0xd9
    ) {
      return [];
    }
    out.push({ pageNumber, jpeg: Buffer.from(jpeg) });
  }
  return out.sort((a, b) => a.pageNumber - b.pageNumber);
}

/**
 * Okuma hattının beklediği sayfa bilgisi, çizim yerine gömülü JPEG'den. Bir fotoğraf her zaman "mürekkepli" ve resim
 * içerikli sayılır: boş sayfa eleme yalnız çizilmiş sayfada anlamlı; fotoğraf boşsa okuma boş metin döner ve sayfa
 * "okunamadı" olur. Şekil okuması yok (sayfanın kendisi resim, tam okuma alır). Aralığın her sayfası bulunamazsa null.
 */
export function photoSetRenderedPages(
  buffer: Uint8Array,
  firstPage: number,
  count: number,
): RenderedPdfPage[] | null {
  if (count <= 0 || !isPhotoSetPdf(buffer)) return null;
  const pages = photoSetPages(buffer, firstPage, count);
  if (pages.length !== count) return null;
  for (let index = 0; index < count; index += 1) {
    if (pages[index]!.pageNumber !== firstPage + index) return null;
  }
  return pages.map((page) => ({
    image: page.jpeg,
    mime: "image/jpeg" as const,
    inkRatio: 1,
    hasImageContent: true,
    figureGraphics: false,
    vectorOps: 0,
    scanRenderFailed: false,
    pageNumber: page.pageNumber,
  }));
}
