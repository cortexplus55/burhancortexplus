"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { formatTry } from "@/lib/format";
import { periodLabel, type BillingPeriod } from "@/lib/payments/subscription";

export type SubscriptionView = {
  planName: string;
  planPriceTry: number | null;
  billingPeriod: BillingPeriod;
  currentPeriodEnd: string | null;
  daysLeft: number | null;
  cancelAtPeriodEnd: boolean;
  autoRenew: boolean;
};

function formatDay(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

/**
 * Aboneliğin bitişi ekranda durmadığında öğrenci ancak kotası kesilince
 * öğreniyordu. Kalan gün, yenileme tarihi ve iptal buradan görünür.
 */
export function SubscriptionCard({ sub }: { sub: SubscriptionView }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [cancelled, setCancelled] = useState(sub.cancelAtPeriodEnd);

  const left = sub.daysLeft;
  const endText = formatDay(sub.currentPeriodEnd);
  const soon = left !== null && left <= 3;

  async function toggleCancel(action: "cancel" | "resume") {
    setBusy(true);
    try {
      const res = await fetch("/api/payments/subscription", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "İşlem tamamlanamadı.");
        return;
      }
      setCancelled(action === "cancel");
      toast.success(
        action === "cancel"
          ? `İptal alındı. ${endText} tarihine kadar her şey açık kalıyor.`
          : "Aboneliğin devam ediyor.",
      );
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="cortex-premium-card mb-6 rounded-2xl border border-[var(--astra-border)] bg-[var(--astra-surface)] p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-[var(--astra-text)]">
              {sub.planName}
            </h2>
            <Badge className="border-amber-500/30 bg-amber-500/15 text-amber-100">
              {periodLabel(sub.billingPeriod)}
            </Badge>
          </div>
          <p className="mt-1 text-sm text-[var(--astra-muted)]">
            {cancelled
              ? `İptal edildi — ${endText} tarihine kadar açık kalıyor, sonra ücretsiz plana döner.`
              : `${endText} tarihinde yenilenmesi gerekiyor.`}
          </p>
        </div>
        {sub.planPriceTry !== null ? (
          <p className="text-right text-sm text-[var(--astra-muted)]">
            <span className="block text-base font-semibold text-[var(--astra-text)]">
              {formatTry(sub.planPriceTry)}
            </span>
            {periodLabel(sub.billingPeriod)}
          </p>
        ) : null}
      </div>

      {left !== null ? (
        <p
          className={
            soon
              ? "mt-3 rounded-lg border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-100"
              : "mt-3 text-sm text-[var(--astra-muted)]"
          }
        >
          {left <= 0
            ? "Bugün son gün."
            : left === 1
              ? "1 gün kaldı."
              : `${left} gün kaldı.`}
          {!cancelled && !sub.autoRenew
            ? " Yenileme otomatik değil — bitmeden yenilersen kalan günlerin yanmaz, üstüne eklenir."
            : null}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => router.push("/pay")}>
          {cancelled ? "Yeniden başlat" : "Şimdi yenile"}
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => toggleCancel(cancelled ? "resume" : "cancel")}
        >
          {busy
            ? "…"
            : cancelled
              ? "İptali geri al"
              : "Yenilemeyi durdur"}
        </Button>
      </div>
    </section>
  );
}
