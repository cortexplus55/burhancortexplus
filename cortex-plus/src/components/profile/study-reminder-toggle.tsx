"use client";

import { useState } from "react";
import { toast } from "sonner";

/**
 * Hatırlatma e-postasını kapatma düğmesi.
 *
 * Kapatılamayan e-posta gönderilmez. Bu düğme olmadan gönderim de
 * açılmıyor; ikisi bir arada yayına giriyor.
 *
 * Kapatmak uygulama içi bildirimi durdurmuyor — öğrenci uygulamaya
 * girdiğinde yolunu yine görüyor. Kapanan şey yalnızca posta.
 */
export function StudyReminderToggle({ initial }: { initial: boolean }) {
  const [on, setOn] = useState(initial);
  const [saving, setSaving] = useState(false);

  async function toggle() {
    const next = !on;
    setSaving(true);
    setOn(next);
    try {
      const res = await fetch("/api/profile/study-reminder", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });
      if (!res.ok) {
        setOn(!next);
        toast.error("Tercih kaydedilemedi.");
        return;
      }
      toast.success(
        next ? "Hatırlatma e-postası açık." : "Hatırlatma e-postası kapalı.",
      );
    } catch {
      setOn(!next);
      toast.error("Bağlantı hatası.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={saving}
      onClick={() => void toggle()}
      className="text-sm font-medium underline disabled:opacity-50"
    >
      {on ? "E-posta hatırlatmasını kapat" : "E-posta hatırlatmasını aç"}
    </button>
  );
}
