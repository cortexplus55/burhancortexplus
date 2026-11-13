import {
  parityGreetingName,
  parityUserInitial,
} from "@/components/parity/app-utils";
import { getStudentAccountContext } from "@/lib/student/account-context";
import { getUserStreakState } from "@/lib/streak/record-activity";
import { loadPromoCampaign } from "@/lib/student/promo-campaign";
import { emailUnverifiedFromMetadata } from "@/lib/auth/email-unverified-flag";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadParityShellProps(
  supabase: SupabaseClient,
  userId: string,
  email?: string | null,
) {
  const [{ data: profile }, account, streakState, promo] = await Promise.all([
    supabase
      .from("profiles")
      .select("full_name, avatar_url")
      .eq("id", userId)
      .maybeSingle(),
    getStudentAccountContext(supabase, userId),
    getUserStreakState(supabase, userId),
    loadPromoCampaign(supabase),
  ]);

  // E-posta şeridi ilk çizimde gelsin (Paket J takip #3): oturum belirtecindeki bayrak (ağ isteği yok).
  // Kurucu görmez; Google ve doğrulanmış hesapta bayrak zaten yok.
  // 10 Kasım 2026: belirteç bayrağı doğrulamadan sonra bir saate kadar bayat kalır; yalnız ona bakan sayfalar
  // (bu yükleyiciyi kullanan hepsi) doğrulanmış öğrenciye şeridi yeniden çiziyordu. Bayrak belirteçte varsa
  // (az sayıda hesap) taze kullanıcıyla teyit edilir; okuma düşerse belirtecin dediği geçerli.
  const { data: sessionData } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));
  let emailUnverified = !account?.isAdmin && emailUnverifiedFromMetadata(sessionData?.session?.user?.app_metadata);
  if (emailUnverified) {
    const fresh = await supabase.auth.getUser().catch(() => null);
    if (fresh?.data?.user) emailUnverified = emailUnverifiedFromMetadata(fresh.data.user.app_metadata);
  }

  const avatar = profile?.avatar_url as string | null | undefined;

  const { data: conversations } = await supabase
    .from("conversations")
    .select("id, title, updated_at")
    .eq("user_id", userId)
    .is("deleted_at", null)
    .order("updated_at", { ascending: false })
    .limit(5);

  // Profil kapsülündeki ad (13 Kasım 2026): selamdaki gibi ilk ad, baş harfi Türkçe kuralla büyük; ad yoksa
  // e-postanın kullanıcı adı (profil panelinin bugünkü yedeği).
  const greetName = parityGreetingName(profile?.full_name);
  const userName = greetName !== "Merhaba" ? greetName : (email?.split("@")[0] || "Öğrenci");

  return {
    userInitial: parityUserInitial(profile?.full_name, email),
    userName,
    avatarEmoji: avatar && !avatar.startsWith("http") ? avatar : null,
    streak: streakState.streak,
    streakFreeze: {
      remaining: streakState.remaining,
      protected: streakState.protected,
      used: streakState.used,
    },
    account,
    emailUnverified,
    promo,
    recentConversations: (conversations ?? []).map((row) => ({
      id: row.id as string,
      title: (row.title as string | null) ?? "Yeni sohbet",
      updatedAt: row.updated_at as string,
    })),
  };
}
