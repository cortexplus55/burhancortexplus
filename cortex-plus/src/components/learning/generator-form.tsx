"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { UpgradeSheet } from "@/components/paywall/upgrade-sheet";
import { cn } from "@/lib/utils";

export function GeneratorForm({
  endpoint,
  fieldLabel,
  placeholder,
  submitLabel,
  creditCost,
  returnPath,
  buildBody,
  extraFields,
  variant = "default",
}: {
  endpoint: string;
  fieldLabel: string;
  placeholder: string;
  submitLabel: string;
  creditCost: number | null;
  returnPath: string;
  buildBody: (value: string, extras: Record<string, string>) => Record<string, unknown>;
  extraFields?: { name: string; label: string; type: "number"; defaultValue: string }[];
  variant?: "default" | "astra";
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

  const isAstra = variant === "astra";

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

  const inputClass = isAstra
    ? "border-[var(--astra-border)] bg-[var(--astra-surface-elevated)] text-[var(--astra-text)] placeholder:text-[var(--astra-muted)] focus-visible:border-[var(--astra-primary)] focus-visible:ring-[var(--astra-primary)]/30"
    : undefined;

  const labelClass = isAstra ? "text-[var(--astra-muted)]" : undefined;

  return (
    <>
      <form
        onSubmit={submit}
        className={cn(
          "grid max-w-2xl gap-3",
          extraFields?.length ? "sm:grid-cols-2" : "sm:grid-cols-[1fr_auto]",
        )}
      >
        <div className={cn("space-y-2", extraFields?.length && "sm:col-span-2")}>
          <Label htmlFor="generator-topic" className={labelClass}>
            {fieldLabel}
          </Label>
          <Input
            id="generator-topic"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            placeholder={placeholder}
            required
            minLength={3}
            className={inputClass}
            disabled={loading}
          />
        </div>

        {extraFields?.map((field) => (
          <div key={field.name} className="space-y-2">
            <Label htmlFor={`generator-${field.name}`} className={labelClass}>
              {field.label}
            </Label>
            <Input
              id={`generator-${field.name}`}
              type={field.type}
              value={extras[field.name] ?? ""}
              onChange={(event) =>
                setExtras((prev) => ({ ...prev, [field.name]: event.target.value }))
              }
              className={cn("w-full sm:w-28", inputClass)}
              disabled={loading}
            />
          </div>
        ))}

        <div className="flex items-end">
          {isAstra ? (
            <button
              type="submit"
              disabled={loading || value.trim().length < 3}
              className="astra-btn-primary h-10 w-full rounded-full px-6 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
            >
              {loading ? "Üretiliyor…" : submitLabel}
            </button>
          ) : (
            <Button type="submit" disabled={loading || value.trim().length < 3}>
              {loading ? "Üretiliyor…" : submitLabel}
            </Button>
          )}
        </div>

        {loading && isAstra ? (
          <div
            className="h-1 overflow-hidden rounded-full bg-white/10 sm:col-span-2"
            aria-hidden
          >
            <div className="astra-learning-shimmer h-full w-1/3 rounded-full bg-amber-400/60" />
          </div>
        ) : null}

        {creditCost !== null ? (
          <p
            className={cn(
              "text-xs sm:col-span-2",
              isAstra ? "text-[var(--astra-muted)]" : "text-muted-foreground",
            )}
          >
            Bu işlem {creditCost} kredi kullanır. Başarısız olursa kredin iade edilir.
          </p>
        ) : null}
      </form>

      <UpgradeSheet
        open={paywall}
        onOpenChange={setPaywall}
        message="Bu işlem için yeterli kredin veya ücretsiz hakkın kalmadı."
        returnPath={returnPath}
      />
    </>
  );
}
