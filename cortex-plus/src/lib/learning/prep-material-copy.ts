import { PHOTO_PAGE_LIMITS, type PlanTier } from "@/lib/billing/entitlements";

export type MaterialLimitLineInput = {
  isAdmin?: boolean;
  tier?: PlanTier | string;
  remaining?: number | null;
};

/** Yalnızca fotoğraf ve metin katmanı olmayan PDF sayfalarının aylık kotası. */
export function freeMaterialLimitLine(input?: MaterialLimitLineInput): string | null {
  if (input?.isAdmin) return null;
  const tierRaw = input?.tier ?? "free";
  const tier: PlanTier =
    tierRaw === "plus" || tierRaw === "sigma" ? tierRaw : "free";
  const cap = PHOTO_PAGE_LIMITS[tier];
  const remaining =
    typeof input?.remaining === "number" && input.remaining >= 0
      ? input.remaining
      : null;

  const remainingBit =
    remaining != null ? ` Kalan: ${remaining} sayfa.` : "";

  if (tier === "plus") {
    return `Aylık taranmış PDF hakkı: ${cap} sayfa.${remainingBit} Metin katmanı olan PDF'ler bu kotaya girmez.`;
  }
  if (tier === "sigma") {
    return `Aylık taranmış PDF hakkı: ${cap} sayfa.${remainingBit} Metin katmanı olan PDF'ler bu kotaya girmez.`;
  }
  return `Aylık fotoğraf ve taranmış PDF hakkı: ${cap} sayfa.${remainingBit} Metin katmanı olan PDF'ler bu kotaya girmez. Plus'ta ${PHOTO_PAGE_LIMITS.plus} sayfa.`;
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
