import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PHOTO_PAGE_LIMITS,
  planTier as resolvePlanTier,
  type PlanTier,
} from "@/lib/billing/entitlements";
import { requireAdminCheck, AdminCheckError } from "@/lib/auth/roles";
import { PDF_MAX_BYTES } from "@/lib/documents/store-upload";
import { STORAGE_CAP_FREE, STORAGE_CAP_PREMIUM } from "@/lib/documents/storage-quota";
import { PREP_SOURCE_DOCUMENT_CAP } from "@/lib/learning/prep-topic-list";
import { MAX_SCAN_PAGES } from "@/lib/documents/render-pdf-pages";

export type DocumentLimits = {
  unlimited: boolean;
  tier: PlanTier;
  scanPagesPerMonth: number | null;
  scanPagesUsed: number;
  scanPagesRemaining: number | null;
  maxPdfBytes: number;
  maxOtherBytes: number;
  storageCapBytes: number;
  prepSourceDocumentCap: number | null;
  maxScanPagesPerRequest: number | null;
};

/**
 * Single gate for page/size/quota limits. Admins are unlimited; everyone
 * else reads the same PHOTO_PAGE_LIMITS / storage caps.
 *
 * Throws `AdminCheckError` when the admin RPC fails after retry so the UI
 * can show "Hesap yetkisi doğrulanamadı" instead of free-tier copy.
 */
export async function getDocumentLimits(
  service: SupabaseClient,
  userId: string,
): Promise<DocumentLimits> {
  let unlimited = false;
  try {
    unlimited = await requireAdminCheck(service, userId);
  } catch (error) {
    if (error instanceof AdminCheckError) throw error;
    throw new AdminCheckError();
  }

  const tier = unlimited ? ("sigma" as PlanTier) : await resolvePlanTier(service, userId);
  const scanPagesPerMonth = unlimited ? null : PHOTO_PAGE_LIMITS[tier];

  let scanPagesUsed = 0;
  if (!unlimited) {
    const { data } = await service
      .from("document_page_grants")
      .select("used, period_start")
      .eq("user_id", userId)
      .maybeSingle();
    const grant = data as { used?: number; period_start?: string } | null;
    const period = `${new Date().getUTCFullYear()}-${String(new Date().getUTCMonth() + 1).padStart(2, "0")}-01`;
    scanPagesUsed =
      grant?.period_start === period ? Math.max(0, Number(grant.used ?? 0)) : 0;
  }

  const remaining =
    scanPagesPerMonth == null
      ? null
      : Math.max(0, scanPagesPerMonth - scanPagesUsed);

  return {
    unlimited,
    tier,
    scanPagesPerMonth,
    scanPagesUsed,
    scanPagesRemaining: remaining,
    maxPdfBytes: unlimited ? Number.MAX_SAFE_INTEGER : PDF_MAX_BYTES,
    maxOtherBytes: unlimited ? Number.MAX_SAFE_INTEGER : 15 * 1024 * 1024,
    storageCapBytes: unlimited
      ? Number.MAX_SAFE_INTEGER
      : tier === "free"
        ? STORAGE_CAP_FREE
        : STORAGE_CAP_PREMIUM,
    prepSourceDocumentCap: unlimited ? null : PREP_SOURCE_DOCUMENT_CAP,
    maxScanPagesPerRequest: unlimited ? null : MAX_SCAN_PAGES,
  };
}
