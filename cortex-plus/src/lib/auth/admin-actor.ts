import { createClient } from "@/lib/supabase/server";

/**
 * Sunucu eyleminin çağıranı yönetici mi? Yöneticiyse kullanıcı kimliği, değilse null.
 * Tek kaynak (5 Kasım 2026): daha önce iki eylem dosyası aynı işlevi ayrı ayrı taşıyordu.
 */
export async function requireAdminActor(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase
    .from("user_roles")
    .select("role")
    .eq("user_id", user.id)
    .eq("role", "admin")
    .is("revoked_at", null)
    .maybeSingle();
  return data ? user.id : null;
}
