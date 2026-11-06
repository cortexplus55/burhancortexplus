import { createClient } from "@/lib/supabase/server";
import { getAdminRole, type AdminRole } from "@/lib/auth/admin-role";
import { readAdminGate } from "@/lib/auth/admin-gate";

/**
 * Sunucu eylemlerinin yetki denetimi (tek kaynak; 5 Kasım 2026'dan beri iki eylem dosyası kopya taşımıyor).
 *
 * - `requireAdminActor()`: çağıran yönetici ya da kurucuysa kullanıcı kimliği, değilse null.
 * - `requireFounderActor()`: yalnız kurucu; PIN tanımlıysa geçerli kapı çerezi de gerekir. Yönetici
 *   ekleme/çıkarma, paket fiyatı, kredi kuralı, harcama tavanı, kur, özellik anahtarı ve sistem ayarı
 *   değiştiren her eylem bunu ister (6 Kasım 2026).
 *
 * Rol `user_roles`'tan SQL `is_admin` / `is_founder` ile okunur; istemciden gelen hiçbir şey okunmaz.
 */

export const FOUNDER_ONLY_ERROR = "Bu işlem yalnız kurucuya açık.";
export const FOUNDER_GATE_ERROR = "Kurucu yönetim girişini PIN ile yeniden doğrula (/admin/kapi).";

export async function currentAdminActor(): Promise<{ userId: string; role: AdminRole } | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const role = await getAdminRole(supabase, user.id);
  return role ? { userId: user.id, role } : null;
}

export async function requireAdminActor(): Promise<string | null> {
  return (await currentAdminActor())?.userId ?? null;
}

/** Kurucu denetimi ve nedeni: rol mü eksik, kapı mı. */
export async function checkFounderActor(): Promise<{ ok: true; userId: string } | { ok: false; error: string }> {
  const actor = await currentAdminActor();
  if (!actor || actor.role !== "founder") return { ok: false, error: FOUNDER_ONLY_ERROR };
  const gate = await readAdminGate(actor.userId);
  if (!gate.passed) return { ok: false, error: FOUNDER_GATE_ERROR };
  return { ok: true, userId: actor.userId };
}

export async function requireFounderActor(): Promise<string | null> {
  const result = await checkFounderActor();
  return result.ok ? result.userId : null;
}
