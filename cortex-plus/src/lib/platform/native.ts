"use client";

import { useEffect, useState } from "react";
import { nativePlatformFromUserAgent, type NativePlatform } from "@/lib/platform/native-ua";

/**
 * Mobil uygulama katmanı (26 Kasım 2026, Aşama 1). Uygulama canlı siteyi kendi web görünümünde açar
 * (`capacitor.config.ts`); bu dosya sayfanın uygulamada çalışıp çalışmadığını söyler ve telefonun yeteneklerine
 * (titreşim, paylaşım menüsü, ağ durumu) tek yerden ulaşır.
 *
 * Kurallar:
 * - Web'de hiçbir davranış değişmez: titreşim yok, paylaşım tarayıcının kendi paylaşımı ya da kopyalama, ağ durumu
 *   tarayıcının `online` olayı.
 * - Eklentiler yalnız uygulamada ve ihtiyaç anında yüklenir (`import()`): web paketine girmez.
 * - Karar önce köprüden (`window.Capacitor`), köprü yoksa tarayıcı kimliğindeki işaretten (`native-ua.ts`).
 */

export type AppPlatform = NativePlatform | "web";

type CapacitorGlobal = {
  isNativePlatform?: () => boolean;
  getPlatform?: () => string;
};

function capacitorGlobal(): CapacitorGlobal | null {
  if (typeof window === "undefined") return null;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return cap ?? null;
}

/** Sayfa Cortex Plus mobil uygulamasının içinde mi (iOS ya da Android)? Sunucuda her zaman false. */
export function isNativeApp(): boolean {
  return getNativePlatform() !== "web";
}

/** "ios" | "android" | "web". Sunucuda "web". */
export function getNativePlatform(): AppPlatform {
  if (typeof window === "undefined") return "web";
  const cap = capacitorGlobal();
  if (cap?.isNativePlatform?.()) {
    const platform = cap.getPlatform?.();
    if (platform === "ios" || platform === "android") return platform;
  }
  return nativePlatformFromUserAgent(window.navigator?.userAgent) ?? "web";
}

export type HapticKind = "selection" | "light" | "medium" | "heavy" | "success" | "warning" | "error";

/**
 * Dokunsal geri bildirim. Yalnız uygulamada; web'de hiçbir şey yapmaz. Hiçbir zaman atmaz (eklenti yoksa ya da
 * cihaz desteklemiyorsa sessiz geçer).
 */
export async function triggerHaptic(kind: HapticKind = "light"): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Haptics, ImpactStyle, NotificationType } = await import("@capacitor/haptics");
    if (kind === "selection") {
      await Haptics.selectionStart();
      await Haptics.selectionChanged();
      await Haptics.selectionEnd();
      return;
    }
    if (kind === "success" || kind === "warning" || kind === "error") {
      const type = kind === "success" ? NotificationType.Success : kind === "warning" ? NotificationType.Warning : NotificationType.Error;
      await Haptics.notification({ type });
      return;
    }
    const style = kind === "heavy" ? ImpactStyle.Heavy : kind === "medium" ? ImpactStyle.Medium : ImpactStyle.Light;
    await Haptics.impact({ style });
  } catch {
    /* titreşim bir süs: düşerse akış sürer */
  }
}

export type ShareInput = { title?: string; text?: string; url?: string };
export type ShareOutcome = "shared" | "copied" | "cancelled" | "unavailable";

function isCancel(error: unknown): boolean {
  const message = error instanceof Error ? `${error.name} ${error.message}` : String(error ?? "");
  return /abort|cancel/i.test(message);
}

/**
 * Paylaşım menüsü. Uygulamada telefonun kendi paylaşım ekranı; web'de tarayıcının paylaşımı (varsa), yoksa
 * bağlantı panoya kopyalanır. Öğrenci menüyü kapatırsa "cancelled".
 */
export async function nativeShare(input: ShareInput): Promise<ShareOutcome> {
  const payload = {
    title: input.title?.trim() || undefined,
    text: input.text?.trim() || undefined,
    url: input.url?.trim() || undefined,
  };
  if (!payload.title && !payload.text && !payload.url) return "unavailable";
  if (isNativeApp()) {
    try {
      const { Share } = await import("@capacitor/share");
      await Share.share({ ...payload, dialogTitle: payload.title });
      return "shared";
    } catch (error) {
      if (isCancel(error)) return "cancelled";
      /* menü açılamadıysa web yoluna düş */
    }
  }
  if (typeof navigator !== "undefined" && typeof navigator.share === "function") {
    try {
      await navigator.share(payload);
      return "shared";
    } catch (error) {
      if (isCancel(error)) return "cancelled";
    }
  }
  const copyText = [payload.text, payload.url].filter(Boolean).join(" ");
  if (copyText && typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(copyText);
      return "copied";
    } catch {
      return "unavailable";
    }
  }
  return "unavailable";
}

export type NetworkStatus = {
  /** Bağlantı var mı. İlk ölçümden önce true (sunucu çizimiyle aynı, boşuna uyarı çizilmez). */
  online: boolean;
  /** İlk ölçüm yapıldı mı. */
  checked: boolean;
};

/**
 * Ağ durumu. Uygulamada telefonun ağ bilgisi (@capacitor/network), web'de tarayıcının `online` / `offline` olayları.
 */
export function useNetworkStatus(): NetworkStatus {
  const [status, setStatus] = useState<NetworkStatus>({ online: true, checked: false });

  useEffect(() => {
    let active = true;
    const set = (online: boolean) => {
      if (active) setStatus({ online, checked: true });
    };

    if (!isNativeApp()) {
      const update = () => set(window.navigator.onLine !== false);
      update();
      window.addEventListener("online", update);
      window.addEventListener("offline", update);
      return () => {
        active = false;
        window.removeEventListener("online", update);
        window.removeEventListener("offline", update);
      };
    }

    let remove: (() => void) | null = null;
    void (async () => {
      try {
        const { Network } = await import("@capacitor/network");
        const first = await Network.getStatus();
        set(first.connected);
        const handle = await Network.addListener("networkStatusChange", (next) => set(next.connected));
        if (active) remove = () => void handle.remove();
        else void handle.remove();
      } catch {
        set(window.navigator.onLine !== false);
      }
    })();
    return () => {
      active = false;
      remove?.();
    };
  }, []);

  return status;
}
