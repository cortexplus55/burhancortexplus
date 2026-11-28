"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  DEFAULT_LIVE_LOOK,
  DEFAULT_LIVE_SPEED,
  LIVE_PREF_KEYS,
  parseLiveLook,
  parseLiveSpeed,
  type LiveLook,
  type LiveSpeed,
} from "@/lib/learning/live-writing";

/**
 * Canlı Defter tercihleri (görünüm ve hız) bu tarayıcıda saklanır; sunucuya gitmez. Depolama kapalıysa (gizli
 * pencere, engelli site verisi) tercih yalnız sekme açıkken bellekte kalır. Sunucu çiziminde varsayılan döner,
 * istemci hidrasyondan sonra kayıtlı değeri okur (uyuşmazlık uyarısı yok).
 */
const memory: Record<string, string | null> = {};
const listeners = new Set<() => void>();

function read(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return memory[key] ?? null;
  }
}

function write(key: string, value: string) {
  memory[key] = value;
  try {
    window.localStorage.setItem(key, value);
  } catch {
    // Depolama kapalı: bellekteki değer yeter.
  }
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  const onStorage = (event: StorageEvent) => {
    if (event.key === LIVE_PREF_KEYS.look || event.key === LIVE_PREF_KEYS.speed) listener();
  };
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

const SERVER_SNAPSHOT = `${DEFAULT_LIVE_LOOK}|${DEFAULT_LIVE_SPEED}`;

function snapshot(): string {
  return `${parseLiveLook(read(LIVE_PREF_KEYS.look))}|${parseLiveSpeed(read(LIVE_PREF_KEYS.speed))}`;
}

export function useLivePrefs(): {
  look: LiveLook;
  speed: LiveSpeed;
  setLook: (look: LiveLook) => void;
  setSpeed: (speed: LiveSpeed) => void;
} {
  const value = useSyncExternalStore(subscribe, snapshot, () => SERVER_SNAPSHOT);
  const [look, speed] = value.split("|");
  const setLook = useCallback((next: LiveLook) => write(LIVE_PREF_KEYS.look, next), []);
  const setSpeed = useCallback((next: LiveSpeed) => write(LIVE_PREF_KEYS.speed, String(next)), []);
  return { look: parseLiveLook(look), speed: parseLiveSpeed(speed), setLook, setSpeed };
}
