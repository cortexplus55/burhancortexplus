"use client";

import { PlusLimitBanner } from "@/components/paywall/plus-limit-banner";

export function CreditLimitToast({
  open,
  onOpenChange,
  message,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  message: string;
}) {
  if (!open) return null;

  return (
    <PlusLimitBanner
      variant="toast"
      message={message}
      onDismiss={() => onOpenChange(false)}
    />
  );
}
