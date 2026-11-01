import { describe, expect, it } from "vitest";
import raw from "@/lib/curriculum/registry.json";
import {
  buildTopicMap,
  inPartScope,
  matchCodeForLabel,
  outcomeGrade,
  outcomeTopicLabel,
  quotaForLabel,
  scenarioOptions,
  TOPIC_LABEL_MAX,
  TOPIC_TARGET_MAX,
} from "@/lib/curriculum/topic-map";
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
    expect(m.topics).toEqual(["Ünite 1"]);
    expect(m.topicCodes).toEqual([["AB 5.1.1"]]);
    expect(m.quotaByCode).toEqual({ "AB 5.1.1": 4 });
    expect(m.quotaByTopic).toEqual([4]);
    expect(m.total).toBe(4);
    expect(m.averaged).toBe(false);
  });
  it("karma: senaryo ortalaması (0 dahil), en az 1", () => {
    const m = buildTopicMap(program, "d1y1", "karma");
    expect(m.quotaByCode).toEqual({ "AB 5.1.1": 2, "AB 5.1.10": 1 });
    expect(m.quotaByTopic).toEqual([3]);
    expect(m.averaged).toBe(true);
  });
  it("ülke geneli ve serbest: bütün kazanımlar, kota yok", () => {
    for (const m of [buildTopicMap(program, "d1y2", 1), buildTopicMap(program, "serbest", null)]) {
      expect(m.outcomeCount).toBe(3);
      expect(m.topicCodes.flat()).toHaveLength(3);
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
      {
        outcomes: [
          { code: "AB 5.1.1", text: "Birinci", limitations: ["Sınır 1"] },
          { code: "AB 5.1.2", text: "İkinci", limitations: ["Sınır 2a", "Sınır 2b"] },
        ],
        programLabel: "P",
        programVersion: "v",
        unitTitle: "U",
        topicLabel: "Konu",
      },
      "quiz",
    );
    for (const part of ["AB 5.1.1 Birinci", "AB 5.1.2 İkinci", "Sınır 1", "Sınır 2a", "Sınır 2b", "2 kazanım"]) {
      expect(block).toContain(part);
    }
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

const reg = (id: string) => REG.programs.find((p) => p.id === id)!;
const codesOf = (p: CurriculumProgram, part: "TYT" | "AYT" | null = null) =>
  p.units.flatMap((u) => u.outcomes).filter((o) => inPartScope(outcomeGrade(o, p.grade), part, REG.examGradeScopes)).map((o) => o.code);

describe("konu gruplama (ünite / alt başlık)", () => {
  it("her programda en çok 16 konu ve bütün kazanımlar korunur", () => {
    for (const p of REG.programs) {
      for (const part of p.kind === "yks" ? (["TYT", "AYT", null] as const) : ([null] as const)) {
        const m = buildTopicMap(p, "serbest", null, { part, scopes: REG.examGradeScopes });
        expect(m.topics.length, `${p.id} ${part}`).toBeLessThanOrEqual(TOPIC_TARGET_MAX);
        expect(new Set(m.topics).size).toBe(m.topics.length);
        for (const t of m.topics) expect(t.length).toBeLessThanOrEqual(TOPIC_LABEL_MAX);
        expect([...m.topicCodes.flat()].sort()).toEqual([...new Set(codesOf(p, part))].sort());
        expect(m.outcomeCount).toBe(new Set(codesOf(p, part)).size);
      }
    }
  });
  it("konu kotası kazanım kotalarının toplamı; 10. sınıf Mat 1. yazılı Senaryo 2 = 7 (3/1/1/1/1)", () => {
    for (const p of REG.programs) {
      for (const key of ["d1y1", "d1y2"] as const) {
        for (const n of scenarioOptions(p, key)) {
          const m = buildTopicMap(p, key, n);
          m.topicCodes.forEach((codes, i) => expect(m.quotaByTopic[i]).toBe(codes.reduce((s, c) => s + (m.quotaByCode[c] ?? 0), 0)));
          expect(m.quotaByTopic.reduce((a, b) => a + b, 0)).toBe(m.total);
        }
      }
    }
    const m = buildTopicMap(reg("meb-10-matematik"), "d1y1", 2);
    expect(m.total).toBe(7);
    expect(m.topicCodes.map((c, i) => [c.join(","), m.quotaByTopic[i]])).toEqual([
      ["10.1.1", 3], ["10.1.2", 1], ["10.1.3", 1], ["10.1.4", 1], ["10.2.1", 1],
    ]);
    expect(quotaForLabel(m, m.topics[0]!)).toBe(3);
    expect(quotaForLabel(m, "10.1.1 eski kazanım etiketi")).toBe(3);
  });
});

describe("TYT / AYT kapsamı sınıf düzeyiyle", () => {
  it("TYT 9–10, AYT 11–12, YKS hepsi (açık veri)", () => {
    expect(REG.examGradeScopes).toEqual({ TYT: [9, 10], AYT: [11, 12], YKS: [9, 12] });
    const p = reg("yks-2026-matematik");
    const grades = (part: "TYT" | "AYT") =>
      new Set(p.units.flatMap((u) => u.outcomes).filter((o) => codesOf(p, part).includes(o.code)).map((o) => outcomeGrade(o, p.grade)));
    expect([...grades("TYT")].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([9, 10]);
    expect([...grades("AYT")].sort((a, b) => (a ?? 0) - (b ?? 0))).toEqual([11, 12]);
    expect(buildTopicMap(p, "serbest", null, { part: "AYT" }).topics.every((t) => /^1[12]\. Sınıf/.test(t))).toBe(true);
    expect(buildTopicMap(reg("yks-2026-inkilap"), "serbest", null, { part: "TYT" }).topics).toEqual([]);
    expect(outcomeGrade({ code: "MAN.1" }, null)).toBeNull();
    expect(inPartScope(null, "TYT", REG.examGradeScopes)).toBe(false);
    expect(inPartScope(null, "AYT", REG.examGradeScopes)).toBe(true);
  });
});

describe("yeni dersler", () => {
  it("YKS TDE, İnkılap, Psikoloji, Sosyoloji, Mantık; LGS altı ders; KPSS GY-GK", () => {
    for (const id of [
      "yks-2026-tde", "yks-2026-inkilap", "yks-2026-psikoloji", "yks-2026-sosyoloji", "yks-2026-mantik",
      "lgs-2027-turkce", "lgs-2027-matematik", "lgs-2027-fen", "lgs-2027-inkilap", "lgs-2027-dkab", "lgs-2027-ingilizce",
      "kpss-2026-genel-yetenek", "kpss-2026-genel-kultur",
    ]) {
      const p = reg(id);
      expect(p, id).toBeTruthy();
      expect(p.units.flatMap((u) => u.outcomes).length, id).toBeGreaterThan(0);
    }
    expect(REG.programs.some((p) => p.kind === "yks" && /türkçe/i.test(p.subject) && p.id !== "yks-2026-tde")).toBe(false);
    expect(REG.programs.filter((p) => p.kind === "lgs").every((p) => p.grade === 8)).toBe(true);
  });
});
