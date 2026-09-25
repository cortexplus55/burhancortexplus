"use client";

import { UpgradeSheet } from "@/components/paywall/upgrade-sheet";
import { CreditLimitToast } from "@/components/paywall/credit-limit-toast";
import { periodWord } from "@/lib/credits/period";
import { useIsFounder, useStudentShellAccount } from "@/lib/student/student-shell-context";

export function CreditGate({
  open,
  onOpenChange,
  message,
  returnPath,
  isPremium: isPremiumProp,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  message: string;
  returnPath?: string;
  isPremium?: boolean;
}) {
  const account = useStudentShellAccount();
  const founder = useIsFounder();
  if (founder) return null;
  const isPremium = isPremiumProp ?? account?.isPremium ?? false;

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
  const resetHint = account?.resetsAtLabel
    ? `${periodWord(account.periodKind)} hakkın ${account.resetsAtLabel} tarihinde yenilenir.`
    : undefined;

  return (
    <UpgradeSheet
      open={open}
      onOpenChange={onOpenChange}
      message={message}
      returnPath={returnPath}
      resetHint={resetHint}
    />
  );
}
