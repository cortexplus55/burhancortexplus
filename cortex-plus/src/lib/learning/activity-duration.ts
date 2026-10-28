import type { PlanNodeKind } from "@/lib/learning/exam-prep-plan";

/**
 * Bir etkinliğin öğrenciye yazılan süresi (25 Ekim 2026, canlı test P1-7). Üç kaynak ayrışıyordu: yol kartı
 * takvim bütçesini (~22 dk), kapı başka bir sayıyı, ders çubuğu okuma süresini (~2 dk) yazıyordu. Yol, kapı ve
 * ders çubuğu bu tek fonksiyonu okur; takvimin `durationMinutes` bütçesi öğrenciye yazılmaz.
 */

/** Ders, içeriği kısa da olsa en az bu kadar sürer (okuma + ekran soruları). */
export const LESSON_MIN_MINUTES = 5;

/** İçerik bilinmezken türün tipik süresi. */
const KIND_MINUTES: Record<PlanNodeKind, number> = {
  lesson: LESSON_MIN_MINUTES,
  quiz: 8,
  true_false: 5,
  gaps: 8,
  focused: 8,
  spaced: 6,
  flashcards: 6,
  podcast: 6,
  oral: 10,
  qa: 8,
  final_check: 10,
  written_exam: 30,
  readiness: 5,
};

export type ActivityContent = {
  /** Kayıtlı (ya da açılışta ölçülen) süre: `session_meta.activityMinutes`. */
  known?: number | null;
  /** Dersin okuma süresi (`honestReadingMinutes`). */
  readingMinutes?: number | null;
  /** Test, doğru/yanlış, kart, sözlü öğe sayısı. */
  itemCount?: number | null;
  /** Podcast ya da deneme süresi. */
  minutes?: number | null;
};

const PER_ITEM_MINUTES: Partial<Record<PlanNodeKind, number>> = {
  quiz: 1.2,
  gaps: 1.2,
  focused: 1.2,
  final_check: 1.2,
  true_false: 0.5,
  flashcards: 0.6,
  spaced: 0.6,
  oral: 2,
  qa: 1.5,
};

function positive(value: number | null | undefined): number | null {
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;
}

export function activityDurationMinutes(kind: PlanNodeKind, content: ActivityContent = {}): number {
  const floor = kind === "lesson" ? LESSON_MIN_MINUTES : 1;
  const known = positive(content.known);
  if (known) return Math.max(floor, Math.round(known));
  if (kind === "lesson") return Math.max(LESSON_MIN_MINUTES, Math.round(positive(content.readingMinutes) ?? 0));
  const minutes = positive(content.minutes);
  if (minutes) return Math.max(1, Math.round(minutes));
  const items = positive(content.itemCount);
  const perItem = PER_ITEM_MINUTES[kind];
  if (items && perItem) return Math.max(2, Math.round(items * perItem));
  return KIND_MINUTES[kind];
}

/**
 * Dersin adım paydası: yalnız yazılmış ekran listesi. Gelecek kavram adları ekran değildir;
 * paydaya eklenirse sayaç 1/2 iken 5/5'e sıçrar.
 */
export function lessonStepTotal(writtenSteps: number, _pendingConcepts = 0): number {
  void _pendingConcepts;
  return Math.max(1, Math.max(0, Math.floor(writtenSteps)));
}

export type LessonStepCounter = {
  now: number;
  /** İlerleme çubuğunun paydası. */
  max: number;
  /** "3 / 8" ya da payda henüz bilinmiyorsa "3". */
  label: string;
};

/**
 * Ders yazılırken adım sayacı (28 Ekim 2026). Kavramlar geldikçe payda büyüyordu: öğrenci "1 / 2"
 * görüp bir sonraki tazelemede "1 / 8" görüyordu. Yazım sürerken payda yazarın baştaki planıdır
 * (giriş kartı + planlanan ekranlar + özet) ve yazılan adımlar onu geçmedikçe değişmez; plan yoksa
 * ya da yazılanlar planı geçtiyse sayaç yalnız "Adım N" der. Yazım bitince payda yazılan adımlardır.
 */
export function lessonStepCounter(input: {
  index: number;
  writtenSteps: number;
  building: boolean;
  plannedScreens?: number | null;
}): LessonStepCounter {
  const written = lessonStepTotal(input.writtenSteps);
  if (!input.building) {
    const now = Math.min(Math.max(0, input.index) + 1, written);
    return { now, max: written, label: `${now} / ${written}` };
  }
  const screens = input.plannedScreens;
  const planned = typeof screens === "number" && Number.isInteger(screens) && screens > 0 ? screens + 2 : null;
  // Yazım sürerken bir "hazırlanıyor" adımı daha var: yazılan + 1.
  const reach = written + 1;
  const max = planned && planned >= reach ? planned : reach;
  const now = Math.min(Math.max(0, input.index) + 1, max);
  return { now, max, label: planned && planned >= reach ? `${now} / ${planned}` : `${now}` };
}

/** Harcanan zaman: oturumun başlangıcından bitişine; boş ya da geçersiz başlangıç 1 dk sayılır. */
export function elapsedMinutes(startedAt: string | number | null | undefined, endedAt: number = Date.now()): number {
  const start = typeof startedAt === "number" ? startedAt : startedAt ? Date.parse(startedAt) : NaN;
  if (!Number.isFinite(start) || start > endedAt) return 1;
  return Math.max(1, Math.round((endedAt - start) / 60_000));
}
