"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { cancelParentLink } from "@/app/kayit/actions";
import { formatDate } from "@/lib/format";

export function PendingChildCard({
  linkId,
  title,
  createdAt,
}: {
  linkId: string;
  title: string;
  createdAt: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <article className="astra-pay-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-medium">{title}</p>
          <p className="mt-0.5 text-xs text-[var(--astra-muted)]">
            {formatDate(createdAt)} · onay bekliyor
          </p>
        </div>
        <span className="shrink-0 rounded-full bg-amber-500/15 px-3 py-1 text-xs text-amber-300">
          Bekliyor
        </span>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-[var(--astra-muted)]">
        Öğrenci profilinden onaylayınca ilerleme özeti açılır. Sohbet içerikleri
        gizli kalır; Plus da onay sonrası alınır.
      </p>
      <button
        type="button"
        disabled={pending}
        className="mt-3 text-xs text-[var(--astra-muted)] underline-offset-2 hover:underline disabled:opacity-50"
        onClick={() => {
          startTransition(async () => {
            const result = await cancelParentLink(linkId);
            if (!result.ok) {
              toast.error(result.error ?? "İptal edilemedi.");
              return;
            }
            toast.success("İstek iptal edildi.");
            router.refresh();
          });
        }}
      >
        İsteği iptal et
      </button>
    </article>
  );
}
