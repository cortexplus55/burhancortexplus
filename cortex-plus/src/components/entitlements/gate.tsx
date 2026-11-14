"use client";

import { Children, cloneElement, isValidElement, useEffect, useRef, type KeyboardEvent, type MouseEvent, type ReactElement, type ReactNode } from "react";
import { Lock } from "lucide-react";
import { useEntitlementUi, useGate } from "@/components/entitlements/entitlement-ui";
import { resolvePlan } from "@/lib/entitlements/gate";
import { sheetContent } from "@/lib/entitlements/sheet-copy";
import { track } from "@/lib/entitlements/track";
import { useStudentShellAccount } from "@/lib/student/student-shell-context";
import type { Action, Gate as GateValue, GateContext } from "@/lib/entitlements/types";
import "@/styles/entitlements.css";

/*
  Kontrolü saran kapı (Faz 3B). Açık: işaret yok, onClick'ler aynen. Sınırlı: yanında `meta-s` sayaç ("3 kaldı";
  1 kaldıysa uyarı tonu). Kilitli: 16 px kilit + `PLUS` mono rozet; kontrol SOLUK DEĞİL, basılabilir; basınca (fare,
  dokunma, Enter, Boşluk) `preventDefault` + yükseltme penceresi. Pencere açmayan kilitte (bekleme, harcama
  sigortası) tıklama bugünkü yola gider: sunucu reddeder, bugünkü metin çıkar.
*/

/** Sınırlı kapının sayacı yalnız günlük hakta (ücretli hesapta kredi sayısı gösterilmez). */
export function gateCounter(gate: GateValue): { text: string; low: boolean } | null {
  if (gate.state !== "limited" || gate.period !== "day" || typeof gate.remaining !== "number") return null;
  return { text: `${gate.remaining} kaldı`, low: gate.remaining <= 1 };
}

/** Kilit rozetinin yazısı: Plus gerekiyorsa PLUS; Sigma'ya yönlendiren kilitte yazısız kilit. */
export function lockLabel(gate: GateValue): string | null {
  if (gate.state !== "locked") return null;
  return gate.requiredPlan === "plus" || gate.requiredPlan === "week" ? "PLUS" : null;
}

/** Ekran okuyucuya söylenen durum. */
export function gateSrText(gate: GateValue): string | null {
  if (gate.state === "locked") return gate.requiredPlan ? "Plus gerekli" : null;
  const counter = gateCounter(gate);
  return counter ? `${gate.remaining} hak kaldı` : null;
}

export function GateMarks({ gate }: { gate: GateValue }) {
  const counter = gateCounter(gate);
  const label = lockLabel(gate);
  const sr = gateSrText(gate);
  if (gate.state === "open") return null;
  return (
    <>
      {gate.state === "locked" ? (
        <span className="cx-gate-lock" aria-hidden>
          <Lock />
          {label ? <span className="cx-t-meta-xs cx-gate-plus">{label}</span> : null}
        </span>
      ) : null}
      {counter ? (
        <span className="cx-t-meta-s cx-gate-count" data-low={counter.low ? "" : undefined} aria-hidden>
          {counter.text}
        </span>
      ) : null}
      {sr ? <span className="sr-only">{sr}</span> : null}
    </>
  );
}

export function Gate({
  action,
  context,
  asChild = false,
  children,
}: {
  action: Action;
  context?: GateContext;
  asChild?: boolean;
  children: ReactNode;
}) {
  const gate = useGate(action, context);
  const ui = useEntitlementUi();
  const account = useStudentShellAccount();
  const viewed = useRef(false);
  const sheetable = gate.state === "locked" && sheetContent({ reason: gate.reason, action, gate, prices: { plusMonthly: null, plusWeekly: null, sigmaMonthly: null } }) !== null;

  useEffect(() => {
    if (gate.state === "open" || viewed.current || !account) return;
    viewed.current = true;
    track("gate_viewed", { action, plan: resolvePlan(account).plan, reason: gate.reason });
    if (sheetable) ui?.prefetchPrices();
  }, [gate.state, gate.reason, action, account, sheetable, ui]);

  const intercept = (event: MouseEvent<HTMLElement> | KeyboardEvent<HTMLElement>) => {
    if (!sheetable || !ui) return;
    event.preventDefault();
    event.stopPropagation();
    ui.openSheet(gate, action, event.currentTarget as HTMLElement);
  };
  const onKeyDownCapture = (event: KeyboardEvent<HTMLElement>) => {
    if (event.key === "Enter" || event.key === " ") intercept(event);
  };

  if (gate.state === "open") return <>{children}</>;

  const marks = <GateMarks gate={gate} />;
  const lockedProps = sheetable ? { "aria-haspopup": "dialog" as const, onClickCapture: intercept, onKeyDownCapture } : {};

  if (asChild) {
    const only = Children.only(children);
    if (isValidElement(only)) {
      const element = only as ReactElement<{ children?: ReactNode; "data-gate"?: string }>;
      return cloneElement(element, { ...lockedProps, "data-gate": gate.state }, <>{element.props.children}{marks}</>);
    }
  }
  return (
    <span className="cx-gate" data-gate={gate.state} {...lockedProps}>
      {children}
      {marks}
    </span>
  );
}
