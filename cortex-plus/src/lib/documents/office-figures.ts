import "server-only";

import {
  appendFigureTranscript,
  extractImageText,
  mergeUsage,
  type ModelUsage,
} from "@/lib/documents/extract-image-text";
import type { OfficeEmbeddedImage } from "@/lib/documents/extract-office-text";

/**
 * Gömülü resimleri luna ile okuyup ait oldukları sayfanın metnine ekler.
 * Kota ve tarama ücreti çağırandadır: burası yalnız okur.
 */
export async function attachOfficeFigures(
  pages: string[],
  images: OfficeEmbeddedImage[],
  options?: { deadlineMs?: number },
): Promise<{ pages: string[]; usage: ModelUsage[]; readCount: number; blocked: boolean }> {
  const next = pages.slice();
  let usage: ModelUsage[] = [];
  let readCount = 0;
  let blocked = false;
  for (let index = 0; index < images.length; index += 1) {
    const image = images[index]!;
    const read = await extractImageText(Buffer.from(image.bytes), image.mimeType, {
      deadlineMs: options?.deadlineMs,
      scanOrdinal: index + 1,
      purpose: "figure",
      // Slaydın/sayfanın metni zaten XML'den geldi: resim okuması onu tekrarlamasın (29 Ekim 2026).
      textLayer: next[image.pageIndex] ?? null,
    });
    usage = mergeUsage(usage, read.usage);
    if (read.reason === "blocked") {
      blocked = true;
      continue;
    }
    const transcript = read.ok ? read.pages[0] : null;
    if (!transcript || next[image.pageIndex] == null) continue;
    next[image.pageIndex] = appendFigureTranscript(next[image.pageIndex]!, transcript);
    readCount += 1;
  }
  return { pages: next, usage, readCount, blocked };
}
