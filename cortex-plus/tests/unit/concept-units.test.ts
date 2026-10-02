import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { needsUnits, pageLead, unitsFromModel, validateUnits } from "@/lib/documents/concept-units";
import { buildExamScheduleV2, scheduleSessionsToNodeDrafts, topicLessonChunks } from "@/lib/learning/exam-schedule-v2";
import { parseSessionMeta } from "@/lib/learning/teaching-standards";

/*
  Kavram birimleri (2 Ekim 2026, ürün sahibinin kararı: "ana konu + içinde
  dersler"). Altın deneme: KPSS s.5–28 (24 sayfa) 8 birime, s.60–78 6 birime
  ayrıldı ("Hukuk kurallarının yaptırımları" s.7–9…). Mekanik bölme dersi
  "(2/5)" diye adlandırıp kavramın ortasından kesiyordu.
*/
describe("kavram birimi doğrulama", () => {
  const pages = [5, 6, 7, 8, 9, 10, 11];

  it("geçerli bölme: sırayla, eksiksiz, ardışık, 1-6 sayfa, farklı adlar", () => {
    const units = validateUnits(pages, [
      { title: "HUKUK KURALLARININ ÖZELLİKLERİ", pages: [5, 6] },
      { title: "Hukuk kurallarının yaptırımları", pages: [7, 8, 9] },
      { title: "Hukukun kaynakları", pages: [10, 11] },
    ]);
    expect(units?.map((unit) => unit.title)).toEqual([
      "Hukuk Kurallarının Özellikleri",
      "Hukuk kurallarının yaptırımları",
      "Hukukun kaynakları",
    ]);
  });

  it("atlanan, tekrar eden, yabancı ya da sırası bozuk sayfa; 6'dan uzun birim; aynı ad; bozuk ad reddedilir", () => {
    expect(validateUnits(pages, [{ title: "A kavramı", pages: [5, 6] }, { title: "B kavramı", pages: [8, 9, 10, 11] }])).toBeNull();
    expect(validateUnits(pages, [{ title: "A kavramı", pages: [5, 6, 7] }, { title: "B kavramı", pages: [7, 8, 9, 10, 11] }])).toBeNull();
    expect(validateUnits(pages, [{ title: "A kavramı", pages: [5, 6, 7, 8, 9, 10, 11] }])).toBeNull();
    expect(validateUnits(pages, [{ title: "B kavramı", pages: [8, 9, 10, 11] }, { title: "A kavramı", pages: [5, 6, 7] }])).toBeNull();
    expect(validateUnits(pages, [{ title: "Açı ölçüsü", pages: [5, 6, 7] }, { title: "Açı ölçüsü", pages: [8, 9, 10, 11] }])).toBeNull();
    expect(validateUnits(pages, [{ title: "Aşağıdakilerden hangisi", pages: [5, 6, 7] }, { title: "B kavramı", pages: [8, 9, 10, 11] }])).toBeNull();
  });

  it("model cevabı konu sırasına göre okunur; tek birimlik bölme yazılmaz", () => {
    const map = unitsFromModel(
      {
        topics: [
          { index: 0, units: [{ title: "A kavramı", pages: [5, 6, 7] }, { title: "B kavramı", pages: [8, 9, 10, 11] }] },
          { index: 1, units: [{ title: "Tek parça", pages: [20, 21, 22, 23, 24] }] },
        ],
      },
      [{ index: 0, pages }, { index: 1, pages: [20, 21, 22, 23, 24] }],
    );
    expect(map.get(0)?.length).toBe(2);
    expect(map.has(1)).toBe(false);
  });

  it("4 sayfaya kadar konu bölünmez; sayfa önü kitap başlığını atar", () => {
    expect(needsUnits([1, 2, 3, 4])).toBe(false);
    expect(needsUnits([1, 2, 3, 4, 5])).toBe(true);
    expect(pageLead("KPSS HUKUKUN TEMEL KAVRAMLARI\nYaptırım, kişileri hukuka uymaya zorlar.\n12", ["KPSS HUKUKUN TEMEL KAVRAMLARI"])).toBe(
      "Yaptırım, kişileri hukuka uymaya zorlar.",
    );
  });
});

describe("çalışma planı birimleri ders yapar", () => {
  const units = [
    { title: "Hukuk kurallarının yaptırımları", pages: [7, 8, 9] },
    { title: "Hükümsüzlüğün dereceleri", pages: [10, 11] },
    { title: "Hukukun kaynakları", pages: [12, 13, 14, 15] },
  ];

  it("birim varsa dersler birimdir; yoksa mekanik bölme", () => {
    expect(topicLessonChunks({ pageNumbers: [7, 8, 9, 10, 11, 12, 13, 14, 15], units }).map((chunk) => chunk.title)).toEqual(units.map((unit) => unit.title));
    expect(topicLessonChunks({ pageNumbers: [7, 8, 9, 10, 11, 12, 13, 14, 15] }).every((chunk) => !chunk.title)).toBe(true);
  });

  it("plan düğümleri birim adını taşır; ders düğümünün meta'sı birimi okur", () => {
    const schedule = buildExamScheduleV2({
      daysToExam: 20,
      dailyMinutes: 90,
      studyDays: [1, 2, 3, 4, 5, 6, 7],
      topics: [{ id: "t1", title: "Hukukun Temel Kavramları", pageNumbers: [7, 8, 9, 10, 11, 12, 13, 14, 15], units }],
      fromDate: new Date("2026-10-05T12:00:00"),
    });
    const lessons = scheduleSessionsToNodeDrafts(schedule.sessions).filter((node) => node.kind === "lesson");
    expect(lessons.map((node) => node.title)).toEqual([
      "Hukukun Temel Kavramları · Ders 1/3: Hukuk kurallarının yaptırımları",
      "Hukukun Temel Kavramları · Ders 2/3: Hükümsüzlüğün dereceleri",
      "Hukukun Temel Kavramları · Ders 3/3: Hukukun kaynakları",
    ]);
    expect(parseSessionMeta(lessons[1].meta)?.unitTitle).toBe("Hükümsüzlüğün dereceleri");
    expect(lessons[1].meta.sourcePages).toEqual([10, 11]);
  });

  it("ders motoru birimi anlatır; harita birimleri kaydeder; plan birimleri haritadan okur", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toContain("topicLabel: input.sessionMeta?.unitTitle ? `${input.topicLabel}: ${input.sessionMeta.unitTitle}` : input.topicLabel,");
    expect(readFileSync("src/lib/documents/pdf-learning-v2.ts", "utf8")).toContain("await persistTopics(service, documentId, topics, pageIdByNumber, units);");
    expect(readFileSync("src/lib/learning/prep-schedule-topics.ts", "utf8")).toContain("units: unitsFor(topic),");
    expect(readFileSync("supabase/migrations/20261002180000_topic_concept_units.sql", "utf8")).toContain("ADD COLUMN IF NOT EXISTS units jsonb");
  });
});
