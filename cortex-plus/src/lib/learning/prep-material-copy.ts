import { PHOTO_PAGE_LIMITS } from "@/lib/billing/entitlements";

/** Yalnızca fotoğraf ve metin katmanı olmayan PDF sayfalarının aylık kotası. */
export function freeMaterialLimitLine(): string {
  return `Aylık fotoğraf ve taranmış PDF hakkı: ${PHOTO_PAGE_LIMITS.free} sayfa. Metin katmanı olan PDF'ler bu kotaya girmez. Plus'ta ${PHOTO_PAGE_LIMITS.plus} sayfa.`;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** Dosya satırı: adın altında boyut ve sayfa. Bilinmeyen parça yazılmaz. */
export function materialDetailLine(input: {
  sizeBytes?: number | null;
  pageCount?: number | null;
}): string {
  const parts: string[] = [];
  if (typeof input.sizeBytes === "number" && input.sizeBytes > 0) {
    parts.push(formatBytes(input.sizeBytes));
  }
  if (typeof input.pageCount === "number" && input.pageCount > 0) {
    parts.push(input.pageCount === 1 ? "1 sayfa" : `${input.pageCount} sayfa`);
  }
  return parts.join(" · ");
}
