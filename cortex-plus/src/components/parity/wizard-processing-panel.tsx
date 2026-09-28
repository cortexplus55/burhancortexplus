"use client";

import { FileText } from "lucide-react";

export type WizardFailedMaterial = {
  documentId: string;
  fileName: string;
  sizeBytes: number | null;
  error: string;
};

type WizardProcessingPanelProps = {
  processDetail: string | null;
  processAlert: string | null;
  failedMaterials: WizardFailedMaterial[];
  uploading?: boolean;
  /** 0–100 progress while auto-retries run silently. */
  processPercent?: number | null;
  onContinue: (failed: WizardFailedMaterial) => void;
  onRetry: (failed: WizardFailedMaterial) => void;
  onRemove: (failed: WizardFailedMaterial) => void;
  onDismissAlert?: () => void;
  hint?: string | null;
};

export function WizardProcessingPanel({
  processDetail,
  processAlert,
  failedMaterials,
  uploading = false,
  processPercent = null,
  onContinue,
  onRetry,
  onRemove,
  onDismissAlert,
  hint,
}: WizardProcessingPanelProps) {
  const showPanel =
    uploading ||
    Boolean(processDetail) ||
    Boolean(processAlert) ||
    failedMaterials.length > 0;
  if (!showPanel) return null;

  const showProgress =
    processPercent != null &&
    Number.isFinite(processPercent) &&
    !processAlert &&
    failedMaterials.length === 0;

  return (
    <div className="apw-processing-panel">
      {hint ? <p className="apw-drop-hint">{hint}</p> : null}
      {showProgress ? (
        <div
          className="apw-process-bar"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(processPercent)}
          aria-label="Belge işleniyor"
        >
          <div
            className="apw-process-bar-fill"
            style={{ width: `${Math.max(4, Math.min(100, processPercent))}%` }}
          />
        </div>
      ) : null}
      {processDetail && !processAlert ? (
        <p className="apw-drop-hint" role="status" aria-live="polite">
          {processDetail}
        </p>
      ) : null}
      {/* Retry / error UI only after automatic attempts are exhausted. */}
      {processAlert ? (
        <div
          className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100"
          role="alert"
        >
          <p>{processAlert}</p>
          {processDetail ? (
            <p className="mt-1 text-xs text-[var(--cp-muted)]">{processDetail}</p>
          ) : null}
          {onDismissAlert ? (
            <button
              type="button"
              className="mt-2 text-xs underline underline-offset-2"
              onClick={onDismissAlert}
            >
              Kapat
            </button>
          ) : null}
        </div>
      ) : null}
      {failedMaterials.length ? (
        <ul className="apw-materials">
          {failedMaterials.map((failed) => (
            <li key={failed.documentId} className="apw-doc-chip apw-doc-chip--failed">
              <FileText className="h-4 w-4 shrink-0" aria-hidden />
              <span className="apw-doc-main">
                <strong>{failed.fileName}</strong>
                <small>{failed.error}</small>
                <small className="text-[var(--cp-muted)]">
                  ID: {failed.documentId.slice(0, 8)}…
                </small>
              </span>
              <button
                type="button"
                className="apw-drop-pick"
                disabled={uploading}
                onClick={() => onContinue(failed)}
              >
                Devam et
              </button>
              <button
                type="button"
                className="apw-drop-pick"
                disabled={uploading}
                onClick={() => onRetry(failed)}
              >
                Tekrar dene
              </button>
              <button
                type="button"
                aria-label="Başarısız materyali kaldır"
                disabled={uploading}
                onClick={() => onRemove(failed)}
              >
                Kaldır
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
