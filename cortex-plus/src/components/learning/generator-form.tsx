"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UpgradeSheet } from "@/components/paywall/upgrade-sheet";

export function GeneratorForm({
  endpoint,
  fieldLabel,
  placeholder,
  submitLabel,
  creditCost,
  returnPath,
  buildBody,
  extraFields,
}: {
  endpoint: string;
  fieldLabel: string;
  placeholder: string;
  submitLabel: string;
  creditCost: number | null;
  returnPath: string;
  buildBody: (value: string, extras: Record<string, string>) => Record<string, unknown>;
  extraFields?: { name: string; label: string; type: "number"; defaultValue: string }[];
}) {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [extras, setExtras] = useState<Record<string, string>>(
    Object.fromEntries(
      (extraFields ?? []).map((field) => [field.name, field.defaultValue]),
    ),
  );
  const [loading, setLoading] = useState(false);
  const [paywall, setPaywall] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setLoading(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(buildBody(value, extras)),
      });

      if (res.status === 402) {
        setPaywall(true);
        return;
      }

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "İşlem tamamlanamadı.");
        return;
      }

      toast.success("Hazır! İçeriğin kaydedildi.");
      setValue("");
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası. Lütfen tekrar deneyin.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <form onSubmit={submit} className="grid max-w-2xl gap-3 sm:grid-cols-[1fr_auto]">
        <div className="space-y-2">
          <Label htmlFor="generator-topic">{fieldLabel}</Label>
          <Input
            id="generator-topic"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            required
            minLength={3}
          />
        </div>

        {extraFields?.map((field) => (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={`generator-${field.name}`}>{field.label}</Label>
            <Input
              id={`generator-${field.name}`}
              type={field.type}
              value={extras[field.name] ?? ""}
              onChange={(event) =>
                setExtras((prev) => ({ ...prev, [field.name]: event.target.value }))
              }
              className="w-28"
            />
          </div>
        ))}

        <div className="flex items-end">
          <Button type="submit" disabled={loading || value.trim().length < 3}>
            {loading ? "Üretiliyor…" : submitLabel}
          </Button>
        </div>

        {creditCost !== null ? (
          <p className="text-xs text-muted-foreground sm:col-span-2">
            Bu işlem {creditCost} kredi kullanır. Başarısız olursa kredin iade edilir.
          </p>
        ) : null}
      </form>

      <UpgradeSheet
        open={paywall}
        onOpenChange={setPaywall}
        message="Bu işlem için yeterli kredin kalmadı."
        returnPath={returnPath}
      />
    </>
  );
}
