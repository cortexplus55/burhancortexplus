import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type PlusPrices = {
  plusMonthly: number | null;
  plusYearly: number | null;
  plusWeekly: number | null;
};

/**
 * Plus fiyatları (kuruş) veritabanından — ana sayfa, öğrencinin ana ekranı ve ödeme sayfası aynı
 * kaynaktan okur, sayfada eski fiyat kalmasın. Okuma düşerse fiyat yerine boş döner; sayfa düşmez,
 * "günde ₺…" satırı yazılmaz.
 */
export async function loadPlusPrices(supabase: SupabaseClient): Promise<PlusPrices> {
  const empty: PlusPrices = { plusMonthly: null, plusYearly: null, plusWeekly: null };
  try {
    const { data } = await supabase
      .from("plans")
      .select("slug, price_try")
      .eq("active", true)
      .in("slug", ["plus-aylik", "plus-yillik", "plus-haftalik"]);
    const price = (slug: string) => {
      const row = (data ?? []).find((plan) => plan.slug === slug);
      return typeof row?.price_try === "number" ? row.price_try : null;
    };
    return { plusMonthly: price("plus-aylik"), plusYearly: price("plus-yillik"), plusWeekly: price("plus-haftalik") };
  } catch {
    return empty;
  }
}
