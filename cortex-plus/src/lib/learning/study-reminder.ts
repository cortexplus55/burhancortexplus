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
  /**
   * Bu hazırlıkta bugün günü gelen tekrar (20 Ekim 2026). Tekrar tarihe bağlı: öğrenci gün içinde
   * çalışmış olsa da 19:00'daki tek bildirim "N tekrar bekliyor" der (ürün sahibinin kararı).
   */
  dueReviews?: number;
};

export type Reminder = {
  kind: "exam_soon" | "review" | "streak" | "idle";
  title: string;
  body: string;
};

const KIND_RANK: Record<Reminder["kind"], number> = {
  exam_soon: 0,
  review: 1,
  streak: 2,
  idle: 3,
};

/**
 * Bir öğrencinin birden çok hazırlığı olduğunda hangisi konuşur.
 *
 * `pickReminder` tek bir hazırlık için en acil kuralı seçiyor, ama öğrenci
 * başına tek bildirim kuralı hazırlıklar ARASINDA da bir seçim gerektiriyor
 * ve orada seçim yoktu: cron sorgudan ilk dönen hazırlığı alıyordu. Canlıda
 * bir öğrencinin sınavına iki gün kalmış hazırlığı varken, sırf satır sırası
 * yüzünden başka bir hazırlığın "kaldığın yer seni bekliyor" mesajını
 * alabiliyordu.
 *
 * Sıra kuralın kendi sırası: sınav yaklaşması > günü gelen tekrar > seri > boş geçen gün.
 * Aynı türden ikisi varsa sınavı yakın olan öne geçer.
 */
export function moreUrgent(
  a: { reminder: Reminder; daysUntilExam: number | null },
  b: { reminder: Reminder; daysUntilExam: number | null },
): number {
  const rank = KIND_RANK[a.reminder.kind] - KIND_RANK[b.reminder.kind];
  if (rank !== 0) return rank;
  const da = a.daysUntilExam ?? Number.POSITIVE_INFINITY;
  const dbb = b.daysUntilExam ?? Number.POSITIVE_INFINITY;
  return da - dbb;
}

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
  // Sınav günü akşamı tekrar hatırlatması geç; o gün tekrar sayılmaz.
  const examDayOrPast = input.daysUntilExam !== null && input.daysUntilExam < 1;
  const due = examDayOrPast ? 0 : Math.max(0, Math.floor(input.dueReviews ?? 0));
  if (!input.hasUnfinishedPath && due === 0) return null;

  /**
   * SON ÜÇ GÜN, "tam olarak üçüncü gün" DEĞİL.
   *
   * Kural bir süre `=== 3` idi ve tek bir kaçan çalıştırma uyarıyı sessizce
   * yok ediyordu: cron günde bir kez çalışıyor, o gün çalışmazsa öğrenci
   * dördüncü günden ikinci güne atlıyor ve uyarıyı hiç almıyor. Canlıda
   * böyle bir hazırlık bulundu — sınavına iki gün kalmıştı ve uyarı
   * penceresi çoktan kapanmıştı.
   *
   * Aralık, eşitlikten dayanıklı. Günde en fazla bir bildirim kuralı zaten
   * yukarıda; son üç günde günde bir hatırlatma kovalamak değil.
   */
  if (
    input.daysUntilExam !== null &&
    input.daysUntilExam <= 3 &&
    input.daysUntilExam >= 1
  ) {
    return {
      kind: "exam_soon",
      title: `Sınava ${input.daysUntilExam} gün kaldı`,
      body:
        due > 0
          ? input.hasUnfinishedPath
            ? `Bugün ${due} tekrarın var; sonra kaldığın yerden devam et.`
            : `Bugün ${due} tekrarın var; birkaç dakika sürer.`
          : "Yolunda bitmemiş adımlar var. Kaldığın yerden devam et.",
    };
  }

  // Günü gelen tekrar seriden ve boş günden önce: tarihi geçerse tekrar bir gün kayar.
  if (due > 0) {
    return {
      kind: "review",
      title: `${due} tekrar bekliyor`,
      body: "Zorlandığın sorular ve dersin sınav noktaları bugün yeniden soruluyor; birkaç dakika sürer.",
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
