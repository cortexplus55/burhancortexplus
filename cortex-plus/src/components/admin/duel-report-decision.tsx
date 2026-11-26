"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { decideDuelReport } from "@/app/admin/duel-report-actions";

/** Düello bildirimi: "Adı gizle" ya da "Bildirimi kapat". */
export function DuelReportDecision({ reportId, status }: { reportId: string; status: string }) {
  const [pending, startTransition] = useTransition();
  const decide = (decision: "hidden" | "dismissed") =>
    startTransition(async () => {
      const result = await decideDuelReport(reportId, decision);
      if (result.ok) toast.success(decision === "hidden" ? "Ad sıralamada gizlendi." : "Bildirim kapatıldı.");
      else toast.error(result.error ?? "Kaydedilemedi.");
    });
  return (
    <div className="flex flex-wrap gap-2">
      {status !== "hidden" ? (
        <button type="button" className="adm-btn" disabled={pending} onClick={() => decide("hidden")}>
          {pending ? "Kaydediliyor…" : "Adı gizle"}
        </button>
      ) : null}
      {status === "open" ? (
        <button type="button" className="adm-btn" disabled={pending} onClick={() => decide("dismissed")}>
          Bildirimi kapat
        </button>
      ) : null}
    </div>
  );
}
