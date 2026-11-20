import type { SupabaseClient } from "@supabase/supabase-js";
import { missingRelation } from "@/lib/learning/missing-column";
import { loadNotificationPreferences } from "@/lib/notifications/preferences";

/**
 * Uygulama içi bildirimler (Faz 6, 20 Kasım 2026): `in_app_notifications`. Çan (🔔) ve /bildirimler buradan okur.
 *
 * Eski `notifications` tablosu: göç bütün satırlarını aynı kimlikle kopyaladı. Ödeme ve promosyon SQL işlevleri ona yazmaya
 * devam ediyor (ödeme yolu değiştirilmez); okuma iki tabloyu kimlikle birleştirir, yeni tablodaki satır önceliklidir.
 * Tablo henüz yoksa (göç kod yayınından sonra) yazım ve okuma eski tabloya düşer.
 *
 * Bütün yazım ve okuma sunucu anahtarıyla ve kullanıcı süzgeciyle; tarayıcı bu tablolara doğrudan erişmez.
 */

export type InAppKind =
  | "video_ready"
  | "podcast_ready"
  | "topic_learned"
  | "blind_spot_detected"
  | "quota_80_pct"
  | "study_reminder"
  | "plan_notice"
  | "payment"
  | "refund"
  | "account"
  /** Faz 7: klonlanan yolu bitiren arkadaşın ödülü (+50 kredi). Bakiye değiştiği için öğrencinin anahtarından bağımsız. */
  | "referral_reward"
  | "legacy";

/** Hesapla ilgili bildirimler öğrencinin "uygulama içi bildirim" anahtarından bağımsız yazılır. */
export const ESSENTIAL_KINDS: ReadonlySet<InAppKind> = new Set(["plan_notice", "payment", "refund", "account", "referral_reward"]);

export type InAppNotification = {
  id: string;
  kind: string;
  title: string;
  body: string;
  actionUrl: string | null;
  isRead: boolean;
  createdAt: string;
};

export type NotifyInput = {
  userId: string;
  kind: InAppKind;
  title: string;
  body: string;
  actionUrl?: string | null;
  /** Aynı olay ikinci kez bildirim açmasın (kullanıcı başına benzersiz). */
  dedupeKey?: string | null;
};

export type NotifyOutcome = "created" | "duplicate" | "muted" | "failed";

const TITLE_MAX = 160;
const BODY_MAX = 600;

/** Uygulama içi bağlantı: yalnız sitenin kendi yolları ("/…"); dışarıya ya da şemalı adrese gidilmez. */
export function safeActionUrl(url: string | null | undefined): string | null {
  const value = String(url ?? "").trim();
  if (!value.startsWith("/") || value.startsWith("//") || value.includes("\\")) return null;
  return value.slice(0, 400);
}

function rowOf(input: NotifyInput) {
  return {
    user_id: input.userId,
    kind: input.kind,
    title: input.title.trim().slice(0, TITLE_MAX),
    body: input.body.trim().slice(0, BODY_MAX),
    action_url: safeActionUrl(input.actionUrl),
    dedupe_key: input.dedupeKey ? input.dedupeKey.slice(0, 200) : null,
  };
}

/** Tek bildirim. Öğrenci uygulama içi bildirimi kapattıysa (hesap bildirimleri hariç) yazılmaz. Hiçbir zaman atmaz. */
export async function notifyInApp(service: SupabaseClient, input: NotifyInput): Promise<NotifyOutcome> {
  try {
    if (!ESSENTIAL_KINDS.has(input.kind)) {
      const preferences = await loadNotificationPreferences(service, input.userId);
      if (!preferences.inAppNotifications) return "muted";
    }
    return (await insertRows(service, [rowOf(input)])) > 0 ? "created" : "duplicate";
  } catch (error) {
    console.error("in_app_notification_failed", { kind: input.kind, error: String(error) });
    return "failed";
  }
}

/**
 * Toplu yazım (cron): tercih denetimini çağıran yapar. Tekilleştirme anahtarı çakışan satır atlanır. Yazılan sayıyı döndürür.
 */
export async function notifyInAppMany(service: SupabaseClient, inputs: readonly NotifyInput[]): Promise<number> {
  if (!inputs.length) return 0;
  try {
    let written = 0;
    for (let from = 0; from < inputs.length; from += 500) {
      written += await insertRows(service, inputs.slice(from, from + 500).map(rowOf));
    }
    return written;
  } catch (error) {
    console.error("in_app_notification_failed", { kind: inputs[0]?.kind, count: inputs.length, error: String(error) });
    return 0;
  }
}

async function insertRows(service: SupabaseClient, rows: ReturnType<typeof rowOf>[]): Promise<number> {
  const keyed = rows.filter((row) => row.dedupe_key);
  const plain = rows.filter((row) => !row.dedupe_key);
  let written = 0;
  if (plain.length) {
    const { error } = await service.from("in_app_notifications").insert(plain);
    if (error) {
      if (!missingRelation(error)) throw new Error(error.message);
      return insertLegacy(service, rows);
    }
    written += plain.length;
  }
  if (keyed.length) {
    const { data, error } = await service
      .from("in_app_notifications")
      .upsert(keyed, { onConflict: "user_id,dedupe_key", ignoreDuplicates: true })
      .select("id");
    if (error) {
      if (!missingRelation(error)) throw new Error(error.message);
      return written + (await insertLegacy(service, keyed));
    }
    written += (data ?? []).length;
  }
  return written;
}

