"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import {
  markPaymentRefunded,
  previewAdminPaymentRefund,
  recordExternalRefund,
  reconcilePaymentWithPaytr,
} from "@/app/admin/actions";
import { cn } from "@/lib/utils";

type Mode = "closed" | "refund" | "external" | "reconcile";

export function RefundButton({
  paymentId,
  paidKurus,
  alreadyRefundedKurus = 0,
  status,
}: {
  paymentId: string;
  paidKurus: number;
  alreadyRefundedKurus?: number;
  status: string;
}) {
  const [mode, setMode] = useState<Mode>("closed");
  const [kind, setKind] = useState<"full" | "partial">("full");
  const remaining = Math.max(0, paidKurus - alreadyRefundedKurus);
  const [partialLira, setPartialLira] = useState(
    (remaining / 100).toFixed(2),
  );
  const [externalLira, setExternalLira] = useState(
    (remaining / 100).toFixed(2),
  );
  const [externalRef, setExternalRef] = useState("");
  const [previewText, setPreviewText] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const canRefund = status === "paid" && remaining > 0;
  // B5: tam iade edilmiş satırlarda kaydet/kontrol gizlenir (yeni aboneliği bozmasın).
  const canRecordOrReconcile = status === "paid";

  if (!canRefund && !canRecordOrReconcile) {
    return <span className="text-xs text-[var(--adm-muted)]">—</span>;
  }

  function openRefund() {
    setMode("refund");
    setKind("full");
    setPartialLira((remaining / 100).toFixed(2));
    setPreviewText(null);
    startTransition(async () => {
      const result = await previewAdminPaymentRefund(paymentId);
      if (result.ok) setPreviewText(result.previewText);
      else setPreviewText(result.error ?? "Önizleme alınamadı.");
    });
  }

  function refreshPreview(nextKind: "full" | "partial", lira: string) {
    setKind(nextKind);
    const kurus =
      nextKind === "full"
        ? remaining
        : Math.round(Number(lira.replace(",", ".")) * 100);
    startTransition(async () => {
      const result = await previewAdminPaymentRefund(paymentId, kurus);
      if (result.ok) setPreviewText(result.previewText);
      else setPreviewText(result.error ?? "Önizleme alınamadı.");
    });
  }

  if (mode === "closed") {
    return (
      <div className="flex flex-wrap gap-1">
        {canRefund ? (
          <button
            type="button"
            className="adm-btn adm-btn--danger"
            disabled={pending}
            onClick={openRefund}
          >
            İade et
          </button>
        ) : null}
        {canRecordOrReconcile ? (
          <button
            type="button"
            className="adm-btn"
            disabled={pending}
            onClick={() => {
              setMode("external");
              setExternalLira((remaining / 100).toFixed(2));
              setExternalRef("");
            }}
          >
            PayTR&apos;de yapıldı, kaydet
          </button>
        ) : null}
        {canRecordOrReconcile ? (
          <button
            type="button"
            className="adm-btn"
            disabled={pending}
            onClick={() => {
              setMode("reconcile");
              startTransition(async () => {
                const result = await reconcilePaymentWithPaytr(paymentId);
                if (result.ok) {
                  toast.success(result.message ?? "Kontrol tamam.");
                  setMode("closed");
                } else {
                  toast.error(result.error ?? "Kontrol başarısız.");
                  setMode("closed");
                }
              });
            }}
          >
            PayTR&apos;den kontrol et
          </button>
        ) : null}
      </div>
    );
  }

  if (mode === "reconcile") {
    return (
      <span className="text-xs text-[var(--adm-muted)]">PayTR kontrol ediliyor…</span>
    );
  }

  if (mode === "external") {
    return (
      <div className="flex min-w-[16rem] flex-col gap-2 rounded border border-[var(--adm-border)] p-2 text-xs">
        <p className="text-[var(--adm-muted)]">
          PayTR panelinden yapılmış iadeyi deftere yaz (PayTR tekrar çağrılmaz).
          Mutabakat PayTR toplamıyla karşılaştırır; aynı tutar iki kez yazılmaz.
        </p>
        <label className="flex flex-col gap-1">
          Tutar (TL)
          <input
            className="adm-input"
            type="number"
            min={0.01}
            step={0.01}
            value={externalLira}
            onChange={(e) => setExternalLira(e.target.value)}
          />
        </label>
        <label className="flex flex-col gap-1">
          PayTR referans (önerilir)
          <input
            className="adm-input"
            type="text"
            maxLength={64}
            value={externalRef}
            onChange={(e) => setExternalRef(e.target.value)}
            placeholder="reference_no"
          />
        </label>
        <div className="flex gap-1">
          <button
            type="button"
            className="adm-btn adm-btn--primary"
            disabled={pending}
            onClick={() =>
              startTransition(async () => {
                const kurus = Math.round(
                  Number(externalLira.replace(",", ".")) * 100,
                );
                const result = await recordExternalRefund({
                  paymentId,
                  amountKurus: kurus,
                  providerRef: externalRef.trim() || undefined,
                });
                if (result.ok) {
                  toast.success(result.message ?? "Kaydedildi.");
                  setMode("closed");
                } else {
                  toast.error(result.error ?? "Kayıt başarısız.");
                }
              })
            }
          >
            {pending ? "Kaydediliyor…" : "Kaydet"}
          </button>
          <button
            type="button"
            className="adm-btn"
            disabled={pending}
            onClick={() => setMode("closed")}
          >
            Vazgeç
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-w-[18rem] flex-col gap-2 rounded border border-[var(--adm-border)] p-2 text-xs">
      <div className="flex gap-2">
        <button
          type="button"
          className={cn("adm-btn", kind === "full" && "adm-btn--primary")}
          disabled={pending}
          onClick={() => refreshPreview("full", partialLira)}
        >
          Tam
        </button>
        <button
          type="button"
          className={cn("adm-btn", kind === "partial" && "adm-btn--primary")}
          disabled={pending}
          onClick={() => refreshPreview("partial", partialLira)}
        >
          Kısmi
        </button>
      </div>
      {kind === "partial" ? (
        <label className="flex flex-col gap-1">
          İade tutarı (TL) — üst sınır {(remaining / 100).toFixed(2)}
          <input
            className="adm-input"
            type="number"
            min={0.01}
            step={0.01}
            max={(remaining / 100).toFixed(2)}
            value={partialLira}
            onChange={(e) => {
              setPartialLira(e.target.value);
              refreshPreview("partial", e.target.value);
            }}
          />
        </label>
      ) : null}
      {previewText ? (
        <p className="rounded bg-[var(--adm-surface)] p-2 text-[var(--adm-text)]">
          {previewText}
        </p>
      ) : (
        <p className="text-[var(--adm-muted)]">Önizleme yükleniyor…</p>
      )}
      <div className="flex gap-1">
        <button
          type="button"
          className="adm-btn adm-btn--danger"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              const kurus =
                kind === "full"
                  ? undefined
                  : Math.round(Number(partialLira.replace(",", ".")) * 100);
              const result = await markPaymentRefunded(paymentId, kurus);
              if (result.ok) {
                toast.success(result.message ?? "İade tamam.");
                setMode("closed");
              } else {
                toast.error(result.error ?? "İade başarısız.");
              }
            })
          }
        >
          {pending ? "İade ediliyor…" : "Onayla"}
        </button>
        <button
          type="button"
          className="adm-btn"
          disabled={pending}
          onClick={() => setMode("closed")}
        >
          Vazgeç
        </button>
      </div>
    </div>
  );
}
