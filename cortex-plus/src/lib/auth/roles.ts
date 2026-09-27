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

/**
 * `user_roles` içinde iptal edilmemiş `admin` satırı var mı.
 *
 * Sonuç istemci nesnesine bağlı saklanıyor. `createServiceClient()` her
 * istekte yeni nesne döndürdüğü için bu, istek başına önbellek demek: aynı
 * istekte kapı, kota ve kredi yolu tek sorguyu paylaşıyor; yetkisi alınan
 * yönetici bir sonraki istekte normal kullanıcıya dönüyor.
 *
 * Sorgu hata verirse `false`: muafiyet kapalıya düşer, kimse yanlışlıkla
 * sınırsız olmaz.
 */
export function isAdminUser(client: SupabaseClient, userId: string): Promise<boolean> {
  let byUser = cache.get(client);
  if (!byUser) {
    byUser = new Map();
    cache.set(client, byUser);
  }
  const hit = byUser.get(userId);
  if (hit) return hit;

  // Eşzamanlı fırlayan hata da (istemci eksik, ağ katmanı çöktü) kapalıya düşsün.
  // Güvenlik: hata → false kalır; teşhis için kod loglanır.
  const pending = (async () => {
    try {
      const { data, error } = await client.rpc("is_admin", { uid: userId });
      if (error) {
        console.warn("is_admin_rpc_failed", {
          code: (error as { code?: string }).code ?? "rpc_error",
        });
        return false;
      }
      return data === true;
    } catch (error) {
      console.warn("is_admin_rpc_failed", {
        code:
          error instanceof Error
            ? (error.constructor?.name ?? error.name)
            : "exception",
      });
      return false;
    }
  })();
  byUser.set(userId, pending);
  return pending;
}
