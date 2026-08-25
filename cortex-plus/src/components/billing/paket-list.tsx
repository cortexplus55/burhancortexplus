"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatTry } from "@/lib/format";

type Plan = {
  id: string;
  name: string;
  description: string | null;
  price_try: number;
  credit_amount: number;
  is_premium: boolean;
};

export function PaketList({ plans }: { plans: Plan[] }) {
  const searchParams = useSearchParams();
  const returnTo = searchParams.get("returnTo");
  const [loadingId, setLoadingId] = useState<string | null>(null);
  const [iframeUrl, setIframeUrl] = useState<string | null>(null);

  async function startCheckout(planId: string) {
    setLoadingId(planId);
    try {
      const res = await fetch("/api/payments/paytr/create-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ planId }),
      });

      const payload = await res.json().catch(() => ({}));
      if (!res.ok) {
        toast.error(payload.error ?? "Ödeme başlatılamadı.");
        return;
      }

      setIframeUrl(payload.iframeUrl);
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setLoadingId(null);
    }
  }

  if (!plans.length) {
    return (
      <p className="rounded-lg border border-dashed p-6 text-sm text-muted-foreground">
        Paketler henüz yapılandırılmadı. Supabase migration&apos;ları uygulandığında
        buradaki liste dolar.
      </p>
    );
  }

  if (iframeUrl) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Ödeme formu güvenli çerçevede açıldı. İşlem tamamlandığında kredilerin
          doğrulanmış bildirim sonrası yüklenir.
        </p>
        <iframe
          src={iframeUrl}
          title="PayTR ödeme formu"
          className="h-[640px] w-full rounded-lg border"
        />
        <Button type="button" variant="outline" onClick={() => setIframeUrl(null)}>
          Paketlere dön
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {returnTo ? (
        <p className="rounded-md border bg-accent/40 p-3 text-sm">
          Kredi yükledikten sonra kaldığın yere döneceksin. Çalışman kaybolmadı.
        </p>
      ) : null}

      <div className="grid gap-4 md:grid-cols-3">
        {plans.map((plan) => (
          <article key={plan.id} className="flex flex-col rounded-lg border p-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-medium">{plan.name}</h2>
              {plan.is_premium ? <Badge>Premium</Badge> : null}
            </div>
            <p className="mt-2 text-2xl font-semibold">{formatTry(plan.price_try)}</p>
            <p className="mt-1 text-sm text-muted-foreground">{plan.description}</p>
            <p className="mt-2 text-sm">{plan.credit_amount} kredi</p>
            <Button
              type="button"
              className="mt-4"
              disabled={loadingId === plan.id}
              onClick={() => startCheckout(plan.id)}
            >
              {loadingId === plan.id ? "Hazırlanıyor…" : "Satın al"}
            </Button>
          </article>
        ))}
      </div>
    </div>
  );
}
