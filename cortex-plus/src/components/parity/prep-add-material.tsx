"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Smartphone, Upload } from "lucide-react";
import { toast } from "sonner";
import { PhoneUploadPanel } from "@/components/parity/phone-upload-panel";
import { CreditGate } from "@/components/paywall/credit-gate";
import { isPhotoQuotaError } from "@/lib/documents/process-errors";
import { formatDocumentProcessProgress } from "@/lib/documents/process-progress-label";
import { messageFromProcessBody } from "@/lib/documents/process-user-message";
import {
  clearPendingDocProcess,
  readPendingDocProcess,
  writePendingDocProcess,
} from "@/lib/documents/pending-doc-process";
import {
  postDocumentProcess,
  requestDocumentProcessing,
} from "@/lib/documents/process-session";
import { PREP_HOME_COPY, WIZARD_COPY } from "@/lib/learning/exam-wizard-copy";
import { freeMaterialLimitLine } from "@/lib/learning/prep-material-copy";
import { PREP_SOURCE_DOCUMENT_CAP } from "@/lib/learning/prep-topic-list";
import {
  useDocumentLimits,
  useStudentShellAccount,
} from "@/lib/student/student-shell-context";
import { uploadDocumentFile } from "@/lib/documents/upload-client";
import "@/styles/exam-create-wizard.css";

const EXTENSIONS = [".pdf", ".txt", ".png", ".jpg", ".jpeg", ".webp", ".heic", ".heif", ".docx", ".pptx"];

function accepted(file: File): boolean {
  if (file.type.startsWith("image/") || file.type === "application/pdf" || file.type === "text/plain") {
    return true;
  }
  if (file.type.includes("wordprocessingml") || file.type.includes("presentationml")) return true;
  const name = file.name.toLowerCase();
  return EXTENSIONS.some((extension) => name.endsWith(extension));
}

