import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getUnitContent } from "@/lib/content-pool/pool";
import { openaiLlm } from "@/lib/content-pool/generate";
import { supabasePoolStore } from "@/lib/content-pool/supabase-store";
import { readFillConfig, sharedContentSpent } from "@/lib/content-pool/fill-server";
import type { EnsureUnit } from "@/lib/content-pool/serve";

/**
 * Havuzda henüz doğrulanmış dersi olmayan ünite (2 Kasım 2026): öğrenci açınca paylaşımlı üretim. Doldurucuyla aynı
 * üretim + doğrulama hattı, maliyet SHARED_CONTENT kodlarıyla yazılır, öğrenciye kredi düşmez; doğrulanan içerik
 * havuza girer ve sonraki herkes model çağrısı olmadan alır. Ortak tavan dolduysa ya da aynı ünite başka istekte
 * üretiliyorsa null (bugünkü yol).
 */
export function sharedUnitEnsurer(service: SupabaseClient, userId: string): EnsureUnit {
  return async (unit) => {
    const [spent, config] = await Promise.all([sharedContentSpent(service), readFillConfig(service)]);
    if (spent + config.unitEstimateUsd > config.capUsd) return null;
    const result = await getUnitContent(unit.unitId, { store: supabasePoolStore(service), llm: openaiLlm(), userId });
    console.info("pool_shared_generate", { unit: unit.unitId, status: result.status });
    return result.status === "hit" || result.status === "generated" ? result.content.lesson : null;
  };
}
