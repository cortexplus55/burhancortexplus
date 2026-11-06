"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { checkFounderActor } from "@/lib/auth/admin-actor";
import {
  ADMIN_EMAIL_NOT_FOUND,
  activeRolesOf,
  adminTeamChangeProblem,
  findUserIdByEmail,
  grantAdminRow,
  normalizeAdminEmail,
  revokeAdminRow,
} from "@/lib/admin/admin-team";
import { auditLog } from "@/lib/audit";
import { createServiceClient } from "@/lib/supabase/server";

export type AdminTeamResult = { ok: true; message: string } | { ok: false; error: string };

const emailSchema = z.string().trim().email().max(254);

/** Var olan bir hesaba `admin` rolü verir (yalnız kurucu). Yeni hesap açmaz. */
export async function grantAdminByEmail(rawEmail: string): Promise<AdminTeamResult> {
  const founder = await checkFounderActor();
  if (!founder.ok) return { ok: false, error: founder.error };

  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) return { ok: false, error: "Geçerli bir e-posta adresi yaz." };
  const email = normalizeAdminEmail(parsed.data);

  const service = createServiceClient();
  const userId = await findUserIdByEmail(service, email);
  if (!userId) return { ok: false, error: ADMIN_EMAIL_NOT_FOUND };

  const roles = await activeRolesOf(service, userId);
  if (!roles) return { ok: false, error: "Yetki okunamadı." };
  const problem = adminTeamChangeProblem({ op: "grant", actorId: founder.userId, targetId: userId, targetRoles: roles });
  if (problem) return { ok: false, error: problem };

  if (!(await grantAdminRow(service, { userId, actorId: founder.userId }))) {
    return { ok: false, error: "Yetki verilemedi." };
  }

  await auditLog(service, {
    actorId: founder.userId,
    action: "admin_role.granted",
    entityType: "profile",
    entityId: userId,
    metadata: { role: "admin", via: "yoneticiler" },
  });

  revalidatePath("/admin/yoneticiler");
  return { ok: true, message: `${email} artık yönetici.` };
}

/** `admin` rolünü geri alır (`revoked_at` dolar, satır silinmez). Kurucu kendini ya da başka kurucuyu çıkaramaz. */
export async function revokeAdminRole(userId: string): Promise<AdminTeamResult> {
  const founder = await checkFounderActor();
  if (!founder.ok) return { ok: false, error: founder.error };

  const parsed = z.string().uuid().safeParse(userId);
  if (!parsed.success) return { ok: false, error: "Geçersiz istek." };

  const service = createServiceClient();
  const roles = await activeRolesOf(service, parsed.data);
  if (!roles) return { ok: false, error: "Yetki okunamadı." };
  const problem = adminTeamChangeProblem({ op: "revoke", actorId: founder.userId, targetId: parsed.data, targetRoles: roles });
  if (problem) return { ok: false, error: problem };

  if (!(await revokeAdminRow(service, parsed.data))) return { ok: false, error: "Yetki geri alınamadı." };

  await auditLog(service, {
    actorId: founder.userId,
    action: "admin_role.revoked",
    entityType: "profile",
    entityId: parsed.data,
    metadata: { role: "admin", via: "yoneticiler" },
  });

  revalidatePath("/admin/yoneticiler");
  return { ok: true, message: "Yönetici yetkisi geri alındı." };
}
