"use client";

import { isNativeApp } from "@/lib/platform/native";
import { cortexDevice, type BiometricKind, type BiometricStatus, type VerifyOutcome } from "@/lib/platform/native-device";

/**
 * Uygulama kilidi (26 Kasım 2026, mobil 1. adım). Öğrenci Ayarlar → "Giriş ve güvenlik"ten açar; uygulama soğuk
 * açılışta ve bir dakikadan uzun arka planda kaldıktan sonra yüz tanıma, parmak izi ya da cihaz şifresi ister.
 *
 * - Ayar cihazda: hesaba yazılmaz (başka telefonda kilit yok). Asıl kayıt Capacitor Preferences; ilk betiğin
 *   (`NATIVE_BOOT_SCRIPT`) sayfa çizilmeden içeriği gizleyebilmesi için `localStorage`'da bir yansısı tutulur.
 * - Biyometrik veri cihazdan çıkmaz; sayfa yalnız "doğrulandı / doğrulanmadı" sonucunu görür.
 * - Eklenti yoksa (eski uygulama sürümü) ya da telefonda ekran kilidi kalmadıysa kilit kendiliğinden kalkar:
 *   öğrenci kendi hesabının dışında kalmaz.
 */

export const LOCK_PREF_KEY = "cp.lock.enabled";
export const LOCK_MIRROR_KEY = "cp.lock";
export const LOCKED_CLASS = "cx-locked";
export const LOCK_AFTER_BACKGROUND_MS = 60_000;
/** Ayar değişince açık kilit katmanı haberdar olur (aynı sayfada; ayrıntı: açık mı). */
export const LOCK_CHANGED_EVENT = "cx:lock-changed";

export const LOCK_COPY = {
  title: "Cortex Plus kilitli",
  reason: "Devam etmek için kimliğini doğrula.",
  unlock: "Kilidi aç",
  signOut: "Çıkış yap",
  failed: "Doğrulanamadı. Yeniden dene ya da çıkış yap.",
  lockout: "Çok fazla deneme oldu. Telefonunun kilidini açıp yeniden dene.",
  settingHint:
    "Uygulama bir dakikadan uzun arka planda kalınca açılırken kimliğini sorar. Yüz ve parmak izi verin telefonundan çıkmaz.",
  noDeviceLock: "Kilidi kullanmak için telefonuna önce ekran kilidi (şifre, yüz ya da parmak izi) ekle.",
} as const;

/** Ayar satırının adı: telefonun sunduğu yönteme göre. */
export function lockLabel(kind: BiometricKind, platform: "ios" | "android" | "web"): string {
  if (kind === "face") return platform === "ios" ? "Face ID ile kilitle" : "Yüz tanımayla kilitle";
  if (kind === "fingerprint") return platform === "ios" ? "Touch ID ile kilitle" : "Parmak iziyle kilitle";
  if (kind === "biometric") return "Parmak izi ya da yüz tanımayla kilitle";
  return "Telefon şifresiyle kilitle";
}

/** Arka planda geçen süreden sonra kilit gerekir mi? (Saf; sınanıyor.) */
export function shouldLockOnResume(enabled: boolean, hiddenAt: number | null, now: number): boolean {
  return enabled && hiddenAt !== null && now - hiddenAt >= LOCK_AFTER_BACKGROUND_MS;
}

function writeMirror(enabled: boolean): void {
  try {
    if (enabled) window.localStorage.setItem(LOCK_MIRROR_KEY, "1");
    else window.localStorage.removeItem(LOCK_MIRROR_KEY);
  } catch {
    /* yansı yazılamazsa soğuk açılışta içerik bir an görünür; kilit yine sorulur */
  }
}

export async function readLockEnabled(): Promise<boolean> {
  if (!isNativeApp()) return false;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const enabled = (await Preferences.get({ key: LOCK_PREF_KEY })).value === "1";
    writeMirror(enabled);
    return enabled;
  } catch {
    return false;
  }
}

export async function writeLockEnabled(enabled: boolean): Promise<void> {
  writeMirror(enabled);
  try {
    const { Preferences } = await import("@capacitor/preferences");
    if (enabled) await Preferences.set({ key: LOCK_PREF_KEY, value: "1" });
    else await Preferences.remove({ key: LOCK_PREF_KEY });
  } catch {
    /* ayar saklanamazsa bir sonraki açılışta kapalı görünür */
  }
}

export async function lockStatus(): Promise<BiometricStatus | null> {
  const plugin = await cortexDevice();
  if (!plugin) return null;
  try {
    return await plugin.biometricStatus();
  } catch {
    return null;
  }
}

export async function verifyIdentity(): Promise<VerifyOutcome> {
  const plugin = await cortexDevice();
  if (!plugin) return { verified: false, reason: "unavailable" };
  try {
    return await plugin.biometricVerify({ title: LOCK_COPY.title, reason: LOCK_COPY.reason, cancelTitle: "Vazgeç" });
  } catch {
    return { verified: false, reason: "failed" };
  }
}

export function setLockedClass(locked: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.classList.toggle(LOCKED_CLASS, locked);
}
