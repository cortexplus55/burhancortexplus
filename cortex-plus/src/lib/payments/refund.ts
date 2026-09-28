import "server-only";

import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auditLog } from "@/lib/audit";
import { formatTry } from "@/lib/format";

/** refunds.reason JSON — makine-okunur durum + defter özeti. */
export type RefundReasonState = "pending" | "applied" | "failed";

export type RefundReasonPayload = {
  state: RefundReasonState;
  ref: string;
  source: "admin" | "reconcile";
  kind: "payment_refund";
  merchant_oid: string;
  payment_id: string;
  actor_id?: string | null;
  note?: string | null;
  to_reverse?: number;
  reversed?: number;
  unrecovered?: number;
  is_full?: boolean;
  cancel_subscription?: boolean;
  shrink_period_end?: string | null;
  paytr_err?: string | null;
  error_step?: string | null;
};

export type ComputeRefundPlanInput = {
  paidKurus: number;
  refundKurus: number;
  alreadyRefundedKurus: number;
  purchasedCredits: number;
  alreadyReversedCredits: number;
  /** credit_adjust_balance'ın düşebildiği miktar = wallet.balance (reserved zaten düşülmüş). */
  availableBalance: number;
  isSubscription: boolean;
  currentPeriodEnd?: Date | string | null;
  periodDays?: number | null;
  now?: Date;
};

export type ComputeRefundPlanResult = {
  refundKurus: number;
  toReverse: number;
  reversed: number;
  unrecovered: number;
  cancelSubscription: boolean;
  /** Abonelik aktif kalırsa yeni current_period_end (ISO); aksi halde null. */
  shrinkPeriodEnd: string | null;
  isFull: boolean;
  remainingRefundableKurus: number;
};

export function parseRefundReason(raw: string | null | undefined): RefundReasonPayload | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<RefundReasonPayload>;
    if (!parsed || typeof parsed !== "object") return null;
    if (parsed.kind !== "payment_refund") return null;
    if (!parsed.ref || !parsed.state) return null;
    return parsed as RefundReasonPayload;
  } catch {
    return null;
  }
}

export function refundLedgerIdempotencyKey(opts: {
  merchantOid: string;
  providerRef: string;
  isFull: boolean;
  alreadyRefundedKurus: number;
}): string {
  // Tek seferlik tam iade: sabit anahtar (çift tık). Kısmi / tamamlayan: ref bazlı.
  if (opts.isFull && opts.alreadyRefundedKurus === 0) {
    return `payment_refund:${opts.merchantOid}:full`;
  }
  return `payment_refund:${opts.merchantOid}:${opts.providerRef}`;
}

export function computeRefundPlan(
  input: ComputeRefundPlanInput,
): ComputeRefundPlanResult {
  const paid = Math.max(0, Math.floor(input.paidKurus));
  const already = Math.max(0, Math.floor(input.alreadyRefundedKurus));
  const remainingRefundableKurus = Math.max(0, paid - already);
  const refundKurus = Math.min(
    Math.max(0, Math.floor(input.refundKurus)),
    remainingRefundableKurus,
  );
  const isFull = paid > 0 && already + refundKurus >= paid;

  const purchased = Math.max(0, Math.floor(input.purchasedCredits));
  const alreadyReversed = Math.max(0, Math.floor(input.alreadyReversedCredits));
  const available = Math.max(0, Math.floor(input.availableBalance));

  // Orantılı geri alma; kuruş artıkları kredi üretmez (floor).
  let toReverse =
    paid > 0 && refundKurus > 0
      ? Math.floor((purchased * refundKurus) / paid)
      : 0;
  toReverse = Math.min(toReverse, Math.max(0, purchased - alreadyReversed));

  const reversed = Math.min(toReverse, available);
  const unrecovered = toReverse - reversed;

  let cancelSubscription = false;
  let shrinkPeriodEnd: string | null = null;

  if (input.isSubscription && isFull) {
    const now = input.now ?? new Date();
    const periodDays =
      input.periodDays && input.periodDays > 0 ? input.periodDays : 30;
    const currentEnd = input.currentPeriodEnd
      ? new Date(input.currentPeriodEnd)
      : now;
    const newEnd = new Date(
      currentEnd.getTime() - periodDays * 24 * 60 * 60 * 1000,
    );
    if (newEnd.getTime() <= now.getTime()) {
      cancelSubscription = true;
    } else {
      shrinkPeriodEnd = newEnd.toISOString();
    }
  }

  return {
    refundKurus,
    toReverse,
    reversed,
    unrecovered,
    cancelSubscription,
    shrinkPeriodEnd,
    isFull,
    remainingRefundableKurus,
  };
}

