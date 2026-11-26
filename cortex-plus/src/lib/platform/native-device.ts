"use client";

import { isNativeApp } from "@/lib/platform/native";

/**
 * Uygulamanın kendi yerel eklentisi (26 Kasım 2026, mobil 1. adım): `ios/App/App/CortexDevicePlugin.swift` ve
 * `android/app/src/main/java/app/cortexplus/mobile/CortexDevicePlugin.java`. Tek yerden yüklenir; web'de ve eklentiyi
 * taşımayan eski uygulama sürümünde `null` döner, her çağıran bunu "özellik yok" diye okur.
 */

export type BiometricKind = "face" | "fingerprint" | "biometric" | "passcode" | "none";
export type BiometricStatus = { available: boolean; biometric: boolean; kind: BiometricKind };
export type VerifyFailure = "cancelled" | "unavailable" | "lockout" | "failed";
export type VerifyOutcome = { verified: boolean; reason?: VerifyFailure };

export type NativeMediaAction =
  | "play"
  | "pause"
  | "previoustrack"
  | "nexttrack"
  | "seekbackward"
  | "seekforward"
  | "seekto";

export type NativeMediaState = {
  title: string;
  artist: string;
  album: string;
  playing: boolean;
  positionMs: number;
  durationMs: number;
  rate: number;
  canPrevious: boolean;
  canNext: boolean;
};

export type NativeMediaEvent = { action: NativeMediaAction; positionMs?: number };

type ListenerHandle = { remove: () => Promise<void> };

export type CortexDevicePlugin = {
  biometricStatus(): Promise<BiometricStatus>;
  biometricVerify(options: { title?: string; reason?: string; cancelTitle?: string }): Promise<VerifyOutcome>;
  requestReview(): Promise<{ requested: boolean }>;
  mediaUpdate(state: NativeMediaState): Promise<{ native: boolean }>;
  mediaStop(): Promise<void>;
  addListener(event: "mediaAction", handler: (event: NativeMediaEvent) => void): Promise<ListenerHandle>;
};

export const CORTEX_DEVICE_PLUGIN = "CortexDevice";

let loading: Promise<CortexDevicePlugin | null> | null = null;

/** Eklenti (uygulamada ve bu sürüm taşıyorsa); aksi hâlde `null`. Hiçbir zaman atmaz. */
export function cortexDevice(): Promise<CortexDevicePlugin | null> {
  if (!isNativeApp()) return Promise.resolve(null);
  loading ??= import("@capacitor/core")
    .then(({ Capacitor, registerPlugin }) =>
      Capacitor.isPluginAvailable(CORTEX_DEVICE_PLUGIN) ? registerPlugin<CortexDevicePlugin>(CORTEX_DEVICE_PLUGIN) : null,
    )
    .catch(() => null);
  return loading;
}

/** Testler için: yüklenmiş eklentiyi unutur. */
export function resetCortexDeviceForTests(): void {
  loading = null;
}
