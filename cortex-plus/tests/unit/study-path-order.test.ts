import { describe, expect, it } from "vitest";
import { groupNodesByPhase } from "@/lib/learning/exam-plan-phases";
import { mergeStudyPathTemplate } from "@/lib/learning/exam-prep-plan";
import {
  buildExamScheduleV2,
  canPromoteForWeight,
  orderTopicsByPrerequisites,
  scheduleSessionsToNodeDrafts,
  type ScheduleTopicInput,
} from "@/lib/learning/exam-schedule-v2";

const FROM = new Date("2026-09-25T12:00:00");

function learnTitles(topics: ScheduleTopicInput[], daysToExam = 23, dailyMinutes = 45) {
  const plan = buildExamScheduleV2({
    daysToExam,
    dailyMinutes,
    studyDays: [1, 2, 3, 4, 5],
    topics,
    fromDate: FROM,
  });
  return plan.sessions.filter((session) => session.role === "learn").map((session) => session.topicTitle);
}

const CHEMISTRY: ScheduleTopicInput[] = [
  {
    id: "1",
    title: "Mol kavramı ve Avogadro sayısı",
    examHeavy: true,
    weightPercent: 10,
    prerequisites: [],
    pageNumbers: [1, 2, 3],
    sourceRefs: [
      { documentId: "pdf", fileName: "pdf-12-sayfa.pdf", pages: [1, 2, 3], nodeId: null },
      { documentId: "docx", fileName: "ders-konulari.docx", pages: [1], nodeId: null },
    ],
  },
  {
    id: "2",
    title: "Mol kütlesi ve kütle–mol hesapları",
    examHeavy: true,
    weightPercent: 15,
    prerequisites: ["Mol kavramı ve Avogadro sayısı"],
    pageNumbers: [4],
    sourceRefs: [
      { documentId: "pdf", fileName: "pdf-12-sayfa.pdf", pages: [4], nodeId: null },
    ],
  },
  {
    id: "3",
    title: "Gazlarda molar hacim ve ideal gaz denklemi",
    weightPercent: 10,
    prerequisites: ["Mol kavramı ve Avogadro sayısı"],
    pageNumbers: [1],
  },
  {
    id: "4",
    title: "Kimyanın temel kanunları",
    weightPercent: 5,
    prerequisites: [],
  },
  {
    id: "5",
    title: "Kimyasal tepkimeler, denkleştirme ve tepkime türleri",
    weightPercent: 10,
    prerequisites: [],
  },
  {
    id: "6",
    title: "Stokiyometri: sınırlayıcı bileşen ve verim",
    examHeavy: true,
    weightPercent: 25,
    prerequisites: ["Mol kavramı ve Avogadro sayısı", "Mol kütlesi ve kütle–mol hesapları"],
  },
  {
    id: "7",
    title: "Çözeltiler",
    weightPercent: 15,
    prerequisites: ["Mol kavramı ve Avogadro sayısı"],
  },
  {
    id: "8",
    title: "Asitler ve bazlar (temel düzey)",
    weightPercent: 10,
    prerequisites: ["Çözeltiler"],
  },
];

