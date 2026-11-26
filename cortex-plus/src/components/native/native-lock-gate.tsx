"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Lock } from "lucide-react";
import { isNativeApp } from "@/lib/platform/native";
import {
  LOCK_CHANGED_EVENT,
  LOCK_COPY,
  LOCKED_CLASS,
  lockStatus,
  readLockEnabled,
  setLockedClass,
  shouldLockOnResume,
  verifyIdentity,
  writeLockEnabled,
} from "@/lib/platform/native-lock";
import { NativePushTokenField } from "@/components/native/native-push-token-field";

/**
 * Uygulama kilidi ekranı (26 Kasım 2026, mobil 1. adım). Kural ve saklama `native-lock.ts`te. Kilitliyken sayfanın
 * içeriği görünmez (`html.cx-locked`, `native-app.css`); bu katman en üstte, yüz/parmak izi penceresi kendiliğinden
 * açılır. Doğrulanamazsa "Kilidi aç" yeniden dener; "Çıkış yap" oturumu kapatır ve kilidi kaldırır.
 */
export function NativeLockGate() {
  const [locked, setLocked] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const enabledRef = useRef(false);
  const hiddenAtRef = useRef<number | null>(null);
  const verifyingRef = useRef(false);
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  const unlock = useCallback(() => {
    setLockedClass(false);
    setLocked(false);
    setMessage(null);
  }, []);

  const attempt = useCallback(async () => {
    if (verifyingRef.current) return;
    verifyingRef.current = true;
    setVerifying(true);
    try {
      const status = await lockStatus();
      if (!status?.available) {
        // Eklenti yok ya da telefonda ekran kilidi kalmadı: öğrenci kendi hesabının dışında kalmasın.
        enabledRef.current = false;
        await writeLockEnabled(false);
        unlock();
        return;
      }
      const outcome = await verifyIdentity();
      if (outcome.verified) unlock();
      else if (outcome.reason !== "cancelled") setMessage(outcome.reason === "lockout" ? LOCK_COPY.lockout : LOCK_COPY.failed);
    } finally {
      verifyingRef.current = false;
      setVerifying(false);
    }
  }, [unlock]);

  const lockNow = useCallback(() => {
    setLockedClass(true);
    setLocked(true);
    setMessage(null);
    void attempt();
  }, [attempt]);

  useEffect(() => {
    if (!isNativeApp()) {
      setLockedClass(false);
      return;
    }
    let active = true;
    let handle: { remove: () => Promise<void> } | null = null;
    const coldLocked = document.documentElement.classList.contains(LOCKED_CLASS);

    void readLockEnabled().then((enabled) => {
      if (!active) return;
      enabledRef.current = enabled;
      if (enabled) lockNow();
      else if (coldLocked) setLockedClass(false);
    });

    void import("@capacitor/app")
      .then(({ App }) =>
        App.addListener("appStateChange", ({ isActive }) => {
          if (!isActive) {
            hiddenAtRef.current = Date.now();
            return;
          }
          const lock = shouldLockOnResume(enabledRef.current, hiddenAtRef.current, Date.now());
          hiddenAtRef.current = null;
          if (lock) lockNow();
        }),
      )
      .then((added) => {
        if (active) handle = added;
        else void added.remove();
      })
      .catch(() => undefined);

    const onChange = (event: Event) => {
      enabledRef.current = (event as CustomEvent<boolean>).detail === true;
    };
    window.addEventListener(LOCK_CHANGED_EVENT, onChange);

    return () => {
      active = false;
      void handle?.remove();
      window.removeEventListener(LOCK_CHANGED_EVENT, onChange);
    };
  }, [lockNow]);

  useEffect(() => {
    if (locked && !verifying) buttonRef.current?.focus();
  }, [locked, verifying]);

  if (!locked || typeof document === "undefined") return null;
  return createPortal(
    <div className="cx-lock-layer" role="dialog" aria-modal="true" aria-labelledby="cx-lock-title">
      <div className="cx-lock-card">
        <span className="cx-lock-icon" aria-hidden>
          <Lock className="h-7 w-7" />
        </span>
        <h2 id="cx-lock-title">{LOCK_COPY.title}</h2>
        <p>{message ?? LOCK_COPY.reason}</p>
        <button ref={buttonRef} type="button" className="cx-lock-action" onClick={() => void attempt()} disabled={verifying}>
          {LOCK_COPY.unlock}
        </button>
        <form
          action="/api/auth/signout"
          method="post"
          className="cx-lock-signout"
          onSubmit={() => {
            void writeLockEnabled(false);
          }}
        >
          <NativePushTokenField />
          <button type="submit">{LOCK_COPY.signOut}</button>
        </form>
      </div>
    </div>,
    document.body,
  );
}
