import { loadPublicPlanOffers } from "@/lib/billing/public-plan-offers";
import { buildLlmsTxt } from "@/lib/seo/llms-txt";
import { createPublicReadClient } from "@/lib/supabase/public-read";

/**
 * `https://cortexplus.app/llms.txt` (27 Kasım 2026, GEO): girişsiz, düz metin (Markdown). İçerik `buildLlmsTxt`'te;
 * paket fiyatları ana sayfayla aynı okumadan ve aynı tazelik süresiyle (5 dakika). Okuma düşerse fiyat yazılmaz.
 */
export const revalidate = 300;

export async function GET() {
  const offers = await loadPublicPlanOffers(createPublicReadClient());
  return new Response(buildLlmsTxt(offers), {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
