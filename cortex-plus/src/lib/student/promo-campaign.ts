import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { PromoCampaign } from "@/components/paywall/promo-banner";

/**
 * Yayındaki kampanyayı okur.
 *
 * Tarih penceresi burada da kontrol ediliyor; satır güvenliği kuralı zaten
 * süzüyor ama servis anahtarıyla yapılan çağrılar o kuralı atlıyor ve süresi
 * geçmiş bir kampanya sessizce görünmeye devam edebilirdi.
 */
export async function loadPromoCampaign(
  supabase: SupabaseClient,
): Promise<PromoCampaign | null> {
  const now = new Date().toISOString();

  const { data } = await supabase
    .from("promo_campaigns")
    .select("title, description, href, ends_at")
    .eq("active", true)
    .lte("starts_at", now)
    .gt("ends_at", now)
    .order("ends_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) return null;

  return {
    title: data.title,
    description: data.description,
    href: data.href,
    endsAt: data.ends_at,
  };
}