export type RefundPaymentRow = {
  id: string;
  status: string;
  user_id: string;
  beneficiary_user_id: string | null;
  plan_id: string | null;
  merchant_oid: string | null;
  amount_try: number;
};

export type RefundPlanRow = {
  id: string;
  credit_amount: number | null;
  is_premium: boolean | null;
  tier: string | null;
  period_days: number | null;
  name: string | null;
};

export type RefundContext = {
  payment: RefundPaymentRow;
  plan: RefundPlanRow | null;
  beneficiaryId: string;
  merchantOid: string;
  paidKurus: number;
  purchasedCredits: number;
  alreadyRefundedKurus: number;
  alreadyReversedCredits: number;
  availableBalance: number;
  isSubscription: boolean;
  periodDays: number;
  activeSubscription: {
    id: string;
    plan_id: string | null;
    status: string;
    current_period_end: string | null;
  } | null;
  pendingRefund: { id: string; reason: RefundReasonPayload } | null;
  appliedRefs: Set<string>;
};

function isMissingRpcError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const msg = String(error.message ?? "").toLowerCase();
  return code === "42883" || msg.includes("does not exist") || msg.includes("could not find");
}

function sumAppliedRefunds(
  rows: { amount_try: number | null; reason: string | null }[],
): { alreadyRefundedKurus: number; alreadyReversedCredits: number; appliedRefs: Set<string>; pending: { id: string; reason: RefundReasonPayload } | null } {
  let alreadyRefundedKurus = 0;
  let alreadyReversedCredits = 0;
  const appliedRefs = new Set<string>();
  let pending: { id: string; reason: RefundReasonPayload } | null = null;

  for (const row of rows) {
    const reason = parseRefundReason(row.reason);
    if (!reason) {
      // Eski düz metin satırları: tutarı say, ref yok.
      alreadyRefundedKurus += Math.max(0, row.amount_try ?? 0);
      continue;
    }
    if (reason.state === "pending") {
      pending = { id: (row as { id?: string }).id ?? "", reason };
      continue;
    }
    if (reason.state === "failed") continue;
    if (reason.state === "applied") {
      alreadyRefundedKurus += Math.max(0, row.amount_try ?? 0);
      alreadyReversedCredits += Math.max(0, reason.reversed ?? 0);
      if (reason.ref) appliedRefs.add(reason.ref);
    }
  }

  return { alreadyRefundedKurus, alreadyReversedCredits, appliedRefs, pending };
}

