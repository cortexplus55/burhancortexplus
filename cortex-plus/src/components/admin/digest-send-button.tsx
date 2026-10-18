"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { sendDailyDigestNow } from "@/app/admin/actions";

/** Günlük özet e-postasını sabahı beklemeden gönderir (plan 4.8). */
export function DigestSendButton() {
  const [pending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<string | null>(null);

  function run() {
    startTransition(async () => {
      const result = await sendDailyDigestNow();
      if (result.ok) {
        setLastResult(result.message);
        toast.success("Günlük özet gönderildi.");
      } else {
        setLastResult(result.error);
        toast.error(result.error);
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" disabled={pending} onClick={run}>
        {pending ? "Gönderiliyor…" : "Özeti şimdi gönder"}
      </Button>
      {lastResult ? <p className="text-sm text-muted-foreground">{lastResult}</p> : null}
    </div>
  );
}
