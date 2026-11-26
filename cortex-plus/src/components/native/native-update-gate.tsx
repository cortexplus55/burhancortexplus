"use client";

import { useEffect, useState } from "react";
import { getNativePlatform, isNativeApp } from "@/lib/platform/native";
import { UPDATE_COPY, type AppVersionStatus } from "@/lib/platform/app-version";

/**
 * Zorunlu güncelleme (26 Kasım 2026, mobil 1. adım). Uygulama açılınca ve en çok 6 saatte bir öne gelince sürümünü
 * `/api/app/version`'a sorar. En düşük sürümün altındaysa kapatılamayan ekran, son sürümün altındaysa kapatılabilen
 * şerit. Web'de, sürüm okunamazsa ya da sunucu cevap vermezse hiçbir şey çizmez.
 */

type Result = { status: AppVersionStatus; latest: string; storeUrl: string | null; platform: "ios" | "android" };

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000;
const DISMISS_KEY = "cp.update.dismissed";

function dismissedVersion(): string | null {
  try {
    return window.sessionStorage.getItem(DISMISS_KEY);
  } catch {
    return null;
  }
}

export function NativeUpdateGate() {
  const [result, setResult] = useState<Result | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);

  useEffect(() => {
    if (!isNativeApp()) return;
    const platform = getNativePlatform();
    if (platform === "web") return;
    setDismissed(dismissedVersion());
    let active = true;
    let lastCheck = 0;
    let handle: { remove: () => Promise<void> } | null = null;

    const check = async () => {
      lastCheck = Date.now();
      let version: string;
      try {
        const { App } = await import("@capacitor/app");
        version = (await App.getInfo()).version;
      } catch {
        return;
      }
      try {
        const response = await fetch(
          `/api/app/version?platform=${platform}&version=${encodeURIComponent(version)}`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const data = (await response.json()) as Omit<Result, "platform">;
        if (active && (data.status === "ok" || data.status === "update_available" || data.status === "update_required")) {
          setResult({ ...data, platform });
        }
      } catch {
        /* ağ yoksa bir sonraki açılışta */
      }
    };

    void check();
    void import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive && Date.now() - lastCheck >= CHECK_INTERVAL_MS) void check();
        }),
      )
      .then((added) => {
        if (active) handle = added;
        else void added.remove();
      })
      .catch(() => undefined);

    return () => {
      active = false;
      void handle?.remove();
    };
  }, []);

  if (!result || result.status === "ok") return null;
  const fallback = result.platform === "ios" ? UPDATE_COPY.iosFallback : UPDATE_COPY.androidFallback;

  if (result.status === "update_required") {
    return (
      <div className="cx-update-gate" role="alertdialog" aria-modal="true" aria-labelledby="cx-update-title" aria-describedby="cx-update-body">
        <div className="cx-update-card">
          <h2 id="cx-update-title">{UPDATE_COPY.requiredTitle}</h2>
          <p id="cx-update-body">{UPDATE_COPY.requiredBody}</p>
          {result.storeUrl ? (
            <a className="cx-update-action" href={result.storeUrl}>
              {UPDATE_COPY.action}
            </a>
          ) : (
            <p className="cx-update-fallback">{fallback}</p>
          )}
        </div>
      </div>
    );
  }

  if (dismissed === result.latest) return null;
  return (
    <div className="cx-update-banner" role="status">
      <span>{UPDATE_COPY.availableBody}</span>
      {result.storeUrl ? (
        <a className="cx-update-banner-action" href={result.storeUrl}>
          {UPDATE_COPY.action}
        </a>
      ) : null}
      <button
        type="button"
        className="cx-update-banner-later"
        onClick={() => {
          try {
            window.sessionStorage.setItem(DISMISS_KEY, result.latest);
          } catch {
            /* yalnız bu açılışta kapanır */
          }
          setDismissed(result.latest);
        }}
      >
        {UPDATE_COPY.later}
      </button>
    </div>
  );
}