export async function loadRefundContext(
  service: SupabaseClient,
  paymentId: string,
): Promise<{ ok: true; context: RefundContext } | { ok: false; error: string }> {
  const { data: payment, error: paymentError } = await service
    .from("payments")
    .select(
      "id, status, user_id, beneficiary_user_id, plan_id, merchant_oid, amount_try",
    )
    .eq("id", paymentId)
    .maybeSingle();

  if (paymentError || !payment) {
    return { ok: false, error: "Ödeme bulunamadı." };
  }

  const merchantOid = payment.merchant_oid as string | null;
  const paidKurus = payment.amount_try as number;
  if (!merchantOid || !(paidKurus > 0)) {
    return {
      ok: false,
      error: "Ödeme kaydında PayTR sipariş no veya tutar eksik.",
    };
  }

  const beneficiaryId =
    (payment.beneficiary_user_id as string | null) ??
    (payment.user_id as string);

  let plan: RefundPlanRow | null = null;
  if (payment.plan_id) {
    const { data } = await service
      .from("plans")
      .select("id, credit_amount, is_premium, tier, period_days, name")
      .eq("id", payment.plan_id)
      .maybeSingle();
    plan = (data as RefundPlanRow | null) ?? null;
  }

  const isSubscription = Boolean(
    plan?.is_premium ||
      ["plus", "sigma"].includes(String(plan?.tier ?? "").toLowerCase()),
  );

  // Satın alınan kredi: o ödemenin purchase ledger satırından (plan sonradan değişmiş olabilir).
  const { data: purchaseLedger } = await service
    .from("credit_ledger")
    .select("delta")
    .eq("user_id", beneficiaryId)
    .eq("idempotency_key", `pay_${merchantOid}`)
    .eq("entry_type", "purchase")
    .maybeSingle();

  const purchasedCredits = Math.max(0, Number(purchaseLedger?.delta ?? 0));

  const { data: refundRows } = await service
    .from("refunds")
    .select("id, amount_try, reason, created_at")
    .eq("payment_id", paymentId)
    .order("created_at", { ascending: true });

  const summed = sumAppliedRefunds(
    (refundRows ?? []).map((r) => ({
      id: r.id as string,
      amount_try: r.amount_try as number,
      reason: r.reason as string | null,
    })),
  );

  const { data: wallet } = await service
    .from("credit_wallets")
    .select("balance, reserved")
    .eq("user_id", beneficiaryId)
    .maybeSingle();

  // reserved zaten balance'dan düşülmüş; credit_adjust_balance yalnız balance'a bakar.
  const availableBalance = Math.max(0, Number(wallet?.balance ?? 0));

  const { data: activeSub } = await service
    .from("subscriptions")
    .select("id, plan_id, status, current_period_end")
    .eq("user_id", beneficiaryId)
    .eq("status", "active")
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  return {
    ok: true,
    context: {
      payment: payment as RefundPaymentRow,
      plan,
      beneficiaryId,
      merchantOid,
      paidKurus,
      purchasedCredits,
      alreadyRefundedKurus: summed.alreadyRefundedKurus,
      alreadyReversedCredits: summed.alreadyReversedCredits,
      availableBalance,
      isSubscription,
      periodDays: plan?.period_days && plan.period_days > 0 ? plan.period_days : 30,
      activeSubscription: activeSub
        ? {
            id: activeSub.id as string,
            plan_id: (activeSub.plan_id as string | null) ?? null,
            status: activeSub.status as string,
            current_period_end:
              (activeSub.current_period_end as string | null) ?? null,
          }
        : null,
      pendingRefund: summed.pending?.id
        ? { id: summed.pending.id, reason: summed.pending.reason }
        : null,
      appliedRefs: summed.appliedRefs,
    },
  };
}

export type PreviewPaymentRefundResult = {
  ok: true;
  plan: ComputeRefundPlanResult;
  purchasedCredits: number;
  availableBalance: number;
  alreadyRefundedKurus: number;
  isSubscription: boolean;
  paymentStatus: string;
  previewText: string;
};

export async function previewPaymentRefund(
  service: SupabaseClient,
  paymentId: string,
  refundKurus?: number,
): Promise<PreviewPaymentRefundResult | { ok: false; error: string }> {
  const loaded = await loadRefundContext(service, paymentId);
  if (!loaded.ok) return loaded;

  const ctx = loaded.context;
  if (ctx.payment.status !== "paid" && ctx.payment.status !== "refunded") {
    return { ok: false, error: "Yalnızca ödenmiş işlemler iade edilebilir." };
  }

  const amount =
    refundKurus == null ? ctx.paidKurus - ctx.alreadyRefundedKurus : refundKurus;

  const plan = computeRefundPlan({
    paidKurus: ctx.paidKurus,
    refundKurus: amount,
    alreadyRefundedKurus: ctx.alreadyRefundedKurus,
    purchasedCredits: ctx.purchasedCredits,
    alreadyReversedCredits: ctx.alreadyReversedCredits,
    availableBalance: ctx.availableBalance,
    isSubscription: ctx.isSubscription,
    currentPeriodEnd: ctx.activeSubscription?.current_period_end ?? null,
    periodDays: ctx.periodDays,
  });

  if (plan.refundKurus <= 0) {
    return { ok: false, error: "İade edilecek kalan tutar yok." };
  }

  const parts: string[] = [];
  if (ctx.purchasedCredits > 0) {
    parts.push(
      `Satın alınan ${ctx.purchasedCredits} kredi · şu an bakiye ${ctx.availableBalance} · geri alınacak ${plan.reversed} · geri alınamayan ${plan.unrecovered}${plan.unrecovered > 0 ? " (harcanmış)" : ""}`,
    );
  } else if (ctx.isSubscription) {
    if (plan.cancelSubscription) {
      parts.push("Abonelik tam iade ile sonlandırılacak; dönem hakkı sıfırlanacak.");
    } else if (plan.shrinkPeriodEnd) {
      parts.push(
        "Abonelik aktif kalacak; bu ödemenin eklediği süre geri alınacak (önceki dönem sürüyor).",
      );
    } else {
      parts.push("Kısmi iade: abonelik / plan değişmez.");
    }
  } else {
    parts.push("Bu ödemede geri alınacak satın alma kredisi yok.");
  }

  return {
    ok: true,
    plan,
    purchasedCredits: ctx.purchasedCredits,
    availableBalance: ctx.availableBalance,
    alreadyRefundedKurus: ctx.alreadyRefundedKurus,
    isSubscription: ctx.isSubscription,
    paymentStatus: ctx.payment.status,
    previewText: parts.join(" "),
  };
}

