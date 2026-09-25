"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Smartphone, Upload } from "lucide-react";
import { toast } from "sonner";
import { PhoneUploadPanel } from "@/components/parity/phone-upload-panel";
import { CreditGate } from "@/components/paywall/credit-gate";
import { PHOTO_PAGE_LIMITS } from "@/lib/billing/entitlements";
import { isPhotoQuotaError } from "@/lib/documents/process-errors";
import {
  PROCESS_RETRY_MESSAGE,
  postDocumentProcess,
  requestDocumentProcessing,
} from "@/lib/documents/process-session";
import { PREP_HOME_COPY, WIZARD_COPY } from "@/lib/learning/exam-wizard-copy";
import { freeMaterialLimitLine } from "@/lib/learning/prep-material-copy";
import { PREP_SOURCE_DOCUMENT_CAP } from "@/lib/learning/prep-topic-list";
import { useStudentShellAccount } from "@/lib/student/student-shell-context";
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
  const freeCap = account?.audience === "free" ? PHOTO_PAGE_LIMITS.free : null;
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const [paywall, setPaywall] = useState(false);

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
    router.refresh();
  }

  async function processThenAttach(documentId: string) {
    const result = await requestDocumentProcessing({
      documentId,
      post: postDocumentProcess,
    });
    const processed = result.body;
    if (result.retried) toast.message(PROCESS_RETRY_MESSAGE);
    if (result.status === 402) {
      if (isPhotoQuotaError(processed)) {
        toast.error(typeof processed.error === "string" ? processed.error : "Bu ayki fotoğraf hakkın doldu.", {
          description: freeCap !== null ? freeMaterialLimitLine() : undefined,
        });
        return;
      }
      setPaywall(true);
      return;
    }
    if (!result.ok) {
      toast.error(typeof processed.error === "string" ? processed.error : "Dosya işlenemedi.");
      return;
    }
    await attach(documentId);
  }

  async function takeFile(file: File | undefined) {
    if (!file || busy) return;
    if (count >= PREP_SOURCE_DOCUMENT_CAP) {
      toast.error(WIZARD_COPY.fileCap);
      return;
    }
    if (!accepted(file) || file.size > 15 * 1024 * 1024) {
      toast.error(file.size > 15 * 1024 * 1024 ? "Dosya en fazla 15 MB olabilir." : "Bu dosya türü desteklenmiyor.");
      return;
    }
    setBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      const uploadRes = await fetch("/api/documents/upload", { method: "POST", body: form });
      const uploaded = await uploadRes.json().catch(() => ({}));
      if (!uploadRes.ok) {
        toast.error(uploaded.error ?? "Yükleme başarısız.");
        return;
      }
      await processThenAttach(uploaded.documentId as string);
    } catch {
      toast.error("Bağlantı hatası.");
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
      {freeCap !== null ? <p className="text-xs text-[var(--cp-muted)]">{freeMaterialLimitLine()}</p> : null}
      {phoneOpen ? (
        <PhoneUploadPanel
          onClose={() => setPhoneOpen(false)}
          onReady={(remote) => {
            setPhoneOpen(false);
            setBusy(true);
            void processThenAttach(remote.documentId).finally(() => setBusy(false));
          }}
        />
      ) : null}
      <CreditGate
        open={paywall}
        onOpenChange={setPaywall}
        message="Materyali işlemek için kredin kalmadı."
        returnPath={`/deneme-sinavlari/${prepId}`}
      />
    </div>
  );
}
