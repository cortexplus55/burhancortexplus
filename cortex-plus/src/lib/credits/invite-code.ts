import { randomBytes } from "crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { appOrigin } from "@/lib/app-url";

/**
 * Davet kodu üretimi. Sunucu tarafı — `randomBytes` istemciye gitmemeli.
 *
 * Kod `profiles.referral_code` üzerinde benzersiz (kısmi indeks). Yarış
 * durumunda ikinci yazma indekse takılır; bu yüzden birkaç kez deniyor ve
 * her turda kodun bu arada başkası tarafından yazılmış olabileceğini de
 * kontrol ediyoruz.
 */
export async function ensureReferralCode(
  supabase: SupabaseClient,
  userId: string,
  existing: string | null,
): Promise<string | null> {
  if (existing) return existing;

  for (let attempt = 0; attempt < 4; attempt++) {
    const code = randomBytes(4).toString("hex").toUpperCase();
    const { data } = await supabase
      .from("profiles")
      .update({ referral_code: code })
      .eq("id", userId)
      .is("referral_code", null)
      .select("referral_code")
      .maybeSingle();
    if (data?.referral_code) return data.referral_code as string;

    // Ya kod çakıştı ya da bu arada bir kod atanmış. İkincisini kontrol et.
    const { data: again } = await supabase
      .from("profiles")
      .select("referral_code")
      .eq("id", userId)
      .maybeSingle();
    if (again?.referral_code) return again.referral_code as string;
  }
  return null;
}

/** Kayıt sayfasına giden davet bağlantısı. */
export function inviteUrlFor(code: string | null, userId: string): string {
  return `${appOrigin()}/kayit?ref=${code ?? userId.slice(0, 8)}`;
}

/** Profilin kodunu okuyup gerekirse üretir ve bağlantıyı döndürür. */
export async function loadInviteLink(
  supabase: SupabaseClient,
  userId: string,
): Promise<{ code: string | null; url: string }> {
  const { data: profile } = await supabase
    .from("profiles")
    .select("referral_code")
    .eq("id", userId)
    .maybeSingle();

  const code = await ensureReferralCode(
    supabase,
    userId,
    (profile?.referral_code as string | null) ?? null,
  );

  return { code, url: inviteUrlFor(code, userId) };
}
