import { describe, expect, it } from "vitest";
import { isJunkTopicTitle } from "@/lib/documents/topic-title";
import { applyMainGroups, mainGroupingPrompt, type SubTopic } from "@/lib/documents/topic-main-groups";
import {
  buildExamScheduleV2,
  lessonPageChunks,
  redistributeRemainingSchedule,
  scheduleSessionsToNodeDrafts,
} from "@/lib/learning/exam-schedule-v2";

/*
  28 Eylül 2026: 211 sayfalık KPSS Vatandaşlık belgesinden 111 konu çıktı;
  Astra aynı belgeden 12 ana konu çıkarıyor. Ürün sahibi Astra gibi 10–15
  ana konu seçti (30 Eylül 2026).
*/
describe("çöp konu başlığı", () => {
  it.each([
    'Aşağıdakilerden hangisi ceza hukukunda "suçta',
    "Bir kimsenin kendi davranışı ile lehine haklar,",
    "Anayasası'nın değiştirilemeyecek hüküm-",
    '"Türkiye Devleti, ülkesi ve milletiyle bölünmez',
    "```plaintext",
    "maddeye göre",
    "KPSS Test 1",
    "KPSS",
    "Durum",
    "Millî Güvenlik Kurulu ile ilgili aşağıdakilerden",
  ])("%s konu olamaz", (title) => {
    expect(isJunkTopicTitle(title)).toBe(true);
  });

  it.each([
    "KPSS HUKUKUN TEMEL KAVRAMLARI",
    "Yasama Sorumsuzluğu",
    "Bakanlar",
    "Anayasa Hukuku: Tanım ve İlkeler",
    "Türk Medeni Kanunu ve Gerçek Kişilerin Hak Ehliyeti",
    "pH ve Asit-Baz Dengesi",
    "Toplu İş Sözleşmesi, Grev Hakkı ve Lokavt",
  ])("%s konudur", (title) => {
    expect(isJunkTopicTitle(title)).toBe(false);
  });
});

function subs(count: number): SubTopic[] {
  return Array.from({ length: count }, (_, i) => ({
    title: `Alt Başlık Numara ${String.fromCharCode(65 + (i % 26))}${i}`,
    pageNumbers: [i * 2 + 1, i * 2 + 2],
  }));
}

function groupsOf(size: number, count: number) {
  return Array.from({ length: Math.ceil(count / size) }, (_, g) => ({
    title: `Ana Konu Grubu ${String.fromCharCode(65 + g)}`,
    learningObjective: "Bu bölümün temel kavramlarını açıklar.",
    members: Array.from({ length: size }, (_, k) => g * size + k).filter((m) => m < count),
  }));
}

describe("ana konulara toplama", () => {
  it("her alt başlık bir ana konuya girer, sayfalar birleşir, sıra korunur", () => {
    const list = subs(40);
    const grouped = applyMainGroups(list, { groups: groupsOf(4, 40).reverse() });
    expect(grouped).not.toBeNull();
    expect(grouped!.length).toBe(10);
    expect(grouped![0].title).toBe("Ana Konu Grubu A");
    expect(grouped![0].pageNumbers).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(grouped!.flatMap((g) => g.members)).toHaveLength(40);
  });

  it("modelin unuttuğu alt başlık komşusunun grubuna gider", () => {
    const list = subs(40);
    const groups = groupsOf(4, 40);
    groups[2].members = groups[2].members.filter((m) => m !== 9);
    const grouped = applyMainGroups(list, { groups });
    expect(grouped!.find((g) => g.members.includes(list[9].title))?.title).toBe("Ana Konu Grubu C");
  });

  it("aralık dışı grup sayısı ya da çöp başlıkta harita gruplanmadan kalır", () => {
    const list = subs(40);
    expect(applyMainGroups(list, { groups: groupsOf(2, 40) })).toBeNull();
    expect(applyMainGroups(list, { groups: groupsOf(10, 40) })).toBeNull();
    const junk = groupsOf(4, 40);
    junk[0].title = "Aşağıdakilerden hangisi doğrudur";
    expect(applyMainGroups(list, { groups: junk })).toBeNull();
    expect(applyMainGroups(list, null)).toBeNull();
  });

  it("istem her alt başlığı sayfasıyla ve aralığı söyler", () => {
    const prompt = mainGroupingPrompt("kpss.pdf", subs(20));
    expect(prompt).toContain("10–15 ana konuda topla");
    expect(prompt).toContain("19. Alt Başlık Numara T19 (s.39–40)");
  });
});

describe("büyük konu ders ders", () => {
  it("4 sayfaya kadar tek ders, sonra ~3 sayfalık dersler", () => {
    expect(lessonPageChunks([3, 1, 2])).toEqual([[1, 2, 3]]);
    expect(lessonPageChunks([1, 2, 3, 4])).toEqual([[1, 2, 3, 4]]);
    expect(lessonPageChunks([1, 2, 3, 4, 5, 6, 7])).toEqual([[1, 2, 3], [4, 5, 6, 7]]);
    expect(lessonPageChunks(Array.from({ length: 18 }, (_, i) => i + 1))).toHaveLength(6);
    expect(lessonPageChunks([])).toEqual([[]]);
  });

  const topics = [
    { id: "a", title: "Yasama Organı ve TBMM", pageNumbers: Array.from({ length: 9 }, (_, i) => i + 10) },
    { id: "b", title: "Yürütme Organı", pageNumbers: [30, 31] },
  ];
  const plan = buildExamScheduleV2({
    daysToExam: 20,
    dailyMinutes: 60,
    studyDays: [1, 2, 3, 4, 5, 6, 7],
    topics,
    fromDate: new Date("2026-10-01T12:00:00"),
  });

  it("dersler sırayla gelir ve kendi sayfalarını okur", () => {
    const lessons = plan.sessions.filter((s) => s.role === "learn" && s.topicId === "a");
    expect(lessons.map((s) => s.lessonPart)).toEqual([1, 2, 3]);
    expect(lessons.map((s) => s.sourcePages)).toEqual([[10, 11, 12], [13, 14, 15], [16, 17, 18]]);
    for (let i = 1; i < lessons.length; i += 1) {
      expect(lessons[i].dayIndex).toBeGreaterThanOrEqual(lessons[i - 1].dayIndex);
    }
    const small = plan.sessions.filter((s) => s.role === "learn" && s.topicId === "b");
    expect(small).toHaveLength(1);
    expect(small[0].lessonPart).toBeUndefined();
    const titles = scheduleSessionsToNodeDrafts(lessons).map((d) => d.title);
    expect(titles[1]).toContain("Ders 2/3");
  });

  it("birinci dersi bitiren öğrencinin ikinci dersi yeniden planlamada kalır", () => {
    const first = plan.sessions.find((s) => s.role === "learn" && s.topicId === "a" && s.lessonPart === 1)!;
    const rebuilt = redistributeRemainingSchedule({
      previous: plan,
      completed: [{ sortOrder: first.sortOrder, calendarDate: first.calendarDate, kind: first.kind }],
      dailyMinutes: 60,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      daysToExam: 18,
      topics,
      fromDate: new Date("2026-10-03T12:00:00"),
    });
    const parts = rebuilt.sessions
      .filter((s) => s.role === "learn" && s.topicId === "a")
      .map((s) => s.lessonPart)
      .sort();
    expect(parts).toEqual([1, 2, 3]);
  });
});
