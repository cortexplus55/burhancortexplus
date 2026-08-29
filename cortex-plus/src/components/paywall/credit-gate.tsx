"use client";

import { UpgradeSheet } from "@/components/paywall/upgrade-sheet";
import { CreditLimitToast } from "@/components/paywall/credit-limit-toast";
import { useStudentShellAccount } from "@/lib/student/student-shell-context";

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

  return (
    <UpgradeSheet
      open={open}
      onOpenChange={onOpenChange}
      message={message}
      returnPath={returnPath}
    />
  );
}
