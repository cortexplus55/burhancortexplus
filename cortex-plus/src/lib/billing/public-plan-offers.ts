import type { SupabaseClient } from "@supabase/supabase-js";
import { STORE_PRODUCTS, storeOffersFromPlans, type StorePlanOffer } from "@/lib/billing/store-products";

/**
 * Herkese açık abonelik planları ve canlı fiyatları (27 Kasım 2026, GEO): yapılandırılmış verideki `Offer` listesi ve
 * `/llms.txt` buradan okur. Plan adları (Sınav Haftası, Plus, Sigma) ve dönemleri tek listeden (`STORE_PRODUCTS`, ödeme
 * ekranlarıyla aynı), fiyat `plans` tablosundan (kuruş). Okuma düşerse boş liste: fiyat uydurulmaz, eski fiyat yazılmaz.
 */
export type PublicPlanOffer = StorePlanOffer;

export async function loadPublicPlanOffers(supabase: SupabaseClient): Promise<PublicPlanOffer[]> {
  try {
    const { data, error } = await supabase
      .from("plans")
      .select("slug, price_try, description, active")
      .eq("active", true)
      .in(
        "slug",
        STORE_PRODUCTS.map((product) => product.slug),
      );
    if (error) return [];
    return storeOffersFromPlans(data);
  } catch {
    return [];
  }
}

/** Ana sayfanın Plus kartları için iki fiyat (kuruş), aynı okumadan. */
export function plusPricesFromOffers(offers: readonly PublicPlanOffer[]): {
  plusMonthly: number | null;
  plusWeekly: number | null;
} {
  const price = (slug: string) => offers.find((offer) => offer.slug === slug)?.priceKurus ?? null;
  return { plusMonthly: price("plus-aylik"), plusWeekly: price("plus-haftalik") };
}
