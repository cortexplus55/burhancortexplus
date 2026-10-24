/**
 * Davet hediyesi görünümü.
 *
 * 24 Ekim 2026 (ürün sahibinin kararı): davet çarpanı kalktı. Davetle gelen arkadaş hesabını doğrulayıp
 * ilk çalışmasını yapınca ikisine de bir kez 90 kredi (3 ders) yazılır (SQL `grant_referral_gift`; davet
 * eden en çok 3 davet için alır). Durum satırı sayılan davetten değil, **yazılmış hediyeden** okunur:
 * `credit_ledger`'da `referral-gift-inviter:<davetli>` ve `referral-gift:<kendisi>` satırları. Davetliyi
 * saymak, hesabını doğrulamış ama hiç çalışmamış arkadaş için "hediye eklendi" demekti.
 */

import type { SupabaseClient } from "@supabase/supabase-js";
import { REFERRAL_GIFT_LESSONS } from "@/lib/billing/free-meters";

export type ReferralSummary = {
  /**
   * RPC yanıt verdi mi. Migration henüz uygulanmamış ortamlarda `false` —
   * arayüz kartı hiç çizmemeli, yoksa olmayan bir ödül vaat eder.
   */
  available: boolean;
  /** Sayılan davet adedi (hesabını doğrulamış davetliler, tavan uygulanmış). */
  usedCount: number;
  /** Kaç davetin sayıldığı — referans üründe 3. */
  maxCount: number;
  /** Bunlardan kaçı aboneye dönüştü. */
  subscribedCount: number;
  /** Eski çarpan alanı (`referral_summary` hâlâ döndürüyor); 24 Ekim 2026'dan beri uygulanmıyor. */
  multiplier: number;
  /** Kullanıcının kendisi bir davetle mi geldi. */
  isInvitee: boolean;
  /** Eski çarpan alanları; çarpan uygulanmıyor, ekranda gösterilmez. */
  signupMultiplier: number;
  subscribedMultiplier: number;
  /** Davet edene gerçekten yazılmış hediye sayısı (`referral-gift-inviter:%`), en çok `maxCount`. */
  giftsGranted: number;
  /** Davetle gelen öğrencinin kendi hediyesi yazıldı mı (`referral-gift:<kendisi>`). */
  giftReceived: boolean;
  /** Hediye satırları okunabildi mi. Okunamadıysa durum satırı hiçbir şey iddia etmez. */
  giftsKnown: boolean;
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
  giftsGranted: 0,
  giftReceived: false,
  giftsKnown: false,
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

const INVITER_GIFT_KEY = "referral-gift-inviter:";
const INVITEE_GIFT_KEY = "referral-gift:";

type GiftRead = Pick<ReferralSummary, "giftsGranted" | "giftReceived" | "giftsKnown">;

/**
 * Yazılmış davet hediyeleri. Sayfanın oturumlu istemcisiyle okunur: `ledger_own` öğrenciye kendi
 * satırlarını gösterir. Yöneticiye bütün satırları gösterdiği için kullanıcı kimliğiyle ayrıca süzülür.
 */
async function loadReferralGifts(supabase: SupabaseClient, userId: string | undefined): Promise<GiftRead> {
  const unknown: GiftRead = { giftsGranted: 0, giftReceived: false, giftsKnown: false };
  try {
    const id = userId ?? (await supabase.auth.getUser()).data.user?.id;
    if (!id) return unknown;
    const { data, error } = await supabase
      .from("credit_ledger")
      .select("idempotency_key")
      .eq("user_id", id)
      .like("idempotency_key", "referral-gift%")
      .limit(20);
    if (error) return unknown;
    const keys = ((data ?? []) as { idempotency_key: string | null }[]).map((row) => row.idempotency_key ?? "");
    return {
      giftsGranted: keys.filter((key) => key.startsWith(INVITER_GIFT_KEY)).length,
      giftReceived: keys.includes(`${INVITEE_GIFT_KEY}${id}`),
      giftsKnown: true,
    };
  } catch {
    return unknown;
  }
}

/**
 * Migration henüz uygulanmamış ortamlarda RPC yok. Bu durumda kart hiç
 * görünmesin diye sessizce boş özet dönüyoruz — sayfayı düşürmek yerine.
 *
 * `userId` verilirse hediye satırları ek kimlik sorgusu olmadan okunur; verilmezse oturumdan alınır.
 */
export async function loadReferralSummary(
  supabase: SupabaseClient,
  userId?: string,
): Promise<ReferralSummary> {
  const [{ data, error }, gifts] = await Promise.all([
    supabase.rpc("referral_summary"),
    loadReferralGifts(supabase, userId),
  ]);
  if (error || !data) return EMPTY;

  const row = (Array.isArray(data) ? data[0] : data) as SummaryRow | undefined;
  if (!row) return EMPTY;

  const maxCount = row.max_count ?? 3;
  return {
    available: true,
    usedCount: row.used_count ?? 0,
    maxCount,
    subscribedCount: row.subscribed_count ?? 0,
    multiplier: Math.max(1, row.multiplier ?? 1),
    isInvitee: Boolean(row.is_invitee),
    signupMultiplier: Math.max(1, row.signup_multiplier ?? 1),
    subscribedMultiplier: Math.max(1, row.subscribed_multiplier ?? 1),
    giftsGranted: Math.min(gifts.giftsGranted, maxCount),
    giftReceived: gifts.giftReceived,
    giftsKnown: gifts.giftsKnown,
  };
}

/** Üleştirme eki rakamla: 1'er, 2'şer, 3'er, 6'şar, 10'ar (sabit ek "%67'i" gibi hata yapmasın). */
const UNIT_EACH = ["", "er", "şer", "er", "er", "er", "şar", "şer", "er", "ar"];
const TEN_EACH = ["", "ar", "şer", "ar", "ar", "şer", "ar", "er", "er", "ar"];
export function perEach(n: number): string {
  if (n % 10) return `${n}'${UNIT_EACH[n % 10]}`;
  if (n % 100) return `${n}'${TEN_EACH[Math.floor(n / 10) % 10]}`;
  return `${n}'er`;
}

/** Kartın açıklama metni: hediye, ne zaman ve en çok kaç davet için. */
export function referralPitch(summary: ReferralSummary): string {
  return (
    `Davetinle gelen arkadaşın hesabını doğrulayıp ilk çalışmasını yapınca ikinize de bir kez ${REFERRAL_GIFT_LESSONS} ders hediye eklenir. ` +
    `En çok ${summary.maxCount} davet için hediye alırsın.`
  );
}

/** "Nasıl çalışır?" adımları; çarpan yok, hediye bir kez. */
export function referralSteps(summary: ReferralSummary): string[] {
  return [
    "Bağlantını paylaş; arkadaşın kayıt olurken kodun hesabına işlenir.",
    `Arkadaşın hesabını doğrulayıp ilk çalışmasını yapınca ikinize de ${REFERRAL_GIFT_LESSONS} ders hediye eklenir.`,
    `Hediye her arkadaş için bir kez verilir; en çok ${summary.maxCount} davet için hediye alırsın.`,
    "Hediye dersler, kullanım hakkın bitince devreye girer.",
  ];
}

/**
 * Durum satırı yalnız yazılmış hediyeyi "eklendi" diye söyler. Sayılan (hesabını doğrulamış) ama hediyesi
 * henüz yazılmamış davetli "bekliyor" diye anlatılır; davet eden tavana ulaştıysa bekleyen yok.
 */
export function referralStatus(summary: ReferralSummary): string | null {
  if (!summary.giftsKnown) return null;
  const lessons = REFERRAL_GIFT_LESSONS;
  const lines: string[] = [];
  const granted = summary.giftsGranted;
  if (granted > 0) {
    lines.push(
      granted === 1
        ? `1 arkadaşın için ${lessons} ders hediye eklendi.`
        : `${granted} arkadaşın için ${perEach(lessons)} ders hediye eklendi.`,
    );
  }
  const pending = granted >= summary.maxCount ? 0 : Math.max(0, summary.usedCount - granted);
  if (pending === 1) {
    lines.push(
      `Davetinle katılan 1 arkadaşın için hediye bekliyor: arkadaşın hesabını doğrulayıp ilk çalışmasını yapınca ikinize de ${lessons} ders eklenir.`,
    );
  } else if (pending > 1) {
    lines.push(
      `Davetinle katılan ${pending} arkadaşın için hediye bekliyor: her arkadaşın hesabını doğrulayıp ilk çalışmasını yapınca ikinize de ${lessons} ders eklenir.`,
    );
  }
  if (summary.isInvitee) {
    lines.push(
      summary.giftReceived
        ? `Davetle katıldığın için ${lessons} ders hediyen eklendi.`
        : `Bir davetle katıldın: hesabını doğrulayıp ilk çalışmanı yapınca ${lessons} ders hediye eklenir.`,
    );
  }
  return lines.length ? lines.join(" ") : null;
}
