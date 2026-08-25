"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { requestParentPayment } from "@/app/kayit/actions";

export function AskParentPaymentButton({
  planId,
  planName,
}: {
  planId: string;
  planName: string;
}) {
  const [pending, startTransition] = useTransition();
  const [sent, setSent] = useState(false);

  useEffect(() => {
    setSent(false);
  }, [planId]);

  return (
    <button
      type="button"
      disabled={pending || sent}
      className="mt-2 w-full rounded-full border border-[var(--astra-border)] py-2.5 text-sm font-medium text-[var(--astra-text)] hover:border-[var(--astra-primary)] disabled:opacity-60"
      onClick={() => {
        startTransition(async () => {
          const result = await requestParentPayment(
            planId,
            `${planName} paketi için ödeme desteği rica ediyorum.`,
          );
          if (result.ok) {
            setSent(true);
            toast.success(
              "Veline bildirim gitti. Bağlı veli yoksa istek kaydedildi; veli bağlandığında görebilir.",
            );
          } else {
            toast.error(result.error ?? "İstek gönderilemedi.");
          }
        });
      }}
    >
      {sent ? "İstek gönderildi" : "Ebeveynden ödeme iste"}
    </button>
  );
}
