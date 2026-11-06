import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingFunctionError } from "@/lib/auth/admin-role";

/*
  Yönetici ekibi (6 Kasım 2026): kurucu e-postayla var olan bir hesaba `admin` rolü verir, tek tıkla geri
  alır. Satır silinmez (`revoked_at` dolar), yeni hesap açılmaz. Kurucu kendini ya da başka bir kurucuyu
  çıkaramaz. `/admin/yoneticiler` ve Kullanıcılar sayfasındaki "Yönetici yap" düğmesi aynı kuralları okur.
*/

export type AdminTeamOp = "grant" | "revoke";

export const ADMIN_EMAIL_NOT_FOUND = "Bu e-postayla kayıtlı bir hesap bulunamadı. Kişi önce Cortex Plus'a kayıt olmalı.";

/** Değişiklik yapılamıyorsa öğrenciye/kurucuya gösterilecek Türkçe neden; yapılabiliyorsa null. */
export function adminTeamChangeProblem(input: {
  op: AdminTeamOp;
  actorId: string;
  targetId: string;
  targetRoles: readonly string[];
}): string | null {
  const isFounder = input.targetRoles.includes("founder");
  const isAdmin = isFounder || input.targetRoles.includes("admin");
  if (input.op === "revoke") {
    if (input.targetId === input.actorId) return "Kendi yöneticiliğini geri alamazsın; panele giriş kapanır.";
    if (isFounder) return "Kurucunun yetkisi buradan geri alınamaz.";
    if (!isAdmin) return "Bu hesap zaten yönetici değil.";
    return null;
  }
  if (isAdmin) return "Bu hesap zaten yönetici.";
  return null;
}

export async function activeRolesOf(service: SupabaseClient, userId: string): Promise<string[] | null> {
  const { data, error } = await service
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .is("revoked_at", null);
  if (error) return null;
  return (data ?? []).map((row) => String(row.role));
}

export function normalizeAdminEmail(raw: string): string {
  return raw.trim().toLowerCase();
}

/**
 * E-postadan hesap kimliği. Önce SQL `admin_user_id_by_email` (göç 20261106150000); göç yoksa Auth
 * yönetici API'siyle sayfa sayfa tarar (en çok 20 × 1.000 hesap). Bulunamazsa null.
 */
export async function findUserIdByEmail(service: SupabaseClient, rawEmail: string): Promise<string | null> {
  const email = normalizeAdminEmail(rawEmail);
  if (!email) return null;
  const { data, error } = await service.rpc("admin_user_id_by_email", { p_email: email });
  if (!error) return typeof data === "string" && data ? data : null;
  if (!isMissingFunctionError(error)) {
    console.warn("admin_user_id_by_email_failed", { code: (error as { code?: string }).code ?? "rpc_error" });
  }
  for (let page = 1; page <= 20; page += 1) {
    const { data: list, error: listError } = await service.auth.admin.listUsers({ page, perPage: 1000 });
    if (listError) return null;
    const users = list?.users ?? [];
    const hit = users.find((user) => (user.email ?? "").toLowerCase() === email);
    if (hit) return hit.id;
    if (users.length < 1000) break;
  }
  return null;
}

/** `admin` satırı: varsa iptali kaldırılır (UNIQUE (user_id, role)), yoksa eklenir. */
export async function grantAdminRow(service: SupabaseClient, input: { userId: string; actorId: string }): Promise<boolean> {
  const { data: existing } = await service
    .from("user_roles")
    .select("id")
    .eq("user_id", input.userId)
    .eq("role", "admin")
    .maybeSingle();
  const { error } = existing
    ? await service
        .from("user_roles")
        .update({ revoked_at: null, granted_by: input.actorId, granted_at: new Date().toISOString() })
        .eq("id", existing.id)
    : await service.from("user_roles").insert({ user_id: input.userId, role: "admin", granted_by: input.actorId });
  return !error;
}

/** `admin` satırını iptal eder; satır silinmez. */
export async function revokeAdminRow(service: SupabaseClient, userId: string): Promise<boolean> {
  const { error } = await service
    .from("user_roles")
    .update({ revoked_at: new Date().toISOString() })
    .eq("user_id", userId)
    .eq("role", "admin")
    .is("revoked_at", null);
  return !error;
}

export type AdminTeamMember = {
  userId: string;
  role: "founder" | "admin";
  name: string;
  email: string;
  grantedAt: string;
  grantedBy: string | null;
};

/** Etkin yöneticiler (kurucu önce, sonra veriliş tarihine göre). Bir kişinin iki satırı tek satır olur. */
export function mergeTeamRows(
  rows: ReadonlyArray<{ user_id: string; role: string; granted_at: string; granted_by: string | null }>,
): Array<{ userId: string; role: "founder" | "admin"; grantedAt: string; grantedBy: string | null }> {
  const byUser = new Map<string, { userId: string; role: "founder" | "admin"; grantedAt: string; grantedBy: string | null }>();
  for (const row of rows) {
    if (row.role !== "admin" && row.role !== "founder") continue;
    const prev = byUser.get(row.user_id);
    if (!prev) {
      byUser.set(row.user_id, { userId: row.user_id, role: row.role, grantedAt: row.granted_at, grantedBy: row.granted_by });
      continue;
    }
    if (row.role === "founder") prev.role = "founder";
    if (row.granted_at < prev.grantedAt) {
      prev.grantedAt = row.granted_at;
      prev.grantedBy = row.granted_by;
    }
  }
  return [...byUser.values()].sort((a, b) =>
    a.role === b.role ? a.grantedAt.localeCompare(b.grantedAt) : a.role === "founder" ? -1 : 1,
  );
}
