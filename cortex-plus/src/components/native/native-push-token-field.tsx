"use client";

import { useEffect, useState } from "react";
import { storedPushToken } from "@/lib/platform/native-push";

/**
 * Çıkış formunun gizli alanı (26 Kasım 2026): mobil uygulamada bu cihazın bildirim anahtarı, sunucu çıkışta onu siler
 * (`/api/auth/signout`). Web'de ve anahtar yoksa hiçbir şey çizmez.
 */
export function NativePushTokenField() {
  const [token, setToken] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    void storedPushToken().then((value) => {
      if (active) setToken(value);
    });
    return () => {
      active = false;
    };
  }, []);
  return token ? <input type="hidden" name="push_token" value={token} /> : null;
}
