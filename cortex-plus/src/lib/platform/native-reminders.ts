"use client";

import { isNativeApp } from "@/lib/platform/native";
import { pushActionPath } from "@/lib/platform/native-links";
import {
  LOCAL_REMINDER_ID_BASE,
  LOCAL_REMINDER_ID_SPAN,
  type LocalReminderItem,
  type LocalReminderPlan,
} from "@/lib/notifications/local-reminders";

/**
 * Yerel çalışma hatırlatması, telefon tarafı (26 Kasım 2026, mobil 1. adım). Planı sunucu çıkarır
 * (`/api/app/reminders`, kural `local-reminders.ts`), burada telefona kurulur.
 *
 * - İzin İSTENMEZ: bildirim izni açılış akışında bir kez sorulur; verilmemişse hatırlatma kurulmaz.
 * - Her kurulumda önce bizim kimlik aralığımızdaki eski hatırlatmalar silinir; başka bildirimlere dokunulmaz.
 * - Oturum yoksa (401) hepsi silinir: aynı telefonda başka bir öğrenci eski öğrencinin hazırlık adını görmesin.
 *   Çıkış formu da göndermeden önce siler (`NativePushTokenField`).
 * - Ağ yoksa ya da sunucu cevap veremezse kurulu plan olduğu gibi kalır.
 * - Hatırlatmaya dokununca içindeki uygulama içi yol açılır.
 */

export const REMINDER_CHANNEL_ID = "cortex_calisma";
export const REMINDERS_CHANGED_EVENT = "cx:reminders-changed";
const SYNC_INTERVAL_MS = 30 * 60 * 1000;

type LocalNotificationsApi = (typeof import("@capacitor/local-notifications"))["LocalNotifications"];

async function localNotifications(): Promise<LocalNotificationsApi | null> {
  if (!isNativeApp()) return null;
  try {
    return (await import("@capacitor/local-notifications")).LocalNotifications;
  } catch {
    return null;
  }
}

export function isReminderId(id: unknown): id is number {
  return typeof id === "number" && id >= LOCAL_REMINDER_ID_BASE && id < LOCAL_REMINDER_ID_BASE + LOCAL_REMINDER_ID_SPAN;
}

/** Sunucunun planından yalnız geçerli öğeler: bizim aralığımızda kimlik, gelecekte saat, uygulama içi yol. */
export function validReminderItems(plan: unknown, now: number): LocalReminderItem[] {
  const items = (plan as LocalReminderPlan | null)?.items;
  if (!Array.isArray(items)) return [];
  return items.filter((item): item is LocalReminderItem => {
    if (!item || typeof item !== "object") return false;
    const at = Date.parse(String(item.at));
    return (
      isReminderId(item.id) &&
      Number.isFinite(at) &&
      at > now &&
      typeof item.title === "string" &&
      typeof item.body === "string" &&
      pushActionPath({ url: item.path }) === item.path
    );
  });
}

export async function clearLocalReminders(): Promise<void> {
  const api = await localNotifications();
  if (!api) return;
  try {
    const pending = await api.getPending();
    const ids = pending.notifications.filter((item) => isReminderId(item.id)).map((item) => ({ id: item.id }));
    if (ids.length) await api.cancel({ notifications: ids });
  } catch {
    /* silinemezse kendi saatinde çıkar; bir sonraki kurulum yeniden dener */
  }
}

let lastSync = 0;
let running: Promise<void> | null = null;

/** Planı sunucudan alıp telefona kurar. `force` olmadan yarım saatte bir. Hiçbir zaman atmaz. */
export function syncLocalReminders(force = false): Promise<void> {
  if (!isNativeApp()) return Promise.resolve();
  if (running) return running;
  if (!force && Date.now() - lastSync < SYNC_INTERVAL_MS) return Promise.resolve();
  running = (async () => {
    const api = await localNotifications();
    if (!api) return;
    try {
      const permission = await api.checkPermissions();
      if (permission.display !== "granted") return;
    } catch {
      return;
    }
    let plan: unknown = null;
    try {
      const response = await fetch("/api/app/reminders", { credentials: "same-origin", cache: "no-store" });
      if (response.status === 401) {
        await clearLocalReminders();
        lastSync = Date.now();
        return;
      }
      if (!response.ok) return;
      plan = await response.json();
    } catch {
      return;
    }
    lastSync = Date.now();
    await clearLocalReminders();
    const items = validReminderItems(plan, Date.now());
    if (!items.length) return;
    try {
      await api.createChannel({
        id: REMINDER_CHANNEL_ID,
        name: "Çalışma hatırlatması",
        description: "Seçtiğin çalışma saatinde kaldığın yeri hatırlatır.",
        importance: 3,
      });
    } catch {
      /* iOS'ta kanal yok; Android'de varsayılan kanala düşer */
    }
    try {
      await api.schedule({
        notifications: items.map((item) => ({
          id: item.id,
          title: item.title,
          body: item.body,
          channelId: REMINDER_CHANNEL_ID,
          // Tam zamanlı alarm istenmez: Android 12+ aksi hâlde öğrenciye "Alarmlar" ayar ekranını açar ve Google Play
          // bu izni yalnız alarm/takvim uygulamalarına verir (izin bildirimde kaldırıldı). Birkaç dakika sapma kabul.
          isExactNotification: false,
          schedule: { at: new Date(item.at), allowWhileIdle: true },
          extra: { path: item.path },
        })),
      });
    } catch {
      /* kurulamazsa bir sonraki açılışta yeniden denenir */
      lastSync = 0;
    }
  })().finally(() => {
    running = null;
  });
  return running;
}

let listenerReady = false;

/** Hatırlatmaya dokununca yolu açar; uygulama açılışında bir kez kurulur. */
export async function initLocalReminderTaps(navigate: (path: string) => void): Promise<void> {
  if (listenerReady) return;
  const api = await localNotifications();
  if (!api) return;
  listenerReady = true;
  try {
    await api.addListener("localNotificationActionPerformed", (action) => {
      if (!isReminderId(action.notification?.id)) return;
      const path = pushActionPath({ url: (action.notification.extra as { path?: unknown } | undefined)?.path });
      if (path) navigate(path);
    });
  } catch {
    listenerReady = false;
  }
}

/** Testler için. */
export function resetLocalRemindersForTests(): void {
  lastSync = 0;
  running = null;
  listenerReady = false;
}
