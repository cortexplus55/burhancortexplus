import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isAdminUser } from "@/lib/auth/roles";
import { FREE_DAILY_ALLOWANCE, type WalletPeriod } from "@/lib/credits/period";

/**
 * Yönetici "ücretsiz gibi gör" önizlemesi (8 Ekim 2026, ürün sahibinin
 * kararı). Kurucu hesabı yönetici olduğu için ücretsiz katman (#249) canlıda
 * hiç denenemiyordu; test hesabı da açılamıyor.
 *
 * Önizleme açıkken yönetici ücretsiz bir hesap gibi sınırlanır:
 *   - kredi: `credit_reserve` cüzdana dokunmadan günlük ayrı bir hak düşer
 *     (`admin_free_preview` tablosu, göç 20261008100000);
 *   - belge ve hazırlık sınırı yalnız `startedAt`'tan sonra eklenenleri
 *     sayar — eski belgeler yeni bir ücretsiz hesabın hakkını yemesin;
 *   - arayüz ücretsiz kromu gösterir, kurucu rozeti gizlenir.
 * Hız sınırı, yönetim paneli ve hata ayrıntısı gibi yönetici araçları
 * değişmez.
 */
export type FreePreview = {
  startedAt: string;
  remaining: number;
  periodEndsAt: string;
};

const cache = new WeakMap<object, Map<string, Promise<FreePreview | null>>>();

async function readPreview(service: SupabaseClient, userId: string): Promise<FreePreview | null> {
  if (!(await isAdminUser(service, userId))) return null;
  // Okuma düşerse önizleme yok sayılır: yönetici bugünkü gibi muaf kalır.
  try {
    const { data, error } = await service
      .from("admin_free_preview")
      .select("started_at, remaining, period_ends_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (error || typeof data?.started_at !== "string" || typeof data.period_ends_at !== "string") return null;
    return {
      startedAt: data.started_at,
      remaining: Number(data.remaining ?? 0),
      periodEndsAt: data.period_ends_at,
    };
  } catch {
    return null;
  }
}

/** Yöneticinin açık önizlemesi; yönetici değilse ya da kapalıysa null. İstek başına önbellekli. */
export function freePreview(service: SupabaseClient, userId: string): Promise<FreePreview | null> {
  let byUser = cache.get(service);
  if (!byUser) {
    byUser = new Map();
    cache.set(service, byUser);
  }
  const hit = byUser.get(userId);
  if (hit) return hit;
  const pending = readPreview(service, userId);
  byUser.set(userId, pending);
  return pending;
}

/** Sınırlardan muaf mı: yönetici ve önizleme kapalı. */
export async function billingExempt(service: SupabaseClient, userId: string): Promise<boolean> {
  if (!(await isAdminUser(service, userId))) return false;
  return !(await freePreview(service, userId));
}

/** Önizlemenin bugünkü hakkı; gün geçmişse SQL'in yapacağı gibi yeniden dolu. */
export function previewAllowanceLeft(preview: FreePreview, now = Date.now()): number {
  return new Date(preview.periodEndsAt).getTime() <= now ? FREE_DAILY_ALLOWANCE : preview.remaining;
}

/** Arayüzün kota görünümü için ücretsiz cüzdan şekli. */
export function previewWallet(preview: FreePreview): WalletPeriod {
  return {
    free_allowance_remaining: preview.remaining,
    period_allowance: FREE_DAILY_ALLOWANCE,
    period_ends_at: preview.periodEndsAt,
    period_kind: "daily",
  };
}
