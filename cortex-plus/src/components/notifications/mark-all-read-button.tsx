"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { markAllNotificationsRead } from "@/app/actions";

export function MarkAllReadButton() {
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  return (
    <button
      type="button"
      disabled={pending}
      className="text-xs font-semibold text-[var(--astra-primary)] disabled:opacity-60"
      onClick={() => {
        startTransition(async () => {
          const result = await markAllNotificationsRead();
          if (result.ok) {
            toast.success("Tümü okundu.");
            router.refresh();
          } else toast.error("Güncellenemedi.");
        });
      }}
    >
      {pending ? "İşleniyor…" : "Tümünü okundu işaretle"}
    </button>
  );
}
