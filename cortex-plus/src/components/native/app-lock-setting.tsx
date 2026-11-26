"use client";

import { useEffect, useId, useState } from "react";
import { getNativePlatform, isNativeApp } from "@/lib/platform/native";
import type { BiometricStatus } from "@/lib/platform/native-device";
import {
  LOCK_CHANGED_EVENT,
  LOCK_COPY,
  lockLabel,
  lockStatus,
  readLockEnabled,
  verifyIdentity,
  writeLockEnabled,
} from "@/lib/platform/native-lock";

/**
 * Ayarlar → "Giriş ve güvenlik": uygulama kilidi anahtarı (26 Kasım 2026, mobil 1. adım). Yalnız mobil uygulamada ve
 * kilidi taşıyan sürümde görünür. Açmak için önce bir kez doğrulama istenir (yanlışlıkla açılıp kilitli kalınmasın).
 */
export function AppLockSetting() {
  const [status, setStatus] = useState<BiometricStatus | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [platform, setPlatform] = useState<"ios" | "android" | "web">("web");
  const hintId = useId();

  useEffect(() => {
    if (!isNativeApp()) return;
    setPlatform(getNativePlatform());
    let active = true;
    void Promise.all([lockStatus(), readLockEnabled()]).then(([nextStatus, nextEnabled]) => {
      if (!active) return;
      setStatus(nextStatus);
      setEnabled(Boolean(nextStatus?.available) && nextEnabled);
    });
    return () => {
      active = false;
    };
  }, []);

  if (!status) return null;
  if (!status.available) {
    return (
      <div className="cx-app-lock" data-app-only>
        <p className="cx-app-lock-note">{LOCK_COPY.noDeviceLock}</p>
      </div>
    );
  }

  const label = lockLabel(status.kind, platform);
  const toggle = async () => {
    if (busy) return;
    setBusy(true);
    setNote(null);
    try {
      if (!enabled) {
        const outcome = await verifyIdentity();
        if (!outcome.verified) {
          if (outcome.reason !== "cancelled") setNote(LOCK_COPY.failed);
          return;
        }
      }
      const next = !enabled;
      await writeLockEnabled(next);
      setEnabled(next);
      window.dispatchEvent(new CustomEvent(LOCK_CHANGED_EVENT, { detail: next }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cx-app-lock" data-app-only>
      <div className="cx-app-lock-row">
        <span className="cx-app-lock-text">
          <strong>{label}</strong>
          <span id={hintId}>{LOCK_COPY.settingHint}</span>
        </span>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={label}
          aria-describedby={hintId}
          className="cx-app-lock-switch"
          disabled={busy}
          onClick={() => void toggle()}
        >
          <span aria-hidden />
        </button>
      </div>
      {note ? (
        <p className="cx-app-lock-note" role="status">
          {note}
        </p>
      ) : null}
    </div>
  );
}
