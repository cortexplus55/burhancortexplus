"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { requestDataDeletion } from "@/app/actions";

export function DataDeletionButton() {
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();

  if (!confirming) {
    return (
      <Button type="button" variant="outline" onClick={() => setConfirming(true)}>
        Veri silme talebi oluştur
      </Button>
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">
        Talebi onaylarsan hesabındaki içerikler silinmek üzere sıraya alınır. Bu
        işlem geri alınamaz.
      </p>
      <div className="flex gap-2">
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
      </div>
    </div>
  );
}
