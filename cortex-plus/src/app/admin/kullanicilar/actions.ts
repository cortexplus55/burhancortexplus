"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createServiceClient } from "@/lib/supabase/server";
import { checkFounderActor, currentAdminActor } from "@/lib/auth/admin-actor";
import { activeRolesOf } from "@/lib/admin/admin-team";
import { auditLog } from "@/lib/audit";
import {
  adjustStars,
  cancelActiveSubscription,
  confirmEmailByAdmin,
  deleteDocumentsForUser,
  deletePrepsForUser,
  grantPlanPeriod,
  resetDeviceSessions,
} from "@/lib/admin/user-manage";
import {
  DELETE_BATCH_MAX,
  DELETE_CONFIRM_WORD,
  GRANT_DAYS_MAX,
  GRANT_DAYS_MIN,
  STAR_ADJUST_MAX,
  deleteConfirmationMatches,
  targetAccountProblem,
  type ActorRole,
} from "@/lib/admin/user-manage-copy";

/*
  Kullanıcı yönetiminin sunucu eylemleri (6 Kasım 2026).

  Paket, yıldız, e-posta onayı ve cihaz sıfırlama: yönetici ya da kurucu (`currentAdminActor`). Yönetici bir
  yöneticinin ya da kurucunun hesabında değişiklik yapamaz. Hazırlık ve belge silme: YALNIZ kurucu
  (`checkFounderActor`, PIN kapısı dahil) ve "SİL" onayı; sahiplik sunucuda yeniden okunur. Her eylem denetim
  kaydına yazılır. Ücret ya da ödeme kaydı yazılmaz. Hediye kredi `adjustCredits` (`../actions.ts`) ile.
*/

export type ActionResult = { ok: true; message: string } | { ok: false; error: string };

const UNAUTHORIZED = "Yetkisiz işlem.";
const INVALID = "Geçersiz istek.";

type Actor = { userId: string; role: ActorRole };

async function guardTarget(
  service: ReturnType<typeof createServiceClient>,
  actor: Actor,
  targetId: string,
  destructive = false,
): Promise<string | null> {
  const roles = await activeRolesOf(service, targetId);
  if (!roles) return "Hesabın yetkisi okunamadı; tekrar deneyin.";
  return targetAccountProblem({ actorId: actor.userId, actorRole: actor.role, targetId, targetRoles: roles, destructive });
}

function refresh(userId: string) {
  revalidatePath(`/admin/kullanicilar/${userId}`);
  revalidatePath("/admin/kullanicilar");
}

const grantSchema = z.object({
  userId: z.string().uuid(),
  planId: z.string().uuid(),
  days: z.number().int().min(GRANT_DAYS_MIN).max(GRANT_DAYS_MAX),
});

