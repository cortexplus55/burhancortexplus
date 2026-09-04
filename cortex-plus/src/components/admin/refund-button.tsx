"use client";

import { ConfirmAction } from "@/components/admin/confirm-action";
import { markPaymentRefunded } from "@/app/admin/actions";

export function RefundButton({ paymentId }: { paymentId: string }) {
  return (
    <ConfirmAction
      label="İade işaretle"
      confirmLabel="Emin misin?"
      successMessage="İade edildi olarak işaretlendi."
      danger
      action={() => markPaymentRefunded(paymentId)}
    />
  );
}
