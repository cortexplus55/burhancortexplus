"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { unlinkParentChild } from "@/app/kayit/actions";

export function UnlinkChildButton({
  linkId,
  childName,
}: {
  linkId: string;
  childName: string;
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const router = useRouter();

  if (!confirming) {
    return (
      <button
        type="button"
        className="text-xs text-[var(--astra-muted)] underline-offset-2 hover:underline"
        onClick={() => setConfirming(true)}
      >
        Bağlantıyı kaldır
      </button>
    );
  }

  return (
    <span className="flex flex-wrap items-center gap-2 text-xs">
      <span className="text-[var(--astra-muted)]">
        {childName} ile bağlantı koparılacak. Raporlar kapanır; çocuğun hesabı
        silinmez.
      </span>
      <button
        type="button"
        disabled={pending}
        className="rounded-full bg-red-500/20 px-3 py-1 text-red-200 disabled:opacity-60"
        onClick={() => {
          startTransition(async () => {
            const result = await unlinkParentChild(linkId);
            if (!result.ok) {
              toast.error(result.error ?? "Kaldırılamadı.");
              return;
            }
            toast.success("Bağlantı kaldırıldı.");
            router.push("/veli");
            router.refresh();
          });
        }}
      >
        {pending ? "Kaldırılıyor…" : "Onayla"}
      </button>
      <button
        type="button"
        className="text-[var(--astra-muted)]"
        onClick={() => setConfirming(false)}
      >
        Vazgeç
      </button>
    </span>
  );
}
