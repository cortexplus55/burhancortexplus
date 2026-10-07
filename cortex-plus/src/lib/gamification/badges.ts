/**
 * Rozetler — öğrencinin yolculuğundaki on iki durak.
 *
 * Yapı referans üründen: roketten en yakın yıldıza uzanan bir yol, dokuz
 * rozet bir görevle, üçü yalnızca seriyle açılıyor. Metinler bizim.
 *
 * Rozetler bir yerde "verilmiyor", her açılışta kayıtlı işten HESAPLANIYOR.
 * İki sebebi var: (1) sistem gelmeden önce yapılanlar da sayılıyor — hiçbir
 * öğrenci bir görevi rozet için tekrar etmek zorunda kalmıyor; (2) ayrı bir
 * "kazanılan rozetler" tablosu, kaynak veriyle ayrışabilecek ikinci bir
 * doğru olurdu.
 *
 * Kazanıldığı tarih de kayıttan çıkıyor: ilk sınav planı hangi gün
 * oluşturulduysa o gün. Tarihi bilinmeyen tek şey anlık ölçümler (konu
 * ustalığı, hazırlık tahmini); onlarda ölçümün son güncellendiği gün
 * gösteriliyor.
 */

export type BadgeId =
  | "roket"
  | "dunya"
  | "ay-yorunge"
  | "ay"
  | "venus"
  | "mars"
  | "jupiter"
  | "saturn"
  | "uranus"
  | "neptun"
  | "yildizlararasi"
  | "ilk-yildiz";

/** Rozetlerin hesaplandığı ham kayıtlar. Tarihler ISO zaman damgası. */
export type BadgeFacts = {
  /** AI öğretmenin bu öğrenciye verdiği ilk yanıt. */
  firstAnswerAt: string | null;
  firstPrepAt: string | null;
  /** Tamamlanan ders düğümlerinin bitiş zamanları. */
  lessonCompletions: string[];
  /** Çalışılan günler, YYYY-MM-DD (İstanbul günü). */
  activityDays: string[];
  firstMockExamAt: string | null;
  firstUploadAt: string | null;
  firstVoiceAt: string | null;
  /** En iyi konu: ustalık yüzdesi ve ustalaşıldı sayılıp sayılmadığı. */
  bestTopic: { pct: number; mastered: boolean; at: string | null } | null;
  firstReferralAt: string | null;
  /** En yüksek hazırlık tahmini (yüzde) ve ölçüldüğü an. */
  bestReadiness: { pct: number; at: string | null } | null;
  /** Görev bağlantıları için son sınav hazırlığı. */
  latestPrepId: string | null;
  /** Bugün, YYYY-MM-DD (İstanbul). */
  today: string;
};

export type BadgeState = {
  id: BadgeId;
  name: string;
  /** Karttaki kısa görev adı. */
  task: string;
  /** "Sıradaki görev" kartındaki cümle. */
  goal: string;
  kind: "task" | "streak";
  unlocked: boolean;
  unlockedAt: string | null;
  /** Kilitliyken ilerleme; ikili görevlerde (ilk X) yok. */
  progress: { value: number; target: number; label: string } | null;
  cta: { label: string; href: string };
};

export type StreakSummary = {
  current: number;
  longest: number;
  /** Pazartesiden pazara bu hafta; true = o gün çalışıldı. */
  week: { iso: string; label: string; active: boolean; isToday: boolean }[];
};

export type BadgeJourney = {
  streak: StreakSummary;
  badges: BadgeState[];
  unlockedCount: number;
  /** Sıradaki görev — yol sırasındaki ilk kilitli rozet. */
  next: BadgeState | null;
  /** Sıradaki seri rozeti. */
  nextStreak: BadgeState | null;
  /** Seri penceresinin altındaki "Bugün 12 / 30 dk" (Astra gibi). */
  dailyGoal?: { goalMinutes: number; todayMinutes: number } | null;
};

const STREAK_TARGETS: Partial<Record<BadgeId, number>> = { ay: 3, saturn: 7, neptun: 30 };
const LESSON_TARGET = 3;
const MASTERY_TARGET = 80;
const READINESS_TARGET = 80;

const DAY_MS = 86_400_000;

/** 1970-01-01'den beri gün sayısı (öğlen UTC'den tabana: yaz saati kaydırmaz). */
function dayNumber(iso: string): number {
  return Math.floor(Date.parse(`${iso}T12:00:00Z`) / DAY_MS);
}

/** Tekrarsız, sıralı gün listesi. */
function uniqueDays(days: string[]): string[] {
  return [...new Set(days.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d)))].sort();
}