describe("study path order", () => {
  it("teaches chemistry in prerequisite order and does not repeat the same quiz title", () => {
    const plan = buildExamScheduleV2({
      daysToExam: 23,
      dailyMinutes: 45,
      studyDays: [1, 2, 3, 4, 5],
      topics: CHEMISTRY,
      fromDate: FROM,
    });
    const learns = plan.sessions.filter((session) => session.role === "learn").map((session) => session.topicId);
    expect(learns.indexOf("1")).toBeLessThan(learns.indexOf("2"));
    expect(learns.indexOf("2")).toBeLessThan(learns.indexOf("7"));
    expect(learns.indexOf("6")).toBeGreaterThan(learns.indexOf("2"));
    expect(learns.indexOf("7")).toBeLessThan(learns.indexOf("8"));
    const learnDays = new Map(
      plan.sessions.filter((session) => session.role === "learn").map((session) => [session.topicId, session.dayIndex]),
    );
    expect(learnDays.get("2")).toBeGreaterThanOrEqual(learnDays.get("1")!);
    expect(learnDays.get("7")).toBeGreaterThanOrEqual(learnDays.get("2")!);

    const drafts = scheduleSessionsToNodeDrafts(plan.sessions);
    const merged = mergeStudyPathTemplate(drafts);
    const learnPhase = groupNodesByPhase(merged).find((group) => group.phase.id === "learn");
    const titles = learnPhase?.nodes.map((node) => node.title) ?? [];
    const solutions = titles.findIndex((title) => title.startsWith("Çözeltiler · Ders"));
    const mass = titles.findIndex((title) => title.startsWith("Mol kütlesi"));
    expect(mass).toBeGreaterThanOrEqual(0);
    expect(solutions).toBeGreaterThan(mass);

    for (let index = 1; index < merged.length; index += 1) {
      const prev = merged[index - 1];
      const next = merged[index];
      if (prev.meta?.topicId && prev.meta.topicId === next.meta?.topicId) {
        expect(next.title).not.toBe(prev.title);
      }
    }
    const heavy = drafts.filter((node) => node.meta?.topicId === "1" && node.kind === "quiz");
    expect(heavy.map((node) => node.title)).toEqual([
      "Mol kavramı ve Avogadro sayısı · Testler ve Doğru/Yanlış",
      "Mol kavramı ve Avogadro sayısı · Tekrar testi (karışık)",
      "Mol kavramı ve Avogadro sayısı · Zor sorular",
    ]);
    expect(heavy[1]?.meta?.objective).toMatch(/karışık bir tekrar/);
    expect(heavy[2]?.meta?.objective).toMatch(/daha zor sorular/);
    expect(drafts.filter((node) => node.meta?.topicId === "4" && node.kind === "quiz")).toHaveLength(1);

    const prepWide = new Set(["written_exam", "gaps", "focused", "flashcards", "final_check", "readiness"]);
    for (const node of merged) {
      if (prepWide.has(node.kind)) {
        expect(node.title).toContain("Tüm konular");
        continue;
      }
      expect(node.meta?.topicTitle).toBeTruthy();
      expect(node.title).toContain(node.meta?.topicTitle);
    }
    expect(merged.some((node) => node.kind === "true_false")).toBe(false);
    expect(merged.find((node) => node.kind === "podcast")?.title).toMatch(/Mol kavramı/);
    const mol = drafts.find((node) => node.meta?.topicId === "1");
    expect(mol?.meta?.sourcePages).toEqual([]);
    expect(mol?.title).not.toMatch(/s\.1/);
    const massDraft = drafts.find((node) => node.meta?.topicId === "2" && node.kind === "lesson");
    expect(massDraft?.title).toContain("pdf-12-sayfa s.4");
    expect(massDraft?.meta?.sourcePages).toEqual([]);
    expect(plan.sessions.length).toBeLessThan(40);
    expect(plan.sessions.length).toBeGreaterThan(8);
  });

  it("keeps historical eras in chronological order even on a short calendar", () => {
    const eras: ScheduleTopicInput[] = [
      { id: "ilk", title: "İlk Çağ" },
      { id: "orta", title: "Orta Çağ", prerequisites: ["İlk Çağ"] },
      { id: "yeni", title: "Yeni Çağ", prerequisites: ["Orta Çağ"] },
    ];
    expect(learnTitles(eras, 8, 20)).toEqual(["İlk Çağ", "Orta Çağ", "Yeni Çağ"]);
  });

  it("does not let importance jump a topic when there is no syllabus weight", () => {
    const topics: ScheduleTopicInput[] = [
      { id: "1", title: "Giriş konusu" },
      { id: "2", title: "Orta konu", importance: "important" },
      { id: "3", title: "Son konu" },
    ];
    expect(canPromoteForWeight(topics[1])).toBe(false);
    expect(orderTopicsByPrerequisites(topics).map((topic) => topic.id)).toEqual(["1", "2", "3"]);
    expect(learnTitles(topics)).toEqual(["Giriş konusu", "Orta konu", "Son konu"]);
  });

  it("moves an independent exam-weighted topic earlier, never ahead of its prerequisite", () => {
    const independent: ScheduleTopicInput[] = [
      { id: "light", title: "Hafif konu", weightPercent: 5 },
      { id: "heavy", title: "Ağır konu", examHeavy: true, weightPercent: 30 },
    ];
    expect(learnTitles(independent)).toEqual(["Ağır konu", "Hafif konu"]);

    const dependent: ScheduleTopicInput[] = [
      { id: "base", title: "Temel konu", weightPercent: 5 },
      {
        id: "heavy",
        title: "Ağır konu",
        examHeavy: true,
        weightPercent: 30,
        prerequisites: ["Temel konu"],
      },
    ];
    expect(learnTitles(dependent)).toEqual(["Temel konu", "Ağır konu"]);
  });
});
