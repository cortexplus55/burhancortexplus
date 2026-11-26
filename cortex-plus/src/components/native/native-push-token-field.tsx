"use client";

import { useEffect, useRef, useState } from "react";
import { isNativeApp } from "@/lib/platform/native";
import { storedPushToken } from "@/lib/platform/native-push";
import { clearLocalReminders } from "@/lib/platform/native-reminders";

/**
 * Çıkış formunun gizli alanı (26 Kasım 2026): mobil uygulamada bu cihazın bildirim anahtarı, sunucu çıkışta onu siler
 * (`/api/auth/signout`). Form gönderilirken telefondaki yerel çalışma hatırlatmaları da silinir (aynı telefonda başka
 * bir öğrenci eski hesabın hazırlık adını görmesin). Web'de hiçbir şey çizmez.
 */
export function NativePushTokenField() {
  const [token, setToken] = useState<string | null>(null);
  const [native, setNative] = useState(false);
  const markerRef = useRef<HTMLSpanElement | null>(null);

  useEffect(() => {
    let active = true;
    setNative(isNativeApp());
    void storedPushToken().then((value) => {
      if (active) setToken(value);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!native) return;
    const form = markerRef.current?.closest("form");
    if (!form) return;
    const clear = () => void clearLocalReminders();
    form.addEventListener("submit", clear);
    return () => form.removeEventListener("submit", clear);
  }, [native]);

  if (!native) return null;
  return (
    <>
      <span ref={markerRef} hidden />
      {token ? <input type="hidden" name="push_token" value={token} /> : null}
    </>
  );
}
