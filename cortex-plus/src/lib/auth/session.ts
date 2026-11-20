import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getSessionUserContext } from "@/lib/auth/session-context";
import { redirect } from "next/navigation";
import { homePathForRole } from "@/lib/parity/signup";
import { accountActiveOrUnknown } from "@/lib/auth/active-account";
import { requireAdminPage } from "@/lib/auth/admin-guard";

/**
 * İsteğin oturum kullanıcısı (Faz 2, madde 2.1): `React.cache` ile aynı istekte Auth'a bir kez gidilir; kabuk,
 * sayfa ve alt bileşenler aynı sonucu paylaşır.
 */
export const getRequestUser = cache(async () => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
});

export async function requireUser() {
  const { supabase, user } = await getRequestUser();
  if (!user) redirect("/giris");
  // Durum iki okumada da gelmezse sayfa 500 vermez, geçer (29 Ekim 2026); askı (`false`) aynen girişe.
  // Faz 2: durum, profil ve plan tek bağlam okumasından gelir (istek içinde bir kez, 45 sn paylaşımlı önbellek;
  // yalnız etkin hesap önbelleğe girer, askı ve silinme önbelleği temizler).
  const context = await getSessionUserContext(user.id, { client: supabase }).catch(() => null);
  const active = context ? context.active : await accountActiveOrUnknown(supabase);
  if (active === false) redirect("/giris");
  if (active === null) console.warn("account_status_unavailable", { where: "requireUser" });
  return { supabase, user };
}

export async function getUserRoles(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", userId)
    .is("revoked_at", null);
  return (data ?? []).map((r) => r.role as string);
}

export async function getPrimaryRole(userId: string) {
  const context = await getSessionUserContext(userId).catch(() => null);
  if (context?.profile?.primary_role) return context.profile.primary_role;
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("primary_role")
    .eq("id", userId)
    .maybeSingle();
  return (data?.primary_role as string | undefined) ?? "student";
}

/**
 * @deprecated Yönetim sayfaları `requireAdminPage()` / `requireFounderPage()` (`@/lib/auth/admin-guard`) kullanır.
 * Eski çağıranlar için aynı koruma: yönetici değilse 404 (6 Kasım 2026'dan beri yönlendirme değil).
 */
export async function requireAdmin() {
  const { supabase, user } = await requireAdminPage();
  return { supabase, user };
}

export async function requireParent(): Promise<never> {
  const { user } = await requireUser();
  redirect(homePathForRole(await getPrimaryRole(user.id)));
}

/** @deprecated Okul öğretmeni paneli kaldırıldı. */
export async function requireTeacher(): Promise<never> {
  const { user } = await requireUser();
  redirect(homePathForRole(await getPrimaryRole(user.id)));
}

/** Öğrenci uygulaması (tek ürün yüzeyi). */
export async function requireStudentArea() {
  return requireUser();
}
