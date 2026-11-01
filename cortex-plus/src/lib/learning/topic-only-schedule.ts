import {
  buildExamScheduleV2,
  prepDailyMinutes,
  prepStudyDays,
  scheduleSessionsToNodeDrafts,
  type ScheduleBuildResult,
  type ScheduleTopicInput,
} from "@/lib/learning/exam-schedule-v2";
import { mergeStudyPathTemplate, type PlanNodeDraft } from "@/lib/learning/exam-prep-plan";

/**
 * Belgesiz hazırlığın yolu da konu konu kurulur (19 Ekim 2026).
 *
 * Canlıda öğrenci gibi kuruldu: "YKS biyoloji, hücre bölünmeleri" — beş konu. Belgesiz kurulumda
 * takvim hiç çalışmıyordu (`scheduleTopics` yalnız belgeden doluyordu); yol eski kalıp şablondan
 * çıktı: konusuz tek "Giriş Dersi", "Podcast Dinle", "AI öğretmenle Soru-Cevap" … 13 adım, beş konu
 * için tek ders. Belgeli hazırlıkta aynı sınav konu başına ders → pratik → tekrar diye dizilir.
 *
 * Konuların veritabanı kimliği hazırlık kaydedilince oluşur; takvim önce geçici kimlikle (`topic:0`)
 * kurulur, kayıttan sonra sıra numarasıyla gerçek kimliğe çevrilir (`remapTopicIds`). Düğüm rotası
 * konuyu `session_meta.topicId` ile arar; geçici kimlik kalsaydı ders konusunu bulamazdı.
 */
export const TOPIC_ONLY_ID_PREFIX = "topic:";

export function topicOnlyScheduleTopics(
  titles: string[],
  hardTopics: string[] = [],
  knownTopics: string[] = [],
): ScheduleTopicInput[] {
  const hard = new Set(hardTopics.map((topic) => topic.trim().toLocaleLowerCase("tr")));
  const known = new Set(knownTopics.map((topic) => topic.trim().toLocaleLowerCase("tr")));
  return titles.map((title, index) => ({
    id: `${TOPIC_ONLY_ID_PREFIX}${index}`,
    title,
    selfHard: hard.has(title.trim().toLocaleLowerCase("tr")),
    selfKnown: known.has(title.trim().toLocaleLowerCase("tr")) || undefined,
  }));
}

export function buildTopicOnlySchedule(input: {
  daysToExam: number;
  titles: string[];
  dailyMinutes?: number | null;
  studyDays?: number[] | null;
  hardTopics?: string[];
  knownTopics?: string[];
  targetScore?: number | null;
}): { schedule: ScheduleBuildResult; drafts: PlanNodeDraft[] } {
  const schedule = buildExamScheduleV2({
    daysToExam: input.daysToExam,
    dailyMinutes: prepDailyMinutes(input.dailyMinutes),
    studyDays: prepStudyDays(input.studyDays),
    topics: topicOnlyScheduleTopics(input.titles, input.hardTopics ?? [], input.knownTopics ?? []),
    targetScore: input.targetScore,
  });
  return { schedule, drafts: mergeStudyPathTemplate(scheduleSessionsToNodeDrafts(schedule.sessions)) };
}

/** Geçici konu kimliklerini (`topic:i`) gerçek kimliklerle değiştirir; başka hiçbir alana dokunmaz. */
export function remapTopicIds<T>(value: T, idFor: Map<string, string>): T {
  if (typeof value === "string") return (idFor.get(value) ?? value) as T;
  if (Array.isArray(value)) return value.map((item) => remapTopicIds(item, idFor)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>)) out[key] = remapTopicIds(item, idFor);
    return out as T;
  }
  return value;
}

/** Kayıttan sonra: `topic:i` → sıra numarası i olan `exam_prep_topics.id`. */
export function topicIdMap(rows: { id: string; sort_order: number }[]): Map<string, string> {
  return new Map(rows.map((row) => [`${TOPIC_ONLY_ID_PREFIX}${row.sort_order}`, row.id]));
}
