import "server-only";

import crypto from "crypto";
import { revalidatePath } from "next/cache";
import type { SupabaseClient } from "@supabase/supabase-js";
import { auditLog } from "@/lib/audit";
import { formatTry } from "@/lib/format";

/** refunds.reason JSON — makine-okunur durum + defter özeti. */
export type RefundReasonState = "pending" | "applying" | "applied" | "failed";

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
  skip_subscription?: boolean;
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
  /** B5: legacy/refunded ödemede aboneliğe dokunma. */
  touchSubscription?: boolean;
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
  shrinkPeriodEnd: string | null;
  isFull: boolean;
  remainingRefundableKurus: number;
  skipSubscription: boolean;
};

/** Pending/applying satırları bu süreden eskiyse kilit sayılmaz (süresi dolmuş). */
export const PENDING_LOCK_TTL_MS = 10 * 60 * 1000;

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
  if (opts.isFull && opts.alreadyRefundedKurus === 0) {
    return `payment_refund:${opts.merchantOid}:full`;
  }
  return `payment_refund:${opts.merchantOid}:${opts.providerRef}`;
}

/**
 * Mutabakat için deterministik ref: PayTR toplam iade kuruşuna bağlı.
 * reference_no olmasa da aynı toplam → aynı ref → tekrar işlenmez.
 */
