"use client";

import { UpgradeSheet } from "@/components/paywall/upgrade-sheet";
import { CreditLimitToast } from "@/components/paywall/credit-limit-toast";
import { useIsFounder, useStudentShellAccount } from "@/lib/student/student-shell-context";
import { beyondFreeMessage, exceedsFreeDaily } from "@/lib/billing/free-reach";
import {
  defaultFreeMeter,
  freeMeterResetLine,
  freeMeterResetsAt,
  type FreeMeter,
  type FreeMeterView,
} from "@/lib/billing/free-meters";
import type { ActionCode } from "@/lib/env";

export function CreditGate({
  open,
  onOpenChange,
  message,
  returnPath,
  isPremium: isPremiumProp,
  beyondFreeDaily: beyondFreeDailyProp = false,
  action,
  actionLabel,
  meter,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  message: string;
  returnPath?: string;
  isPremium?: boolean;
  /**
   * İş ücretsiz hesapta açılmıyor (Plus'ta: podcast, sözlü …): beklemek çözmez, yenilenme saati ve geri
   * sayım gösterilmez (`free-reach.ts`).
   */
  beyondFreeDaily?: boolean;
  /** İşin kredi kodu: ücretsiz hakkı aşıyorsa kapı cümlesi ve geri sayım buna göre (19 Ekim 2026). */
  action?: ActionCode;
  /** Kapı cümlesindeki işin adı ("Podcast", "Fotoğraftan çözüm"). */
  actionLabel?: string;
  /**
   * Ücretsiz hesapta dolan sayaç (24 Ekim 2026); verilmezse işin varsayılanı. İkisi de yoksa yenilenme
   * saati ve geri sayım gösterilmez.
   */
  meter?: FreeMeter;
}) {
  const account = useStudentShellAccount();
  const founder = useIsFounder();
  if (founder) return null;
  const isPremium = isPremiumProp ?? account?.isPremium ?? false;
  const actionBeyond = !isPremium && action ? exceedsFreeDaily(action) : false;
  const beyondFreeDaily = beyondFreeDailyProp || actionBeyond;
  const gateMessage = actionBeyond ? beyondFreeMessage(actionLabel ?? "Bu iş") : message;

  if (isPremium) {
    return (
      <CreditLimitToast
        open={open}
        onOpenChange={onOpenChange}
        message={message}
      />
    );
  }

  const reset = beyondFreeDaily ? null : freeGateReset(meter ?? (action ? defaultFreeMeter(action) : null), account?.freeMeters);

  return (
    <UpgradeSheet
      open={open}
      onOpenChange={onOpenChange}
      message={gateMessage}
      returnPath={returnPath}
      resetHint={reset?.hint}
      resetsAt={reset?.resetsAt}
    />
  );
}

/**
 * Yenilenme saati kapıya taşınıyor: "abone ol" tek çözüm değil, beklemek de çözüm ve bunu söylemek
 * dürüst olan. Ücretsiz hesapta sayacın kendi saati (ders Pazartesi, mesaj, fotoğraf ve derse dahil
 * adımlar gece yarısı).
 *
 * Sayaç bilinmiyorsa (kurulum, belge işleme, sınav hazırlığı sınırı) saat yazılmaz: 24 Ekim 2026'ya kadar
 * kapı burada ders sayacına düşüyor, beklemenin hiçbir şeyi çözmediği kapılarda Pazartesi'ye geri sayıyordu.
 */
export function freeGateReset(
  meter: FreeMeter | null | undefined,
  meters: readonly FreeMeterView[] | undefined,
  now: Date = new Date(),
): { hint: string; resetsAt: string } | null {
  if (!meter) return null;
  // "included" kabukta görünmez (sayaç listesinde yok); saati aynı kuraldan hesaplanır.
  const view = meters?.find((item) => item.meter === meter);
  return {
    hint: freeMeterResetLine(meter),
    resetsAt: view?.resetsAtIso ?? freeMeterResetsAt(meter, now).toISOString(),
  };
}
