"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { previewLifecycleMail, sendLifecycleTest } from "@/app/admin/eposta-actions";
import { formatNumber } from "@/lib/format";

type Row = { id: string; name: string; when: string; sent: number | null };

/**
 * Otomatik e-postalar (8 Kasım 2026): ne zaman gittiği, kaç tane gittiği, önizleme (örnek verilerle çizilir; kimseye
 * gitmez) ve kurucunun kendi adresine deneme.
 */
export function LifecycleMailsCard({ rows, purchaseSent }: { rows: Row[]; purchaseSent: number }) {
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<{ id: string; subject: string; html: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  function show(id: string) {
    startTransition(async () => {
      const result = await previewLifecycleMail(id);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      setPreview({ id, subject: result.subject, html: result.html });
    });
  }

  function sendTest(id: string) {
    startTransition(async () => {
      const result = await sendLifecycleTest(id);
      if (result.ok) {
        setNote(`${result.to} adresine ${result.via} ile gönderildi.`);
        toast.success("Deneme e-postası gönderildi.");
      } else {
        setNote(result.error);
        toast.error("Gönderilemedi.");
      }
    });
  }

  return (
    <div className="space-y-4">
      <div className="overflow-x-auto">
        <table className="adm-table w-full text-sm">
          <thead>
            <tr>
              <th>E-posta</th>
              <th>Ne zaman gider</th>
              <th>Gönderilen</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                <td className="font-medium">{row.name}</td>
                <td className="text-[var(--adm-muted)]">{row.when}</td>
                <td className="adm-num">
                  {row.sent === null
                    ? row.id === "plus_monthly"
                      ? `${formatNumber(purchaseSent)} (bütün paketler)`
                      : "—"
                    : formatNumber(row.sent)}
                </td>
                <td className="whitespace-nowrap">
                  <button type="button" className="adm-btn" disabled={pending} onClick={() => show(row.id)}>
                    Önizle
                  </button>{" "}
                  <button type="button" className="adm-btn" disabled={pending} onClick={() => sendTest(row.id)}>
                    Kendime gönder
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {note ? (
        <p className="text-sm text-[var(--adm-muted)]" role="status">
          {note}
        </p>
      ) : null}
      {preview ? (
        <div className="space-y-2">
          <p className="text-sm">
            <strong>Konu:</strong> {preview.subject}
          </p>
          <iframe
            title="E-posta önizlemesi"
            sandbox=""
            srcDoc={preview.html}
            className="w-full rounded-lg border border-[var(--adm-line)] bg-white"
            style={{ height: 720 }}
          />
          <button type="button" className="adm-btn" onClick={() => setPreview(null)}>
            Önizlemeyi kapat
          </button>
        </div>
      ) : null}
    </div>
  );
}
