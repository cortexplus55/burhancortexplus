import { cache } from "react";
import { notFound, redirect } from "next/navigation";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createClient } from "@/lib/supabase/server";
import { accountActiveOrUnknown } from "@/lib/auth/active-account";
import { getAdminRole, type AdminRole } from "@/lib/auth/admin-role";
import { readAdminGate, type AdminGateStatus } from "@/lib/auth/admin-gate";

/*
  Yönetim sayfalarının koruması (6 Kasım 2026).

  Misafir, öğrenci, askıdaki hesap ya da rol okunamayan herkes `/admin*` için 404 alır: panelin varlığı
  bile söylenmez (eskiden misafir girişe, öğrenci ana sayfaya yönleniyordu). PIN kapısı açıksa ve bu
  kullanıcının geçerli kapı çerezi yoksa `/admin/kapi`'ya gider.

  Her sayfa kendi korumasını çağırır; ortak düzen (layout) yalnız görünüm içindir. Next.js istemci
  gezinmesinde düzen yeniden çizilmez, bu yüzden düzendeki kontrol tek başına koruma sayılmaz.
*/

export type AdminContext = {
  supabase: SupabaseClient;
  user: User;
  role: AdminRole;
  gate: AdminGateStatus;
};

export const ADMIN_GATE_PATH = "/admin/kapi";

/** Oturum, hesap durumu, rol ve kapı; yönetici değilse null. İstek başına bir kez. */
export const loadAdminContext = cache(async (): Promise<AdminContext | null> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const active = await accountActiveOrUnknown(supabase);
  if (active === false) return null;
  const role = await getAdminRole(supabase, user.id);
  if (!role) return null;
  const gate = await readAdminGate(user.id);
  return { supabase, user, role, gate };
});

/** Yönetici ya da kurucu; değilse 404. `skipGate` yalnız kapı sayfasının kendisi için. */
export async function requireAdminPage(options: { skipGate?: boolean } = {}): Promise<AdminContext> {
  const context = await loadAdminContext();
  if (!context) notFound();
  if (!options.skipGate && !context.gate.passed) redirect(ADMIN_GATE_PATH);
  return context;
}

/** Yalnız kurucu; yönetici de 404 alır (menüde kilitli görünür). */
export async function requireFounderPage(): Promise<AdminContext> {
  const context = await requireAdminPage();
  if (context.role !== "founder") notFound();
  return context;
}
