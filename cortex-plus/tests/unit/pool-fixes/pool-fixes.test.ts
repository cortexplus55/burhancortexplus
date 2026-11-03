import { describe, expect, it, vi } from "vitest";
import { chosenIndex, poolResponsePlan } from "@/lib/content-pool/answer-index";
import { poolLessonText } from "@/lib/content-pool/lesson-text";
import { pickPoolExamItems, usablePoolItem, type PoolExamItem } from "@/lib/learning/mock-exam/pool-pick";
import { oralPoolLabelsFrom } from "@/lib/content-pool/oral-pool-labels";
import { poolQuizAnswers } from "@/lib/learning/node/score";
import { recordExamPoolAnswers } from "@/lib/learning/mock-exam/grade-exam";

function item(id: string, unit: string, outcome: string): PoolExamItem {
  return { id, unit_id: unit, outcome_id: outcome, difficulty: "medium", stem: `Soru ${id} kökü?`, choices: ["A şık", "B şık", "C şık", "D şık"], answer: 1, explanation: "Açıklama metni." };
}

describe("havuz cevabı → şık sırası", () => {
  it("Türkçe büyük/küçük harf ve boşluk farkını eşler", () => {
    expect(chosenIndex(["İstanbul", "Ankara"], "  istanbul ")).toBe(0);
    expect(chosenIndex(["İstanbul", "Ankara"], "İzmir")).toBeNull();
    expect(chosenIndex(["a"], "")).toBeNull();
  });
  it("bilinmeyen, yinelenen ve boş cevapları atlar", () => {
    const plan = poolResponsePlan(
      [{ id: "x", choices: ["a", "b"] }],
      [
        { poolItemId: "x", chosenText: "b", correct: true },
        { poolItemId: "x", chosenText: "a", correct: false },
        { poolItemId: "y", chosenText: "a", correct: false },
      ],
    );
    expect(plan).toEqual([{ poolItemId: "x", chosen: 1, correct: true }]);
  });
});

describe("konu testi havuz cevapları", () => {
  it("poolItemId taşıyan tek seçimli cevabı döndürür", () => {
    const payload = {
      type: "quiz",
      questions: [
        { text: "Birinci soru nedir?", options: ["a", "b", "c", "d"], correct: ["b"], poolItemId: "p1" },
        { text: "İkinci soru nedir?", options: ["a", "b", "c", "d"], correct: ["c"] },
      ],
    };
    const out = poolQuizAnswers(payload, { "0": "b", "1": "c" });
    expect(out).toEqual([{ poolItemId: "p1", chosenText: "b", correct: true }]);
  });
});

describe("yazılı deneme havuz cevapları", () => {
  it("havuz sorusu yoksa hiçbir şey yazmaz", async () => {
    const service = { from: vi.fn() } as never;
    const n = await recordExamPoolAnswers(service, { userId: "u", prepId: "p", since: "2026-11-03", list: [{ id: "q1" }], items: [{ questionId: "q1", userAnswer: "a", isCorrect: true }] as never });
    expect(n).toBe(0);
  });
});

describe("havuz yazılı deneme seçimi", () => {
  const items = [
    ...Array.from({ length: 6 }, (_, i) => item(`a${i}`, "u1", i % 2 ? "o1" : "o2")),
    ...Array.from({ length: 6 }, (_, i) => item(`b${i}`, "u2", "o3")),
  ];
  it("her konuya kendi ünitesinden, yinelemesiz ve görülmemiş önce seçer", () => {
    const seen = new Set(["a0", "a1"]);
    const out = pickPoolExamItems(
      items,
      [
        { topicId: "t1", topicLabel: "K1", count: 4, unitIds: ["u1"], outcomeIds: null },
        { topicId: "t2", topicLabel: "K2", count: 3, unitIds: ["u2"], outcomeIds: null },
      ],
      seen,
      () => 0.3,
    )!;
    expect(out[0]!.items.every((x) => x.unit_id === "u1")).toBe(true);
    expect(out[0]!.items.some((x) => seen.has(x.id))).toBe(false);
    expect(out[1]!.items).toHaveLength(3);
    const ids = out.flatMap((r) => r.items.map((x) => x.id));
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("yetmezse null (üretim yoluna düşer)", () => {
    expect(pickPoolExamItems(items, [{ topicId: "t", topicLabel: "K", count: 7, unitIds: ["u2"], outcomeIds: null }], new Set())).toBeNull();
  });
  it("bozuk şıklı soruyu kullanmaz", () => {
    expect(usablePoolItem({ ...item("z", "u", "o"), answer: 9 })).toBe(false);
    expect(usablePoolItem({ ...item("z", "u", "o"), choices: ["a", "a"] })).toBe(false);
  });
});

describe("sözlü havuz kaynağı", () => {
  const rows = [
    { id: "1", label: "A" },
    { id: "2", label: "B" },
    { id: "3", label: "C" },
    { id: "4", label: "D" },
  ];
  it("tek konu, seçilen konular ve tüm sınav", () => {
    expect(oralPoolLabelsFrom(rows, { topicLabel: "X", all: false, topicIds: null, count: 3 })).toEqual(["X"]);
    expect(oralPoolLabelsFrom(rows, { topicLabel: "X", all: false, topicIds: ["2", "4"], count: 3 })).toEqual(["B", "D"]);
    expect(oralPoolLabelsFrom(rows, { topicLabel: "X", all: true, topicIds: null, count: 2 })).toEqual(["A", "C"]);
  });
  it("anlatım metni başlık, bölüm ve özet içerir; sınırı aşmaz", () => {
    const body = {
      title: "İslamiyet Öncesi",
      overview: "Genel bakış metni burada yer alır.",
      sections: [{ outcome_code: "1", heading: "Hunlar", explanation: "Asya Hun Devleti açıklaması.", key_points: ["Mete Han"] }],
      summary: "Özet metni burada yer alır.",
      cards: [{ front: "a", back: "b" }],
    };
    const text = poolLessonText(body, "İslamiyet Öncesi Türk Tarihi");
    expect(text).toContain("Hunlar");
    expect(text).toContain("Mete Han");
    expect(poolLessonText(body, "x", 40).length).toBeLessThanOrEqual(40);
  });
});
