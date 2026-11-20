import type { SupabaseClient } from "@supabase/supabase-js";
import { missingRelation } from "@/lib/learning/missing-column";
import { isQuietHour } from "@/lib/notifications/schedule";

/**
 * E-posta gönderim kilidi (Faz 6, 20 Kasım 2026). Her e-posta göndermeden önce buradan geçer:
 *
 *  1. **Sessiz saat:** yaşam döngüsü (`lifecycle`) e-postası Türkiye saatiyle 22:00–08:00 arasında gönderilmez.
 *  2. **24 saat kuralı:** öğrenciye son 24 saatte yaşam döngüsü e-postası gittiyse ikincisi gitmez. İşlem e-postaları
 *     (`transactional`: hoş geldin, ödeme) muaftır ve sayılmaz.
 *  3. **Tekilleştirme:** aynı `dedupe_key` ikinci kez gönderilemez. Satır gönderimden ÖNCE yazılır (benzersiz anahtar
 *     ikinci isteği çarptırır); gönderim düşerse satır geri alınır ve sonraki tur yeniden dener.
 *
 * Kayıt `email_dispatch_log`. Tablo henüz yoksa (göç kod yayınından sonra uygulanır) eski "bir kez" kaydına
 * (`email_events`, `once:` anahtarı) düşer; o arada 24 saat kuralı eski kayıtta tutulmaz, yalnız tekilleştirme çalışır.
 */

export type EmailCategory = "transactional" | "lifecycle";

export type DispatchRequest = {
  userId: string;
  templateKey: string;
  dedupeKey: string;
  category: EmailCategory;
  now?: Date;
};

export type DispatchDecision =
  | { ok: true; claimId: string | null; legacy: boolean }
  | { ok: false; reason: "quiet_hours" | "cooldown" | "duplicate" | "error" };

/** 24 saat kuralı. Cron yarım saatte bir çalıştığı için dünkü aynı dilim (ör. 18:30 → 18:30) birkaç saniye erken düşse de
 * engellenmesin diye 30 dakika pay bırakılır: önceki gönderimden en az 23,5 saat geçmiş olmalı. */
export const LIFECYCLE_COOLDOWN_MS = 24 * 60 * 60 * 1000;
export const COOLDOWN_SLOT_GRACE_MS = 30 * 60 * 1000;

/** Saf: son yaşam döngüsü gönderiminden sonra yeni bir tanesi gidebilir mi. */
export function cooldownActive(lastLifecycleSentAt: string | Date | null | undefined, now: Date): boolean {
  if (!lastLifecycleSentAt) return false;
  const last = typeof lastLifecycleSentAt === "string" ? Date.parse(lastLifecycleSentAt) : lastLifecycleSentAt.getTime();
  if (!Number.isFinite(last)) return false;
  return now.getTime() - last < LIFECYCLE_COOLDOWN_MS - COOLDOWN_SLOT_GRACE_MS;
}

/** Saf: kilit kararı (veritabanından bağımsız kısım). */
export function preDispatchCheck(
  request: Pick<DispatchRequest, "category">,
  now: Date,
  lastLifecycleSentAt: string | null,
): "quiet_hours" | "cooldown" | null {
  if (request.category !== "lifecycle") return null;
  if (isQuietHour(now)) return "quiet_hours";
  if (cooldownActive(lastLifecycleSentAt, now)) return "cooldown";
  return null;
}

const UNIQUE_VIOLATION = /23505|duplicate key/i;

async function lastLifecycleSend(service: SupabaseClient, userId: string): Promise<{ at: string | null; missing: boolean }> {
  const { data, error } = await service
    .from("email_dispatch_log")
    .select("sent_at")
    .eq("user_id", userId)
    .eq("category", "lifecycle")
    .order("sent_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) {
    if (missingRelation(error)) return { at: null, missing: true };
    throw new Error(`dispatch_log_read_failed: ${error.message}`);
  }
  return { at: (data?.sent_at as string | undefined) ?? null, missing: false };
}

