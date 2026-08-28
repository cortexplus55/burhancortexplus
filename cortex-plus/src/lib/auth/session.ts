import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { homePathForRole } from "@/lib/parity/signup";

export async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect("/giris");
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
  const supabase = await createClient();
  const { data } = await supabase
    .from("profiles")
    .select("primary_role")
    .eq("id", userId)
    .maybeSingle();
  return (data?.primary_role as string | undefined) ?? "student";
}

export async function requireAdmin() {
  const { supabase, user } = await requireUser();
  const roles = await getUserRoles(user.id);
  if (!roles.includes("admin")) redirect("/dashboard");
  return { supabase, user };
}

export async function requireTeacher() {
  const { supabase, user } = await requireUser();
  const roles = await getUserRoles(user.id);
  const allowed =
    roles.includes("teacher") ||
    roles.includes("verified_teacher") ||
    roles.includes("admin");
  if (!allowed) {
    redirect(homePathForRole(await getPrimaryRole(user.id)));
  }
  return { supabase, user, roles };
}

/** Veli alanı: yalnızca parent (veya admin) girebilir. */
export async function requireParent() {
  const { supabase, user } = await requireUser();
  const roles = await getUserRoles(user.id);
  if (!roles.includes("parent") && !roles.includes("admin")) {
    redirect(homePathForRole(await getPrimaryRole(user.id)));
  }
  return { supabase, user };
}

/** Öğrenci uygulaması: veli ve okul öğretmeni kendi alanına yönlenir. */
export async function requireStudentArea() {
  const { supabase, user } = await requireUser();
  const roles = await getUserRoles(user.id);
  if (roles.includes("admin")) return { supabase, user };
  if (roles.includes("parent")) redirect("/veli");
  if (roles.includes("verified_teacher") || roles.includes("teacher")) {
    redirect("/ogretmen-paneli");
  }
  return { supabase, user };
}
