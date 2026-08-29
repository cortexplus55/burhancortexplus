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