/** Kilidi alır: izin verilirse satır yazılmıştır, gönderimden sonra `settleDispatch` çağrılır. */
export async function claimDispatch(service: SupabaseClient, request: DispatchRequest): Promise<DispatchDecision> {
  const now = request.now ?? new Date();
  try {
    const last = request.category === "lifecycle" ? await lastLifecycleSend(service, request.userId) : { at: null, missing: false };
    const blocked = preDispatchCheck(request, now, last.at);
    if (blocked) return { ok: false, reason: blocked };
    const { data, error } = await service
      .from("email_dispatch_log")
      .insert({
        user_id: request.userId,
        template_key: request.templateKey,
        dedupe_key: request.dedupeKey,
        category: request.category,
        sent_at: now.toISOString(),
      })
      .select("id")
      .maybeSingle();
    if (!error) return { ok: true, claimId: (data?.id as string | undefined) ?? null, legacy: false };
    if (UNIQUE_VIOLATION.test(`${error.code ?? ""} ${error.message ?? ""}`)) return { ok: false, reason: "duplicate" };
    if (!missingRelation(error)) {
      console.error("email_dispatch_claim_failed", { templateKey: request.templateKey, error: error.message });
      return { ok: false, reason: "error" };
    }
    // Göç öncesi: eski "bir kez" kaydı.
    const legacy = await service
      .from("email_events")
      .insert({ user_id: request.userId, template_key: legacyOnceKey(request.dedupeKey, request.userId), status: "claimed" });
    if (legacy.error) return { ok: false, reason: "duplicate" };
    return { ok: true, claimId: null, legacy: true };
  } catch (error) {
    console.error("email_dispatch_claim_failed", { templateKey: request.templateKey, error: String(error) });
    return { ok: false, reason: "error" };
  }
}

/** Gönderim sonucu: başarısızsa kilit geri alınır (sonraki tur yeniden dener). */
export async function settleDispatch(
  service: SupabaseClient,
  request: Pick<DispatchRequest, "userId" | "dedupeKey">,
  claim: Extract<DispatchDecision, { ok: true }>,
  sent: boolean,
): Promise<void> {
  try {
    if (claim.legacy) {
      const key = legacyOnceKey(request.dedupeKey, request.userId);
      if (sent) await service.from("email_events").update({ status: "sent" }).eq("user_id", request.userId).eq("template_key", key);
      else await service.from("email_events").delete().eq("user_id", request.userId).eq("template_key", key).eq("status", "claimed");
      return;
    }
    if (sent) return;
    await service.from("email_dispatch_log").delete().eq("dedupe_key", request.dedupeKey);
  } catch (error) {
    console.error("email_dispatch_settle_failed", { dedupeKey: request.dedupeKey, error: String(error) });
  }
}

/**
 * Yeni anahtarın eski "bir kez" kaydındaki karşılığı (göç öncesi tekilleştirme). Eski kayıtta kullanıcı ayrı sütundaydı:
 * "welcome:<kullanıcı>" → "once:welcome" (eski satırlarla birebir), "purchase:<sipariş>" → "once:purchase:<sipariş>".
 * Göç aynı eşlemeyi tersinden yapar.
 */
export function legacyOnceKey(dedupeKey: string, userId: string): string {
  const suffix = `:${userId}`;
  const base = dedupeKey.endsWith(suffix) ? dedupeKey.slice(0, -suffix.length) : dedupeKey;
  return `once:${base}`.slice(0, 200);
}

/** Tek kaynak: anahtar biçimleri (göç eski anahtarları bu biçime çevirir). */
export const dedupeKeys = {
  welcome: (userId: string) => `welcome:${userId}`,
  trial: (userId: string) => `trial:${userId}`,
  referralInvite: (userId: string) => `referral_invite:${userId}`,
  purchase: (merchantOid: string) => `purchase:${merchantOid}`,
  activation: (userId: string) => `activation_24h:${userId}`,
  freeFirstUnit: (userId: string) => `free_first_unit:${userId}`,
  smartTrap: (userId: string, isoWeek: string) => `smart_trap:${userId}:${isoWeek}`,
  examEve: (prepId: string, hours: 48 | 24) => `exam_eve_${hours}h:${prepId}`,
  expiry: (subscriptionId: string, window: "3d" | "24h") => `expiry_${window}:${subscriptionId}`,
  weekly: (userId: string, isoWeek: string) => `weekly:${userId}:${isoWeek}`,
  studyReminder: (userId: string, day: string) => `study_reminder:${userId}:${day}`,
} as const;
