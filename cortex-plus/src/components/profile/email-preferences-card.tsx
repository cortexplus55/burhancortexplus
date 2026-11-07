"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Switch } from "@/components/ui/switch";
import { MARKETING_CONSENT_HINT, MARKETING_CONSENT_TEXT } from "@/lib/legal/marketing-consent";

/**
 * E-posta tercihleri (7 Kasım 2026): iki ayrı anahtar. Çalışma hatırlatması varsayılan açık (hizmetin kendi
 * bildirimi); duyuru ve kampanya e-postası varsayılan KAPALI ve yalnız burada ya da kayıtta açık onayla açılır.
 * Hesapla ilgili bilgilendirmeler (doğrulama, ödeme, iade) bu anahtarlara bağlı değildir.
 */
export function EmailPreferencesCard({ initial }: { initial: { reminders: boolean; marketing: boolean } }) {
  const [prefs, setPrefs] = useState(initial);
  const [saving, setSaving] = useState<"reminders" | "marketing" | null>(null);

  async function change(key: "reminders" | "marketing", value: boolean) {
    const before = prefs;
    setPrefs({ ...prefs, [key]: value });
    setSaving(key);
    try {
      const response = await fetch("/api/profile/email-preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [key]: value }),
      });
      if (!response.ok) {
        setPrefs(before);
        toast.error("Tercih kaydedilemedi.");
        return;
      }
      toast.success(value ? "Açıldı." : "Kapatıldı.");
    } catch {
      setPrefs(before);
      toast.error("Bağlantı hatası.");
    } finally {
      setSaving(null);
    }
  }

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Çalışma hatırlatması</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Sınavına kalan günü ve kaldığın yeri akşamları e-postayla hatırlatırız. Bugün çalıştıysan göndermeyiz.
          </p>
        </div>
        <Switch
          aria-label="Çalışma hatırlatması e-postası"
          checked={prefs.reminders}
          disabled={saving === "reminders"}
          onCheckedChange={(value) => void change("reminders", value)}
        />
      </div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <p className="text-sm font-medium">Duyuru ve kampanya e-postaları</p>
          <p className="mt-1 text-sm text-muted-foreground">{MARKETING_CONSENT_TEXT}</p>
          <p className="mt-1 text-xs text-muted-foreground">{MARKETING_CONSENT_HINT}</p>
        </div>
        <Switch
          aria-label="Duyuru ve kampanya e-postaları"
          checked={prefs.marketing}
          disabled={saving === "marketing"}
          onCheckedChange={(value) => void change("marketing", value)}
        />
      </div>
    </div>
  );
}