/** Art arda `n` güne ilk ulaşılan gün; ulaşılmadıysa null. */
export function firstDayReachingRun(days: string[], n: number): string | null {
  const sorted = uniqueDays(days);
  let run = 0;
  let prev: number | null = null;
  for (const day of sorted) {
    const num = dayNumber(day);
    run = prev !== null && num - prev === 1 ? run + 1 : 1;
    prev = num;
    if (run >= n) return day;
  }
  return null;
}

export function longestRun(days: string[]): number {
  const sorted = uniqueDays(days);
  let best = 0;
  let run = 0;
  let prev: number | null = null;
  for (const day of sorted) {
    const num = dayNumber(day);
    run = prev !== null && num - prev === 1 ? run + 1 : 1;
    prev = num;
    best = Math.max(best, run);
  }
  return best;
}

/**
 * Bugüne uzanan seri. Bugün henüz çalışılmadıysa dünden sayılır — gün
 * bitmedi; dün de boşsa seri kırılmıştır ve 0'dır.
 */
export function currentRun(days: string[], today: string): number {
  const set = new Set(uniqueDays(days).map(dayNumber));
  let cursor = dayNumber(today);
  if (!set.has(cursor)) cursor -= 1;
  let run = 0;
  while (set.has(cursor)) {
    run += 1;
    cursor -= 1;
  }
  return run;
}

const WEEK_LABELS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

function isoFromDayNumber(num: number): string {
  return new Date(num * DAY_MS).toISOString().slice(0, 10);
}

export function weekOf(days: string[], today: string): StreakSummary["week"] {
  const set = new Set(uniqueDays(days));
  const todayNum = dayNumber(today);
  // 1970-01-01 perşembe; pazartesi = 0 olacak şekilde kaydır.
  const weekday = (((todayNum + 3) % 7) + 7) % 7;
  const monday = todayNum - weekday;
  return WEEK_LABELS.map((label, i) => {
    const iso = isoFromDayNumber(monday + i);
    return { iso, label, active: set.has(iso), isToday: i === weekday };
  });
}

type Definition = {
  id: BadgeId;
  name: string;
  task: string;
  goal: string;
  kind: BadgeState["kind"];
};

/** Yol sırası — kartlar ve "sıradaki görev" bu sırayı izliyor. */
export const BADGE_DEFINITIONS: Definition[] = [
  { id: "roket", name: "İlk Roket", task: "AI öğretmene ilk soru", goal: "AI öğretmene bir soru sor, ilk yanıtını al", kind: "task" },
  { id: "dunya", name: "Dünya Yörüngesi", task: "İlk sınav planı", goal: "İlk sınav hazırlığını oluştur", kind: "task" },
  { id: "ay-yorunge", name: "Ay Yörüngesi", task: "3 ders bitir", goal: "Sınav planından 3 ders tamamla", kind: "task" },
  { id: "ay", name: "Ay", task: "3 günlük seri", goal: "3 gün üst üste çalış", kind: "streak" },
  { id: "venus", name: "Venüs", task: "İlk deneme sınavı", goal: "Bir deneme sınavını sonuna kadar çöz", kind: "task" },
  { id: "mars", name: "Mars", task: "İlk belge ya da fotoğraf", goal: "Bir PDF, not ya da fotoğraf yükle", kind: "task" },
  { id: "jupiter", name: "Jüpiter", task: "İlk sesli çalışma", goal: "Soru-Cevap ya da sözlü denemeyi sesli modda yap", kind: "task" },
  { id: "saturn", name: "Satürn", task: "7 günlük seri", goal: "7 gün üst üste çalış", kind: "streak" },
  { id: "uranus", name: "Uranüs", task: "Bir konuda %80", goal: "Bir konuda %80 ustalığa ulaş", kind: "task" },
  { id: "neptun", name: "Neptün", task: "30 günlük seri", goal: "30 gün üst üste çalış", kind: "streak" },
  { id: "yildizlararasi", name: "Yıldızlararası", task: "Bir arkadaşını davet et", goal: "Davet bağlantınla bir arkadaşın kaydolsun", kind: "task" },
  { id: "ilk-yildiz", name: "İlk Yıldız", task: "Sınava %80 hazır", goal: "Bir sınavda hazırlık tahminini %80'e çıkar", kind: "task" },
];

function prepHref(facts: BadgeFacts, suffix = ""): string {
  return facts.latestPrepId
    ? `/deneme-sinavlari/${facts.latestPrepId}${suffix}`
    : "/deneme-sinavlari/olustur";
}

