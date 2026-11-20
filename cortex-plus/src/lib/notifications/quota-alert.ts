import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyInAppMany } from "@/lib/notifications/in-app";
import { loadPreferencesMap } from "@/lib/notifications/preferences";
import { missingRelation } from "@/lib/learning/missing-column";

/**
 * Hakkın %80 bildirimi (Faz 6, 20 Kasım 2026). Kredi servisine dokunmaz: 30 dakikalık cron cüzdanları yalnız okur ve
 * eşiği geçen öğrenciye dönem başına bir kez uygulama içi bildirim yazar (tekillik `quota_80:<dönem sonu>`). Gecikme en
 * çok yarım saat; istek yolunda ek sorgu yok. Ayrı dosyada: ağır öğrenme modüllerini içe aktarmasın.
 */

/** Dönem hakkının %80'i kullanıldıysa. Saf: eşik kararı. 100 krediden küçük dönem (ücretsiz) sayılmaz. */
export const QUOTA_ALERT_RATIO = 0.8;

export function quotaCrossed(wallet: { period_allowance: number | null; free_allowance_remaining: number | null }): boolean {
  const allowance = Number(wallet.period_allowance ?? 0);
  const remaining = Number(wallet.free_allowance_remaining ?? 0);
  if (!Number.isFinite(allowance) || allowance < 100) return false;
  return (allowance - Math.max(0, Math.min(remaining, allowance))) / allowance >= QUOTA_ALERT_RATIO;
}

type WalletRow = { user_id: string; period_allowance: number | null; free_allowance_remaining: number | null; period_ends_at: string | null };

export const QUOTA_ALERT = {
  title: "Çalışma havuzunun %80'ini kullandın",
  body: "Bu dönemki hakkının büyük kısmını kullandın; tekrarların 0 kredi! Kayıtlı derslerini ve günü gelen tekrarlarını açmak hakkından düşmez.",
  actionUrl: "/krediler",
} as const;

export function quotaDedupeKey(periodEndsAt: string | null | undefined): string {
  return `quota_80:${String(periodEndsAt ?? "").slice(0, 10) || "donem"}`;
}

export type QuotaSweep = { checked: number; crossed: number; written: number } | "no_table" | "failed";

/**
 * Süpürme: süresi dolmamış, 100+ kredilik dönemi olan cüzdanlar 1000'erli okunur. Yeni bildirim tablosu yoksa (göçten önce)
 * hiç yazılmaz: eski tabloda tekillik tutulamaz, her turda aynı bildirim yeniden yazılırdı. Tercih okunamazsa yazılmaz.
 */
export async function sweepQuotaAlerts(service: SupabaseClient, options: { now: Date; deadline: number }): Promise<QuotaSweep> {
  try {
    const probe = await service.from("in_app_notifications").select("id", { head: true, count: "exact" }).limit(1);
    if (probe.error) return missingRelation(probe.error) ? "no_table" : "failed";
    let checked = 0;
    let crossedCount = 0;
    let written = 0;
    for (let from = 0; Date.now() < options.deadline; from += 1000) {
      const { data, error } = await service
        .from("credit_wallets")
        .select("user_id, period_allowance, free_allowance_remaining, period_ends_at")
        .gte("period_allowance", 100)
        .gt("period_ends_at", options.now.toISOString())
        .order("user_id")
        .range(from, from + 999);
      if (error) {
        console.error("quota_sweep_read_failed", { error: error.message });
        return checked ? { checked, crossed: crossedCount, written } : "failed";
      }
      const rows = (data ?? []) as WalletRow[];
      checked += rows.length;
      const crossed = rows.filter(quotaCrossed);
      crossedCount += crossed.length;
      if (crossed.length) {
        const preferences = await loadPreferencesMap(service, crossed.map((row) => row.user_id));
        if (preferences) {
          const allowed = crossed.filter((row) => preferences.get(row.user_id)?.inAppNotifications !== false);
          written += await notifyInAppMany(
            service,
            allowed.map((row) => ({ userId: row.user_id, kind: "quota_80_pct" as const, ...QUOTA_ALERT, dedupeKey: quotaDedupeKey(row.period_ends_at) })),
          );
        }
      }
      if (rows.length < 1000) break;
    }
    return { checked, crossed: crossedCount, written };
  } catch (error) {
    console.error("quota_sweep_failed", { error: String(error) });
    return "failed";
  }
}
