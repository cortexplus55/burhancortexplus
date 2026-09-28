"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit";
import { verifySmtpConnection } from "@/lib/email/smtp";
import { requestPaytrRefund, queryPaytrStatus } from "@/lib/payments/paytr";
import {
  applyPaymentRefund,
  generateRefundProviderRef,
  insertPendingRefundLock,
  loadRefundContext,
  markPendingRefundFailed,
  previewPaymentRefund,
  reconcileDeltaRef,
} from "@/lib/payments/refund";
import { formatTry } from "@/lib/format";

async function requireAdminActor() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();

  return data ? user.id : null;
}

const decisionSchema = z.object({
  applicationId: z.string().uuid(),
  decision: z.enum(["approved", "rejected"]),
  notes: z.string().max(500).optional(),
});

export async function reviewTeacherApplication(input: {
  applicationId: string;
  decision: "approved" | "rejected";
  notes?: string;
}) {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const parsed = decisionSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const service = createServiceClient();
  const { data: application } = await service
    .from("teacher_applications")
    .select("id, user_id, status")
    .eq("id", parsed.data.applicationId)
    .maybeSingle();

  if (!application) return { ok: false, error: "Başvuru bulunamadı." };
  if (application.status !== "pending") {
    return { ok: false, error: "Başvuru zaten sonuçlanmış." };
  }

  await service
    .from("teacher_applications")
    .update({
      status: parsed.data.decision,
      reviewed_by: actorId,
      reviewed_at: new Date().toISOString(),
      notes: parsed.data.notes ?? null,
    })
    .eq("id", application.id);

  await service
    .from("profiles")
    .update({ teacher_application_status: parsed.data.decision })
    .eq("id", application.user_id);

  if (parsed.data.decision === "approved") {
    await service
      .from("user_roles")
      .upsert(
        {
          user_id: application.user_id,
          role: "verified_teacher",
          granted_by: actorId,
          revoked_at: null,
        },
        { onConflict: "user_id,role" },
      );
    await service.from("teacher_verifications").insert({
      user_id: application.user_id,
      verified_by: actorId,
    });
  }

  await service.from("notifications").insert({
    user_id: application.user_id,
    title:
      parsed.data.decision === "approved"
        ? "Öğretmen başvurun onaylandı"
        : "Öğretmen başvurun sonuçlandı",
    body:
      parsed.data.decision === "approved"
        ? "Öğretmen paneline artık erişebilirsin."
        : "Başvurun bu kez onaylanmadı. Belgelerini güncelleyerek tekrar deneyebilirsin.",
  });

  await auditLog(service, {
    actorId,
    action: `teacher.application.${parsed.data.decision}`,
    entityType: "teacher_application",
    entityId: application.id,
  });

  revalidatePath("/admin/ogretmen-basvurulari");
  return { ok: true };
}

const creditRuleSchema = z.object({
  actionCode: z.string().min(3).max(60),
  creditCost: z.number().int().min(0).max(1000),
});

export async function updateCreditRule(input: {
  actionCode: string;
  creditCost: number;
}) {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const parsed = creditRuleSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Geçersiz değer." };

  const service = createServiceClient();
  const { error } = await service
    .from("credit_rules")
    .update({
      credit_cost: parsed.data.creditCost,
      updated_at: new Date().toISOString(),
    })
    .eq("action_code", parsed.data.actionCode);

  await auditLog(service, {
    actorId,
    action: "credit_rule.updated",
    entityType: "credit_rule",
    entityId: parsed.data.actionCode,
    metadata: { credit_cost: parsed.data.creditCost },
  });

  revalidatePath("/admin/kredi-kurallari");
  return { ok: !error, error: error ? "Güncellenemedi." : undefined };
}

export async function toggleFeatureFlag(key: string, enabled: boolean) {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const service = createServiceClient();
  const { error } = await service
    .from("feature_flags")
    .upsert(
      { key, enabled, updated_at: new Date().toISOString() },
      { onConflict: "key" },
    );

  await auditLog(service, {
    actorId,
    action: "feature_flag.toggled",
    entityType: "feature_flag",
    entityId: key,
    metadata: { enabled },
  });

  revalidatePath("/admin/feature-flags");
  return { ok: !error };
}