/** Göç öncesi: eski tablo (başlık ve gövde; tür ve bağlantı yok). Tekilleştirme anahtarı orada tutulamaz. */
async function insertLegacy(service: SupabaseClient, rows: ReturnType<typeof rowOf>[]): Promise<number> {
  const { error } = await service
    .from("notifications")
    .insert(rows.map((row) => ({ user_id: row.user_id, title: row.title, body: row.body })));
  if (error) throw new Error(error.message);
  return rows.length;
}

type NewRow = { id: string; kind: string; title: string; body: string; action_url: string | null; is_read: boolean; created_at: string };
type LegacyRow = { id: string; title: string; body: string | null; read_at: string | null; created_at: string };

/** Son bildirimler (yeni önce) ve okunmamış sayısı. Okuma düşerse boş liste. */
export async function listInAppNotifications(
  service: SupabaseClient,
  userId: string,
  options: { limit?: number } = {},
): Promise<{ items: InAppNotification[]; unread: number }> {
  const limit = Math.max(1, Math.min(100, options.limit ?? 30));
  const [fresh, legacy] = await Promise.all([
    service
      .from("in_app_notifications")
      .select("id, kind, title, body, action_url, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
    service
      .from("notifications")
      .select("id, title, body, read_at, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(limit),
  ]);
  const freshMissing = Boolean(fresh.error && missingRelation(fresh.error));
  if (fresh.error && !freshMissing) console.error("in_app_notifications_read_failed", { error: fresh.error.message });
  const newRows = (fresh.error ? [] : (fresh.data ?? [])) as NewRow[];
  const items = new Map<string, InAppNotification>();
  for (const row of newRows) {
    items.set(row.id, {
      id: row.id,
      kind: row.kind,
      title: row.title,
      body: row.body,
      actionUrl: safeActionUrl(row.action_url),
      isRead: row.is_read,
      createdAt: row.created_at,
    });
  }
  // Eski tablodaki satır yeni tabloda yoksa (ödeme / promosyon SQL işlevi yazdı ya da göç öncesi) listeye girer.
  const legacyRows = (legacy.error ? [] : (legacy.data ?? [])) as LegacyRow[];
  const unseen = legacyRows.filter((row) => !items.has(row.id));
  let copied = new Set<string>();
  if (unseen.length && !freshMissing) {
    const { data } = await service.from("in_app_notifications").select("id").in("id", unseen.map((row) => row.id));
    copied = new Set(((data ?? []) as { id: string }[]).map((row) => row.id));
  }
  for (const row of unseen) {
    if (copied.has(row.id)) continue;
    items.set(row.id, {
      id: row.id,
      kind: "legacy",
      title: row.title,
      body: row.body ?? "",
      actionUrl: null,
      isRead: row.read_at != null,
      createdAt: row.created_at,
    });
  }
  const sorted = [...items.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, limit);
  return { items: sorted, unread: await unreadCount(service, userId, freshMissing) };
}

/** Okunmamış sayısı (çan rozeti). */
export async function unreadCount(service: SupabaseClient, userId: string, freshMissing?: boolean): Promise<number> {
  let fresh = 0;
  let missing = freshMissing === true;
  if (!missing) {
    const { count, error } = await service
      .from("in_app_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("is_read", false);
    if (error) {
      if (missingRelation(error)) missing = true;
      else return 0;
    } else fresh = count ?? 0;
  }
  const legacy = await service
    .from("notifications")
    .select("id")
    .eq("user_id", userId)
    .is("read_at", null)
    .order("created_at", { ascending: false })
    .limit(100);
  const legacyIds = ((legacy.data ?? []) as { id: string }[]).map((row) => row.id);
  if (!legacyIds.length) return fresh;
  if (missing) return fresh + legacyIds.length;
  const { data } = await service.from("in_app_notifications").select("id").in("id", legacyIds);
  const copied = new Set(((data ?? []) as { id: string }[]).map((row) => row.id));
  return fresh + legacyIds.filter((id) => !copied.has(id)).length;
}

/** Okundu işaretler: verilen kimlikler ya da hepsi. Yalnız kullanıcının kendi satırları. */
export async function markNotificationsRead(
  service: SupabaseClient,
  userId: string,
  ids: readonly string[] | "all",
): Promise<boolean> {
  const now = new Date().toISOString();
  const valid = ids === "all" ? null : ids.filter((id) => /^[0-9a-f-]{36}$/i.test(id)).slice(0, 200);
  if (valid && !valid.length) return true;
  let fresh = service.from("in_app_notifications").update({ is_read: true }).eq("user_id", userId).eq("is_read", false);
  let legacy = service.from("notifications").update({ read_at: now }).eq("user_id", userId).is("read_at", null);
  if (valid) {
    fresh = fresh.in("id", valid);
    legacy = legacy.in("id", valid);
  }
  const [a, b] = await Promise.all([fresh, legacy]);
  const freshOk = !a.error || missingRelation(a.error);
  if (!freshOk) console.error("in_app_notifications_mark_failed", { error: a.error?.message });
  if (b.error) console.error("notifications_mark_failed", { error: b.error.message });
  return freshOk && !b.error;
}
