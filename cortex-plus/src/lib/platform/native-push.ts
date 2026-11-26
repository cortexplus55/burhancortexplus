"use client";

import { isNativeApp, getNativePlatform } from "@/lib/platform/native";
import { pushActionPath } from "@/lib/platform/native-links";

/**
 * Mobil uygulamada anlık bildirim (26 Kasım 2026, Aşama 1). Yalnız uygulamada çalışır; web'de her işlev
 * "unavailable" / hiçbir şey döndürür.
 *
 * - İzin, açılış akışının üçüncü adımında değeri anlatıldıktan sonra istenir (`requestPushPermission`); öğrenci
 *   "Şimdi değil" derse uygulama bir daha kendiliğinden sormaz (işletim sistemi ayarlarından açılır).
 * - İzin verilmişse her açılışta cihaz kaydı yenilenir; anahtar `/api/push/token` ucuna yazılır ve cihazda saklanır
 *   (çıkışta formla birlikte silinsin diye: `NativePushTokenField`).
 * - Bildirime dokunulunca içindeki uygulama içi yol açılır (yalnız "/..." yolları).
 */

export const PUSH_TOKEN_KEY = "cp.push.token";

export type PushPermission = "granted" | "denied" | "prompt" | "unavailable";

async function storeToken(token: string | null): Promise<void> {
  try {
    const { Preferences } = await import("@capacitor/preferences");
    if (token) await Preferences.set({ key: PUSH_TOKEN_KEY, value: token });
    else await Preferences.remove({ key: PUSH_TOKEN_KEY });
  } catch {
    /* saklanamazsa çıkışta silinmez; sunucu geçersiz anahtarı ilk gönderimde temizler */
  }
}

/** Cihazda saklanan bildirim anahtarı (çıkış formuna eklenir). */
export async function storedPushToken(): Promise<string | null> {
  if (!isNativeApp()) return null;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    return (await Preferences.get({ key: PUSH_TOKEN_KEY })).value ?? null;
  } catch {
    return null;
  }
}

export async function pushPermissionState(): Promise<PushPermission> {
  if (!isNativeApp()) return "unavailable";
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const { receive } = await PushNotifications.checkPermissions();
    if (receive === "granted") return "granted";
    if (receive === "denied") return "denied";
    return "prompt";
  } catch {
    return "unavailable";
  }
}

async function saveTokenOnServer(token: string): Promise<void> {
  const platform = getNativePlatform();
  if (platform === "web") return;
  try {
    await fetch("/api/push/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "same-origin",
      body: JSON.stringify({ token, platform }),
    });
  } catch {
    /* ağ yoksa bir sonraki açılışta yeniden yazılır */
  }
}

let listenersReady = false;

/**
 * Dinleyicileri bir kez kurar: kayıt anahtarı gelince sunucuya yazılır, bildirime dokunulunca `navigate` çağrılır.
 * İzin zaten verilmişse cihaz kaydını yeniler. Uygulama açılışında (`NativeBootstrap`) çağrılır.
 */
export async function initNativePush(navigate: (path: string) => void): Promise<void> {
  if (!isNativeApp() || listenersReady) return;
  listenersReady = true;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    await PushNotifications.addListener("registration", ({ value }) => {
      void storeToken(value);
      void saveTokenOnServer(value);
    });
    await PushNotifications.addListener("registrationError", () => {
      /* Firebase ya da Apple bildirim yeteneği tanımlı değil: uygulama bildirimsiz çalışır */
    });
    await PushNotifications.addListener("pushNotificationActionPerformed", ({ notification }) => {
      const path = pushActionPath(notification?.data);
      if (path) navigate(path);
    });
    if ((await pushPermissionState()) === "granted") await PushNotifications.register();
  } catch {
    listenersReady = false;
  }
}

/** Sistem iznini ister; verilirse cihazı kaydeder. Öğrencinin dokunuşuyla çağrılır. */
export async function requestPushPermission(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { PushNotifications } = await import("@capacitor/push-notifications");
    const { receive } = await PushNotifications.requestPermissions();
    if (receive !== "granted") return false;
    await PushNotifications.register();
    return true;
  } catch {
    return false;
  }
}
