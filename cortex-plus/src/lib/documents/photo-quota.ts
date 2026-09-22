import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  PHOTO_PAGE_LIMITS,
  planTier as resolvePlanTier,
  type PlanTier,
} from "@/lib/billing/entitlements";

export { PHOTO_PAGE_LIMITS, type PlanTier };

/**
 * Fotoğraf sayfası kotası — kredinin yanında, ondan ayrı.
 *
 * Kredi bu işi frenlemiyor: bir belge 2 kredi, Plus'ın 400 kredisi 200 belge
 * eder ve hepsi fotoğraf olabilir. Asıl mesele de maliyet değil — fotoğraf
 * tek tek çekilen bir şey; yüzlercesi bir öğrencinin çalışması değildir.
 *
 * Sayılar ürün sahibinin kararı (18 Eylül 2026). Ücretsiz taraf bilerek dar:
 * iki fotoğraf ürünü görmeye yeter, üçüncüsü abonelik konusudur.
 *
 * Kademe kararı `@/lib/billing/entitlements` üzerinden — tek kaynak.
 */

export async function planTier(
  service: SupabaseClient,
  userId: string,
): Promise<PlanTier> {
  return resolvePlanTier(service, userId);
}

export function photoPageLimit(tier: PlanTier): number {
  return PHOTO_PAGE_LIMITS[tier];
}

/**
 * Bu ay `pages` kadar fotoğraf sayfası hakkı ister.
 *
 * Hata hâlinde `false` — kapalıya düşüyor. Sayacın çalışmadığı bir anda
 * sınırsız fotoğraf okumak, ölçmediğimiz bir maliyeti açık bırakmak olurdu;
 * öğrenci bu durumda anlaşılır bir hata görüyor, sessiz bir bedava yol
 * açılmıyor.
 */
export async function claimPhotoPages(
  service: SupabaseClient,
  userId: string,
  pages: number,
  tier: PlanTier,
): Promise<boolean> {
  const { data, error } = await service.rpc("claim_document_pages", {
    p_user_id: userId,
    p_pages: pages,
    p_limit: photoPageLimit(tier),
  });
  if (error) return false;
  return data === true;
}

/** Okuma düştüğünde hakkı geri verir — okunamayan fotoğraf kota yakmamalı. */
export async function releasePhotoPages(
  service: SupabaseClient,
  userId: string,
  pages: number,
): Promise<void> {
  await service.rpc("release_document_pages", {
    p_user_id: userId,
    p_pages: pages,
  });
}