export function reconcileDeltaRef(merchantOid: string, paytrTotalKurus: number): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${merchantOid}|${paytrTotalKurus}`)
    .digest("hex")
    .slice(0, 40);
  return `rec${digest}`.slice(0, 64);
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

  let toReverse =
    paid > 0 && refundKurus > 0
      ? Math.floor((purchased * refundKurus) / paid)
      : 0;
  toReverse = Math.min(toReverse, Math.max(0, purchased - alreadyReversed));

  const reversed = Math.min(toReverse, available);
  const unrecovered = toReverse - reversed;

  const skipSubscription = input.touchSubscription === false;
  let cancelSubscription = false;
  let shrinkPeriodEnd: string | null = null;

  if (input.isSubscription && isFull && !skipSubscription) {
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
    skipSubscription,
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

export type InProgressRefund = {
  id: string;
  reason: RefundReasonPayload;
  createdAt: string | null;
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
  /** B5: ödemenin aktif dönemi finanse edip etmediği. */
  touchSubscription: boolean;
  legacyRefundedCleanup: boolean;
  activeSubscription: {
    id: string;
    plan_id: string | null;
    status: string;
    current_period_end: string | null;
  } | null;
  pendingRefund: InProgressRefund | null;
  inProgressByRef: Map<string, InProgressRefund>;
  appliedRefs: Set<string>;
};

function isMissingRpcError(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const code = String(error.code ?? "");
  const msg = String(error.message ?? "").toLowerCase();
  return (
    code === "42883" ||
    code === "PGRST202" ||
    msg.includes("does not exist") ||
    msg.includes("could not find")
  );
}

export function sumAppliedRefunds(
  rows: {
    id?: string;
    amount_try: number | null;
    reason: string | null;
    created_at?: string | null;
  }[],
  now = new Date(),
): {
  alreadyRefundedKurus: number;
  alreadyReversedCredits: number;
  appliedRefs: Set<string>;
  pending: InProgressRefund | null;
  inProgressByRef: Map<string, InProgressRefund>;
  stalePendingIds: string[];
} {
  let alreadyRefundedKurus = 0;
  let alreadyReversedCredits = 0;
  const appliedRefs = new Set<string>();
  const inProgressByRef = new Map<string, InProgressRefund>();
  let pending: InProgressRefund | null = null;
  const stalePendingIds: string[] = [];

  for (const row of rows) {
    const reason = parseRefundReason(row.reason);
    if (!reason) {
      alreadyRefundedKurus += Math.max(0, row.amount_try ?? 0);
      continue;
    }
    if (reason.state === "failed") continue;

    if (reason.state === "pending" || reason.state === "applying") {
      const createdMs = row.created_at ? Date.parse(row.created_at) : NaN;
      const ageMs = Number.isFinite(createdMs) ? now.getTime() - createdMs : 0;
      if (ageMs > PENDING_LOCK_TTL_MS) {
        if (row.id) stalePendingIds.push(row.id);
        continue;
      }
      const entry: InProgressRefund = {
        id: row.id ?? "",
        reason,
        createdAt: row.created_at ?? null,
      };
      if (reason.ref) inProgressByRef.set(reason.ref, entry);
      if (!pending || (entry.createdAt && pending.createdAt && entry.createdAt < pending.createdAt)) {
        pending = entry;
      } else if (!pending) {
        pending = entry;
      }
      continue;
    }

    if (reason.state === "applied") {
      alreadyRefundedKurus += Math.max(0, row.amount_try ?? 0);
      alreadyReversedCredits += Math.max(0, reason.reversed ?? 0);
      if (reason.ref) appliedRefs.add(reason.ref);
    }
  }

  return {
    alreadyRefundedKurus,
    alreadyReversedCredits,
    appliedRefs,
    pending,
    inProgressByRef,
    stalePendingIds,
  };
}

/**
 * B5: Eski akışta payments.status=refunded yazılmış ama refunds satırı yoksa
 * abonelik o zaman zaten iptal edilmişti. Yeni aboneliğe dokunma.
 */
export function shouldTouchSubscription(opts: {
  paymentStatus: string;
  alreadyRefundedKurus: number;
  isSubscription: boolean;
}): boolean {
  if (!opts.isSubscription) return false;
  if (opts.paymentStatus === "refunded" && opts.alreadyRefundedKurus === 0) {
    return false;
  }
  return true;
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
      created_at: r.created_at as string | null,
    })),
  );

  // Süresi dolmuş pending/applying satırlarını failed yap (kilidi aç).
  for (const staleId of summed.stalePendingIds) {
    const row = (refundRows ?? []).find((r) => r.id === staleId);
    const prev = parseRefundReason(row?.reason as string | null);
    if (!prev) continue;
    await service
      .from("refunds")
      .update({
        reason: JSON.stringify({
          ...prev,
          state: "failed",
          paytr_err: prev.paytr_err ?? "pending_expired",
          error_step: "pending_expired",
        }),
      })
      .eq("id", staleId);
  }

  const { data: wallet } = await service
    .from("credit_wallets")
    .select("balance, reserved")
    .eq("user_id", beneficiaryId)
    .maybeSingle();

  const availableBalance = Math.max(0, Number(wallet?.balance ?? 0));

  const { data: activeSub } = await service
    .from("subscriptions")
    .select("id, plan_id, status, current_period_end")
    .eq("user_id", beneficiaryId)
    .eq("status", "active")
    .order("current_period_end", { ascending: false, nullsFirst: false })
    .limit(1)
    .maybeSingle();

  const touchSubscription = shouldTouchSubscription({
    paymentStatus: payment.status as string,
    alreadyRefundedKurus: summed.alreadyRefundedKurus,
    isSubscription,
  });

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
      touchSubscription,
      legacyRefundedCleanup: isSubscription && !touchSubscription,
      activeSubscription: activeSub
        ? {
            id: activeSub.id as string,
            plan_id: (activeSub.plan_id as string | null) ?? null,
            status: activeSub.status as string,
            current_period_end:
              (activeSub.current_period_end as string | null) ?? null,
          }
        : null,
      pendingRefund: summed.pending?.id ? summed.pending : null,
      inProgressByRef: summed.inProgressByRef,
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
  touchSubscription: boolean;
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

  if (!(amount > 0) || !Number.isFinite(amount)) {
    return { ok: false, error: "İade tutarı geçersiz." };
  }

  const plan = computeRefundPlan({
    paidKurus: ctx.paidKurus,
    refundKurus: amount,
    alreadyRefundedKurus: ctx.alreadyRefundedKurus,
    purchasedCredits: ctx.purchasedCredits,
    alreadyReversedCredits: ctx.alreadyReversedCredits,
    availableBalance: ctx.availableBalance,
    isSubscription: ctx.isSubscription,
    touchSubscription: ctx.touchSubscription,
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
  }
  if (ctx.legacyRefundedCleanup) {
    parts.push(
      "Bu ödeme daha önce iade edilmiş (eski kayıt). Yalnızca kredi defteri tamamlanır; aktif aboneliğe dokunulmaz.",
    );
  } else if (ctx.isSubscription) {
    if (plan.cancelSubscription) {
      parts.push("Abonelik tam iade ile sonlandırılacak; dönem hakkı sıfırlanacak.");
    } else if (plan.shrinkPeriodEnd) {
      parts.push(
        "Abonelik aktif kalacak; bu ödemenin eklediği süre geri alınacak (önceki dönem sürüyor).",
      );
    } else if (!plan.isFull) {
      parts.push("Kısmi iade: abonelik / plan değişmez.");
    }
  } else if (ctx.purchasedCredits === 0) {
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
    touchSubscription: ctx.touchSubscription,
  };
}

export type ApplyPaymentRefundInput = {
  paymentId: string;
  refundKurus: number;
  source: "admin" | "reconcile";
  providerRef: string;
  actorId?: string | null;
  note?: string | null;
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
    p_refund_kurus: input.refundKurus,
    p_provider_ref: input.providerRef,
    p_source: input.source,
    p_actor_id: input.actorId ?? null,
    p_note: input.note ?? null,
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
    planName?: string | null;
  },
) {
  const amountLabel = formatTry(opts.refundKurus);
  const planLabel = opts.planName?.trim() || "Üyelik";
  let title = "Ödemen iade edildi";
  let body: string;

  if (opts.isSubscription) {
    if (opts.cancelSubscription) {
      title = "Üyeliğin iade nedeniyle sonlandı";
      body = `Ödemen (${amountLabel}) iade edildi. ${planLabel} üyeliğin iade nedeniyle sonlandı.`;
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

async function writeRefundReason(
  service: SupabaseClient,
  refundId: string,
  payload: RefundReasonPayload,
  amountTry: number,
): Promise<{ error: string | null }> {
  const { error } = await service
    .from("refunds")
    .update({
      amount_try: amountTry,
      reason: JSON.stringify(payload),
    })
    .eq("id", refundId);
  return { error: error?.message ?? null };
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

  // B1: önce applying yaz; applied en sonda.
  const applyingPayload: RefundReasonPayload = {
    state: "applying",
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
    skip_subscription: plan.skipSubscription,
  };

  let refundId =
    input.pendingRefundId ??
    ctx.inProgressByRef.get(input.providerRef)?.id ??
    undefined;

  if (refundId) {
    const { error } = await writeRefundReason(
      service,
      refundId,
      applyingPayload,
      plan.refundKurus,
    );
    if (error) {
      return {
        ok: false,
        error: `İade kaydı güncellenemedi: ${error}`,
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
        reason: JSON.stringify(applyingPayload),
      })
      .select("id")
      .maybeSingle();
    if (error) {
      const again = await loadRefundContext(service, ctx.payment.id);
      if (again.ok && again.context.appliedRefs.has(input.providerRef)) {
        return {
          ok: true,
          noop: true,
          message: "Bu iade zaten işlenmiş.",
        };
      }
      const resume = again.ok
        ? again.context.inProgressByRef.get(input.providerRef)
        : null;
      if (resume?.id) {
        refundId = resume.id;
      } else {
        return {
          ok: false,
          error: `İade kaydı yazılamadı: ${error.message}`,
          errorStep: "refunds_insert",
        };
      }
    } else {
      refundId = inserted?.id as string | undefined;
    }
  }

  if (!refundId) {
    return { ok: false, error: "İade satırı oluşturulamadı.", errorStep: "refunds_insert" };
  }

  // Ledger var mı? (yarıda kalmış retry)
  const { data: existingLedger } = await service
    .from("credit_ledger")
    .select("id, delta")
    .eq("user_id", ctx.beneficiaryId)
    .eq("idempotency_key", idempotencyKey)
    .maybeSingle();

  let actualReversed = plan.reversed;
  let actualUnrecovered = plan.unrecovered;

  if (existingLedger) {
    actualReversed = Math.abs(Number(existingLedger.delta ?? 0));
    actualUnrecovered = Math.max(0, plan.toReverse - actualReversed);
  } else if (plan.reversed > 0) {
    const { error: creditError } = await service.rpc("credit_adjust_balance", {
      p_user_id: ctx.beneficiaryId,
      p_delta: -plan.reversed,
      p_idempotency_key: idempotencyKey,
      p_entry_type: "adjustment",
      p_reason: `payment_refund:${ctx.merchantOid}`,
    });
    if (creditError) {
      const msg = String(creditError.message ?? "");
      await writeRefundReason(
        service,
        refundId,
        { ...applyingPayload, error_step: "credit_adjust_balance" },
        plan.refundKurus,
      );
      await auditLog(service, {
        actorId: input.actorId,
        action: "payment.refund.partial",
        entityType: "payment",
        entityId: ctx.payment.id,
        metadata: {
          errorStep: "credit_adjust_balance",
          error: msg,
          providerRef: input.providerRef,
        },
      });
      return {
        ok: false,
        error:
          msg.includes("wallet_not_found")
            ? "Cüzdan bulunamadı; iade yarıda kaldı — tekrar deneyin."
            : msg.includes("insufficient_balance")
              ? "Bakiye yetersiz; iade yarıda kaldı — tekrar deneyin."
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

  // B5: legacy refunded cleanup → aboneliğe dokunma
  if (
    !plan.skipSubscription &&
    ctx.isSubscription &&
    plan.isFull &&
    ctx.activeSubscription
  ) {
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
        await writeRefundReason(
          service,
          refundId,
          { ...applyingPayload, error_step: "subscription_cancel", reversed: actualReversed, unrecovered: actualUnrecovered },
          plan.refundKurus,
        );
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
          reversed: actualReversed,
          unrecovered: actualUnrecovered,
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
        await writeRefundReason(
          service,
          refundId,
          { ...applyingPayload, error_step: "wallet_allowance_clear", reversed: actualReversed, unrecovered: actualUnrecovered },
          plan.refundKurus,
        );
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
          reversed: actualReversed,
          unrecovered: actualUnrecovered,
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
        await writeRefundReason(
          service,
          refundId,
          { ...applyingPayload, error_step: "subscription_shrink", reversed: actualReversed, unrecovered: actualUnrecovered },
          plan.refundKurus,
        );
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
          reversed: actualReversed,
          unrecovered: actualUnrecovered,
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
      await writeRefundReason(
        service,
        refundId,
        { ...applyingPayload, error_step: "payment_status", reversed: actualReversed, unrecovered: actualUnrecovered },
        plan.refundKurus,
      );
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
        reversed: actualReversed,
        unrecovered: actualUnrecovered,
        isFull: plan.isFull,
        cancelSubscription: plan.cancelSubscription,
      };
    }
  }

  // B1: applied EN SONDA
  const appliedPayload: RefundReasonPayload = {
    ...applyingPayload,
    state: "applied",
    reversed: actualReversed,
    unrecovered: actualUnrecovered,
    error_step: null,
  };
  const { error: finalError } = await writeRefundReason(
    service,
    refundId,
    appliedPayload,
    plan.refundKurus,
  );
  if (finalError) {
    return {
      ok: false,
      error: `İade tamamlandı ama kayıt kapatılamadı: ${finalError}`,
      errorStep: "refunds_finalize",
      partialFailure: true,
      refundId,
      reversed: actualReversed,
      unrecovered: actualUnrecovered,
      isFull: plan.isFull,
      cancelSubscription: plan.cancelSubscription,
    };
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
      reversed: actualReversed,
      unrecovered: actualUnrecovered,
      isFull: plan.isFull,
      cancelSubscription: plan.cancelSubscription,
      shrinkPeriodEnd: plan.shrinkPeriodEnd,
      skipSubscription: plan.skipSubscription,
      beneficiaryId: ctx.beneficiaryId,
      merchantOid: ctx.merchantOid,
    },
  });

  await notifyRefund(service, {
    userId: ctx.beneficiaryId,
    reversed: actualReversed,
    unrecovered: actualUnrecovered,
    isFull: plan.isFull,
    isSubscription: ctx.isSubscription,
    cancelSubscription: plan.cancelSubscription,
    refundKurus: plan.refundKurus,
    planName: ctx.plan?.name,
  });

  revalidateAfterRefund();

  const bits: string[] = [];
  if (actualReversed > 0) bits.push(`${actualReversed} kredi geri alındı`);
  if (actualUnrecovered > 0) {
    bits.push(`${actualUnrecovered} kredi geri alınamadı (harcanmış)`);
  }
  if (plan.skipSubscription && ctx.isSubscription) {
    bits.push("aktif aboneliğe dokunulmadı (eski iade kaydı)");
  } else if (plan.cancelSubscription) {
    bits.push("abonelik sonlandırıldı");
  } else if (plan.shrinkPeriodEnd) {
    bits.push("abonelik süresi kısaltıldı");
  } else if (ctx.isSubscription && !plan.isFull) {
    bits.push("abonelik korundu (kısmi iade)");
  }

  return {
    ok: true,
    message: bits.length
      ? `İade işlendi: ${bits.join("; ")}.`
      : "İade deftere işlendi.",
    reversed: actualReversed,
    unrecovered: actualUnrecovered,
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
  if (
    !Number.isFinite(input.refundKurus) ||
    !Number.isInteger(input.refundKurus) ||
    input.refundKurus <= 0
  ) {
    return { ok: false, error: "İade tutarı geçersiz." };
  }

  const loaded = await loadRefundContext(service, input.paymentId);
  if (!loaded.ok) return loaded;

  const ctx = loaded.context;
  if (ctx.payment.status !== "paid" && ctx.payment.status !== "refunded") {
    return { ok: false, error: "Yalnızca ödenmiş işlemler iade edilebilir." };
  }

  // Applied → noop. Applying/pending → resume (noop değil).
  if (ctx.appliedRefs.has(input.providerRef)) {
    return {
      ok: true,
      noop: true,
      message: "Bu iade zaten işlenmiş.",
      reversed: 0,
      unrecovered: 0,
    };
  }

  const inProgress = ctx.inProgressByRef.get(input.providerRef);
  const pendingRefundId = input.pendingRefundId ?? inProgress?.id ?? null;

  const plan = computeRefundPlan({
    paidKurus: ctx.paidKurus,
    refundKurus: input.refundKurus,
    alreadyRefundedKurus: ctx.alreadyRefundedKurus,
    purchasedCredits: ctx.purchasedCredits,
    alreadyReversedCredits: ctx.alreadyReversedCredits,
    availableBalance: ctx.availableBalance,
    isSubscription: ctx.isSubscription,
    touchSubscription: ctx.touchSubscription,
    currentPeriodEnd: ctx.activeSubscription?.current_period_end ?? null,
    periodDays: ctx.periodDays,
  });

  if (plan.refundKurus <= 0) {
    // Resume durumunda applying satırı var ama tutar kalmadıysa (başka iade
    // araya girdiyse) satırı failed yapıp çık.
    if (pendingRefundId) {
      await markPendingRefundFailed(
        service,
        pendingRefundId,
        "remaining_zero_on_resume",
      );
    }
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
    pendingRefundId,
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

  return applyPaymentRefundTs(
    service,
    { ...input, pendingRefundId },
    ctx,
    plan,
  );
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
    .select("id, created_at, reason")
    .maybeSingle();

  if (error || !data?.id) {
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

  // Eşzamanlı insert yarışı: en eski pending kazansın; diğerleri failed + abort.
  const after = await loadRefundContext(service, opts.paymentId);
  if (after.ok && after.context.pendingRefund) {
    const winner = after.context.pendingRefund;
    if (winner.id !== data.id) {
      await markPendingRefundFailed(
        service,
        data.id as string,
        "lost_pending_race",
      );
      return {
        ok: false,
        error:
          "Bu ödeme için devam eden bir iade var (eşzamanlı istek). Bitmesini bekleyin.",
      };
    }
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
  const rand = crypto.randomBytes(6).toString("hex");
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
