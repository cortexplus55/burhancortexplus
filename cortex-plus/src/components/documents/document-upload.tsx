"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditGate } from "@/components/paywall/credit-gate";
import { cn } from "@/lib/utils";

const ALLOWED = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "text/plain",
];

const MAX_BYTES = 15 * 1024 * 1024;

export function DocumentUpload({
  creditCost,
  variant = "default",
}: {
  creditCost: number | null;
  variant?: "default" | "astra";
}) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"idle" | "uploading" | "processing">("idle");
  const [paywall, setPaywall] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;

    if (!ALLOWED.includes(file.type)) {
      toast.error("Desteklenmeyen dosya türü.");
      return;
    }
    if (file.size > MAX_BYTES) {
      toast.error("Dosya en fazla 15 MB olabilir.");
      return;
    }

    setStage("uploading");
    try {
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await fetch("/api/documents/upload", {
        method: "POST",
        body: form,
      });
      const uploaded = await uploadRes.json().catch(() => ({}));

      if (!uploadRes.ok) {
        toast.error(uploaded.error ?? "Yükleme başarısız.");
        return;
      }

      setStage("processing");
      const processRes = await fetch("/api/documents/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ documentId: uploaded.documentId }),
      });

      if (processRes.status === 402) {
        setPaywall(true);
        return;
      }

      const processed = await processRes.json().catch(() => ({}));
      if (!processRes.ok) {
        toast.error(processed.error ?? "Doküman işlenemedi.");
        return;
      }

      toast.success("Doküman hazır. AI öğretmende kaynak olarak kullanabilirsin.");
      setFile(null);
      router.refresh();
    } catch {
      toast.error("Bağlantı hatası.");
    } finally {
      setStage("idle");
    }
  }

  const isAstra = variant === "astra";

  return (
    <>
      <form onSubmit={submit} className="max-w-md space-y-3">
        <div className="space-y-2">
          <Label
            htmlFor="document-file"
            className={isAstra ? "text-[var(--astra-muted)]" : undefined}
          >
            Dosya
          </Label>
          <Input
            id="document-file"
            type="file"
            accept=".pdf,.txt,.png,.jpg,.jpeg,.webp"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            required
            className={
              isAstra
                ? "border-[var(--astra-border)] bg-[var(--astra-surface-elevated)] text-[var(--astra-text)] file:text-[var(--astra-muted)]"
                : undefined
            }
          />
          <p
            className={cn(
              "text-xs",
              isAstra ? "text-[var(--astra-muted)]" : "text-muted-foreground",
            )}
          >
            PDF, TXT ve görsel · en fazla 15 MB
            {creditCost !== null ? ` · işleme ${creditCost} kredi` : ""}
          </p>
        </div>

        {isAstra ? (
          <button
            type="submit"
            disabled={!file || stage !== "idle"}
            className="astra-btn-primary h-10 rounded-full px-6 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {stage === "uploading"
              ? "Yükleniyor…"
              : stage === "processing"
                ? "İşleniyor…"
                : "Yükle ve işle"}
          </button>
        ) : (
          <Button type="submit" disabled={!file || stage !== "idle"}>
            {stage === "uploading"
              ? "Yükleniyor…"
              : stage === "processing"
                ? "İşleniyor…"
                : "Yükle ve işle"}
          </Button>
        )}
      </form>

      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Doküman işleme için yeterli kredin kalmadı. Dosyan hesabında duruyor."
        returnPath="/dokumanlar"
      />
    </>
  );
}
