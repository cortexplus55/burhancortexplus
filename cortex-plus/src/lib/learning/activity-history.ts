/**
 * Öğrencinin çalışma geçmişi — kaç gün, ne sıklıkla.
 *
 * Referans ürünün "Aktivitelerim" ekranında üç şey var: son yedi günün çubuk
 * grafiği, yıllık bir ısı haritası ve "tüm zamanların tasarrufları"
 * diye bir lira tutarı.
 *
 * İlk ikisi alındı. Üçüncüsü BİLEREK alınmadı: o tutar ölçülen bir şey
 * değil, saat sayısının bir özel ders ücretiyle çarpımı. Ölçmediğimiz
 * bir şeyi sayı gibi göstermek bu projede zaten bir kez pahalıya
 * patladı.
 *
 * Aynı sebeple burada DAKİKA değil ETKİNLİK sayılıyor. Öğrencinin
 * ekranda ne kadar kaldığını ölçmüyoruz; ölçtüğümüz şey bitirdiği
 * etkinlik. Grafik de onu söylüyor.
 */

import { addDays, istanbulDay, isoWeekday } from "@/lib/istanbul-day";

export type ActivityDay = { date: string; count: number };

/*
  Günler Türkiye takviminde. Bu dosya sunucuda çalışıyor (`/ilerleme`) ve
  sunucu UTC'de: yerel saatle sayıldığında gece 01:30'da bitirilen etkinlik
  bir önceki güne yazılıyor, son yedi gün dünde bitiyordu.
*/

/** Zaman damgalarını gün gün sayıya çevirir. */
export function countByDay(timestamps: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const stamp of timestamps) {
    const time = Date.parse(stamp);
    if (Number.isNaN(time)) continue;
    const day = istanbulDay(new Date(time));
    counts.set(day, (counts.get(day) ?? 0) + 1);
  }
  return counts;
}

/** Son N gün, bugün en sonda; boş günler sıfırla dolduruluyor. */
export function lastDays(
  timestamps: string[],
  days: number,
  today = new Date(),
): ActivityDay[] {
  const counts = countByDay(timestamps);
  const end = istanbulDay(today);
  const out: ActivityDay[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = addDays(end, -i);
    out.push({ date: key, count: counts.get(key) ?? 0 });
  }
  return out;
}

/**
 * Isı haritası için son 52 hafta, pazartesiyle başlayan sütunlar.
 *
 * Dönen dizi hafta hafta: her hafta 7 günlük bir dizi. Bugünün haftası
 * en sağda ve eksik günleri null — gelecek günü doluymuş gibi
 * göstermemek için.
 */
export function activityWeeks(
  timestamps: string[],
  today = new Date(),
): (ActivityDay | null)[][] {
  const counts = countByDay(timestamps);
  const end = istanbulDay(today);
  // Bugünün haftasının pazartesisine git.
  const monday = addDays(end, 1 - isoWeekday(end));

  const weeks: (ActivityDay | null)[][] = [];
  for (let w = 51; w >= 0; w -= 1) {
    const weekStart = addDays(monday, -w * 7);
    const week: (ActivityDay | null)[] = [];
    for (let d = 0; d < 7; d += 1) {
      const key = addDays(weekStart, d);
      if (key > end) {
        week.push(null);
        continue;
      }
      week.push({ date: key, count: counts.get(key) ?? 0 });
    }
    weeks.push(week);
  }
  return weeks;
}

/** Bugüne kadar kesintisiz kaç gün çalışıldı. */
export function currentStreak(timestamps: string[], today = new Date()): number {
  const counts = countByDay(timestamps);
  let cursor = istanbulDay(today);
  // Bugün henüz çalışılmadıysa seri dünden sayılır; gün bitmedi.
  if (!counts.get(cursor)) cursor = addDays(cursor, -1);
  let streak = 0;
  while (counts.get(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  return streak;
}
