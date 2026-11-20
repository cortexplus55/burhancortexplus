"use client";

import { useState } from "react";
import {
  MARKETING_ALREADY_OFF,
  MARKETING_OFF_DONE,
  MARKETING_OFF_LABEL,
  PREFERENCE_SAVE_ERROR,
} from "@/lib/notifications/preference-copy";

/**
 * E-postadaki bağlantının sayfasında kampanya iznini kapatan düğme (Faz 6, 20 Kasım 2026). Yalnız kapatır: izni açmak
 * yasal onay kanıtı ister ve Ayarlar'dan ya da kayıttan yapılır. Tek tık ucunun kendisini çağırır (`c=marketing`).
 */
export function MarketingOffButton({ token, initiallyOn }: { token: string; initiallyOn: boolean }) {
  const [state, setState] = useState<"on" | "busy" | "off" | "done" | "failed">(initiallyOn ? "on" : "off");

  async function turnOff() {
    setState("busy");
    try {
      const response = await fetch(
        `/api/bildirim-tercihleri/abonelik?token=${encodeURIComponent(token)}&c=marketing`,
        { method: "POST" },
      );
      setState(response.ok ? "done" : "failed");
    } catch {
      setState("failed");
    }
  }

  if (state === "off") return <p className="cx-np-marketing-text">{MARKETING_ALREADY_OFF}</p>;
  if (state === "done") {
    return (
      <p className="cx-np-marketing-text" role="status">
        {MARKETING_OFF_DONE}
      </p>
    );
  }
  return (
    <>
      <p className="cx-np-marketing-text">
        Duyuru, yeni özellik ve davet kampanyası e-postaları. Hesabın ve çalışma hatırlatmaların etkilenmez.
      </p>
      <button
        type="button"
        className="cx-np-marketing-btn cx-weak"
        aria-label={MARKETING_OFF_LABEL}
        disabled={state === "busy"}
        onClick={() => void turnOff()}
      >
        {state === "busy" ? "Kaydediliyor…" : MARKETING_OFF_LABEL}
      </button>
      {state === "failed" ? (
        <p role="alert" className="cx-np-status is-error">
          {PREFERENCE_SAVE_ERROR}
        </p>
      ) : null}
    </>
  );
}
