import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Fotoğraf sayfası kotası — kredinin yanında, ondan ayrı.
 *
 * Kredi bu işi frenlemiyor: bir belge 2 kredi, Plus'ın 400 kredisi 200 belge
 * eder ve hepsi fotoğraf olabilir. Asıl mesele de maliyet değil — fotoğraf
 * tek tek çekilen bir şey; yüzlercesi bir öğrencinin çalışması değildir.
 *
 * Sayılar ürün sahibinin kararı (18 Eylül 2026). Ücretsiz taraf bilerek dar:
 * iki fotoğraf ürünü görmeye yeter, üçüncüsü abonelik konusudur.
 */
export const PHOTO_PAGE_LIMITS = {
  free: 2,
  plus: 300,
  sigma: 1000,
} as const;

export type PlanTier = keyof typeof PHOTO_PAGE_LIMITS;

/**
 * Kullanıcının kademesi.
 *
 * `is_premium` yetmiyor: Plus ile Sigma'nın kotası farklı. Tanınmayan bir
 * kademe `plus` sayılıyor — abone olduğu kesin olan bir öğrenciyi ücretsiz
 * kotaya düşürmek, ödediği şeyi geri almak olurdu.
 */
export async function planTier(
  service: SupabaseClient,
  userId: string,
): Promise<PlanTier> {
  const { data } = await service
    .from("subscriptions")
    .select("status, current_period_end, plans(is_premium, tier)")
    .eq("user_id", userId)
    .eq("status", "active")
    .maybeSingle();

  if (data?.current_period_end) {
    const end = new Date(data.current_period_end);
    if (!Number.isNaN(end.getTime()) && end.getTime() <= Date.now()) return "free";
  }

  const plan = data?.plans as { is_premium?: boolean; tier?: string } | null;
  if (!plan?.is_premium) return "free";
  return plan.tier === "sigma" ? "sigma" : "plus";
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
