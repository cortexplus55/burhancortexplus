import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PDF_LEARNING_V2_FLAG = "pdf_learning_v2";

/**
 * Runtime feature flag reader. Missing rows and DB errors count as disabled
 * so production stays on the legacy path until an admin explicitly enables.
 */
export async function isFeatureEnabled(
  service: SupabaseClient,
  key: string,
): Promise<boolean> {
  const { data, error } = await service
    .from("feature_flags")
    .select("enabled")
    .eq("key", key)
    .maybeSingle();

  if (error || !data) return false;
  return Boolean(data.enabled);
}
