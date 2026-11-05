"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { archiveSupersededItems, type CockpitActionResult } from "@/app/admin/cockpit-actions";
import { supersededArchivable, supersededGroups, type SupersededRow } from "@/lib/admin/cockpit-math";

/*
  Eski sürüm soruları (5 Kasım 2026): ünitenin yeniden yazılmasından kalan `stale` sorular. Karantina kuyruğundan
  ayrı: öğrenci yanlışı değil, içerik emekliliği. Ünite başına özet + tek tıkla toplu arşiv; eylem sunucuda
  (`cockpit-actions.ts`), burada yalnız durum ve sonuç satırı.
*/

export function CockpitSuperseded({ rows }: { rows: SupersededRow[] }) {
  const [result, setResult] = useState<CockpitActionResult | null>(null);
  const [pending, startTransition] = useTransition();
  const archivable = rows.filter(supersededArchivable);
  const anomalies = rows.length - archivable.length;
  const groups = supersededGroups(rows);

  if (!rows.length) {
    return <p className="text-sm text-[var(--adm-muted)]">Eski sürüm sorusu yok: havuzdaki her `stale` soru ya karantinada ya da arşivlenmiş.</p>;
  }

  return (
    <div className="space-y-3 text-sm">
      <table className="w-full text-left text-xs">
        <thead className="text-[var(--adm-muted)]">
          <tr>
            <th className="py-1 pr-3 font-medium">Ünite</th>
            <th className="py-1 pr-3 font-medium adm-num">Soru</th>
            <th className="py-1 pr-3 font-medium adm-num">Arşivlenebilir</th>
            <th className="py-1 font-medium">Eski içeriğin durumu</th>
          </tr>
        </thead>
        <tbody>
          {groups.map((group) => (
            <tr key={group.unitId} className="border-t border-[var(--adm-border)]">
              <td className="py-1 pr-3">{group.unitId}</td>
              <td className="py-1 pr-3 adm-num">{group.count}</td>
              <td className="py-1 pr-3 adm-num">{group.archivable}</td>
              <td className="py-1">{group.contentStatus ?? "içerik satırı yok"}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <details>
        <summary className="cursor-pointer text-xs text-[var(--adm-muted)]">Soru kökleri ({rows.length})</summary>
        <ul className="mt-2 space-y-1 text-xs">
          {rows.map((row) => (
            <li key={row.id}>
              <span className="text-[var(--adm-muted)]">
                {row.outcomeCode ?? row.unitId} · {row.difficulty}
                {supersededArchivable(row) ? "" : " · içeriği yayında (arşivlenmez)"}
              </span>{" "}
              {row.stem.slice(0, 160)}
              {row.stem.length > 160 ? "…" : ""}
            </li>
          ))}
        </ul>
      </details>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="adm-btn adm-btn--primary"
          disabled={pending || result?.ok === true || archivable.length === 0}
          onClick={() => {
            startTransition(async () => {
              const outcome = await archiveSupersededItems(archivable.map((row) => row.id));
              setResult(outcome);
              // Sayfa yenilenince liste boşalır ve bu bileşen "yok" satırına döner; sonuç bildirimde kalsın.
              if (outcome.ok) toast.success(outcome.message);
              else toast.error(outcome.error);
            });
          }}
        >
          {pending ? "Arşivleniyor…" : `Eski sürümleri arşivle (${archivable.length})`}
        </button>
        {anomalies ? (
          <span className="text-xs text-[var(--adm-warn)]">{anomalies} sorunun içeriği hâlâ yayında: beklenmedik durum, elle bakılmalı.</span>
        ) : null}
      </div>
      {result ? (
        <p role="status" className={`text-xs ${result.ok ? "text-[var(--adm-ok)]" : "text-[var(--adm-bad)]"}`}>
          {result.ok ? result.message : result.error}
        </p>
      ) : null}
    </div>
  );
}
