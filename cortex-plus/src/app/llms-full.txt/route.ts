import { loadPublicPlanOffers } from "@/lib/billing/public-plan-offers";
import { buildLlmsFullTxt } from "@/lib/seo/llms-full";
import { createPublicReadClient } from "@/lib/supabase/public-read";

/**
 * `https://cortexplus.app/llms-full.txt` (27 Kasım 2026, GEO): bütün sınavlar, dersler, rehberler, özellikler, paketler
 * ve müfredat programları tek düz metinde. İçerik `buildLlmsFullTxt`'te; fiyatlar `/llms.txt` ile aynı okumadan ve aynı
 * tazelik süresiyle (5 dakika). Okuma düşerse fiyat yazılmaz.
 */
export const revalidate = 300;

export async function GET() {
  const offers = await loadPublicPlanOffers(createPublicReadClient());
  return new Response(buildLlmsFullTxt(offers), {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
