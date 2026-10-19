"use client";

import { UpgradeSheet } from "@/components/paywall/upgrade-sheet";
import { CreditLimitToast } from "@/components/paywall/credit-limit-toast";
import { periodWord } from "@/lib/credits/period";
import { useIsFounder, useStudentShellAccount } from "@/lib/student/student-shell-context";
import { beyondFreeMessage, exceedsFreeDaily } from "@/lib/billing/free-reach";
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
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  message: string;
  returnPath?: string;
  isPremium?: boolean;
  /**
   * İş ücretsiz günlük haktan büyük (podcast, sözlü …): beklemek çözmez, yenilenme saati ve geri
   * sayım gösterilmez (`free-reach.ts`).
   */
  beyondFreeDaily?: boolean;
  /** İşin kredi kodu: ücretsiz hakkı aşıyorsa kapı cümlesi ve geri sayım buna göre (19 Ekim 2026). */
  action?: ActionCode;
  /** Kapı cümlesindeki işin adı ("Podcast", "Fotoğraftan çözüm"). */
  actionLabel?: string;
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

  // Yenilenme saati kapıya taşınıyor: "abone ol" tek çözüm değil, beklemek de
  // çözüm ve bunu söylemek dürüst olan.
  const resetHint =
    !beyondFreeDaily && account?.resetsAtLabel
      ? `${periodWord(account.periodKind)} hakkın ${account.resetsAtLabel} tarihinde yenilenir.`
      : undefined;

  return (
    <UpgradeSheet
      open={open}
      onOpenChange={onOpenChange}
      message={gateMessage}
      returnPath={returnPath}
      resetHint={resetHint}
      resetsAt={beyondFreeDaily ? undefined : account?.resetsAtIso}
    />
  );
}
