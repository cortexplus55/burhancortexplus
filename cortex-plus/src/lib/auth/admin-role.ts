import type { SupabaseClient } from "@supabase/supabase-js";
import { checkIsAdminUser } from "@/lib/auth/roles";

/*
  İki kademeli yönetim rolünün tek kaynağı (6 Kasım 2026).

  "founder" (Kurucu): her şey; yönetici ekler/çıkarır, fiyat, kredi kuralı, harcama tavanı, kur, özellik
  anahtarı ve sistem ayarı değiştirir. "admin" (Yönetici): destek, soru bildirimi, kullanıcı listesi gibi
  günlük işler. Karar yalnız `user_roles` satırından, SQL `is_admin` ve `is_founder` üzerinden gelir;
  e-posta listesi, çerez ya da istek gövdesi okunmaz.

  Göç (20261106150000_founder_role.sql) uygulanmamışsa `is_founder` yoktur. O durumda KİMSE kurucu
  sayılmaz: yöneticiler yönetici olarak devam eder, kurucuya özel eylemler kapalı kalır. Gerekçe: eksik
  bir fonksiyonu "en eski yönetici kurucudur" diye kodda taklit etmek, göçün tek kaynak olma kuralını
  bozar ve yanlış kişiye en yüksek yetkiyi verebilir. Pencere kısa: göç kod yayınından önce uygulanır.
*/

export type AdminRole = "founder" | "admin";

export const ADMIN_ROLE_LABEL: Record<AdminRole, string> = {
  founder: "Kurucu",
  admin: "Yönetici",
};

export const ADMIN_ROLE_BADGE: Record<AdminRole, string> = {
  founder: "👑 Kurucu",
  admin: "🛡️ Yönetici",
};

type FounderAnswer = { ok: true; value: boolean } | { ok: false; missing: boolean };

/** PostgREST "fonksiyon yok" (PGRST202) ya da Postgres 42883: göç henüz uygulanmamış. */
export function isMissingFunctionError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const code = (error as { code?: unknown }).code;
  return code === "PGRST202" || code === "42883";
}

async function queryIsFounder(client: SupabaseClient, userId: string): Promise<FounderAnswer> {
  try {
    const { data, error } = await client.rpc("is_founder", { uid: userId });
    if (error) {
      const missing = isMissingFunctionError(error);
      console.warn(missing ? "is_founder_missing" : "is_founder_rpc_failed", {
        code: (error as { code?: string }).code ?? "rpc_error",
      });
      return { ok: false, missing };
    }
    return { ok: true, value: data === true };
  } catch (error) {
    console.warn("is_founder_rpc_failed", {
      code: error instanceof Error ? error.name : "exception",
    });
    return { ok: false, missing: false };
  }
}

const cache = new WeakMap<object, Map<string, Promise<AdminRole | null>>>();

async function resolveRole(client: SupabaseClient, userId: string): Promise<AdminRole | null> {
  const admin = await checkIsAdminUser(client, userId);
  // Yönetici sorgusu iki kez düştüyse yetki verilmez (güvenli taraf).
  if (!admin.ok || !admin.isAdmin) return null;
  const first = await queryIsFounder(client, userId);
  if (first.ok) return first.value ? "founder" : "admin";
  if (first.missing) return "admin";
  const second = await queryIsFounder(client, userId);
  return second.ok && second.value ? "founder" : "admin";
}

/**
 * Kullanıcının yönetim rolü: "founder", "admin" ya da yönetici değilse null.
 * Sonuç istemci nesnesine bağlı saklanır (istek başına önbellek); başarısız okuma saklanmaz.
 */
export function getAdminRole(client: SupabaseClient, userId: string): Promise<AdminRole | null> {
  let byUser = cache.get(client);
  if (!byUser) {
    byUser = new Map();
    cache.set(client, byUser);
  }
  const hit = byUser.get(userId);
  if (hit) return hit;
  const pending = resolveRole(client, userId);
  byUser.set(userId, pending);
  return pending;
}

export async function isFounderUser(client: SupabaseClient, userId: string): Promise<boolean> {
  return (await getAdminRole(client, userId)) === "founder";
}
