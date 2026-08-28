"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { testWorkspaceSmtp } from "@/app/admin/actions";

export function SmtpTestButton() {
  const [pending, startTransition] = useTransition();
  const [lastResult, setLastResult] = useState<string | null>(null);

  function runTest() {
    startTransition(async () => {
      const result = await testWorkspaceSmtp();
      if (result.ok) {
        setLastResult("Bağlantı başarılı (Gmail SMTP verify).");
        toast.success("Workspace SMTP bağlantısı doğrulandı.");
      } else {
        setLastResult(result.error ?? "Doğrulama başarısız.");
        toast.error(result.error ?? "SMTP doğrulanamadı.");
      }
    });
  }

  return (
    <div className="space-y-2">
      <Button type="button" variant="outline" disabled={pending} onClick={runTest}>
        {pending ? "Test ediliyor…" : "Workspace SMTP bağlantısını test et"}
      </Button>
      {lastResult ? (
        <p className="text-sm text-muted-foreground">{lastResult}</p>
      ) : null}
    </div>
  );
}
