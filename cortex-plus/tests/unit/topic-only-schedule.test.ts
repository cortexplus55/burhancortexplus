import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildTopicOnlySchedule,
  remapTopicIds,
  topicIdMap,
  topicOnlyScheduleTopics,
} from "@/lib/learning/topic-only-schedule";

/*
  19 Ekim 2026, canlıda öğrenci gibi kuruldu: "YKS biyoloji: hücre bölünmeleri" — beş konu, belge yok.
  Yol kalıp şablondan çıktı: konusuz tek "Giriş Dersi", "Podcast Dinle", "AI öğretmenle Soru-Cevap" …
  13 adım. Belgeli hazırlıkta yol konu konu kuruluyor; belgesiz hazırlık da artık aynı takvimden.
*/
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const TOPICS = ["Hücre bölünmeleri", "Mitoz", "Mayoz", "Eşeysiz ve eşeyli üreme", "Kromozom sayısı değişimleri"];

describe("belgesiz hazırlığın yolu", () => {
  it("her konunun kendi dersi var; kalıp 'Giriş Dersi' yok", () => {
    const { drafts } = buildTopicOnlySchedule({ daysToExam: 14, titles: TOPICS });
    const lessons = drafts.filter((draft) => draft.kind === "lesson");
    const lessonTopics = new Set(lessons.map((draft) => draft.meta?.topicTitle));
    for (const topic of TOPICS) expect(lessonTopics.has(topic), topic).toBe(true);
    expect(drafts.some((draft) => draft.title === "Giriş Dersi")).toBe(false);
    expect(drafts.some((draft) => draft.kind === "written_exam")).toBe(true);
  });

  it("geçici kimlikler kayıtlı konu kimliklerine çevrilir", () => {
    expect(topicOnlyScheduleTopics(["A", "B"], ["b"])).toEqual([
      { id: "topic:0", title: "A", selfHard: false },
      { id: "topic:1", title: "B", selfHard: true },
    ]);
    const { schedule, drafts } = buildTopicOnlySchedule({ daysToExam: 10, titles: TOPICS });
    const idFor = topicIdMap(TOPICS.map((_, index) => ({ id: `uuid-${index}`, sort_order: index })));
    const mappedDrafts = remapTopicIds(drafts, idFor);
    const mappedSchedule = remapTopicIds(schedule, idFor);
    const ids = new Set(mappedDrafts.map((draft) => draft.meta?.topicId).filter(Boolean));
    expect([...ids].every((id) => String(id).startsWith("uuid-"))).toBe(true);
    expect(JSON.stringify(mappedSchedule)).not.toContain("topic:");
    // Başlıklara dokunulmaz.
    expect(mappedDrafts.map((draft) => draft.title)).toEqual(drafts.map((draft) => draft.title));
  });

  it("kurulum rotası ve önizleme aynı takvimi kullanıyor", () => {
    const create = read("src/app/api/learning/exam-prep/create/route.ts");
    expect(create).toContain("const topicOnly = !documentIds.length && v2 && topics.length > 0;");
    expect(create).toContain("scheduleTopics = topicOnlyScheduleTopics(topics, parsed.data.hardTopics ?? []);");
    expect(create).toContain("scheduleSummary = remapTopicIds(scheduleSummary, idFor);");
    const intake = read("src/app/api/learning/exam-prep/intake/route.ts");
    expect(intake).toContain("buildTopicOnlySchedule({");
  });
});
