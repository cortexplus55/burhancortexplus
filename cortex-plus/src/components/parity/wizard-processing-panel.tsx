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

  return (
    <div className="apw-processing-panel">
      {hint ? <p className="apw-drop-hint">{hint}</p> : null}
      {processDetail ? (
        <p className="apw-drop-hint" role="status" aria-live="polite">
          {processDetail}
        </p>
      ) : null}
      {processAlert ? (
        <div
          className="mt-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-100"
          role="alert"
        >
          <p>{processAlert}</p>
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
