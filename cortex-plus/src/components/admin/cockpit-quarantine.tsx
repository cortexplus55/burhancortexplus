"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { regenerateQuarantinedItem, rejectQuarantinedItem, restoreQuarantinedItem, type CockpitActionResult } from "@/app/admin/cockpit-actions";
import type { QuarantineRow } from "@/lib/admin/cockpit-math";
import { formatDate } from "@/lib/format";

/*
  Karantina kuyruğu (5 Kasım 2026): her soru açılır kapanır bir kart; kurucu soruyu okur, üç tek tıklık karar verir.
  Eylemler sunucuda (`cockpit-actions.ts`); burada yalnız durum ve sonuç satırı tutulur.
*/

const LETTERS = ["A", "B", "C", "D", "E", "F"] as const;

function QuarantineCard({ row }: { row: QuarantineRow }) {
  const [result, setResult] = useState<CockpitActionResult | null>(null);
  const [busy, setBusy] = useState<"restore" | "reject" | "regenerate" | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (kind: "restore" | "reject" | "regenerate", action: (id: string) => Promise<CockpitActionResult>) => {
    setBusy(kind);
    startTransition(async () => {
      const outcome = await action(row.id);
      setResult(outcome);
      setBusy(null);
      // Eylem sayfayı yeniler ve biten kart listeden düşer; sonuç satırı kartla gitmesin diye bildirim de verilir.
      if (outcome.ok) toast.success(outcome.message);
      else toast.error(outcome.error);
    });
  };

  const done = result?.ok === true;
  return (
    <details className="adm-card" open={false}>
      <summary className="adm-card-head cursor-pointer list-none">
        <div>
          <h3 className="adm-card-title text-sm">{row.stem.slice(0, 140)}{row.stem.length > 140 ? "…" : ""}</h3>
          <p className="adm-card-desc">
            {row.programId} · {row.unitId}
            {row.outcomeCode ? ` · ${row.outcomeCode}` : ""} · {row.difficulty} · {row.ruleLabel}
            {row.quarantinedAt ? ` · ${formatDate(row.quarantinedAt)}` : ""}
          </p>
        </div>
      </summary>
      <div className="adm-card-body space-y-3 text-sm">
        <p className="whitespace-pre-line">{row.stem}</p>
        <ol className="space-y-1">
          {row.choices.map((choice, index) => (
            <li key={`${row.id}-${index}`} className={index === row.answer ? "font-semibold text-[var(--adm-ok)]" : ""}>
              {LETTERS[index] ?? index + 1}) {choice}
              {index === row.answer ? " ✓ anahtar" : ""}
            </li>
          ))}
        </ol>
        {row.explanation ? <p className="text-[var(--adm-muted)] whitespace-pre-line">{row.explanation}</p> : null}
        <p className="text-xs text-[var(--adm-muted)]">
          {row.responses} yanıt
          {row.correctRate != null ? ` · doğru oranı %${Math.round(row.correctRate * 100)}` : ""}
          {row.reports ? ` · ${row.reports} bildirim` : ""}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="adm-btn adm-btn--primary" disabled={pending || done} onClick={() => run("restore", restoreQuarantinedItem)}>
            {busy === "restore" ? "Alınıyor…" : "Onayla · havuza geri al"}
          </button>
          <button type="button" className="adm-btn" disabled={pending || done} onClick={() => run("reject", rejectQuarantinedItem)}>
            {busy === "reject" ? "Reddediliyor…" : "Reddet"}
          </button>
          <button type="button" className="adm-btn" disabled={pending || done} onClick={() => run("regenerate", regenerateQuarantinedItem)}>
            {busy === "regenerate" ? "Yeniden üretiliyor (≈20 sn)…" : "Reddet ve yeniden ürettir"}
          </button>
        </div>
        {result ? (
          <p role="status" className={`text-xs ${result.ok ? "text-[var(--adm-ok)]" : "text-[var(--adm-bad)]"}`}>
            {result.ok ? result.message : result.error}
          </p>
        ) : null}
      </div>
    </details>
  );
}

export function CockpitQuarantine({ rows }: { rows: QuarantineRow[] }) {
  if (!rows.length) {
    return <p className="text-sm text-[var(--adm-muted)]">Karantinada soru yok. Saatlik SQL işi (`quarantine_pool_items`) düşen soruyu buraya getirir.</p>;
  }
  return (
    <div className="space-y-3">
      {rows.map((row) => (
        <QuarantineCard key={row.id} row={row} />
      ))}
    </div>
  );
}
