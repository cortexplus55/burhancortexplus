export type PlanGrantInfo = {
  name?: string | null;
  is_premium?: boolean | null;
};

/** Plus adı veya is_premium — abonelik satırı açılır. */
export function planGrantsSubscription(plan: PlanGrantInfo | null | undefined) {
  if (!plan) return false;
  if (plan.is_premium) return true;
  const name = (plan.name ?? "").toLocaleLowerCase("tr");
  return (
    name.includes("plus") ||
    name.includes("sigma") ||
    name.includes("premium")
  );
}

export function paymentWalletUserId(payment: {
  user_id: string;
  beneficiary_user_id?: string | null;
}) {
  return payment.beneficiary_user_id || payment.user_id;
}

export function resolveCheckoutBeneficiary(opts: {
  payerId: string;
  payerRole: string | null | undefined;
  studentId?: string | null;
}):
  | { ok: true; beneficiaryId: string }
  | { ok: false; code: "child_required" | "forbidden" } {
  const isParent = opts.payerRole === "parent";
  if (isParent) {
    if (!opts.studentId || opts.studentId === opts.payerId) {
      return { ok: false, code: "child_required" };
    }
    return { ok: true, beneficiaryId: opts.studentId };
  }
  if (opts.studentId && opts.studentId !== opts.payerId) {
    return { ok: false, code: "forbidden" };
  }
  return { ok: true, beneficiaryId: opts.payerId };
}
