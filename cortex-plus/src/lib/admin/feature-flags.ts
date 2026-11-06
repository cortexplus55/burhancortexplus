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
/**
 * Günü gelen tekrar (20 Ekim 2026): yanlış soru ve dersin sınav noktası 1-3-7-14 gün sonra; hazırlık
 * sayfasında "Bugün N tekrar". Kapalıyken yeni tekrar yazılmaz, kart ve hatırlatma görünmez.
 */
export const SPACED_REVIEW_FLAG = "spaced_review";

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

/** Önbellekteki bir anahtarın satırı; `row: null` = satır yok (kapalı, bilinen). */
type CachedFlag = { row: FlagRow | null; at: number };

/** Süreç başına önbellek süresi (6 Kasım 2026, hız paketi): her sayfa ve istek aynı anahtarı yeniden okumasın. */
export const FEATURE_FLAG_CACHE_TTL_MS = 30_000;
const UNKNOWN_WARN_INTERVAL_MS = 60_000;

const flagCache = new Map<string, CachedFlag>();
const unknownWarnedAt = new Map<string, number>();
/**
 * Testte önbellek kapalı: birim testleri aynı anahtarı farklı sahte istemcilerle okur ve süreç
 * ortak; açık önbellek bir testin satırını öbürüne taşırdı. Önbelleği sınayan test açıkça açar.
 */
let cacheInTests = false;

function cacheActive(): boolean {
  return cacheInTests || !process.env.VITEST;
}

/** Yalnız testler için: önbelleği ve uyarı saatini sıfırlar; `cache: true` önbelleği testte de açar. */
export function resetFeatureFlagCacheForTests(options: { cache?: boolean } = {}): void {
  flagCache.clear();
  unknownWarnedAt.clear();
  cacheInTests = Boolean(options.cache);
}

function decide(row: FlagRow | null, userId?: string | null): boolean {
  if (!row) return false;
  if (Boolean(row.enabled)) return true;
  if (userId && pilotUserIds(row.metadata).includes(userId)) return true;
  return false;
}

/**
 * Runtime feature flag reader. Missing rows count as disabled so production
 * stays on the legacy path until an admin explicitly enables.
 *
 * Pilot: when `metadata.pilot_user_ids` includes `userId`, the flag is treated
 * as enabled for that user even if global `enabled` is false.
 *
 * Önbellek (6 Kasım 2026): satır süreç başına 30 sn tutulur (anahtara göre; pilot kararı her çağrıda).
 * "Bilinmiyor" ile "kapalı" ayrıdır: okuma hata verirse son bilinen satır kullanılır (süresi geçmiş
 * olsa da); hiç bilinmiyorsa eskisi gibi kapalı sayılır ve dakikada en çok bir kez
 * `feature_flag_unknown` yazılır.
 */
export async function isFeatureEnabled(
  service: SupabaseClient,
  key: string,
  userId?: string | null,
): Promise<boolean> {
  const useCache = cacheActive();
  const now = Date.now();
  const cached = useCache ? flagCache.get(key) : undefined;
  if (cached && now - cached.at < FEATURE_FLAG_CACHE_TTL_MS) return decide(cached.row, userId);

  let data: unknown = null;
  let error: unknown = null;
  try {
    const read = await service
      .from("feature_flags")
      .select("enabled, metadata")
      .eq("key", key)
      .maybeSingle();
    data = read.data;
    error = read.error;
  } catch (thrown) {
    error = thrown ?? new Error("feature_flag_read_failed");
  }

  if (error) {
    if (cached) return decide(cached.row, userId);
    const warned = unknownWarnedAt.get(key);
    if (warned === undefined || now - warned >= UNKNOWN_WARN_INTERVAL_MS) {
      unknownWarnedAt.set(key, now);
      console.warn("feature_flag_unknown", { key });
    }
    return false;
  }

  const row = (data as FlagRow | null) ?? null;
  if (useCache) flagCache.set(key, { row, at: now });
  return decide(row, userId);
}
