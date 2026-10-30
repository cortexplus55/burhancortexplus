import "server-only";

import {
  appendFigureTranscript,
  extractImageText,
  mergeUsage,
  type ModelUsage,
} from "@/lib/documents/extract-image-text";
import type { OfficeEmbeddedImage } from "@/lib/documents/extract-office-text";

/**
 * Aynı anda okunan gömülü resim (31 Ekim 2026). Önce resimler tek tek ve sırayla okunuyordu: 40 resimli bir sunu
 * resim başına 15-20 sn ile ~10 dk sürer, 300 sn'lik işlev sınırını aşıp düşerdi. Taranmış PDF havuzuyla aynı ölçek.
 */
export const OFFICE_FIGURE_CONCURRENCY = 12;

/**
 * Gömülü resimleri luna ile okuyup ait oldukları sayfanın metnine ekler.
 * Kota ve tarama ücreti çağırandadır: burası yalnız okur. Okumalar paralel; ekler sayfaya resmin belgedeki
 * sırasıyla girer (paralel okuma sırayı bozmaz).
 */
export async function attachOfficeFigures(
  pages: string[],
  images: OfficeEmbeddedImage[],
  options?: {
    deadlineMs?: number;
    /** Hızlı işlem (`fastAllowedFor`): yalnız Plus/Sigma ve kurucu. */
    fast?: boolean;
    concurrency?: number;
  },
): Promise<{ pages: string[]; usage: ModelUsage[]; readCount: number; blocked: boolean }> {
  const next = pages.slice();
  const transcripts: (string | null)[] = images.map(() => null);
  let usage: ModelUsage[] = [];
  let blocked = false;
  let cursor = 0;
  const lane = async () => {
    for (;;) {
      const index = cursor;
      cursor += 1;
      if (index >= images.length) return;
      const image = images[index]!;
      // Son tarihe yaklaşıldıysa yeni okuma başlamaz; okunmayan resmin kotası çağıranda geri verilir.
      if (options?.deadlineMs && Date.now() > options.deadlineMs - 20_000) continue;
      const read = await extractImageText(Buffer.from(image.bytes), image.mimeType, {
        deadlineMs: options?.deadlineMs,
        scanOrdinal: index + 1,
        purpose: "figure",
        // Slaydın/sayfanın metni zaten XML'den geldi: resim okuması onu tekrarlamasın (29 Ekim 2026).
        textLayer: pages[image.pageIndex] ?? null,
        fast: options?.fast === true,
      });
      usage = mergeUsage(usage, read.usage);
      if (read.reason === "blocked") {
        blocked = true;
        continue;
      }
      transcripts[index] = read.ok ? read.pages[0] ?? null : null;
    }
  };
  const lanes = Math.max(1, Math.min(options?.concurrency ?? OFFICE_FIGURE_CONCURRENCY, images.length));
  await Promise.all(Array.from({ length: lanes }, lane));
  let readCount = 0;
  images.forEach((image, index) => {
    const transcript = transcripts[index];
    if (!transcript || next[image.pageIndex] == null) return;
    next[image.pageIndex] = appendFigureTranscript(next[image.pageIndex]!, transcript);
    readCount += 1;
  });
  return { pages: next, usage, readCount, blocked };
}
