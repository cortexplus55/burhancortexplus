/**
 * Kota dönemi görünümü.
 *
 * Bütçe yenilemesi `credit_reserve()` içinde tembel çalışır: dönem dolmuş olsa
 * bile kullanıcı yeni bir işlem yapana kadar veritabanındaki satır eski değeri
 * taşır. Arayüz bunu olduğu gibi gösterirse, dün kotasını bitirmiş bir kullanıcı
 * bugün "0 kalan" görür — oysa ilk işlemde bütçesi dolacak. Bu yüzden burada
 * dönem geçmişse yenilenmiş hâli hesaplanır.
 */

export type WalletPeriod = {
  free_allowance_remaining: number;
  period_allowance: number;
  period_ends_at: string;
  period_kind: string;
};

export type QuotaView = {
  /** Dönem içinde kalan hak (yenileme beklentisi uygulanmış). */
  remaining: number;
  /** Dönemin toplam bütçesi. */
  allowance: number;
  /** Kullanılan yüzde — Astra'nın gösterdiği sayı. */
  usedPercent: number;
  /** Sıfırlanma anı (yenileme beklentisi uygulanmış). */
  resetsAt: Date;
  kind: "daily" | "monthly";
  /** Dönem dolmuş ama henüz yenilenmemiş — ilk işlemde dolacak. */
  pendingRefill: boolean;
};

const FREE_DAILY_ALLOWANCE = 6;
const PREMIUM_MONTHLY_ALLOWANCE = 400;

/** Bir sonraki gün başı (UTC) — Türkiye saatiyle 03:00'e denk gelir. */
function nextDayBoundary(from: Date): Date {
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

function nextMonthlyBoundary(from: Date): Date {
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + 30);
  return d;
}

export function quotaView(
  wallet: WalletPeriod | null | undefined,
  isPremium: boolean,
  now = new Date(),
): QuotaView {
  const fallbackAllowance = isPremium
    ? PREMIUM_MONTHLY_ALLOWANCE
    : FREE_DAILY_ALLOWANCE;

  if (!wallet) {
    return {
      remaining: fallbackAllowance,
      allowance: fallbackAllowance,
      usedPercent: 0,
      resetsAt: isPremium ? nextMonthlyBoundary(now) : nextDayBoundary(now),
      kind: isPremium ? "monthly" : "daily",
      pendingRefill: false,
    };
  }

  const endsAt = new Date(wallet.period_ends_at);
  const expired = Number.isNaN(endsAt.getTime()) || now >= endsAt;

  if (expired) {
    // Yenileme henüz yazılmadı; kullanıcıya bir sonraki işlemde ne olacağını göster.
    return {
      remaining: fallbackAllowance,
      allowance: fallbackAllowance,
      usedPercent: 0,
      resetsAt: isPremium ? nextMonthlyBoundary(now) : nextDayBoundary(now),
      kind: isPremium ? "monthly" : "daily",
      pendingRefill: true,
    };
  }

  const allowance = Math.max(1, wallet.period_allowance);
  const remaining = Math.max(0, Math.min(wallet.free_allowance_remaining, allowance));
  return {
    remaining,
    allowance,
    usedPercent: Math.round(((allowance - remaining) / allowance) * 100),
    resetsAt: endsAt,
    kind: wallet.period_kind === "monthly" ? "monthly" : "daily",
    pendingRefill: false,
  };
}

/** "4 Eylül 2026 03:00" — kullanıcının saat diliminde. */
export function formatResetAt(date: Date): string {
  return date.toLocaleString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function periodLabel(kind: "daily" | "monthly"): string {
  return kind === "monthly" ? "Aylık limit" : "Günlük limit";
}