export function PrepMaterialAdder({
  prepId,
  count,
}: {
  prepId: string;
  count: number;
}) {
  const router = useRouter();
  const account = useStudentShellAccount();
  const { isAdmin } = useDocumentLimits();
  const materialLimitLine = freeMaterialLimitLine({
    isAdmin,
    tier:
      account?.audience === "plus" || account?.audience === "sigma"
        ? account.audience
        : "free",
  });
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [paywall, setPaywall] = useState(false);
  const [processDetail, setProcessDetail] = useState<string | null>(null);
  const [processAlert, setProcessAlert] = useState<string | null>(null);
  const [failedUpload, setFailedUpload] = useState<{
    documentId: string;
    fileName: string;
    error: string;
  } | null>(null);
  const resumeRef = useRef(false);

  async function attach(documentId: string) {
    const res = await fetch("/api/learning/exam-prep/add-source", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prepId, documentId }),
    });
    const payload = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast.error(payload.error ?? "Dosya hazırlığa eklenemedi.");
      return;
    }
    const added = Number(payload.addedTopics ?? 0);
    const merged = Number(payload.mergedTopics ?? 0);
    toast.success(
      added || merged
        ? `Eklendi. ${added} yeni konu, ${merged} konuda yeni kaynak. İlerlemen duruyor.`
        : "Dosya eklendi. İlerlemen duruyor.",
    );
    if (Array.isArray(payload.warnings) && payload.warnings[0]) {
      toast.warning(String(payload.warnings[0]));
    }
    setFailedUpload(null);
    router.refresh();
  }

  async function processThenAttach(input: {
    documentId: string;
    fileName: string;
    sizeBytes: number | null;
    /** An explicit "Tekrar dene"/"Devam et" press. */
    retryMap?: boolean;
  }) {
    writePendingDocProcess({
      documentId: input.documentId,
      fileName: input.fileName,
      sizeBytes: input.sizeBytes,
      startedAt: new Date().toISOString(),
      surface: "prep-add",
    });
    setProcessDetail("Belge işleniyor…");
    const result = await requestDocumentProcessing({
      documentId: input.documentId,
      // The prep's topic names guide the new file's outline (reuse, don't duplicate).
      post: (body) => postDocumentProcess({ ...body, prepId, retryMap: input.retryMap }),
      onProgress: (progress) => {
        const line = formatDocumentProcessProgress(progress);
        if (line) setProcessDetail(line);
      },
    });
    const processed = result.body;
    // Silent automatic retries — student sees progress only until exhaustion.
    if (result.status === 402) {
      clearPendingDocProcess();
      setProcessDetail(null);
      if (isPhotoQuotaError(processed)) {
        const description = materialLimitLine ?? undefined;
        toast.error(typeof processed.error === "string" ? processed.error : "Bu ayki fotoğraf hakkın doldu.", {
          description,
        });
        setProcessAlert(
          typeof processed.error === "string" ? processed.error : "Bu ayki fotoğraf hakkın doldu.",
        );
        return;
      }
      setPaywall(true);
      return;
    }
    if (!result.ok) {
      clearPendingDocProcess();
      const message = messageFromProcessBody(processed);
      // A map out of attempts is not an error: just offer "Tekrar dene".
      const calm = processed.canRetry === true;
      setProcessAlert(calm ? null : message);
      if (!calm) toast.error(message);
      setProcessDetail(null);
      setFailedUpload({
        documentId: input.documentId,
        fileName: input.fileName,
        error: message,
      });
      return;
    }
    clearPendingDocProcess();
    setProcessAlert(null);
    setProcessDetail(null);
    await attach(input.documentId);
  }

  useEffect(() => {
    const pending = readPendingDocProcess();
    if (!pending || pending.surface !== "prep-add" || resumeRef.current) return;
    resumeRef.current = true;
    setBusy(true);
    void processThenAttach({
      documentId: pending.documentId,
      fileName: pending.fileName,
      sizeBytes: pending.sizeBytes,
    }).finally(() => {
      setBusy(false);
      resumeRef.current = false;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount resume once
  }, []);

  async function takeFile(file: File | undefined) {
    if (!file || busy) return;
    if (count >= PREP_SOURCE_DOCUMENT_CAP) {
      toast.error(WIZARD_COPY.fileCap);
      return;
    }
    const maxBytes = file.type === "application/pdf" || /\.pdf$/i.test(file.name) ? 50 * 1024 * 1024 : 15 * 1024 * 1024;
    if (!accepted(file) || file.size > maxBytes) {
      toast.error(file.size > maxBytes ? "PDF en fazla 50 MB, diğer dosyalar en fazla 15 MB olabilir." : "Bu dosya türü desteklenmiyor.");
      return;
    }
    setBusy(true);
    try {
      const uploaded = await uploadDocumentFile(file);
      await processThenAttach({
        documentId: uploaded.documentId as string,
        fileName: file.name,
        sizeBytes: file.size,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "Bağlantı hatası.";
      setProcessAlert(message);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="cp-exam-add">
      <button
        type="button"
        className="cp-back-pill"
        disabled={busy || count >= PREP_SOURCE_DOCUMENT_CAP}
        onClick={() => fileRef.current?.click()}
      >
        <Upload className="h-4 w-4" aria-hidden />
        {busy ? "Ekleniyor…" : PREP_HOME_COPY.addFile}
      </button>
      <button
        type="button"
        className="cp-back-pill"
        disabled={busy || count >= PREP_SOURCE_DOCUMENT_CAP}
        onClick={() => setPhoneOpen(true)}
      >
        <Smartphone className="h-4 w-4" aria-hidden />
        {WIZARD_COPY.uploadFromPhone}
      </button>
      <input
        ref={fileRef}
        type="file"
        className="hidden"
        accept=".pdf,.txt,.png,.jpg,.jpeg,.webp,.heic,.heif,.docx,.pptx,image/heic,image/heif"
        onChange={(event) => {
          void takeFile(event.target.files?.[0]);
          event.target.value = "";
        }}
      />
      {processDetail ? (
        <p className="text-xs text-[var(--cp-muted)]" role="status" aria-live="polite">
          {processDetail}
        </p>
      ) : null}
      {materialLimitLine ? (
        <p className="text-xs text-[var(--cp-muted)]">{materialLimitLine}</p>
      ) : null}
      <p className="text-xs text-[var(--cp-muted)]">
        Sekmeyi kapatırsan geri geldiğinde kaldığı yerden devam eder.
      </p>
      {processAlert ? (
        <div
          className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100"
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
      {failedUpload ? (
        <div className="flex flex-wrap items-center gap-2 text-xs text-[var(--cp-muted)]">
          <span>
            {failedUpload.fileName} — {failedUpload.error}
          </span>
          <button
            type="button"
            className="cp-back-pill"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void processThenAttach({
                documentId: failedUpload.documentId,
                fileName: failedUpload.fileName,
                sizeBytes: null,
                retryMap: true,
              }).finally(() => setBusy(false));
            }}
          >
            Devam et
          </button>
          <button
            type="button"
            className="cp-back-pill"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void processThenAttach({
                documentId: failedUpload.documentId,
                fileName: failedUpload.fileName,
                sizeBytes: null,
                retryMap: true,
              }).finally(() => setBusy(false));
            }}
          >
            Tekrar dene
          </button>
          <button
            type="button"
            className="cp-back-pill"
            disabled={busy}
            onClick={() => {
              void fetch(`/api/documents/${failedUpload.documentId}`, { method: "DELETE" })
                .then(async (res) => {
                  if (!res.ok) {
                    toast.error("Kaldırılamadı.");
                    return;
                  }
                  setFailedUpload(null);
                  clearPendingDocProcess();
                })
                .catch(() => toast.error("Bağlantı hatası."));
            }}
          >
            Kaldır
          </button>
        </div>
      ) : null}
      {phoneOpen ? (
        <PhoneUploadPanel
          onClose={() => setPhoneOpen(false)}
          onReady={(remote) => {
            setPhoneOpen(false);
            setBusy(true);
            void processThenAttach({
              documentId: remote.documentId,
              fileName: remote.fileName ?? "Telefon yüklemesi",
              sizeBytes: null,
            }).finally(() => setBusy(false));
          }}
        />
      ) : null}
      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Materyali işlemek için kullanım hakkın doldu."
        returnPath={`/deneme-sinavlari/${prepId}`}
      />
    </div>
  );
}