export type ApplyPaymentRefundInput = {
  paymentId: string;
  refundKurus: number;
  source: "admin" | "reconcile";
  providerRef: string;
  actorId?: string | null;
  note?: string | null;
  /** Pending kilit satırı varsa onu tamamla. */
  pendingRefundId?: string | null;
};

export type ApplyPaymentRefundResult = {
  ok: boolean;
  error?: string;
  message?: string;
  noop?: boolean;
  reversed?: number;
  unrecovered?: number;
  toReverse?: number;
  isFull?: boolean;
  cancelSubscription?: boolean;
  shrinkPeriodEnd?: string | null;
  refundId?: string;
  partialFailure?: boolean;
  errorStep?: string;
};

async function tryApplyPaymentRefundRpc(
  service: SupabaseClient,
  input: ApplyPaymentRefundInput & {
    plan: ComputeRefundPlanResult;
    context: RefundContext;
    idempotencyKey: string;
  },
): Promise<ApplyPaymentRefundResult | null> {
  const { data, error } = await service.rpc("apply_payment_refund", {
    p_payment_id: input.paymentId,
    p_refund_kurus: input.plan.refundKurus,
    p_provider_ref: input.providerRef,
    p_source: input.source,
    p_actor_id: input.actorId ?? null,
    p_note: input.note ?? null,
    p_to_reverse: input.plan.toReverse,
    p_reversed: input.plan.reversed,
    p_unrecovered: input.plan.unrecovered,
    p_is_full: input.plan.isFull,
    p_cancel_subscription: input.plan.cancelSubscription,
    p_shrink_period_end: input.plan.shrinkPeriodEnd,
    p_idempotency_key: input.idempotencyKey,
    p_pending_refund_id: input.pendingRefundId ?? null,
  });

  if (error) {
    if (isMissingRpcError(error)) return null;
    return {
      ok: false,
      error: `İade RPC hatası: ${error.message}`,
      errorStep: "rpc",
    };
  }

  const payload =
    data && typeof data === "object" ? (data as Record<string, unknown>) : {};
  if (payload.result === "already_applied" || payload.noop === true) {
    return {
      ok: true,
      noop: true,
      message: "Bu iade zaten işlenmiş.",
      reversed: Number(payload.reversed ?? 0),
      unrecovered: Number(payload.unrecovered ?? 0),
      isFull: Boolean(payload.is_full),
    };
  }

  return {
    ok: payload.ok !== false,
    message: typeof payload.message === "string" ? payload.message : undefined,
    error: typeof payload.error === "string" ? payload.error : undefined,
    reversed: Number(payload.reversed ?? input.plan.reversed),
    unrecovered: Number(payload.unrecovered ?? input.plan.unrecovered),
    toReverse: Number(payload.to_reverse ?? input.plan.toReverse),
    isFull: Boolean(payload.is_full ?? input.plan.isFull),
    cancelSubscription: Boolean(
      payload.cancel_subscription ?? input.plan.cancelSubscription,
    ),
    shrinkPeriodEnd:
      (payload.shrink_period_end as string | null | undefined) ??
      input.plan.shrinkPeriodEnd,
    refundId: typeof payload.refund_id === "string" ? payload.refund_id : undefined,
    partialFailure: Boolean(payload.partial_failure),
    errorStep:
      typeof payload.error_step === "string" ? payload.error_step : undefined,
  };
}

