/**
 * Öğrencinin çalışma geçmişi — kaç gün, ne sıklıkla.
 *
 * Astra'nın "Aktivitelerim" ekranında üç şey var: son yedi günün çubuk
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

export type ActivityDay = { date: string; count: number };

function isoDay(date: Date): string {
  const y = date.getFullYear();
  const m = `${date.getMonth() + 1}`.padStart(2, "0");
  const d = `${date.getDate()}`.padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Zaman damgalarını gün gün sayıya çevirir. */
export function countByDay(timestamps: string[]): Map<string, number> {
  const counts = new Map<string, number>();
  for (const stamp of timestamps) {
    const time = Date.parse(stamp);
    if (Number.isNaN(time)) continue;
    const day = isoDay(new Date(time));
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
  const out: ActivityDay[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(today);
    date.setHours(12, 0, 0, 0);
    date.setDate(date.getDate() - i);
    const key = isoDay(date);
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
  const end = new Date(today);
  end.setHours(12, 0, 0, 0);
  // Bugünün haftasının pazartesisine git.
  const monday = new Date(end);
  monday.setDate(monday.getDate() - ((monday.getDay() + 6) % 7));

  const weeks: (ActivityDay | null)[][] = [];
  for (let w = 51; w >= 0; w -= 1) {
    const weekStart = new Date(monday);
    weekStart.setDate(weekStart.getDate() - w * 7);
    const week: (ActivityDay | null)[] = [];
    for (let d = 0; d < 7; d += 1) {
      const day = new Date(weekStart);
      day.setDate(day.getDate() + d);
      if (day > end) {
        week.push(null);
        continue;
      }
      const key = isoDay(day);
      week.push({ date: key, count: counts.get(key) ?? 0 });
    }
    weeks.push(week);
  }
  return weeks;
}

/** Bugüne kadar kesintisiz kaç gün çalışıldı. */
export function currentStreak(timestamps: string[], today = new Date()): number {
  const counts = countByDay(timestamps);
  const cursor = new Date(today);
  cursor.setHours(12, 0, 0, 0);
  // Bugün henüz çalışılmadıysa seri dünden sayılır; gün bitmedi.
  if (!counts.get(isoDay(cursor))) cursor.setDate(cursor.getDate() - 1);
  let streak = 0;
  while (counts.get(isoDay(cursor))) {
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}