/** Plus / Sınav Haftası / Sigma'yı N gün tanımlar; süren dönem varsa sonuna ekler. */
export async function grantUserPlan(input: { userId: string; planId: string; days: number }): Promise<ActionResult> {
  const actor = await currentAdminActor();
  if (!actor) return { ok: false, error: UNAUTHORIZED };
  const parsed = grantSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Gün ${GRANT_DAYS_MIN} ile ${GRANT_DAYS_MAX} arasında olmalı.` };
  const service = createServiceClient();
  const problem = await guardTarget(service, actor, parsed.data.userId);
  if (problem) return { ok: false, error: problem };

  const result = await grantPlanPeriod(service, parsed.data);
  if (!result.ok) return result;
  await auditLog(service, {
    actorId: actor.userId,
    action: "subscription.granted",
    entityType: "user",
    entityId: parsed.data.userId,
    metadata: {
      planId: parsed.data.planId,
      plan: result.planLabel,
      days: parsed.data.days,
      before: result.before,
      after: result.after,
      extended: result.extended,
      paid: false,
    },
  });
  refresh(parsed.data.userId);
  const until = new Date(result.after).toLocaleDateString("tr-TR", { timeZone: "Europe/Istanbul" });
  return {
    ok: true,
    message: result.extended
      ? `${result.planLabel} ${parsed.data.days} gün uzatıldı · bitiş ${until}.`
      : `${result.planLabel} ${parsed.data.days} gün tanımlandı · bitiş ${until}.`,
  };
}

/** Süren aboneliği hemen bitirir; hesap ücretsize döner. */
export async function cancelUserPlan(input: { userId: string }): Promise<ActionResult> {
  const actor = await currentAdminActor();
  if (!actor) return { ok: false, error: UNAUTHORIZED };
  const parsed = z.object({ userId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID };
  const service = createServiceClient();
  const problem = await guardTarget(service, actor, parsed.data.userId);
  if (problem) return { ok: false, error: problem };

  const result = await cancelActiveSubscription(service, { userId: parsed.data.userId });
  if (!result.ok) return result;
  await auditLog(service, {
    actorId: actor.userId,
    action: "subscription.cancelled",
    entityType: "user",
    entityId: parsed.data.userId,
    metadata: { subscriptionId: result.subscriptionId, before: result.before },
  });
  refresh(parsed.data.userId);
  return { ok: true, message: "Abonelik iptal edildi; hesap ücretsiz kullanıma döndü." };
}

const starsSchema = z.object({
  userId: z.string().uuid(),
  delta: z
    .number()
    .int()
    .min(-STAR_ADJUST_MAX)
    .max(STAR_ADJUST_MAX)
    .refine((value) => value !== 0),
  reason: z.string().trim().max(200).optional(),
});

/** Yıldız ekler (artı) ya da düşer (eksi). */
export async function adjustUserStars(input: { userId: string; delta: number; reason?: string }): Promise<ActionResult> {
  const actor = await currentAdminActor();
  if (!actor) return { ok: false, error: UNAUTHORIZED };
  const parsed = starsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `Yıldız -${STAR_ADJUST_MAX} ile ${STAR_ADJUST_MAX} arasında, sıfırdan farklı olmalı.` };
  const service = createServiceClient();
  const problem = await guardTarget(service, actor, parsed.data.userId);
  if (problem) return { ok: false, error: problem };

  const result = await adjustStars(service, {
    userId: parsed.data.userId,
    delta: parsed.data.delta,
    ref: `admin:${actor.userId}:${Date.now()}`,
  });
  if (!result.ok) return result;
  await auditLog(service, {
    actorId: actor.userId,
    action: "stars.adjusted",
    entityType: "user",
    entityId: parsed.data.userId,
    metadata: { delta: parsed.data.delta, total: result.total, reason: parsed.data.reason || null },
  });
  refresh(parsed.data.userId);
  return {
    ok: true,
    message: `${Math.abs(parsed.data.delta)} yıldız ${parsed.data.delta > 0 ? "eklendi" : "düşüldü"}. Toplam: ${result.total}.`,
  };
}

/** E-postayı onaylı işaretler. Davet hediyesi kuraldaki gibi öğrencinin bir sonraki çalışmasında açılır. */
export async function confirmUserEmail(input: { userId: string }): Promise<ActionResult> {
  const actor = await currentAdminActor();
  if (!actor) return { ok: false, error: UNAUTHORIZED };
  const parsed = z.object({ userId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID };
  const service = createServiceClient();
  const problem = await guardTarget(service, actor, parsed.data.userId);
  if (problem) return { ok: false, error: problem };

  const result = await confirmEmailByAdmin(service, parsed.data.userId);
  if (!result.ok) return result;
  if (!result.changed) return { ok: true, message: "E-posta zaten onaylı." };
  await auditLog(service, {
    actorId: actor.userId,
    action: "email.confirmed_by_admin",
    entityType: "user",
    entityId: parsed.data.userId,
    metadata: {},
  });
  refresh(parsed.data.userId);
  return {
    ok: true,
    message: "E-posta onaylı işaretlendi. Davet hediyesi varsa öğrencinin bir sonraki çalışmasında açılır.",
  };
}

/** Bütün cihazlardan çıkış; öğrenci yeniden giriş yapar. */
export async function resetUserDevices(input: { userId: string }): Promise<ActionResult> {
  const actor = await currentAdminActor();
  if (!actor) return { ok: false, error: UNAUTHORIZED };
  const parsed = z.object({ userId: z.string().uuid() }).safeParse(input);
  if (!parsed.success) return { ok: false, error: INVALID };
  const service = createServiceClient();
  const problem = await guardTarget(service, actor, parsed.data.userId);
  if (problem) return { ok: false, error: problem };

  const result = await resetDeviceSessions(service, parsed.data.userId);
  if (!result.ok) return result;
  await auditLog(service, {
    actorId: actor.userId,
    action: "devices.reset",
    entityType: "user",
    entityId: parsed.data.userId,
    metadata: { revoked: result.revoked, authSessions: result.authSessions, viaFunction: result.viaFunction },
  });
  refresh(parsed.data.userId);
  return {
    ok: true,
    message: result.viaFunction
      ? `${result.revoked} cihaz kaydı düşürüldü; hesap bütün cihazlardan çıkarıldı.`
      : `${result.revoked} cihaz kaydı düşürüldü; o cihazlar en geç 5 dakika içinde çıkış yapar.`,
  };
}

const deleteSchema = z.object({
  userId: z.string().uuid(),
  ids: z.array(z.string().uuid()).min(1).max(DELETE_BATCH_MAX),
  confirm: z.string().max(40),
});

async function deletionGuard(
  input: { userId: string; ids: string[]; confirm: string },
): Promise<{ ok: true; actorId: string; data: z.infer<typeof deleteSchema> } | { ok: false; error: string }> {
  const founder = await checkFounderActor();
  if (!founder.ok) return founder;
  const parsed = deleteSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: `En az bir, en çok ${DELETE_BATCH_MAX} kayıt seçin.` };
  if (!deleteConfirmationMatches(parsed.data.confirm)) {
    return { ok: false, error: `Onay için kutuya "${DELETE_CONFIRM_WORD}" yazın.` };
  }
  return { ok: true, actorId: founder.userId, data: parsed.data };
}

function deletionMessage(kind: "hazırlık" | "belge", report: { deleted: string[]; failed: string[]; pending?: string[] }) {
  const parts = [`${report.deleted.length} ${kind} kalıcı olarak silindi.`];
  if (report.pending?.length) parts.push(`${report.pending.length} belgenin dosya temizliği arka planda tamamlanacak.`);
  if (report.failed.length) parts.push(`Silinemeyen: ${report.failed.join(", ")}.`);
  return parts.join(" ");
}

/** Seçilen hazırlıkları kalıcı siler (yalnız kurucu, "SİL" onayıyla). */
export async function deleteUserPreps(input: { userId: string; ids: string[]; confirm: string }): Promise<ActionResult> {
  const guard = await deletionGuard(input);
  if (!guard.ok) return guard;
  const service = createServiceClient();
  const problem = await guardTarget(service, { userId: guard.actorId, role: "founder" }, guard.data.userId, true);
  if (problem) return { ok: false, error: problem };

  const result = await deletePrepsForUser(service, { userId: guard.data.userId, prepIds: guard.data.ids });
  if (!result.ok) return result;
  await auditLog(service, {
    actorId: guard.actorId,
    action: "exam_preps.deleted_by_founder",
    entityType: "user",
    entityId: guard.data.userId,
    metadata: { titles: result.deleted, failed: result.failed, prepIds: guard.data.ids },
  });
  refresh(guard.data.userId);
  if (!result.deleted.length) return { ok: false, error: deletionMessage("hazırlık", result) };
  return { ok: true, message: deletionMessage("hazırlık", result) };
}

/** Seçilen belgeleri kalıcı siler: dosya, parça kopyaları ve gömmeler dahil (yalnız kurucu, "SİL" onayıyla). */
export async function deleteUserDocuments(input: {
  userId: string;
  ids: string[];
  confirm: string;
}): Promise<ActionResult> {
  const guard = await deletionGuard(input);
  if (!guard.ok) return guard;
  const service = createServiceClient();
  const problem = await guardTarget(service, { userId: guard.actorId, role: "founder" }, guard.data.userId, true);
  if (problem) return { ok: false, error: problem };

  const result = await deleteDocumentsForUser(service, { userId: guard.data.userId, documentIds: guard.data.ids });
  if (!result.ok) return result;
  await auditLog(service, {
    actorId: guard.actorId,
    action: "documents.deleted_by_founder",
    entityType: "user",
    entityId: guard.data.userId,
    metadata: { names: result.deleted, failed: result.failed, pending: result.pending, documentIds: guard.data.ids },
  });
  refresh(guard.data.userId);
  if (!result.deleted.length) return { ok: false, error: deletionMessage("belge", result) };
  return { ok: true, message: deletionMessage("belge", result) };
}
