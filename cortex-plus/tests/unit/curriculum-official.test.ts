import { describe, expect, it } from "vitest";
import raw from "@/lib/curriculum/registry.json";
import { buildTopicMap, matchCodeForLabel, outcomeTopicLabel, scenarioOptions, TOPIC_LABEL_MAX } from "@/lib/curriculum/topic-map";
import { officialOutcomeBlock } from "@/lib/curriculum/grounding";
import { eventDays, officialExamOn, schoolBreakOn, upcomingOfficialExams } from "@/lib/curriculum/calendar";
import { turkishHolidayOn } from "@/lib/learning/tr-calendar";
import { allocateQuestions } from "@/lib/learning/mock-exam/allocate";
import type { CurriculumProgram, CurriculumRegistry } from "@/lib/curriculum/types";

const REG = raw as unknown as CurriculumRegistry;

const program: CurriculumProgram = {
  id: "test-prog",
  kind: "okul",
  grade: 5,
  subjectKey: "x",
  subject: "X",
  label: "5. Sınıf X",
  programVersion: "maarif_2024",
  badge: "B",
  scope: "s",
  sourceIds: [],
  exams: { d1y1: { scenarios: [1, 2, 3], national: false }, d1y2: { scenarios: [1], national: true } },
  units: [
    {
      title: "Ünite 1",
      outcomes: [
        { code: "AB 5.1.1", text: "Birinci", topic: null, limitations: [], quotas: { d1y1: { "1": 2, "2": 4 } }, sourceId: "s" },
        { code: "AB 5.1.10", text: "Onuncu", topic: null, limitations: [], quotas: { d1y1: { "3": 1 } }, sourceId: "s" },
        { code: "AB 5.1.2", text: "İkinci", topic: null, limitations: [], quotas: { d1y1: {} }, sourceId: "s" },
      ],
    },
  ],
};

describe("buildTopicMap", () => {
  it("senaryo N: yalnız soru alan kazanımlar, kota aynen", () => {
    const m = buildTopicMap(program, "d1y1", 2);
    expect(m.codes).toEqual(["AB 5.1.1"]);
    expect(m.quotaByCode).toEqual({ "AB 5.1.1": 4 });
    expect(m.total).toBe(4);
    expect(m.averaged).toBe(false);
  });
  it("karma: senaryo ortalaması (0 dahil), en az 1", () => {
    const m = buildTopicMap(program, "d1y1", "karma");
    expect(m.quotaByCode).toEqual({ "AB 5.1.1": 2, "AB 5.1.10": 1 });
    expect(m.averaged).toBe(true);
  });
  it("ülke geneli ve serbest: bütün kazanımlar, kota yok", () => {
    for (const m of [buildTopicMap(program, "d1y2", 1), buildTopicMap(program, "serbest", null)]) {
      expect(m.codes).toHaveLength(3);
      expect(m.total).toBe(0);
    }
    expect(buildTopicMap(program, "d1y2", 1).national).toBe(true);
    expect(scenarioOptions(program, "d1y2")).toEqual([]);
    expect(scenarioOptions(program, "d1y1")).toEqual([1, 2, 3]);
  });
});

describe("etiket ve kod eşleme", () => {
  it("uzun etiket 120 karakterde kelime sınırından kırpılır, kod başta kalır", () => {
    const label = outcomeTopicLabel({ code: "AB 5.1.1", text: "kelime ".repeat(40) });
    expect(label.length).toBeLessThanOrEqual(TOPIC_LABEL_MAX);
    expect(label.startsWith("AB 5.1.1 ")).toBe(true);
    expect(label.endsWith("…")).toBe(true);
  });
  it("boşluklu kodda en uzun önek kazanır", () => {
    const codes = ["AB 5.1.1", "AB 5.1.10"];
    expect(matchCodeForLabel("AB 5.1.10 Onuncu", codes)).toBe("AB 5.1.10");
    expect(matchCodeForLabel("AB 5.1.1 Birinci", codes)).toBe("AB 5.1.1");
    expect(matchCodeForLabel("Başka konu", codes)).toBeNull();
  });
});

describe("deneme dağılımı", () => {
  it("resmî sayılar toplamı tutarsa aynen kullanılır, 0 alan konu düşer", () => {
    const slot = (id: string, n: number | null) => ({
      topicId: id, topicLabel: id, weightPercent: null, examHeavy: false, outOfScope: false, officialCount: n,
    });
    const rows = allocateQuestions([slot("a", 3), slot("b", 0), slot("c", 2)] as never, 5);
    expect(rows.map((r) => [r.topicId, r.count])).toEqual([["a", 3], ["c", 2]]);
  });
});

describe("dayanak bloğu", () => {
  it("resmî metin ve sınırlamalar aynen girer", () => {
    const block = officialOutcomeBlock(
      { code: "AB 5.1.1", text: "Birinci", limitations: ["Sınır 1"], programLabel: "P", programVersion: "v", unitTitle: "U" },
      "quiz",
    );
    expect(block).toContain("AB 5.1.1");
    expect(block).toContain("Sınır 1");
    expect(officialOutcomeBlock(null, "lesson")).toBe("");
  });
});

describe("kayıt defteri bütünlüğü", () => {
  it("her program ve takvim satırının kaynağı sha256 taşır", () => {
    for (const p of REG.programs) {
      expect(p.sourceIds.length).toBeGreaterThan(0);
      for (const id of p.sourceIds) expect(REG.sources[id]?.sha256).toMatch(/^[0-9a-f]{64}$/);
      for (const u of p.units) for (const o of u.outcomes) expect(REG.sources[o.sourceId]).toBeTruthy();
    }
    for (const e of REG.calendar) expect(REG.sources[e.sourceId]?.url).toMatch(/^https:\/\//);
  });
});

describe("resmî takvim", () => {
  it("ÖSYM tarihleri ve okul tatili", () => {
    expect(officialExamOn("2027-06-19")).toContain("TYT");
    expect(schoolBreakOn("2026-11-18")).toBeTruthy();
    expect(schoolBreakOn("2026-11-25")).toBeNull();
    expect(upcomingOfficialExams("2027-06-01")[0]?.label).toBe("LGS 2027");
    expect(eventDays({ starts: "2026-11-16", ends: "2026-11-20" })).toHaveLength(5);
    expect(turkishHolidayOn("2028-02-26")).toBe("Ramazan Bayramı");
    expect(turkishHolidayOn("2027-03-09")).toBe("Ramazan Bayramı");
  });
});
