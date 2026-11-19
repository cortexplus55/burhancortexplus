import { PLAN_ALLOWANCES } from "@/lib/credits/price-table";
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
  /** Kullanılan yüzde — referans ürünün gösterdiği sayı. */
  usedPercent: number;
  /** Sıfırlanma anı (yenileme beklentisi uygulanmış). */
  resetsAt: Date;
  kind: PeriodKind;
  /** Dönem dolmuş ama henüz yenilenmemiş — ilk işlemde dolacak. */
  pendingRefill: boolean;
};

/**
 * Cüzdanın dönem türü.
 *
 * `weekly` haftalık Plus paketiyle geldi: o abonenin hakkı 30 günde bir değil
 * 7 günde bir yenileniyor, ekranda da "Aylık limit" yazması yanlış olurdu.
 */
export type PeriodKind = "daily" | "weekly" | "monthly";

/**
 * Ücretsiz günlük kredi: 24 Ekim 2026'dan beri 0 (SQL: 20261024123000). Ücretsiz hesap sayaçla çalışır
 * (ilk ders, günde 3 mesaj, ayda 7 fotoğraf; `free-meters.ts`).
 */
export const FREE_DAILY_ALLOWANCE = 0;
/** Faz 4: fiyat tablosundaki aylık Plus hakkı (tek kaynak); plan satırı okunamazsa yedek. */
const PREMIUM_MONTHLY_ALLOWANCE: number = PLAN_ALLOWANCES.plusMonthly;

/**
 * UTC gün başına `days` ekler. Gün başı Türkiye'de 03:00'dır.
 * Ücretsiz hak 1 gün, haftalık Plus 7 gün, aylık/yıllık kota 30 gün.
 */
function nextUtcDayOffset(from: Date, days: number): Date {
  const d = new Date(from);
  d.setUTCHours(0, 0, 0, 0);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}

/** Dönemi dolmuş premium cüzdanın bir sonraki penceresi. Plan haftalıksa 7 gün kalır. */
function premiumRefill(wallet: WalletPeriod | null | undefined): {
  kind: PeriodKind;
  days: number;
} {
  if (wallet?.period_kind === "weekly") return { kind: "weekly", days: 7 };
  return { kind: "monthly", days: 30 };
}

/** Aboneliğin son 24 saati: sunucu yeni dönem hakkı yazmaz (credit_reserve, 20261115120000). */
const SUBSCRIPTION_TAIL_MS = 86_400_000;

export function quotaView(
  wallet: WalletPeriod | null | undefined,
  isPremium: boolean,
  now = new Date(),
  premiumAllowance = PREMIUM_MONTHLY_ALLOWANCE,
  /** Aboneliğin bitişi: yenilenen dönem bunu geçmez, son 24 saatte yenileme yok (sunucuyla aynı kural). */
  subscriptionEnd?: string | null,
): QuotaView {
  const fallbackAllowance = isPremium
    ? premiumAllowance
    : FREE_DAILY_ALLOWANCE;

  if (!wallet) {
    return {
      remaining: fallbackAllowance,
      allowance: fallbackAllowance,
      usedPercent: 0,
      resetsAt: isPremium
        ? nextUtcDayOffset(now, 30)
        : nextUtcDayOffset(now, 1),
      kind: isPremium ? "monthly" : "daily",
      pendingRefill: false,
    };
  }

  const endsAt = new Date(wallet.period_ends_at);
  const expired = Number.isNaN(endsAt.getTime()) || now >= endsAt;

  if (expired) {
    // Yenileme henüz yazılmadı; kullanıcıya bir sonraki işlemde ne olacağını göster.
    // Haftalık Plus burada aylığa düşmesin: pencere 7 gün, etiket de haftalık.
    const refill = isPremium
      ? premiumRefill(wallet)
      : { kind: "daily" as const, days: 1 };
    const subEnd = isPremium && subscriptionEnd ? new Date(subscriptionEnd) : null;
    const subEndKnown = subEnd !== null && !Number.isNaN(subEnd.getTime());
    if (subEndKnown && subEnd.getTime() - now.getTime() < SUBSCRIPTION_TAIL_MS) {
      // Aboneliğin son saatleri: yenileme yok, eldeki hak paket bitene kadar geçerli.
      const allowance = Math.max(1, wallet.period_allowance || fallbackAllowance);
      const remaining = Math.max(0, Math.min(wallet.free_allowance_remaining, allowance));
      return {
        remaining,
        allowance,
        usedPercent: Math.round(((allowance - remaining) / allowance) * 100),
        resetsAt: subEnd,
        kind: refill.kind,
        pendingRefill: false,
      };
    }
    const next = nextUtcDayOffset(now, refill.days);
    return {
      remaining: fallbackAllowance,
      allowance: fallbackAllowance,
      usedPercent: 0,
      resetsAt: subEndKnown && subEnd < next ? subEnd : next,
      kind: refill.kind,
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
    kind:
      wallet.period_kind === "monthly"
        ? "monthly"
        : wallet.period_kind === "weekly"
          ? "weekly"
          : "daily",
    pendingRefill: false,
  };
}

/**
 * Bir miktarın dönem hakkına oranı, yüzde olarak.
 *
 * Öğrenci kredi sayısı görmüyor (29 Eylül 2026, kıyas ürünü gibi): kullanım ekranı
 * yalnızca yüzde gösteriyor, ek paket de "aylık hakkına +%13" diye satılıyor.
 * Sayının kendisi sunucuda kalıyor.
 */
export function allowanceShare(amount: number, allowance: number | null | undefined): number | null {
  if (!allowance || allowance <= 0 || amount <= 0) return null;
  return Math.max(1, Math.round((amount / allowance) * 100));
}

/**
 * "4 Eylül 2026 03:00" — ÖĞRENCİNİN saatinde, sunucununkinde değil.
 *
 * Saat dilimi sabitlenmemişti ve etiket sunucuda üretiliyor. Vercel UTC'de
 * çalıştığı için hak yenilenme anı ekranda "00:00" yazıyordu; oysa sınır
 * UTC gece yarısı, yani Türkiye'de 03:00. Hakkı biten öğrenci gece yarısını
 * bekliyor, hiçbir şey olmuyor ve üç saat daha bekliyordu.
 *
 * Ürün Türkiye'ye ait; proje zaten başka yerlerde (streak, günlük tur,
 * sınav takvimi) aynı saat dilimini sabitliyor.
 */
export function formatResetAt(date: Date): string {
  return date.toLocaleString("tr-TR", {
    timeZone: "Europe/Istanbul",
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function periodLabel(kind: PeriodKind): string {
  if (kind === "monthly") return "Aylık limit";
  if (kind === "weekly") return "Haftalık limit";
  return "Günlük limit";
}

/** Cümle başı: "Haftalık kotan", "Aylık hakkın". */
export function periodWord(kind: PeriodKind): string {
  if (kind === "monthly") return "Aylık";
  if (kind === "weekly") return "Haftalık";
  return "Günlük";
}
