import {
  parityShellName,
  parityUserInitial,
} from "@/components/parity/app-utils";
import { getSessionUserContext } from "@/lib/auth/session-context";
import { getUserStreakState } from "@/lib/streak/record-activity";
import { loadPromoCampaign } from "@/lib/student/promo-campaign";
import { loadRecentConversations } from "@/lib/student/recent-conversations";
import { emailUnverifiedFromMetadata } from "@/lib/auth/email-unverified-flag";
import type { SupabaseClient } from "@supabase/supabase-js";

export async function loadParityShellProps(
  supabase: SupabaseClient,
  userId: string,
  email?: string | null,
) {
  // Faz 2 (madde 2): profil, plan ve kredi özeti oturum bağlamından (istek içinde tek okuma, 45 sn önbellek); seri,
  // kampanya ve son sohbetler aynı turda. Eskiden profil ve sohbet listesi ayrı, sohbet listesi de en sonda sıralı
  // okunuyordu.
  const [context, streakState, promo, recentConversations, { data: sessionData }] = await Promise.all([
    getSessionUserContext(userId, { client: supabase }),
    getUserStreakState(supabase, userId),
    loadPromoCampaign(supabase),
    loadRecentConversations(supabase, userId),
    // Oturum belirteci çerezden okunur (ağ isteği yok).
    supabase.auth.getSession().catch(() => ({ data: { session: null } })),
  ]);
  const profile = context.profile;
  const account = context.account;

  // E-posta şeridi ilk çizimde gelsin (Paket J takip #3): oturum belirtecindeki bayrak (ağ isteği yok).
  // Kurucu görmez; Google ve doğrulanmış hesapta bayrak zaten yok.
  // 10 Kasım 2026: belirteç bayrağı doğrulamadan sonra bir saate kadar bayat kalır; yalnız ona bakan sayfalar
  // (bu yükleyiciyi kullanan hepsi) doğrulanmış öğrenciye şeridi yeniden çiziyordu. Bayrak belirteçte varsa
  // (az sayıda hesap) taze kullanıcıyla teyit edilir; okuma düşerse belirtecin dediği geçerli.
  let emailUnverified = !account?.isAdmin && emailUnverifiedFromMetadata(sessionData?.session?.user?.app_metadata);
  if (emailUnverified) {
    const fresh = await supabase.auth.getUser().catch(() => null);
    if (fresh?.data?.user) emailUnverified = emailUnverifiedFromMetadata(fresh.data.user.app_metadata);
  }

  const avatar = profile?.avatar_url as string | null | undefined;

  return {
    userInitial: parityUserInitial(profile?.full_name, email),
    userName: parityShellName(profile?.full_name, email),
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
    recentConversations,
  };
}
