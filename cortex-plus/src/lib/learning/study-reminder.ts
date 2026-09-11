/**
 * Çalışma hatırlatması — hangi öğrenciye, ne diyeceğiz.
 *
 * Takvim kalktı: artık "bugünkü planını yapmadın" diyemeyiz, çünkü
 * öğrencinin bugün için bir planı yok. Yol duruyor ve öğrenci istediği
 * zaman ilerliyor. Hatırlatma da bu yüzden bir azar değil, bir hatırlatma:
 * "kaldığın yer burası".
 *
 * Kural burada, veritabanından ayrı duruyor ki sınanabilsin. Cron yalnızca
 * satırları okuyup buraya veriyor.
 */

export type ReminderInput = {
  /** Yolda bitmemiş adım var mı? Yoksa hatırlatacak bir şey yok. */
  hasUnfinishedPath: boolean;
  /** Son etkinlikten bu yana geçen saat; hiç etkinlik yoksa null. */
  hoursSinceActivity: number | null;
  /** Sınava kalan gün; tarih yoksa null. */
  daysUntilExam: number | null;
  /** Bugün kırılacak bir seri var mı ve kaç günlük? */
  streakDays: number;
  streakBreaksToday: boolean;
  /** Bu öğrenciye bugün zaten hatırlatma gönderildi mi? */
  alreadyNotifiedToday: boolean;
};

export type Reminder = {
  kind: "exam_soon" | "streak" | "idle";
  title: string;
  body: string;
};

/** Hiç etkinlik yoksa bile hazırlık kurulalı bu kadar saat geçtiyse say. */
const IDLE_HOURS = 24;

/**
 * Günde EN FAZLA BİR hatırlatma, en aciline göre.
 *
 * Üç kural da aynı gün tutabiliyor. Üçünü birden göndermek öğrenciyi
 * kovalamak olur; sınav yaklaşması seriyi, seri de boş geçen günü
 * bastırıyor.
 */
export function pickReminder(input: ReminderInput): Reminder | null {
  if (input.alreadyNotifiedToday) return null;
  if (!input.hasUnfinishedPath) return null;

  if (input.daysUntilExam !== null && input.daysUntilExam === 3) {
    return {
      kind: "exam_soon",
      title: "Sınava 3 gün kaldı",
      body: "Yolunda bitmemiş adımlar var. Kaldığın yerden devam et.",
    };
  }

  if (input.streakBreaksToday && input.streakDays >= 2) {
    return {
      kind: "streak",
      title: `${input.streakDays} günlük serin bugün kırılıyor`,
      body: "Tek bir adım seriyi sürdürmeye yeter.",
    };
  }

  if (input.hoursSinceActivity === null || input.hoursSinceActivity >= IDLE_HOURS) {
    return {
      kind: "idle",
      title: "Kaldığın yer seni bekliyor",
      body: "Yolundaki sıradaki adım hazır; istediğin zaman devam edebilirsin.",
    };
  }

  return null;
}