export async function grantCredits(userId: string, amount: number) {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const parsed = z
    .object({ userId: z.string().uuid(), amount: z.number().int().min(1).max(10000) })
    .safeParse({ userId, amount });
  if (!parsed.success) return { ok: false, error: "Geçersiz değer." };

  const service = createServiceClient();
  const { data, error } = await service.rpc("credit_adjust_balance", {
    p_user_id: parsed.data.userId,
    p_delta: parsed.data.amount,
    p_idempotency_key: `grant_${actorId}_${parsed.data.userId}_${parsed.data.amount}_${Date.now()}`,
    p_entry_type: "grant",
    p_reason: `admin:${actorId}`,
  });

  if (error) {
    if (error.message.includes("wallet_not_found")) {
      return { ok: false, error: "Cüzdan bulunamadı." };
    }
    return { ok: false, error: "Kredi verilemedi." };
  }

  await auditLog(service, {
    actorId,
    action: "credits.granted",
    entityType: "profile",
    entityId: parsed.data.userId,
    metadata: { amount: parsed.data.amount, balance_after: data },
  });

  revalidatePath("/admin/kullanicilar");
  return { ok: true };
}

export async function testWorkspaceSmtp() {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const result = await verifySmtpConnection();
  if (!result.ok) {
    const hint =
      result.reason === "smtp_not_configured"
        ? "SMTP_PASS veya EMAIL_FROM tanımlı değil."
        : result.reason.includes("535")
          ? "535: Uygulama şifresi gerekir (hesap şifresi değil)."
          : result.reason;
    return { ok: false, error: hint };
  }

  const service = createServiceClient();
  await auditLog(service, {
    actorId,
    action: "smtp.verify_ok",
    entityType: "system",
    entityId: "workspace_smtp",
  });

  revalidatePath("/admin/sistem");
  return { ok: true };
}

/* ---------------------------------------------------------------------------
   Aşağıdakiler panelin salt okunur olmaktan çıkması için eklendi. Her biri
   audit_logs tablosuna yazıyor: yönetici işlemlerinin izi kalmalı.
   --------------------------------------------------------------------------- */

const ROLE_LABELS: Record<string, string> = {
  admin: "yönetici",
  teacher: "öğretmen",
  verified_teacher: "onaylı öğretmen",
};

/**
 * Bir hesaba yetki verir ya da geri alır.
 *
 * Kendi yöneticiliğini geri almak engelleniyor: tek yönetici kendini
 * çıkarırsa panele kimse giremez ve geri dönüş yalnızca veritabanından olur.
 */
