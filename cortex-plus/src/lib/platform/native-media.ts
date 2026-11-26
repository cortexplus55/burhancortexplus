"use client";

import { useEffect, useRef } from "react";
import { getNativePlatform } from "@/lib/platform/native";
import { cortexDevice, type NativeMediaAction, type NativeMediaState } from "@/lib/platform/native-device";

/**
 * Ders sesinin uygulamadaki kilit ekranı denetimleri (26 Kasım 2026, mobil 1. adım). Sınav Radyosu ve podcast
 * oynatıcısı aynı kancayı kullanır.
 *
 * - Android: başlık ve düğmeler yerel medya bildiriminde (`CortexMediaService`); düğmeler `handlers`'a döner. Web
 *   görünümü bildirim çizmediği için bu yol gerekir.
 * - iOS: kilit ekranı ve Denetim Merkezi bilgisini web görünümü kendi Media Session'ından yayımlar (oynatıcıların
 *   `navigator.mediaSession` kodu); burada yalnız ses oturumunun "çalma" kipinde etkin olduğu bildirilir.
 * - Web: hiçbir şey yapmaz.
 *
 * Bildirim gereksiz yere yenilenmesin diye durum yalnız anlamlı değişimde gönderilir: çalma/duraklama, başlık, süre,
 * önceki/sonraki, hız ve beklenenden 3 saniyeden fazla kayan konum (ileri sarma, bölüm değişimi).
 */

export type NativeMediaHandlers = Partial<Record<NativeMediaAction, (positionMs?: number) => void>>;

export type NativeMediaInput = Omit<NativeMediaState, "artist"> & { active: boolean; artist?: string };

const POSITION_DRIFT_MS = 3000;

type Sent = { state: NativeMediaState; at: number };

/** Bir önceki gönderimden sonra bu durum yeniden gönderilmeli mi? (Saf; sınanıyor.) */
export function mediaStateChanged(previous: Sent | null, next: NativeMediaState, now: number): boolean {
  if (!previous) return true;
  const before = previous.state;
  if (
    before.playing !== next.playing ||
    before.title !== next.title ||
    before.album !== next.album ||
    before.durationMs !== next.durationMs ||
    before.canPrevious !== next.canPrevious ||
    before.canNext !== next.canNext ||
    before.rate !== next.rate
  ) {
    return true;
  }
  const expected = before.playing ? before.positionMs + (now - previous.at) * before.rate : before.positionMs;
  return Math.abs(expected - next.positionMs) > POSITION_DRIFT_MS;
}

function normalized(input: NativeMediaInput): NativeMediaState {
  const round = (value: number) => (Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
  return {
    title: input.title.slice(0, 120) || "Cortex Plus",
    artist: (input.artist ?? "Cortex Plus").slice(0, 80),
    album: input.album.slice(0, 120),
    playing: input.playing,
    positionMs: round(input.positionMs),
    durationMs: round(input.durationMs),
    rate: Number.isFinite(input.rate) && input.rate > 0 ? input.rate : 1,
    canPrevious: input.canPrevious,
    canNext: input.canNext,
  };
}

export function useNativeMediaControls(input: NativeMediaInput, handlers: NativeMediaHandlers): void {
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;
  const sentRef = useRef<Sent | null>(null);
  const platform = typeof window === "undefined" ? "web" : getNativePlatform();
  const enabled = platform !== "web" && input.active;

  // Düğmeler: oturum açık kaldıkça tek dinleyici.
  useEffect(() => {
    if (!enabled || platform !== "android") return;
    let removed = false;
    let handle: { remove: () => Promise<void> } | null = null;
    void cortexDevice().then(async (plugin) => {
      if (!plugin || removed) return;
      const added = await plugin
        .addListener("mediaAction", (event) => handlersRef.current[event.action]?.(event.positionMs))
        .catch(() => null);
      if (removed) void added?.remove();
      else handle = added;
    });
    return () => {
      removed = true;
      void handle?.remove();
    };
  }, [enabled, platform]);

  // Oturum kapanınca (oynatıcı kapandı ya da sayfa değişti) bildirim kalkar.
  useEffect(() => {
    if (!enabled) return;
    return () => {
      sentRef.current = null;
      void cortexDevice().then((plugin) => plugin?.mediaStop().catch(() => undefined));
    };
  }, [enabled]);

  const state = normalized(input);
  const key = JSON.stringify(state);
  useEffect(() => {
    if (!enabled) return;
    const next = JSON.parse(key) as NativeMediaState;
    const now = Date.now();
    if (!mediaStateChanged(sentRef.current, next, now)) return;
    sentRef.current = { state: next, at: now };
    void cortexDevice().then((plugin) => plugin?.mediaUpdate(next).catch(() => undefined));
  }, [enabled, key]);
}
