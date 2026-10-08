/**
 * Türkiye takvim günü — sunucunun saatinden bağımsız.
 *
 * Vercel UTC'de çalışıyor. `getDate()`, `getDay()`, `setHours()` sunucuda
 * UTC gününü verir; Türkiye'de 00:00–03:00 arası UTC'de hâlâ dün. 30 Eylül
 * 2026'da ana sayfa sabah 07:40'ta "iyi geceler" dedi; aynı hata gün
 * hesaplayan her sunucu kodunda gece yarısından sonra üç saat boyunca
 * "bugün"ü dün yapıyordu.
 *
 * Günler burada "YYYY-MM-DD" dizesi olarak taşınıyor ve aritmetik UTC
 * gece yarısında yapılıyor; böylece sonuç sunucunun saat diliminden
 * etkilenmiyor. Europe/Istanbul 2016'dan beri yaz saati uygulamıyor.
 */

const DAY_KEY = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Europe/Istanbul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Bu anın Türkiye'deki takvim günü: "2026-10-01". */
export function istanbulDay(now: Date = new Date()): string {
  return DAY_KEY.format(now);
}

/** "YYYY-MM-DD" + n gün. */
export function addDays(day: string, n: number): string {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + n);
  return date.toISOString().slice(0, 10);
}

/** Pazartesi = 1 … Pazar = 7. */
export function isoWeekday(day: string): number {
  const js = new Date(`${day}T00:00:00Z`).getUTCDay();
  return js === 0 ? 7 : js;
}
