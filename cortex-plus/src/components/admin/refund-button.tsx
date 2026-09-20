"use client";

import { ConfirmAction } from "@/components/admin/confirm-action";
import { markPaymentRefunded } from "@/app/admin/actions";

export function RefundButton({ paymentId }: { paymentId: string }) {
  return (
    <ConfirmAction
      label="PayTR ile iade"
      confirmLabel="Parayı karta iade et?"
      successMessage="PayTR iadesi alındı."
      danger
      action={() => markPaymentRefunded(paymentId)}
    />
  );
}
