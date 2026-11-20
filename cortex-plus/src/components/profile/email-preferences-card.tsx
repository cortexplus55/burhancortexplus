"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { MARKETING_CONSENT_HINT, MARKETING_CONSENT_TEXT } from "@/lib/legal/marketing-consent";

/**
 * Duyuru ve kampanya e-postası izni (7 Kasım 2026): varsayılan KAPALI ve yalnız burada ya da kayıtta açık onayla
 * açılır; onay kanıtı `consent_records`a yazılır. Hesapla ilgili bilgilendirmeler (doğrulama, ödeme, iade) bu
 * anahtara bağlı değildir.
 *
 * Faz 6 (20 Kasım 2026): çalışma hatırlatması bu karttan çıktı; hatırlatma, sınav öncesi, haftalık karne, uygulama
 * içi bildirim ve saat seçimi tek yerde (`NotificationPreferencesPanel`).
 */
export function EmailPreferencesCard({ initial }: { initial: { marketing: boolean } }) {
  const [marketing, setMarketing] = useState(initial.marketing);
  const [saving, setSaving] = useState(false);

  async function change(value: boolean) {
    const before = marketing;
    setMarketing(value);
    setSaving(true);
    try {
      const response = await fetch("/api/profile/email-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ marketing: value }),
      });
      if (!response.ok) {
        setMarketing(before);
        toast.error("Tercih kaydedilemedi.");
        return;
      }
      toast.success(value ? "Açıldı." : "Kapatıldı.");
    } catch {
      setMarketing(before);
      toast.error("Bağlantı hatası.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-sm font-medium">Duyuru ve kampanya e-postaları</p>
        <p className="mt-1 text-sm text-muted-foreground">{MARKETING_CONSENT_TEXT}</p>
        <p className="mt-1 text-xs text-muted-foreground">{MARKETING_CONSENT_HINT}</p>
      </div>
      <Switch
        aria-label="Duyuru ve kampanya e-postaları"
        checked={marketing}
        disabled={saving}
        onCheckedChange={(value) => void change(value)}
      />
    </div>
  );
}