async function notifyRefund(
  service: SupabaseClient,
  opts: {
    userId: string;
    reversed: number;
    unrecovered: number;
    isFull: boolean;
    isSubscription: boolean;
    cancelSubscription: boolean;
    refundKurus: number;
  },
) {
  const amountLabel = formatTry(opts.refundKurus);
  let title = "Ödemen iade edildi";
  let body: string;

  if (opts.isSubscription) {
    if (opts.cancelSubscription) {
      title = "Üyeliğin iade nedeniyle sonlandı";
      body = `Ödemen (${amountLabel}) iade edildi. Plus üyeliğin iade nedeniyle sonlandı.`;
    } else if (!opts.isFull) {
      body = `Ödemenden ${amountLabel} kısmi iade edildi. Planın değişmedi.`;
    } else {
      body = `Ödemen (${amountLabel}) iade edildi. Üyelik süren buna göre güncellendi.`;
    }
  } else if (opts.reversed > 0) {
    body = `Ödemen iade edildi. Hesabından ${opts.reversed} kredi geri alındı.`;
    if (opts.unrecovered > 0) {
      body += ` Harcanmış ${opts.unrecovered} kredi geri alınamadı.`;
    }
  } else if (opts.unrecovered > 0) {
    body = `Ödemen iade edildi. Geri alınacak kredilerin tamamı (${opts.unrecovered}) daha önce harcanmıştı; bakiye değişmedi.`;
  } else {
    body = `Ödemen (${amountLabel}) iade edildi.`;
  }

  await service.from("notifications").insert({
    user_id: opts.userId,
    title,
    body,
  });
}

function revalidateAfterRefund() {
  revalidatePath("/krediler");
  revalidatePath("/odemeler");
  revalidatePath("/profil");
  revalidatePath("/admin/odemeler");
  revalidatePath("/admin");
  revalidatePath("/", "layout");
}

