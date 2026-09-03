/**
 * Davet çarpanı görünümü.
 *
 * Çarpanlar veritabanındaki `referral_tiers` tablosunda duruyor; arayüz metni
 * de oradan besleniyor. Sayıyı koda gömseydik tabloyu kısan biri metni
 * güncellemeyi unutur ve ürün olmayan bir ödül vaat ederdi.
 */

import type { SupabaseClient } from "@supabase/supabase-js";

export type ReferralSummary = {
  /**
   * RPC yanıt verdi mi. Migration henüz uygulanmamış ortamlarda `false` —
   * arayüz kartı hiç çizmemeli, yoksa "1 katına çıkar" gibi anlamsız bir
   * ödül vaat eder.
   */
  available: boolean;
  /** Sayılan davet adedi (tavan uygulanmış). */
  usedCount: number;
  /** Kaç davetin sayıldığı — Astra'da 3. */
  maxCount: number;
  /** Bunlardan kaçı aboneye dönüştü. */
  subscribedCount: number;
  /** Kotaya uygulanan etkin çarpan. */
  multiplier: number;
  /** Kullanıcının kendisi bir davetle mi geldi. */
  isInvitee: boolean;
  signupMultiplier: number;
  subscribedMultiplier: number;
};

const EMPTY: ReferralSummary = {
  available: false,
  usedCount: 0,
  maxCount: 3,
  subscribedCount: 0,
  multiplier: 1,
  isInvitee: false,
  signupMultiplier: 1,
  subscribedMultiplier: 1,
};

type SummaryRow = {
  used_count: number | null;
  max_count: number | null;
  subscribed_count: number | null;
  multiplier: number | null;
  is_invitee: boolean | null;
  signup_multiplier: number | null;
  subscribed_multiplier: number | null;
};

/**
 * Migration henüz uygulanmamış ortamlarda RPC yok. Bu durumda kart hiç
 * görünmesin diye sessizce boş özet dönüyoruz — sayfayı düşürmek yerine.
 */
export async function loadReferralSummary(
  supabase: SupabaseClient,
): Promise<ReferralSummary> {
  const { data, error } = await supabase.rpc("referral_summary");
  if (error || !data) return EMPTY;

  const row = (Array.isArray(data) ? data[0] : data) as SummaryRow | undefined;
  if (!row) return EMPTY;

  return {
    available: true,
    usedCount: row.used_count ?? 0,
    maxCount: row.max_count ?? 3,
    subscribedCount: row.subscribed_count ?? 0,
    multiplier: Math.max(1, row.multiplier ?? 1),
    isInvitee: Boolean(row.is_invitee),
    signupMultiplier: Math.max(1, row.signup_multiplier ?? 1),
    subscribedMultiplier: Math.max(1, row.subscribed_multiplier ?? 1),
  };
}

/** Kartın açıklama metni — çarpanlar tablodan geldiği için her zaman doğru. */
export function referralPitch(summary: ReferralSummary): string {
  return (
    `Davetinle kaydolan her arkadaşta ikinizin de hakkı ` +
    `${summary.signupMultiplier} katına çıkar. ` +
    `Davet ettiğin kişi aboneliğe geçerse seninki ` +
    `${summary.subscribedMultiplier} katına yükselir.`
  );
}

/** Çarpan gerçekten uygulanıyorsa kullanıcıya durumunu söyle. */
export function referralStatus(summary: ReferralSummary): string | null {
  if (summary.multiplier <= 1) return null;
  if (summary.subscribedCount > 0) {
    return `Hakkın şu anda ${summary.multiplier} katı — davet ettiğin bir kişi aboneliğe geçti.`;
  }
  if (summary.usedCount > 0) {
    return `Hakkın şu anda ${summary.multiplier} katı — ${summary.usedCount} davetin sayıldı.`;
  }
  return `Hakkın şu anda ${summary.multiplier} katı — bir davetle katıldığın için.`;
}
