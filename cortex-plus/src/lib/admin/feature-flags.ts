import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export const PDF_LEARNING_V2_FLAG = "pdf_learning_v2";

/** Adaptive Learning Engine — LearningGovernor + Student State autopilot. */
export const ADAPTIVE_LEARNING_FLAG = "adaptive_learning_enabled";
/** TypeSafe Jev decision engine (fallback still runs when off/unavailable). */
export const JEV_ENABLED_FLAG = "jev_enabled";
/** Limited daily plan adaptation under policy. */
export const ADAPTIVE_DAILY_REPLAN_FLAG = "adaptive_daily_replan_enabled";
/** TutorModelRouter gpt-4o escalation path. */
export const ADAPTIVE_MODEL_ROUTER_FLAG = "adaptive_model_router_enabled";

type FlagRow = {
  enabled: boolean;
  metadata?: unknown;
};

function pilotUserIds(metadata: unknown): string[] {
  if (!metadata || typeof metadata !== "object") return [];
  const raw = (metadata as { pilot_user_ids?: unknown }).pilot_user_ids;
  if (!Array.isArray(raw)) return [];
  return raw.map((id) => String(id)).filter(Boolean);
}

/**
 * Runtime feature flag reader. Missing rows and DB errors count as disabled
 * so production stays on the legacy path until an admin explicitly enables.
 *
 * Pilot: when `metadata.pilot_user_ids` includes `userId`, the flag is treated
 * as enabled for that user even if global `enabled` is false.
 */
export async function isFeatureEnabled(
  service: SupabaseClient,
  key: string,
  userId?: string | null,
): Promise<boolean> {
  const { data, error } = await service
    .from("feature_flags")
    .select("enabled, metadata")
    .eq("key", key)
    .maybeSingle();

  if (error || !data) return false;
  const row = data as FlagRow;
  if (Boolean(row.enabled)) return true;
  if (userId && pilotUserIds(row.metadata).includes(userId)) return true;
  return false;
}
