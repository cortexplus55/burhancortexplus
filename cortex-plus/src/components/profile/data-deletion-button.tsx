"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { requestDataDeletion } from "@/app/actions";

export function DataDeletionButton({
  tone = "default",
}: {
  tone?: "default" | "astra";
}) {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const astra = tone === "astra";

  if (!confirming) {
    if (astra) {
      return (
        <button
          type="button"
          className="rounded-full border border-[var(--astra-border)] px-4 py-2 text-sm"
          onClick={() => setConfirming(true)}
        >
          Veri silme talebi oluştur
        </button>
      );
    }
    return (
      <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
        Veri silme talebi oluştur
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <p
        className={
          astra ? "text-sm text-[var(--astra-muted)]" : "text-sm text-muted-foreground"
        }
      >
        Talebi onaylarsan hesabındaki içerikler silinmek üzere sıraya alınır. Bu
        işlem geri alınamaz. Bağlı çocuk hesapları silinmez.
      </p>
      <div className="flex gap-2">
        {astra ? (
          <>
            <button
              type="button"
              disabled={pending}
              className="rounded-full bg-red-500/20 px-4 py-2 text-sm text-red-200 disabled:opacity-60"
              onClick={() =>
                startTransition(async () => {
                  const result = await requestDataDeletion();
                  if (result.ok) toast.success("Talebin alındı.");
                  else toast.error("Talep oluşturulamadı.");
                  setConfirming(false);
                })
              }
            >
              Onaylıyorum
            </button>
            <button
              type="button"
              className="rounded-full px-4 py-2 text-sm text-[var(--astra-muted)]"
              onClick={() => setConfirming(false)}
            >
              Vazgeç
            </button>
          </>
        ) : (
          <>
            <Button
              type="button"
              variant="destructive"
              disabled={pending}
              onClick={() =>
                startTransition(async () => {
                  const result = await requestDataDeletion();
                  if (result.ok) toast.success("Talebin alındı.");
                  else toast.error("Talep oluşturulamadı.");
                  setConfirming(false);
                })
              }
            >
              Onaylıyorum
            </Button>
            <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
              Vazgeç
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