async function applyPaymentRefundTs(
  service: SupabaseClient,
  input: ApplyPaymentRefundInput,
  ctx: RefundContext,
  plan: ComputeRefundPlanResult,
): Promise<ApplyPaymentRefundResult> {
  if (ctx.appliedRefs.has(input.providerRef)) {
    return {
      ok: true,
      noop: true,
      message: "Bu iade zaten işlenmiş.",
      reversed: 0,
      unrecovered: 0,
      isFull: plan.isFull,
    };
  }

  const idempotencyKey = refundLedgerIdempotencyKey({
    merchantOid: ctx.merchantOid,
    providerRef: input.providerRef,
    isFull: plan.isFull,
    alreadyRefundedKurus: ctx.alreadyRefundedKurus,
  });

  // Ledger daha önce yazıldıysa (yarıda kalmış akış) tekrar düşme.
  const { data: existingLedger } = await service
    .from("credit_ledger")
    .select("id, delta")
    .eq("user_id", ctx.beneficiaryId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  const reasonPayload: RefundReasonPayload = {
    state: "applied",
    ref: input.providerRef,
    source: input.source,
    kind: "payment_refund",
    merchant_oid: ctx.merchantOid,
    payment_id: ctx.payment.id,
    actor_id: input.actorId ?? null,
    note: input.note ?? null,
    to_reverse: plan.toReverse,
    reversed: plan.reversed,
    unrecovered: plan.unrecovered,
    is_full: plan.isFull,
    cancel_subscription: plan.cancelSubscription,
    shrink_period_end: plan.shrinkPeriodEnd,
  };

  let refundId = input.pendingRefundId ?? undefined;
  if (refundId) {
    const { error } = await service
      .from("refunds")
      .update({
        amount_try: plan.refundKurus,
        reason: JSON.stringify(reasonPayload),
      })
      .eq("id", refundId);
    if (error) {
      return {
        ok: false,
        error: `İade kaydı güncellenemedi: ${error.message}`,
        errorStep: "refunds_update",
        partialFailure: true,
      };
    }
  } else {
    const { data: inserted, error } = await service
      .from("refunds")
      .insert({
        payment_id: ctx.payment.id,
        amount_try: plan.refundKurus,
        reason: JSON.stringify(reasonPayload),
      })
      .select("id")
      .maybeSingle();
    if (error) {
      // Aynı ref ile yarış: applied say.
      const again = await loadRefundContext(service, ctx.payment.id);
      if (again.ok && again.context.appliedRefs.has(input.providerRef)) {
        return {
          ok: true,
          noop: true,
          message: "Bu iade zaten işlenmiş.",
        };
      }
      return {
        ok: false,
        error: `İade kaydı yazılamadı: ${error.message}`,
        errorStep: "refunds_insert",
      };
    }
    refundId = inserted?.id as string | undefined;
  }

  if (plan.reversed > 0 && !existingLedger) {
    const { error: creditError } = await service.rpc("credit_adjust_balance", {
      p_user_id: ctx.beneficiaryId,
      p_delta: -plan.reversed,
      p_idempotency_key: idempotencyKey,
      p_entry_type: "adjustment",
      p_reason: `payment_refund:${ctx.merchantOid}`,
    });
    if (creditError) {
      const msg = String(creditError.message ?? "");
      await auditLog(service, {
        actorId: input.actorId,
        action: "payment.refund.partial",
        entityType: "payment",
        entityId: ctx.payment.id,
        metadata: {
          errorStep: "credit_adjust_balance",
          error: msg,
          providerRef: input.providerRef,
          reason: reasonPayload,
        },
      });
      return {
        ok: false,
        error:
          msg.includes("wallet_not_found")
            ? "Cüzdan bulunamadı; iade defteri kısmen yazıldı."
            : msg.includes("insufficient_balance")
              ? "Bakiye yetersiz; iade defteri kısmen yazıldı."
              : `Kredi geri alınamadı: ${msg}`,
        errorStep: "credit_adjust_balance",
        partialFailure: true,
        refundId,
        reversed: 0,
        unrecovered: plan.toReverse,
        toReverse: plan.toReverse,
        isFull: plan.isFull,
      };
    }
  }

  if (ctx.isSubscription && plan.isFull && ctx.activeSubscription) {
    if (plan.cancelSubscription) {
      const { error: subError } = await service
        .from("subscriptions")
        .update({
          status: "cancelled",
          updated_at: new Date().toISOString(),
        })
        .eq("id", ctx.activeSubscription.id)
        .eq("status", "active");
      if (subError) {
        await auditLog(service, {
          actorId: input.actorId,
          action: "payment.refund.partial",
          entityType: "payment",
          entityId: ctx.payment.id,
          metadata: {
            errorStep: "subscription_cancel",
            error: subError.message,
            providerRef: input.providerRef,
          },
        });
        return {
          ok: false,
          error: `Abonelik iptal edilemedi: ${subError.message}`,
          errorStep: "subscription_cancel",
          partialFailure: true,
          refundId,
          reversed: plan.reversed,
          unrecovered: plan.unrecovered,
          isFull: plan.isFull,
        };
      }

      const { error: walletError } = await service
        .from("credit_wallets")
        .update({
          free_allowance_remaining: 0,
          period_ends_at: new Date(Date.now() - 1000).toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("user_id", ctx.beneficiaryId);
      if (walletError) {
        await auditLog(service, {
          actorId: input.actorId,
          action: "payment.refund.partial",
          entityType: "payment",
          entityId: ctx.payment.id,
          metadata: {
            errorStep: "wallet_allowance_clear",
            error: walletError.message,
            providerRef: input.providerRef,
          },
        });
        return {
          ok: false,
          error: `Dönem hakkı sıfırlanamadı: ${walletError.message}`,
          errorStep: "wallet_allowance_clear",
          partialFailure: true,
          refundId,
          reversed: plan.reversed,
          unrecovered: plan.unrecovered,
          isFull: plan.isFull,
          cancelSubscription: true,
        };
      }
    } else if (plan.shrinkPeriodEnd) {
      const { error: shrinkError } = await service
        .from("subscriptions")
        .update({
          current_period_end: plan.shrinkPeriodEnd,
          updated_at: new Date().toISOString(),
        })
        .eq("id", ctx.activeSubscription.id)
        .eq("status", "active");
      if (shrinkError) {
        await auditLog(service, {
          actorId: input.actorId,
          action: "payment.refund.partial",
          entityType: "payment",
          entityId: ctx.payment.id,
          metadata: {
            errorStep: "subscription_shrink",
            error: shrinkError.message,
            providerRef: input.providerRef,
          },
        });
        return {
          ok: false,
          error: `Abonelik süresi güncellenemedi: ${shrinkError.message}`,
          errorStep: "subscription_shrink",
          partialFailure: true,
          refundId,
          reversed: plan.reversed,
          unrecovered: plan.unrecovered,
          isFull: plan.isFull,
        };
      }
    }
  }

  if (plan.isFull && ctx.payment.status === "paid") {
    const { error: statusError } = await service
      .from("payments")
      .update({
        status: "refunded",
        updated_at: new Date().toISOString(),
      })
      .eq("id", ctx.payment.id)
      .eq("status", "paid");
    if (statusError) {
      await auditLog(service, {
        actorId: input.actorId,
        action: "payment.refund.partial",
        entityType: "payment",
        entityId: ctx.payment.id,
        metadata: {
          errorStep: "payment_status",
          error: statusError.message,
          providerRef: input.providerRef,
        },
      });
      return {
        ok: false,
        error: `Ödeme durumu güncellenemedi: ${statusError.message}`,
        errorStep: "payment_status",
        partialFailure: true,
        refundId,
        reversed: plan.reversed,
        unrecovered: plan.unrecovered,
        isFull: plan.isFull,
        cancelSubscription: plan.cancelSubscription,
      };
    }
  }

  await auditLog(service, {
    actorId: input.actorId,
    action: "payment.refunded",
    entityType: "payment",
    entityId: ctx.payment.id,
    metadata: {
      source: input.source,
      providerRef: input.providerRef,
      refundKurus: plan.refundKurus,
      toReverse: plan.toReverse,
      reversed: plan.reversed,
      unrecovered: plan.unrecovered,
      isFull: plan.isFull,
      cancelSubscription: plan.cancelSubscription,
      shrinkPeriodEnd: plan.shrinkPeriodEnd,
      beneficiaryId: ctx.beneficiaryId,
      merchantOid: ctx.merchantOid,
    },
  });

  await notifyRefund(service, {
    userId: ctx.beneficiaryId,
    reversed: plan.reversed,
    unrecovered: plan.unrecovered,
    isFull: plan.isFull,
    isSubscription: ctx.isSubscription,
    cancelSubscription: plan.cancelSubscription,
    refundKurus: plan.refundKurus,
  });

  revalidateAfterRefund();

  const bits: string[] = [];
  if (plan.reversed > 0) bits.push(`${plan.reversed} kredi geri alındı`);
  if (plan.unrecovered > 0) bits.push(`${plan.unrecovered} kredi geri alınamadı (harcanmış)`);
  if (plan.cancelSubscription) bits.push("abonelik sonlandırıldı");
  else if (plan.shrinkPeriodEnd) bits.push("abonelik süresi kısaltıldı");
  else if (ctx.isSubscription && !plan.isFull) bits.push("abonelik korundu (kısmi iade)");

  return {
    ok: true,
    message: bits.length
      ? `İade işlendi: ${bits.join("; ")}.`
      : "İade deftere işlendi.",
    reversed: plan.reversed,
    unrecovered: plan.unrecovered,
    toReverse: plan.toReverse,
    isFull: plan.isFull,
    cancelSubscription: plan.cancelSubscription,
    shrinkPeriodEnd: plan.shrinkPeriodEnd,
    refundId,
  };
}

export async function applyPaymentRefund(
  service: SupabaseClient,
  input: ApplyPaymentRefundInput,
): Promise<ApplyPaymentRefundResult> {
  const loaded = await loadRefundContext(service, input.paymentId);
  if (!loaded.ok) return loaded;

  const ctx = loaded.context;
  if (ctx.payment.status !== "paid" && ctx.payment.status !== "refunded") {
    return { ok: false, error: "Yalnızca ödenmiş işlemler iade edilebilir." };
  }

  if (ctx.appliedRefs.has(input.providerRef)) {
    return {
      ok: true,
      noop: true,
      message: "Bu iade zaten işlenmiş.",
      reversed: 0,
      unrecovered: 0,
    };
  }

  const plan = computeRefundPlan({
    paidKurus: ctx.paidKurus,
    refundKurus: input.refundKurus,
    alreadyRefundedKurus: ctx.alreadyRefundedKurus,
    purchasedCredits: ctx.purchasedCredits,
    alreadyReversedCredits: ctx.alreadyReversedCredits,
    availableBalance: ctx.availableBalance,
    isSubscription: ctx.isSubscription,
    currentPeriodEnd: ctx.activeSubscription?.current_period_end ?? null,
    periodDays: ctx.periodDays,
  });

  if (plan.refundKurus <= 0) {
    return { ok: false, error: "İade edilecek kalan tutar yok." };
  }

  const idempotencyKey = refundLedgerIdempotencyKey({
    merchantOid: ctx.merchantOid,
    providerRef: input.providerRef,
    isFull: plan.isFull,
    alreadyRefundedKurus: ctx.alreadyRefundedKurus,
  });

  const rpcResult = await tryApplyPaymentRefundRpc(service, {
    ...input,
    plan,
    context: ctx,
    idempotencyKey,
  });
  if (rpcResult) {
    if (rpcResult.ok && !rpcResult.partialFailure) {
      revalidateAfterRefund();
    }
    return rpcResult;
  }

  return applyPaymentRefundTs(service, input, ctx, plan);
}

export async function insertPendingRefundLock(
  service: SupabaseClient,
  opts: {
    paymentId: string;
    refundKurus: number;
    providerRef: string;
    actorId: string;
    merchantOid: string;
  },
): Promise<{ ok: true; refundId: string } | { ok: false; error: string }> {
  const loaded = await loadRefundContext(service, opts.paymentId);
  if (!loaded.ok) return loaded;

  if (loaded.context.pendingRefund) {
    return {
      ok: false,
      error:
        "Bu ödeme için devam eden bir iade var. Bitmesini bekleyin veya 'PayTR'den kontrol et' kullanın.",
    };
  }

  const reason: RefundReasonPayload = {
    state: "pending",
    ref: opts.providerRef,
    source: "admin",
    kind: "payment_refund",
    merchant_oid: opts.merchantOid,
    payment_id: opts.paymentId,
    actor_id: opts.actorId,
  };

  const { data, error } = await service
    .from("refunds")
    .insert({
      payment_id: opts.paymentId,
      amount_try: opts.refundKurus,
      reason: JSON.stringify(reason),
    })
    .select("id")
    .maybeSingle();

  if (error || !data?.id) {
    // Dar yarış penceresi: iki istek aynı anda pending insert edebilir.
    const again = await loadRefundContext(service, opts.paymentId);
    if (again.ok && again.context.pendingRefund) {
      return {
        ok: false,
        error:
          "Bu ödeme için devam eden bir iade var (eşzamanlı istek). Bitmesini bekleyin.",
      };
    }
    return {
      ok: false,
      error: error?.message ?? "İade kilidi alınamadı.",
    };
  }

  return { ok: true, refundId: data.id as string };
}

export async function markPendingRefundFailed(
  service: SupabaseClient,
  refundId: string,
  paytrErr: string,
): Promise<void> {
  const { data } = await service
    .from("refunds")
    .select("reason")
    .eq("id", refundId)
    .maybeSingle();
  const previous = parseRefundReason(data?.reason as string | null);
  const next: RefundReasonPayload = {
    ...(previous ?? {
      state: "failed",
      ref: "unknown",
      source: "admin",
      kind: "payment_refund",
      merchant_oid: "",
      payment_id: "",
    }),
    state: "failed",
    paytr_err: paytrErr,
  };
  await service
    .from("refunds")
    .update({ reason: JSON.stringify(next) })
    .eq("id", refundId);
}

export function generateRefundProviderRef(prefix = "admin"): string {
  const rand = Math.random().toString(36).slice(2, 10);
  return `${prefix}${Date.now().toString(36)}${rand}`.slice(0, 64);
}

export function isPaymentRefundLedgerEntry(entry: {
  entry_type?: string | null;
  idempotency_key?: string | null;
  metadata?: { reason?: unknown } | null;
}): boolean {
  if (entry.entry_type !== "adjustment") return false;
  if (
    typeof entry.idempotency_key === "string" &&
    entry.idempotency_key.startsWith("payment_refund:")
  ) {
    return true;
  }
  const reason = entry.metadata?.reason;
  return typeof reason === "string" && reason.startsWith("payment_refund:");
}
