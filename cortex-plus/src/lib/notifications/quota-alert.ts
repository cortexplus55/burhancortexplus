import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyInApp, type NotifyOutcome } from "@/lib/notifications/in-app";

/**
 * Hakkın %80 bildirimi (Faz 6, 20 Kasım 2026). Kredi kesinleşince yanıttan sonra çağrılır; yalnız okur, kota kuralına
 * dokunmaz. Ayrı dosyada: kredi servisi ağır öğrenme modüllerini içe aktarmasın.
 */

/** Dönem hakkının %80'i kullanıldıysa (dönem başına bir kez). Saf: eşik kararı. */
export const QUOTA_ALERT_RATIO = 0.8;

export function quotaCrossed(wallet: { period_allowance: number | null; free_allowance_remaining: number | null }): boolean {
  const allowance = Number(wallet.period_allowance ?? 0);
  const remaining = Number(wallet.free_allowance_remaining ?? 0);
  if (!Number.isFinite(allowance) || allowance < 100) return false;
  return (allowance - Math.max(0, Math.min(remaining, allowance))) / allowance >= QUOTA_ALERT_RATIO;
}

/**
 * Kredi kesinleşince çağrılır (yalnız okur, kota kuralına dokunmaz): rezervasyonun sahibinin cüzdanı dönem hakkının %80'ini
 * geçtiyse bir kez bildirim. Ücretsiz hesapta (dönem hakkı yok) çalışmaz.
 */
export async function notifyQuotaIfCrossed(service: SupabaseClient, reservationId: string): Promise<NotifyOutcome | null> {
  try {
    const { data: reservation } = await service.from("credit_reservations").select("user_id").eq("id", reservationId).maybeSingle();
    const userId = reservation?.user_id as string | undefined;
    if (!userId) return null;
    const { data: wallet } = await service
      .from("credit_wallets")
      .select("period_allowance, free_allowance_remaining, period_ends_at")
      .eq("user_id", userId)
      .maybeSingle();
    if (!wallet || !quotaCrossed(wallet as { period_allowance: number; free_allowance_remaining: number })) return null;
    const periodKey = String((wallet as { period_ends_at?: string | null }).period_ends_at ?? "").slice(0, 10) || "donem";
    return notifyInApp(service, {
      userId,
      kind: "quota_80_pct",
      title: "Çalışma havuzunun %80'ini kullandın",
      body: "Bu dönemki hakkının büyük kısmını kullandın; tekrarların 0 kredi! Kayıtlı derslerini ve günü gelen tekrarlarını açmak hakkından düşmez.",
      actionUrl: "/krediler",
      dedupeKey: `quota_80:${periodKey}`,
    });
  } catch (error) {
    console.error("quota_notification_failed", { error: String(error) });
    return null;
  }
}
