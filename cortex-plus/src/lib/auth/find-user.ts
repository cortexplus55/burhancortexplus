import "server-only";
import type { SupabaseClient, User } from "@supabase/supabase-js";

/**
 * E-postadan Supabase kullanıcısı (8 Kasım 2026). Supabase yönetici arayüzünde e-postayla doğrudan arama yok
 * (getUserByEmail v2'de kalktı); sayfa sayfa taranır. Bugünkü ölçekte (yüzlerce hesap) tek istek; tarama
 * MAX_PAGES sayfada durur ve sınıra gelince günlüğe yazar. Hesap sayısı birkaç bini geçerse bu işlev bir SQL
 * işleviyle (auth.users e-posta dizini) değiştirilmeli.
 */
const PAGE_SIZE = 200;
const MAX_PAGES = 10;

export async function findAuthUserByEmail(service: SupabaseClient, email: string): Promise<User | null> {
  const target = email.trim().toLowerCase();
  if (!target) return null;
  for (let page = 1; page <= MAX_PAGES; page += 1) {
    const { data, error } = await service.auth.admin.listUsers({ page, perPage: PAGE_SIZE });
    if (error) return null;
    const found = data.users.find((user) => (user.email ?? "").toLowerCase() === target);
    if (found) return found;
    if (data.users.length < PAGE_SIZE) return null;
  }
  console.warn("find_user_scan_limit", { pages: MAX_PAGES });
  return null;
}

/** Hesap yalnız Google ile açılmış mı (şifre kimliği yok)? */
export function isGoogleOnly(user: Pick<User, "app_metadata"> | null | undefined): boolean {
  const providers = (user?.app_metadata?.providers ?? []) as string[];
  return providers.includes("google") && !providers.includes("email");
}

export const GOOGLE_ONLY_NOTE =
  "Bu hesap Google ile açılmış, şifresi yok. «Google ile devam et» ile gir; e-posta ve şifreyle girmek istersen «Şifremi unuttum» ile bir şifre belirle.";