function ctaFor(id: BadgeId, facts: BadgeFacts): BadgeState["cta"] {
  switch (id) {
    case "roket":
      return { label: "AI öğretmene sor", href: "/ogretmen" };
    case "dunya":
      return { label: "Sınav hazırlığı oluştur", href: "/deneme-sinavlari/olustur" };
    case "ay-yorunge":
      return { label: "Sıradaki derse geç", href: prepHref(facts) };
    case "venus":
      return { label: "Deneme sınavı çöz", href: prepHref(facts, "/deneme/kurulum") };
    case "mars":
      return { label: "Belge yükle", href: "/dokumanlar" };
    case "jupiter":
      return { label: "Sesli çalış", href: prepHref(facts) };
    case "uranus":
      return { label: "Bir konuda alıştırma yap", href: prepHref(facts) };
    case "yildizlararasi":
      return { label: "Arkadaşını davet et", href: "/davet" };
    case "ilk-yildiz":
      return { label: "Hazırlık durumuna bak", href: prepHref(facts) };
    default:
      return { label: "Bugün çalış", href: "/ogretmen" };
  }
}

function evaluate(def: Definition, facts: BadgeFacts): Pick<BadgeState, "unlocked" | "unlockedAt" | "progress"> {
  const streakTarget = STREAK_TARGETS[def.id];
  if (streakTarget) {
    const at = firstDayReachingRun(facts.activityDays, streakTarget);
    if (at) return { unlocked: true, unlockedAt: at, progress: null };
    const now = currentRun(facts.activityDays, facts.today);
    const left = streakTarget - now;
    return {
      unlocked: false,
      unlockedAt: null,
      progress: { value: now, target: streakTarget, label: `${left} gün daha` },
    };
  }

  const once = (at: string | null) => ({ unlocked: Boolean(at), unlockedAt: at, progress: null });

  switch (def.id) {
    case "roket":
      return once(facts.firstAnswerAt);
    case "dunya":
      return once(facts.firstPrepAt);
    case "ay-yorunge": {
      const done = [...facts.lessonCompletions].sort();
      if (done.length >= LESSON_TARGET) {
        return { unlocked: true, unlockedAt: done[LESSON_TARGET - 1], progress: null };
      }
      return {
        unlocked: false,
        unlockedAt: null,
        progress: { value: done.length, target: LESSON_TARGET, label: `${done.length} / ${LESSON_TARGET} ders` },
      };
    }
    case "venus":
      return once(facts.firstMockExamAt);
    case "mars":
      return once(facts.firstUploadAt);
    case "jupiter":
      return once(facts.firstVoiceAt);
    case "uranus": {
      const best = facts.bestTopic;
      if (best?.mastered) return { unlocked: true, unlockedAt: best.at, progress: null };
      const pct = Math.max(0, Math.min(MASTERY_TARGET, Math.round(best?.pct ?? 0)));
      return {
        unlocked: false,
        unlockedAt: null,
        progress: { value: pct, target: MASTERY_TARGET, label: `%${pct} / %${MASTERY_TARGET}` },
      };
    }
    case "yildizlararasi":
      return once(facts.firstReferralAt);
    case "ilk-yildiz": {
      const best = facts.bestReadiness;
      if (best && best.pct >= READINESS_TARGET) {
        return { unlocked: true, unlockedAt: best.at, progress: null };
      }
      const pct = Math.max(0, Math.round(best?.pct ?? 0));
      return {
        unlocked: false,
        unlockedAt: null,
        progress: { value: pct, target: READINESS_TARGET, label: `%${pct} / %${READINESS_TARGET}` },
      };
    }
    default:
      return once(null);
  }
}

export function buildBadgeJourney(facts: BadgeFacts): BadgeJourney {
  const badges: BadgeState[] = BADGE_DEFINITIONS.map((def) => ({
    ...def,
    ...evaluate(def, facts),
    cta: ctaFor(def.id, facts),
  }));
  const current = currentRun(facts.activityDays, facts.today);
  return {
    streak: {
      current,
      longest: Math.max(current, longestRun(facts.activityDays)),
      week: weekOf(facts.activityDays, facts.today),
    },
    badges,
    unlockedCount: badges.filter((b) => b.unlocked).length,
    next: badges.find((b) => !b.unlocked && b.kind === "task") ?? badges.find((b) => !b.unlocked) ?? null,
    nextStreak: badges.find((b) => !b.unlocked && b.kind === "streak") ?? null,
  };
}

/** "12 Eylül 2026" — kazanıldığı gün, İstanbul takvimiyle. */
export function formatBadgeDate(value: string | null): string | null {
  if (!value) return null;
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? new Date(`${value}T12:00:00Z`) : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("tr-TR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    timeZone: "Europe/Istanbul",
  });
}
