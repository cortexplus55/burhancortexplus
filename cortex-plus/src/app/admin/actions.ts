"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient, createServiceClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit";

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
