"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CreditGate } from "@/components/paywall/credit-gate";
import { isPhotoQuotaError } from "@/lib/documents/process-errors";
import {
  postDocumentProcess,
  requestDocumentProcessing,
} from "@/lib/documents/process-session";
import { DOCUMENT_UPLOAD_HINT } from "@/lib/documents/upload-labels";
import { uploadDocumentFile } from "@/lib/documents/upload-client";
import { formatDocumentProcessProgress } from "@/lib/documents/process-progress-label";
import { messageFromProcessBody } from "@/lib/documents/process-user-message";
import { useDocumentLimits } from "@/lib/student/student-shell-context";
import { cn } from "@/lib/utils";

const ALLOWED = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "text/plain",
];

const MAX_BYTES = 15 * 1024 * 1024;
const PDF_MAX_BYTES = 50 * 1024 * 1024;

export function DocumentUpload({
  creditCost,
  variant = "default",
  learningV2 = false,
}: {
  creditCost: number | null;
  variant?: "default" | "parity";
  /** Stage 9 — explain topic-map pipeline when pdf_learning_v2 is on. */
  learningV2?: boolean;
}) {
  const router = useRouter();
  const { isAdmin, freePdfCap } = useDocumentLimits();
  const founder = isAdmin;
  const [file, setFile] = useState<File | null>(null);
  const [stage, setStage] = useState<"idle" | "uploading" | "processing">("idle");
  const [statusDetail, setStatusDetail] = useState<string | null>(null);
  const [processAlert, setProcessAlert] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!file) return;

    const extensionOk = /\.(pdf|txt|docx|pptx|heic|heif|jpe?g|png|webp)$/i.test(file.name);
    if (!ALLOWED.includes(file.type) && !extensionOk) {
      toast.error("Desteklenmeyen dosya türü.");
      return;
    }
    if (file.size > (file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? PDF_MAX_BYTES : MAX_BYTES)) {
      toast.error("PDF en fazla 50 MB, diğer dosyalar en fazla 15 MB olabilir.");
      return;
    }

    setStage("uploading");
    setStatusDetail("Dosyan yükleniyor…");
    setProcessAlert(null);
    // router.push (learningV2 success path) and router.refresh (finally
    // below) both start a Next.js router transition — firing refresh right
    // after push interrupts the pending push, so the app never lands on
    // the document page and the list behind it keeps showing stale data
    // (looks to the student like the upload silently did nothing). Skip
    // the redundant refresh once we've already navigated away.
    let navigated = false;
    try {
      const uploaded = await uploadDocumentFile(file);

      setStage("processing");
      setStatusDetail(
        learningV2
          ? "Belgen okunuyor; metin çıkarılıyor ve konu haritası hazırlanıyor…"
          : "Belgen okunuyor; metin çıkarılıyor ve içerik hazırlanıyor…",
      );
      const result = await requestDocumentProcessing({
        documentId: uploaded.documentId,
        post: postDocumentProcess,
        onProgress: (progress) => {
          const line = formatDocumentProcessProgress(progress);
          if (line) setStatusDetail(line);
        },
      });
      const processed = result.body;
      // Automatic retries stay silent; errors surface only after exhaustion.

      if (result.status === 402) {
        setStatusDetail(null);
        // Fotoğraf kotası bittiyse kredi satın almak işe yaramıyor; kapı
        // yerine ne olduğunu söyleyen cümle çıkıyor.
        if (isPhotoQuotaError(processed)) {
          const message =
            typeof processed.error === "string" ? processed.error : "Bu ayki fotoğraf hakkın doldu.";
          setProcessAlert(message);
          toast.error(message);
          return;
        }
        setPaywall(true);
        return;
      }

      if (!result.ok) {
        const message = messageFromProcessBody(processed);
        setProcessAlert(message);
        toast.error(message);
        setStatusDetail(null);
        return;
      }

      if (learningV2 && uploaded.documentId) {
        toast.success(
          "Belge hazır. Konu haritasını gözden geçirip sınav hazırlığına geçebilirsin.",
        );
        setFile(null);
        navigated = true;
        router.push(`/dokumanlar/${uploaded.documentId}`);
        return;
      }

      // Uzun bir tarama kesildiyse bunu söylemek zorundayız: öğrenci
      // belgenin tamamının okunduğunu sanıp eksik kaynakla çalışmasın.
      toast.success("Doküman hazır. AI öğretmende kaynak olarak kullanabilirsin.", {
        description: typeof processed.notice === "string" ? processed.notice : undefined,
      });
      setFile(null);
      router.refresh();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bağlantı hatası.";
      setProcessAlert(message);
      toast.error(message);
      setStatusDetail(null);
    } finally {
      setStage("idle");
      setStatusDetail(null);
      if (!navigated) router.refresh();
    }
  }

  const isParity = variant === "parity";

  return (
    <>
      <form onSubmit={submit} className="max-w-md space-y-3">
        <div className="space-y-2">
          <Label
            htmlFor="document-file"
            className={isParity ? "text-[var(--cs-muted)]" : undefined}
          >
            Dosya
          </Label>
          <Input
            id="document-file"
            type="file"
            accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.heic,.heif,.docx,.pptx,image/heic,image/heif"
            onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            required
            className={
              isParity
                ? "border-[var(--cs-border)] bg-[var(--cs-surface-elevated)] text-[var(--cs-text)] file:text-[var(--cs-muted)]"
                : undefined
            }
          />
          <p
            className={cn(
              "text-xs",
              isParity ? "text-[var(--cs-muted)]" : "text-muted-foreground",
            )}
          >
            {DOCUMENT_UPLOAD_HINT}
            {creditCost !== null && !founder ? ` · işleme ${creditCost} kredi` : ""}
            {freePdfCap !== null ? ` · aylık taranmış sayfa hakkı: ${freePdfCap}` : ""}
            {learningV2
              ? " · işlem sonrası konu haritası çıkarılır"
              : ""}
          </p>
          {statusDetail ? (
            <p
              className={cn(
                "text-xs",
                isParity ? "text-[var(--cs-muted)]" : "text-muted-foreground",
              )}
              role="status"
              aria-live="polite"
            >
              {statusDetail}
            </p>
          ) : null}
          {processAlert ? (
            <div
              className={cn(
                "rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm",
                isParity ? "text-red-100" : "text-red-900 dark:text-red-100",
              )}
              role="alert"
            >
              <p>{processAlert}</p>
              <button
                type="button"
                className="mt-2 text-xs underline underline-offset-2"
                onClick={() => setProcessAlert(null)}
              >
                Kapat
              </button>
            </div>
          ) : null}
        </div>

        {isParity ? (
          <button
            type="submit"
            disabled={!file || stage !== "idle"}
            className="cs-btn-primary h-10 rounded-full px-6 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {stage === "uploading"
              ? "Yükleniyor…"
              : stage === "processing"
                ? learningV2
                  ? "Harita çıkarılıyor…"
                  : "İşleniyor…"
                : "Yükle ve işle"}
          </button>
        ) : (
          <Button type="submit" disabled={!file || stage !== "idle"}>
            {stage === "uploading"
              ? "Yükleniyor…"
              : stage === "processing"
                ? learningV2
                  ? "Harita çıkarılıyor…"
                  : "İşleniyor…"
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
