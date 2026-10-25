/**
 * Aktif öğrenme süresi: hesaplar ve ekran metni (saf).
 *
 * Astra'nın Aktivitelerim sayfasındaki süre ve tasarruf kartının karşılığı
 * (30 Eylül 2026). Tasarruf, ürün sahibinin seçtiği özel ders saat ücretiyle
 * hesaplanır: 500 ₺. Astra ~660 ₺ kullanıyor ve sitede geçen her dakikayı
 * sayıyor; biz yalnızca ders, test ve sohbette aktif geçen süreyi.
 */

export const LEARNING_SURFACES = ["lesson", "quiz", "chat", "exam"] as const;
export type LearningSurface = (typeof LEARNING_SURFACES)[number];

export const TUTOR_TL_PER_HOUR = 500;

export type LearningTimeRow = { activity_date: string; subject: string; seconds: number };

/** Veritabanından gelen satırı güvenli biçime getirir; tarihi okunamayan satır düşer. */
export function normalizeLearningRows(raw: unknown): LearningTimeRow[] {
  if (!Array.isArray(raw)) return [];
  const rows: LearningTimeRow[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const date = typeof row.activity_date === "string" ? row.activity_date.slice(0, 10) : "";
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
    const seconds = Number(row.seconds);
    rows.push({
      activity_date: date,
      subject: typeof row.subject === "string" ? row.subject : "",
      seconds: Number.isFinite(seconds) && seconds > 0 ? seconds : 0,
    });
  }
  return rows;
}

/** Aşağı yuvarlanır: 0 dakikaya "1 ₺" yazmasın. */
export function savingsTl(seconds: number): number {
  return Math.floor((Math.max(0, seconds) / 3600) * TUTOR_TL_PER_HOUR);
}

/** "2 sa 47 dk", "35 dk", "0 dk". */
export function formatLearningDuration(seconds: number): string {
  const minutes = Math.floor(Math.max(0, seconds) / 60);
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (!hours) return `${rest} dk`;
  return rest ? `${hours} sa ${rest} dk` : `${hours} sa`;
}

/** Son 7 günün dakikası, eskiden yeniye. `today` YYYY-AA-GG (Türkiye). */
export function lastSevenDays(rows: LearningTimeRow[], today: string): { date: string; minutes: number }[] {
  const parsed = new Date(`${today}T12:00:00Z`);
  const base = Number.isNaN(parsed.getTime()) ? new Date() : parsed;
  const days = Array.from({ length: 7 }, (_, i) => {
    const day = new Date(base);
    day.setUTCDate(base.getUTCDate() - (6 - i));
    return day.toISOString().slice(0, 10);
  });
  const byDay = new Map<string, number>();
  for (const row of rows) byDay.set(row.activity_date, (byDay.get(row.activity_date) ?? 0) + row.seconds);
  return days.map((date) => ({ date, minutes: Math.round((byDay.get(date) ?? 0) / 60) }));
}

/** En çok süre ayrılan dersler; adı olmayan satır sayılmaz. */
export function favoriteSubjects(rows: LearningTimeRow[], limit = 5): string[] {
  const bySubject = new Map<string, number>();
  for (const row of rows) {
    const subject = typeof row.subject === "string" ? row.subject.trim() : "";
    if (!subject) continue;
    bySubject.set(subject, (bySubject.get(subject) ?? 0) + row.seconds);
  }
  return [...bySubject.entries()]
    .filter(([, seconds]) => seconds >= 60)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([subject]) => subject);
}
