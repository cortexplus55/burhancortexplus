"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit";
import { verifySmtpConnection } from "@/lib/email/smtp";

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
  const { data: wallet } = await service
    .from("credit_wallets")
    .select("balance")
    .eq("user_id", parsed.data.userId)
    .maybeSingle();

  if (!wallet) return { ok: false, error: "Cüzdan bulunamadı." };

  const newBalance = wallet.balance + parsed.data.amount;
  await service
    .from("credit_wallets")
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq("user_id", parsed.data.userId);

  await service.from("credit_ledger").insert({
    user_id: parsed.data.userId,
    delta: parsed.data.amount,
    balance_after: newBalance,
    entry_type: "grant",
    idempotency_key: `grant_${actorId}_${Date.now()}`,
    metadata: { granted_by: actorId },
  });

  await auditLog(service, {
    actorId,
    action: "credits.granted",
    entityType: "profile",
    entityId: parsed.data.userId,
    metadata: { amount: parsed.data.amount },
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
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

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
  const { data: wallet } = await service
    .from("credit_wallets")
    .select("balance")
    .eq("user_id", parsed.data.userId)
    .maybeSingle();

  if (!wallet) return { ok: false, error: "Bu hesabın kredi cüzdanı yok." };

  const newBalance = wallet.balance + parsed.data.delta;
  if (newBalance < 0) {
    return {
      ok: false,
      error: `Bakiye eksiye düşemez. Mevcut kredi: ${wallet.balance}.`,
    };
  }

  const { error } = await service
    .from("credit_wallets")
    .update({ balance: newBalance, updated_at: new Date().toISOString() })
    .eq("user_id", parsed.data.userId);

  if (error) return { ok: false, error: "Kredi güncellenemedi." };

  await service.from("credit_ledger").insert({
    user_id: parsed.data.userId,
    delta: parsed.data.delta,
    balance_after: newBalance,
    entry_type: parsed.data.delta > 0 ? "grant" : "adjustment",
    idempotency_key: `adm_${actorId}_${Date.now()}`,
    metadata: { by: actorId, reason: parsed.data.reason ?? null },
  });

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
 * Ödemeyi iade edildi olarak işaretler.
 *
 * Parayı geri göndermez — o işlem ödeme sağlayıcısının panelinden yapılır.
 * Buradaki kayıt yalnızca bizim tarafımızdaki durumu düzeltir, gelir tablosu
 * şişik kalmasın.
 */
export async function markPaymentRefunded(paymentId: string) {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };

  const parsed = z.string().uuid().safeParse(paymentId);
  if (!parsed.success) return { ok: false, error: "Geçersiz kayıt." };

  const service = createServiceClient();
  const { data: payment } = await service
    .from("payments")
    .select("id, status")
    .eq("id", parsed.data)
    .maybeSingle();

  if (!payment) return { ok: false, error: "Ödeme bulunamadı." };
  if (payment.status !== "paid") {
    return { ok: false, error: "Yalnızca ödenmiş işlemler iade edilebilir." };
  }

  const { error } = await service
    .from("payments")
    .update({ status: "refunded", updated_at: new Date().toISOString() })
    .eq("id", parsed.data);

  if (error) return { ok: false, error: "Güncellenemedi." };

  await auditLog(service, {
    actorId,
    action: "payment.refunded",
    entityType: "payment",
    entityId: parsed.data,
    metadata: {},
  });

  revalidatePath("/admin/odemeler");
  revalidatePath("/admin");
  return { ok: true, message: "İade edildi olarak işaretlendi." };
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