export async function setUserRole(input: {
  userId: string;
  role: "admin" | "teacher" | "verified_teacher";
  grant: boolean;
}) {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const parsed = z
    .object({
      userId: z.string().uuid(),
      role: z.enum(["admin", "teacher", "verified_teacher"]),
      grant: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Geçersiz değer." };

  if (
    !parsed.data.grant &&
    parsed.data.role === "admin" &&
    parsed.data.userId === actorId
  ) {
    return {
      ok: false,
      error: "Kendi yöneticiliğini geri alamazsın; panele giriş kapanır.",
    };
  }

  const service = createServiceClient();
  const { data: existing } = await service
    .from("user_roles")
    .select("id, revoked_at")
    .eq("user_id", parsed.data.userId)
    .eq("role", parsed.data.role)
    .maybeSingle();

  let error = null;
  if (parsed.data.grant) {
    // UNIQUE (user_id, role) var: daha önce verilip geri alınmışsa satır
    // duruyor, yenisini eklemek yerine iptali kaldırıyoruz.
    ({ error } = existing
      ? await service.from("user_roles").update({ revoked_at: null }).eq("id", existing.id)
      : await service
          .from("user_roles")
          .insert({ user_id: parsed.data.userId, role: parsed.data.role, granted_by: actorId }));
  } else if (existing) {
    ({ error } = await service
      .from("user_roles")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", existing.id));
  }

  if (error) return { ok: false, error: "Yetki değiştirilemedi." };

  await auditLog(service, {
    actorId,
    action: parsed.data.grant ? "role.granted" : "role.revoked",
    entityType: "profile",
    entityId: parsed.data.userId,
    metadata: { role: parsed.data.role },
  });

  revalidatePath("/admin/kullanicilar");
  return {
    ok: true,
    message: `${ROLE_LABELS[parsed.data.role]} yetkisi ${parsed.data.grant ? "verildi" : "geri alındı"}.`,
  };
}

/**
 * Krediyi artırır ya da azaltır.
 *
 * grantCredits yalnızca ekleyebiliyordu; yanlışlıkla fazla verilen krediyi
 * geri almanın yolu yoktu. Bakiye eksiye düşürülmüyor.
 */
export async function adjustCredits(input: {
  userId: string;
  delta: number;
  reason?: string;
}) {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, status: 403, error: "Yetkisiz işlem." };

  const parsed = z
    .object({
      userId: z.string().uuid(),
      delta: z
        .number()
        .int()
        .min(-10000)
        .max(10000)
        .refine((v) => v !== 0, { message: "sıfır olamaz" }),
      reason: z.string().max(200).optional(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Geçersiz değer." };

  const service = createServiceClient();
  const { data, error } = await service.rpc("credit_adjust_balance", {
    p_user_id: parsed.data.userId,
    p_delta: parsed.data.delta,
    p_idempotency_key: `adm_${actorId}_${parsed.data.userId}_${parsed.data.delta}_${Date.now()}`,
    p_entry_type: parsed.data.delta > 0 ? "grant" : "adjustment",
    p_reason: parsed.data.reason ?? `admin:${actorId}`,
  });

  if (error) {
    if (error.message.includes("wallet_not_found")) {
      return { ok: false, error: "Bu hesabın kredi cüzdanı yok." };
    }
    if (error.message.includes("insufficient_balance")) {
      return { ok: false, error: "Bakiye sıfırın altına inemez." };
    }
    return { ok: false, error: "Kredi güncellenemedi." };
  }

  const newBalance = data as number;

  await auditLog(service, {
    actorId,
    action: "credits.adjusted",
    entityType: "profile",
    entityId: parsed.data.userId,
    metadata: { delta: parsed.data.delta, reason: parsed.data.reason ?? null },
  });

  revalidatePath("/admin/kullanicilar");
  return {
    ok: true,
    message: `Kredi ${parsed.data.delta > 0 ? "eklendi" : "düşüldü"}. Yeni bakiye: ${newBalance}.`,
  };
}

/**
 * PayTR üzerinden para iadesi yapar; yalnızca PayTR başarı dönerse DB'yi
 * refunded yapar ve abonelik/cüzdan tezgâhını söker.
 *
 * Cayma hakkı (m.15/1-ğ) zaten doğmaz — bu akış yalnızca hatalı/yetkisiz
 * tahsilat incelemeleri için admin tarafında kullanılır. Kullanıcıya
 * self-serve para iadesi açmaz.
 *
 * Aboneliği de kapatıyor. Eskiden kapatmıyordu ve şöyle bir açık kalıyordu:
 * Plus al, aylık hakkı bir günde yak, sonra iade iste. Para geri gider,
 * abonelik ve kalan hak yerinde kalırdı. Artık iade, satın alınan şeyi de
 * geri alıyor.
 */
/**
 * Admin iadesi: PayTR'ye iade ister, sonra deftere işler (kredi + abonelik).
 * amountKurus verilmezse kalan tutarın tamamı iade edilir.
 */
export async function markPaymentRefunded(
  paymentId: string,
  amountKurus?: number,
) {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const parsed = z
    .object({
      paymentId: z.string().uuid(),
      amountKurus: z.number().int().positive().max(10_000_000).optional(),
    })
    .safeParse({ paymentId, amountKurus });
  if (!parsed.success) return { ok: false, error: "Geçersiz kayıt veya tutar." };

  const service = createServiceClient();
  const preview = await previewPaymentRefund(
    service,
    parsed.data.paymentId,
    parsed.data.amountKurus,
  );
  if (!preview.ok) return preview;

  const loaded = await loadRefundContext(service, parsed.data.paymentId);
  if (!loaded.ok) return loaded;
  const ctx = loaded.context;

  if (ctx.payment.status !== "paid") {
    return { ok: false, error: "Yalnızca ödenmiş işlemler iade edilebilir." };
  }

  const refundKurus = preview.plan.refundKurus;
  if (!(refundKurus > 0) || refundKurus > ctx.paidKurus - ctx.alreadyRefundedKurus) {
    return { ok: false, error: "İade tutarı kalan iade edilebilir tutarı aşıyor." };
  }

  const providerRef = generateRefundProviderRef(
    `adm${parsed.data.paymentId.replace(/-/g, "").slice(0, 8)}`,
  );

  const lock = await insertPendingRefundLock(service, {
    paymentId: parsed.data.paymentId,
    refundKurus,
    providerRef,
    actorId,
    merchantOid: ctx.merchantOid,
  });
  if (!lock.ok) return lock;

  const paytr = await requestPaytrRefund({
    merchantOid: ctx.merchantOid,
    returnAmountTry: refundKurus / 100,
    referenceNo: providerRef,
  });

  if (!paytr.ok) {
    await markPendingRefundFailed(
      service,
      lock.refundId,
      paytr.errMsg ?? "PayTR iade reddedildi.",
    );
    return {
      ok: false,
      error: paytr.errMsg
        ? `PayTR iade başarısız: ${paytr.errMsg}`
        : "PayTR iade başarısız; defter değişmedi.",
    };
  }

  const applied = await applyPaymentRefund(service, {
    paymentId: parsed.data.paymentId,
    refundKurus,
    source: "admin",
    providerRef,
    actorId,
    pendingRefundId: lock.refundId,
  });

  if (!applied.ok) {
    return {
      ok: false,
      error: applied.error ?? "İade PayTR'de alındı ama defter tamamlanamadı.",
      partialFailure: applied.partialFailure,
      errorStep: applied.errorStep,
    };
  }

  return {
    ok: true,
    message:
      applied.message ??
      `PayTR iadesi alındı (${formatTry(refundKurus)}).`,
    reversed: applied.reversed,
    unrecovered: applied.unrecovered,
    isFull: applied.isFull,
    previewText: preview.previewText,
  };
}

/** PayTR panelinden zaten yapılmış iadeyi PayTR'yi tekrar çağırmadan deftere işler. */
export async function recordExternalRefund(input: {
  paymentId: string;
  amountKurus: number;
  providerRef?: string;
  note?: string;
}) {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const schema = z.object({
    paymentId: z.string().uuid(),
    amountKurus: z.number().int().positive().max(10_000_000),
    providerRef: z.string().min(1).max(64).optional(),
    note: z.string().max(500).optional(),
  });
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const service = createServiceClient();
  const loaded = await loadRefundContext(service, parsed.data.paymentId);
  if (!loaded.ok) return loaded;
  const ctx = loaded.context;

  // B5: tam iade edilmiş satırlarda yalnızca legacy kredi temizliği; UI gizler ama sunucu da korur.
  if (ctx.payment.status === "refunded" && !ctx.legacyRefundedCleanup) {
    return {
      ok: false,
      error: "Bu ödeme zaten iade edilmiş; yeni kayıt gerekmiyor.",
    };
  }

  const remaining = ctx.paidKurus - ctx.alreadyRefundedKurus;
  if (parsed.data.amountKurus > remaining && remaining > 0) {
    return {
      ok: false,
      error: `İade tutarı kalanı (${formatTry(remaining)}) aşıyor.`,
    };
  }

  const providerRef =
    parsed.data.providerRef?.trim() ||
    generateRefundProviderRef("ext");

  // Eşzamanlı "kaydet" çift yazımını pending kilit ile daralt.
  const lock = await insertPendingRefundLock(service, {
    paymentId: parsed.data.paymentId,
    refundKurus: parsed.data.amountKurus,
    providerRef,
    actorId,
    merchantOid: ctx.merchantOid,
  });
  if (!lock.ok) return lock;

  const applied = await applyPaymentRefund(service, {
    paymentId: parsed.data.paymentId,
    refundKurus: parsed.data.amountKurus,
    source: "admin",
    providerRef,
    actorId,
    pendingRefundId: lock.refundId,
    note: parsed.data.note ?? "PayTR panelinden yapıldı, admin kaydetti",
  });

  if (!applied.ok) {
    if (!applied.partialFailure) {
      await markPendingRefundFailed(
        service,
        lock.refundId,
        applied.error ?? "record_failed",
      );
    }
    return {
      ok: false,
      error: applied.error ?? "İade kaydedilemedi.",
      partialFailure: applied.partialFailure,
      errorStep: applied.errorStep,
    };
  }

  return {
    ok: true,
    message: applied.noop
      ? "Bu iade zaten kayıtlıydı."
      : applied.message ?? "İade deftere işlendi (PayTR çağrılmadı).",
    reversed: applied.reversed,
    unrecovered: applied.unrecovered,
    isFull: applied.isFull,
  };
}

/**
 * PayTR Durum Sorgu ile iadeleri çekip deftere işler.
 * B2/B3: satır satır uydurma ref YOK — PayTR toplamı − kayıtlı toplam = delta.
 */
export async function reconcilePaymentWithPaytr(paymentId: string) {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const parsed = z.string().uuid().safeParse(paymentId);
  if (!parsed.success) return { ok: false, error: "Geçersiz kayıt." };

  const service = createServiceClient();
  const loaded = await loadRefundContext(service, parsed.data);
  if (!loaded.ok) return loaded;
  const ctx = loaded.context;

  // B5: legacy refunded satırda mutabakat aboneliği bozmasın; kredi temizliği ayrı.
  if (ctx.payment.status === "refunded" && !ctx.legacyRefundedCleanup) {
    return {
      ok: true,
      message: "Ödeme zaten iade edilmiş; PayTR mutabakatı gerekmiyor.",
      appliedCount: 0,
      paytrTotalKurus: 0,
      alreadyRefundedKurus: ctx.alreadyRefundedKurus,
    };
  }

  const status = await queryPaytrStatus(ctx.merchantOid);
  if (!status.ok) {
    return {
      ok: false,
      error: status.errMsg ?? "PayTR durum sorgu başarısız.",
    };
  }

  const paytrTotalKurus = status.returns.reduce(
    (sum, row) => sum + Math.round(row.returnAmountTry * 100),
    0,
  );

  // Taze context (pending expiry sonrası)
  const fresh = await loadRefundContext(service, parsed.data);
  if (!fresh.ok) return fresh;
  const already = fresh.context.alreadyRefundedKurus;
  const delta = paytrTotalKurus - already;

  if (delta <= 0) {
    return {
      ok: true,
      message:
        paytrTotalKurus === 0
          ? "PayTR'de bu sipariş için iade kaydı yok."
          : `PayTR toplam iadesi (${formatTry(paytrTotalKurus)}) zaten kayıtlı (${formatTry(already)}).`,
      appliedCount: 0,
      paytrTotalKurus,
      alreadyRefundedKurus: already,
      deltaKurus: 0,
    };
  }

  const providerRef = reconcileDeltaRef(ctx.merchantOid, paytrTotalKurus);
  const applied = await applyPaymentRefund(service, {
    paymentId: parsed.data,
    refundKurus: delta,
    source: "reconcile",
    providerRef,
    actorId,
    note: `PayTR mutabakatı: toplam ${paytrTotalKurus} kuruş, delta ${delta}`,
  });

  if (!applied.ok) {
    return {
      ok: false,
      error: applied.error ?? "Mutabakat iadesi işlenemedi.",
      partialFailure: applied.partialFailure,
      errorStep: applied.errorStep,
      paytrTotalKurus,
      alreadyRefundedKurus: already,
      deltaKurus: delta,
    };
  }

  return {
    ok: true,
    message: applied.noop
      ? "PayTR iadeleri zaten kayıtlıydı; yeni işlem yok."
      : `PayTR'den ${formatTry(delta)} iade deftere işlendi (toplam ${formatTry(paytrTotalKurus)}).`,
    appliedCount: applied.noop ? 0 : 1,
    paytrTotalKurus,
    alreadyRefundedKurus: already,
    deltaKurus: delta,
    reversed: applied.reversed,
    unrecovered: applied.unrecovered,
  };
}

/** Admin önizleme — yazma yok. */
export async function previewAdminPaymentRefund(
  paymentId: string,
  amountKurus?: number,
) {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false as const, error: "Yetkisiz işlem." };

  const parsed = z.string().uuid().safeParse(paymentId);
  if (!parsed.success) return { ok: false as const, error: "Geçersiz kayıt." };

  const service = createServiceClient();
  return previewPaymentRefund(service, parsed.data, amountKurus);
}

/** Paketin fiyatını, kredi miktarını ve satışta olup olmadığını günceller. */
export async function updatePlan(input: {
  planId: string;
  priceTry: number;
  creditAmount: number;
  active: boolean;
}) {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const parsed = z
    .object({
      planId: z.string().uuid(),
      priceTry: z.number().int().min(0).max(1_000_000),
      creditAmount: z.number().int().min(0).max(1_000_000),
      active: z.boolean(),
    })
    .safeParse(input);
  if (!parsed.success) return { ok: false, error: "Geçersiz değer." };

  const service = createServiceClient();
  const { error } = await service
    .from("plans")
    .update({
      price_try: parsed.data.priceTry,
      credit_amount: parsed.data.creditAmount,
      active: parsed.data.active,
      updated_at: new Date().toISOString(),
    })
    .eq("id", parsed.data.planId);

  if (error) return { ok: false, error: "Paket güncellenemedi." };

  await auditLog(service, {
    actorId,
    action: "plan.updated",
    entityType: "plan",
    entityId: parsed.data.planId,
    metadata: {
      price_try: parsed.data.priceTry,
      credit_amount: parsed.data.creditAmount,
      active: parsed.data.active,
    },
  });

  revalidatePath("/admin/paketler");
  revalidatePath("/fiyatlandirma");
  return { ok: true, message: "Paket güncellendi." };
}

/** Yeni kampanya kodu oluşturur. */
export async function createPromoCode(input: {
  code: string;
  creditAmount: number;
  maxRedemptions?: number | null;
}) {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const parsed = z
    .object({
      // Kodlar elle yazılıyor: karışıklık olmasın diye tek biçim.
      code: z
        .string()
        .trim()
        .min(3)
        .max(32)
        .regex(/^[A-Za-z0-9-]+$/),
      creditAmount: z.number().int().min(1).max(100000),
      maxRedemptions: z.number().int().min(1).max(1_000_000).nullable().optional(),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Kod yalnızca harf, rakam ve tire içerebilir." };
  }

  const service = createServiceClient();
  const { error } = await service.from("promo_codes").insert({
    code: parsed.data.code.toUpperCase(),
    credit_amount: parsed.data.creditAmount,
    max_redemptions: parsed.data.maxRedemptions ?? null,
  });

  if (error) {
    return {
      ok: false,
      error: error.code === "23505" ? "Bu kod zaten var." : "Kod oluşturulamadı.",
    };
  }

  await auditLog(service, {
    actorId,
    action: "promo.created",
    entityType: "promo_code",
    entityId: parsed.data.code.toUpperCase(),
    metadata: { credit_amount: parsed.data.creditAmount },
  });

  revalidatePath("/admin/promosyonlar");
  return { ok: true, message: `${parsed.data.code.toUpperCase()} oluşturuldu.` };
}

/** Kampanya kodunu açar ya da kapatır. */
export async function togglePromoCode(promoId: string, active: boolean) {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const parsed = z.string().uuid().safeParse(promoId);
  if (!parsed.success) return { ok: false, error: "Geçersiz kayıt." };

  const service = createServiceClient();
  const { error } = await service
    .from("promo_codes")
    .update({ active })
    .eq("id", parsed.data);

  if (error) return { ok: false, error: "Güncellenemedi." };

  await auditLog(service, {
    actorId,
    action: active ? "promo.enabled" : "promo.disabled",
    entityType: "promo_code",
    entityId: parsed.data,
    metadata: { active },
  });

  revalidatePath("/admin/promosyonlar");
  return { ok: true, message: active ? "Kod açıldı." : "Kod kapatıldı." };
}

/** Bir AI talimatının yayındaki sürümünü değiştirir. */
export async function activatePromptVersion(promptId: string) {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const parsed = z.string().uuid().safeParse(promptId);
  if (!parsed.success) return { ok: false, error: "Geçersiz kayıt." };

  const service = createServiceClient();
  const { data: target } = await service
    .from("prompt_versions")
    .select("id, key, version")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!target) return { ok: false, error: "Sürüm bulunamadı." };

  // Aynı anahtarda tek bir sürüm yayında olabilir.
  await service.from("prompt_versions").update({ active: false }).eq("key", target.key);

  const { error } = await service
    .from("prompt_versions")
    .update({ active: true })
    .eq("id", target.id);

  if (error) return { ok: false, error: "Sürüm etkinleştirilemedi." };

  await auditLog(service, {
    actorId,
    action: "prompt.activated",
    entityType: "prompt_version",
    entityId: target.id,
    metadata: { key: target.key, version: target.version },
  });

  revalidatePath("/admin/promptlar");
  return { ok: true, message: `${target.key} v${target.version} yayına alındı.` };
}

/**
 * Ana ekran duyuru bandı.
 *
 * Bant ücretsiz kullanıcıya görünüyor ve bitiş tarihi geçince kendiliğinden
 * kayboluyor. Tarihi buradan giriyoruz; kod içinde sabit bir süre yok ve
 * sayaç kendi kendine yenilenmiyor.
 */
export async function savePromoCampaign(input: {
  title: string;
  description: string;
  href: string;
  endsAt: string;
}) {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const parsed = z
    .object({
      title: z.string().trim().min(3).max(60),
      description: z.string().trim().min(5).max(160),
      href: z.string().trim().startsWith("/").max(200),
      endsAt: z.string().min(1),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Başlık, metin ve bağlantı doldurulmalı." };
  }

  const endsAt = new Date(parsed.data.endsAt);
  if (Number.isNaN(endsAt.getTime())) {
    return { ok: false, error: "Bitiş tarihi okunamadı." };
  }
  if (endsAt.getTime() <= Date.now()) {
    return { ok: false, error: "Bitiş tarihi gelecekte olmalı." };
  }

  const service = createServiceClient();

  // Aynı anda tek bant gösteriliyor; yenisini açarken eskisini kapatıyoruz ki
  // hangisinin yayında olduğu belirsiz kalmasın.
  await service
    .from("promo_campaigns")
    .update({ active: false })
    .eq("active", true);

  const { error } = await service.from("promo_campaigns").insert({
    title: parsed.data.title,
    description: parsed.data.description,
    href: parsed.data.href,
    ends_at: endsAt.toISOString(),
  });

  if (error) return { ok: false, error: "Kampanya kaydedilemedi." };

  await auditLog(service, {
    actorId,
    action: "campaign.started",
    entityType: "promo_campaign",
    entityId: parsed.data.title,
    metadata: { ends_at: endsAt.toISOString() },
  });

  revalidatePath("/admin/promosyonlar");
  revalidatePath("/ogretmen");
  return { ok: true, message: "Bant yayına alındı." };
}

/** Yayındaki bandı hemen kaldırır. */
export async function endPromoCampaign() {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const service = createServiceClient();
  const { error } = await service
    .from("promo_campaigns")
    .update({ active: false })
    .eq("active", true);

  if (error) return { ok: false, error: "Kaldırılamadı." };

  await auditLog(service, {
    actorId,
    action: "campaign.ended",
    entityType: "promo_campaign",
    entityId: "active",
    metadata: {},
  });

  revalidatePath("/admin/promosyonlar");
  revalidatePath("/ogretmen");
  return { ok: true, message: "Bant kaldırıldı." };
}

/**
 * Yeni talimat sürümü kaydeder ve yayına alır.
 *
 * Sayfada bir sürüm oluşturmanın hiçbir yolu yoktu: tablo boştu, ekranda
 * yalnızca "kayıtlı talimat yok" yazıyordu ve düğme de yoktu. Yani panel
 * kendi vaadini yerine getiremiyordu.
 *
 * Sürüm numarası elle verilmiyor; aynı anahtarın en büyüğünün bir fazlası
 * alınıyor. Eski sürümler duruyor, geri dönmek için listeden yayına
 * alınabiliyor.
 */
export async function savePromptVersion(input: { key: string; content: string }) {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const parsed = z
    .object({
      key: z.string().min(2).max(64).regex(/^[a-z0-9_]+$/),
      content: z.string().trim().min(20).max(4000),
    })
    .safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: "Talimat en az 20 karakter olmalı." };
  }

  const service = createServiceClient();

  const { data: latest } = await service
    .from("prompt_versions")
    .select("version")
    .eq("key", parsed.data.key)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();

  const nextVersion = Number(latest?.version ?? 0) + 1;

  await service
    .from("prompt_versions")
    .update({ active: false })
    .eq("key", parsed.data.key);

  const { data: created, error } = await service
    .from("prompt_versions")
    .insert({
      key: parsed.data.key,
      version: nextVersion,
      content: parsed.data.content,
      active: true,
    })
    .select("id")
    .single();

  if (error || !created) return { ok: false, error: "Kaydedilemedi." };

  await auditLog(service, {
    actorId,
    action: "prompt.saved",
    entityType: "prompt_version",
    entityId: created.id,
    metadata: { key: parsed.data.key, version: nextVersion },
  });

  revalidatePath("/admin/promptlar");
  return { ok: true, message: `v${nextVersion} yayına alındı.` };
}
