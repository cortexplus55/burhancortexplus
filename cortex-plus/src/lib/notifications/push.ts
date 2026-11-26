import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { missingRelation } from "@/lib/learning/missing-column";
import { loadNotificationPreferences } from "@/lib/notifications/preferences";
import { isQuietHour } from "@/lib/notifications/schedule";
import { apnsConfig, sendApns, type DeliveryResult, type PushPayload } from "@/lib/notifications/push-apns";
import { fcmConfig, sendFcm } from "@/lib/notifications/push-fcm";

/**
 * Mobil uygulamaya anlık bildirim (26 Kasım 2026, Aşama 1).
 *
 * Kurallar (uygulama içi bildirim ve e-postayla aynı):
 * - Gece sessiz saati: Türkiye saatiyle 22:00–08:00 arası hatırlatma, tamamlandı ve öneri bildirimi gönderilmez
 *   (`isQuietHour`). Hesapla ilgili bildirimler (ödeme, iade, hesap, plan, ödül; `essential`) bu kurala tabi değildir:
 *   e-postada da öyle.
 * - Öğrencinin tercihi: "Uygulama içi bildirimler" kapalıysa (`/bildirim-tercihleri`, Ayarlar) hesap bildirimleri
 *   dışında telefona da gitmez. Telefonun kendi izni ayrıca işletim sisteminde.
 * - Cihaz anahtarları `user_push_tokens`'ta (yalnız sunucu anahtarıyla). Tablo henüz yoksa sessizce atlanır.
 * - Kimlik bilgileri yoksa (APNs, FCM) o platforma gönderilmez; ikisi de yoksa veritabanına hiç sorulmaz.
 * - Hiçbir zaman atmaz; geçersizleşen cihaz anahtarı silinir.
 */

export type PushMessage = {
  title: string;
  body: string;
  /** Dokununca açılacak uygulama içi yol ("/..."); başka adres kabul edilmez. */
  actionUrl?: string | null;
  /** Hesapla ilgili (ödeme, iade, plan, hesap, ödül): sessiz saat ve tercih kapısından muaf. */
  essential?: boolean;
};

export type PushSkipReason = "not_configured" | "quiet_hours" | "muted" | "no_devices" | "no_table" | "error";

export type PushOutcome = { delivered: number; removed: number; failed: number; skipped?: PushSkipReason };

const TITLE_MAX = 120;
const BODY_MAX = 240;

export function pushConfigured(env: NodeJS.ProcessEnv = process.env): { ios: boolean; android: boolean } {
  return { ios: apnsConfig(env) !== null, android: fcmConfig(env) !== null };
}

/** Bu an bu bildirim gönderilebilir mi (yalnız saat kuralı). */
export function pushAllowedAt(now: Date, essential: boolean): boolean {
  return essential || !isQuietHour(now);
}

/** Uygulama içi yol: "/" ile başlar, "//" ya da ters bölü taşımaz. */
export function pushActionUrl(url: string | null | undefined): string | null {
  const value = String(url ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value.slice(0, 400);
}

export function pushPayload(message: PushMessage): PushPayload {
  const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text);
  return {
    title: clip(message.title.trim(), TITLE_MAX),
    body: clip(message.body.trim(), BODY_MAX),
    url: pushActionUrl(message.actionUrl),
  };
}

type TokenRow = { token: string; platform: string };

/** Tek öğrenciye bildirim. */
export async function sendPushToUser(
  service: SupabaseClient,
  userId: string,
  message: PushMessage,
  now: Date = new Date(),
): Promise<PushOutcome> {
  const empty = (skipped: PushSkipReason): PushOutcome => ({ delivered: 0, removed: 0, failed: 0, skipped });
  const configured = pushConfigured();
  if (!configured.ios && !configured.android) return empty("not_configured");
  const essential = message.essential === true;
  if (!pushAllowedAt(now, essential)) return empty("quiet_hours");
  try {
    if (!essential) {
      const preferences = await loadNotificationPreferences(service, userId);
      if (!preferences.inAppNotifications) return empty("muted");
    }
    const { data, error } = await service.from("user_push_tokens").select("token, platform").eq("user_id", userId).limit(20);
    if (error) return empty(missingRelation(error) ? "no_table" : "error");
    const rows = (data ?? []) as TokenRow[];
    const ios = rows.filter((row) => row.platform === "ios").map((row) => row.token);
    const android = rows.filter((row) => row.platform === "android").map((row) => row.token);
    if (!ios.length && !android.length) return empty("no_devices");

    const payload = pushPayload(message);
    const apns = apnsConfig();
    const fcm = fcmConfig();
    const results: DeliveryResult[] = await Promise.all([
      apns && ios.length ? sendApns(apns, ios, payload).catch(() => ({ delivered: 0, invalidTokens: [], failed: ios.length })) : null,
      fcm && android.length ? sendFcm(fcm, android, payload).catch(() => ({ delivered: 0, invalidTokens: [], failed: android.length })) : null,
    ]).then((list) => list.filter((item): item is DeliveryResult => item !== null));

    const invalid = results.flatMap((item) => item.invalidTokens);
    if (invalid.length) {
      await service.from("user_push_tokens").delete().eq("user_id", userId).in("token", invalid);
    }
    return {
      delivered: results.reduce((sum, item) => sum + item.delivered, 0),
      removed: invalid.length,
      failed: results.reduce((sum, item) => sum + item.failed, 0),
    };
  } catch (error) {
    console.error("push_send_failed", { error: String(error) });
    return empty("error");
  }
}

/** Birden çok öğrenci (cron, toplu bildirim): aynı anda en çok 6 öğrenci. */
export async function sendPushToUsers(
  service: SupabaseClient,
  entries: readonly { userId: string; message: PushMessage }[],
  now: Date = new Date(),
): Promise<number> {
  const configured = pushConfigured();
  if (!entries.length || (!configured.ios && !configured.android)) return 0;
  const queue = [...entries];
  let delivered = 0;
  const worker = async () => {
    for (let entry = queue.shift(); entry; entry = queue.shift()) {
      delivered += (await sendPushToUser(service, entry.userId, entry.message, now)).delivered;
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, entries.length) }, worker));
  return delivered;
}
