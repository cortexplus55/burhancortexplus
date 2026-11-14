"use client";

import { useEntitlementUi, useGate } from "@/components/entitlements/entitlement-ui";
import { resetDay } from "@/lib/entitlements/sheet-copy";
import { useStudentShellAccount } from "@/lib/student/student-shell-context";
import "@/styles/entitlements.css";

/**
 * Profil panelindeki "Kullanım" satırı (Faz 3B, ANA-PROMPT 3B): "Bu ay %38 · 12 Aralık'ta sıfırlanır · Planın aktif".
 * Ücretli hesapta (Plus, Sınav Haftası, Sigma); Kurucu'da sayaç yok (satır çizilmez). Plus %90 eşiğindeyse satıra
 * dokununca %90 penceresi açılır (kullanıcı isteyince). Sınav Haftası'nda dönem haftalık ("Bu hafta").
 */
export function usageLine(input: { usedPercent: number; resetsAtIso?: string; periodKind: string }): string {
  const period = input.periodKind === "weekly" ? "Bu hafta" : "Bu ay";
  const day = input.resetsAtIso ? resetDay(input.resetsAtIso) : null;
  return [`${period} %${input.usedPercent}`, day ? `${day.on} sıfırlanır` : null, "Planın aktif"].filter(Boolean).join(" · ");
}

export function UsageRow() {
  const account = useStudentShellAccount();
  const ui = useEntitlementUi();
  const gate = useGate("lesson.create");
  if (!account || account.isAdmin || !account.isPremium) return null;
  const text = usageLine(account);
  const offer = gate.reason === "plus_quota_90" && ui;
  return (
    <div className="cx-usage">
      <span className="cx-t-meta-xs cx-usage-label">Kullanım</span>
      {offer ? (
        <button
          type="button"
          className="cx-usage-line cx-t-label-13"
          aria-haspopup="dialog"
          onClick={(event) => ui.openSheet(gate, "lesson.create", event.currentTarget)}
        >
          {text}
        </button>
      ) : (
        <span className="cx-usage-line cx-t-label-13">{text}</span>
      )}
    </div>
  );
}
