import type { SupabaseClient } from "@supabase/supabase-js";

/*
  Yönetici tespitinin tek yeri.

  Veritabanındaki `public.is_admin()` çağrılıyor — `credit_reserve` de aynı
  fonksiyona bakıyor. Böylece "arayüz yönetici sanıyor ama kredi yine
  düşüyor" ayrışması kurulamıyor: iki taraf tek tanımı okuyor.

  E-posta listesi, ortam değişkeni, çerez ya da istek gövdesi okunmuyor.
  Ayrıcalık yalnızca `user_roles` satırından geliyor.
*/

const cache = new WeakMap<object, Map<string, Promise<boolean>>>();

/** Admin RPC failed after retry — callers must not silently treat as free. */
export class AdminCheckError extends Error {
  readonly code = "admin_check_failed";
  constructor() {
    super("admin_check_failed");
    this.name = "AdminCheckError";
  }
}

export type AdminCheckResult =
  | { ok: true; isAdmin: boolean }
  | { ok: false; code: "admin_check_failed" };

async function queryIsAdmin(
  client: SupabaseClient,
  userId: string,
): Promise<{ ok: true; value: boolean } | { ok: false }> {
  try {
    const { data, error } = await client.rpc("is_admin", { uid: userId });
    if (error) {
      console.warn("is_admin_rpc_failed", {
        code: (error as { code?: string }).code ?? "rpc_error",
      });
      return { ok: false };
    }
    return { ok: true, value: data === true };
  } catch (error) {
    console.warn("is_admin_rpc_failed", {
      code:
        error instanceof Error
          ? (error.constructor?.name ?? error.name)
          : "exception",
    });
    return { ok: false };
  }
}

async function resolveAdmin(
  client: SupabaseClient,
  userId: string,
): Promise<AdminCheckResult> {
  const first = await queryIsAdmin(client, userId);
  if (first.ok) return { ok: true, isAdmin: first.value };
  const second = await queryIsAdmin(client, userId);
  if (second.ok) return { ok: true, isAdmin: second.value };
  return { ok: false, code: "admin_check_failed" };
}

/**
 * `user_roles` içinde iptal edilmemiş `admin` satırı var mı.
 *
 * Sonuç istemci nesnesine bağlı saklanıyor. `createServiceClient()` her
 * istekte yeni nesne döndürdüğü için bu, istek başına önbellek demek.
 *
 * Sorgu hata verirse bir kez yeniden denenir; ikisi de düşerse `false`
 * (güvenlik: kimse yanlışlıkla sınırsız olmaz). Kota/preflight yolu
 * `checkIsAdminUser` ile aynı hatayı açık kod olarak alır.
 */
export function isAdminUser(client: SupabaseClient, userId: string): Promise<boolean> {
  let byUser = cache.get(client);
  if (!byUser) {
    byUser = new Map();
    cache.set(client, byUser);
  }
  const hit = byUser.get(userId);
  if (hit) return hit;

  const pending = resolveAdmin(client, userId).then((result) => {
    if (!result.ok) {
      // Do not cache failures — next call may succeed.
      byUser!.delete(userId);
      return false;
    }
    return result.isAdmin;
  });
  byUser.set(userId, pending);
  return pending;
}

/** Like `isAdminUser` but surfaces RPC failure instead of silent free-tier. */
export async function checkIsAdminUser(
  client: SupabaseClient,
  userId: string,
): Promise<AdminCheckResult> {
  // Reuse the boolean cache when a successful answer is already pending.
  let byUser = cache.get(client);
  const cached = byUser?.get(userId);
  if (cached) {
    return { ok: true, isAdmin: await cached };
  }
  const result = await resolveAdmin(client, userId);
  if (result.ok) {
    if (!byUser) {
      byUser = new Map();
      cache.set(client, byUser);
    }
    byUser.set(userId, Promise.resolve(result.isAdmin));
  }
  return result;
}

/** Throws when the admin RPC cannot be verified. */
export async function requireAdminCheck(
  client: SupabaseClient,
  userId: string,
): Promise<boolean> {
  const result = await checkIsAdminUser(client, userId);
  if (!result.ok) throw new AdminCheckError();
  return result.isAdmin;
}
