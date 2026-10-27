import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { dropNearDuplicates } from "@/lib/learning/item-dedup";
import { allocateQuestions, slotFromTopicRow } from "@/lib/learning/mock-exam/allocate";
import { topUpTargets } from "@/lib/learning/mock-exam/create";
import { assignExamCoverage, coverageAsk, topicCoveragePoints } from "@/lib/learning/mock-exam/fact-coverage";
import { buildTopicReport } from "@/lib/learning/mock-exam/grade";
import { mockProgressCounter } from "@/lib/learning/mock-exam/progress";
import { mockElapsedLabel } from "@/lib/learning/mock-exam/time-limit";
import type { MockGradeItem } from "@/lib/learning/mock-exam/types";

describe("yazılı deneme kotası ve süre", () => {
  it("kurulum ve üretim aynı ağırlıktan aynı kotayı kurar", () => {
    const rows = [
      { id: "a", label: "Konu 6", sourceRefs: [{ weightPercent: 30, examHeavy: true }] },
      { id: "b", label: "Konu 7", sourceRefs: [{ weightPercent: 10, examHeavy: false }] },
    ];
    const slots = rows.map((row) => slotFromTopicRow(row));
    const announced = allocateQuestions(slots, 5);
    const produced = allocateQuestions(slots.map((slot) => ({ ...slot })), 5);
    expect(produced.map((row) => [row.topicLabel, row.count])).toEqual(
      announced.map((row) => [row.topicLabel, row.count]),
    );
    expect(announced.find((row) => row.topicLabel === "Konu 6")!.count).toBeGreaterThan(
      announced.find((row) => row.topicLabel === "Konu 7")!.count,
    );
  });

  it("eksik kendi konusunda kapanır; dolu konu büyümez", () => {
    const allocation = [
      { topicLabel: "Konu 6", count: 3 },
      { topicLabel: "Konu 7", count: 2 },
    ];
    const have = new Map([["Konu 6", 1], ["Konu 7", 2]]);
    expect(topUpTargets(allocation, have, 2)).toEqual([{ row: allocation[0], missing: 2 }]);
  });

  it("aynı denemede yakın soru ikinci kez durmaz", () => {
    const questions = [
      { text: "Mutlak butlan hangi durumda ortaya çıkar?" },
      { text: "İptal ile butlan arasındaki fark nedir?" },
      { text: "Mutlak butlan hangi durumlarda ortaya çıkar?" },
    ];
    const kept = dropNearDuplicates(questions, (question) => question.text);
    expect(kept).toHaveLength(2);
    expect(kept.map((question) => question.text)).not.toContain(questions[2]!.text);
  });

  it("ilerleme gerilemez; harcanan süre sınır değil, başlangıç ile bitiş arasıdır", () => {
    const seen: number[] = [];
    const tick = mockProgressCounter(4, (progress) => seen.push(progress.done));
    tick("birinci");
    tick("ikinci");
    tick("üçüncü");
    expect(seen).toEqual([0, 1, 2, 3]);
    for (let index = 1; index < seen.length; index += 1) expect(seen[index]).toBeGreaterThanOrEqual(seen[index - 1]!);
    expect(mockElapsedLabel("2026-10-25T10:00:00Z", "2026-10-25T10:18:00Z")).toBe("18 dk");
    expect(mockElapsedLabel("2026-10-25T10:00:00Z", "2026-10-25T10:00:20Z")).toBe("20 sn");
    expect(mockElapsedLabel(null, "2026-10-25T10:18:00Z")).toBe("—");
    expect(mockElapsedLabel("2026-10-25T10:00:00Z", null)).toBe("—");
  });
});

/**
 * Kapsam kuralı ders bağımsız: her konunun kilit bilgisi ve alt başlığı kotada ayrı bir slota düşer.
 * Biyoloji örneği yalnız kabul ölçütü; aynı iddia KPSS, kimya, matematik ve İngilizce dilbilgisinde de geçer.
 */
const SUBJECT_BRANCH =
  /kan grub|soya[gğ]ac|kal[ıi]t[ıi]m|cinsiyete ba[gğ]l|mitoz|mayoz|\brh\b|nefroloji|pediatri|sex-linked|pedigree/i;

type CourseFixture = {
  name: string;
  wide: string;
  points: readonly string[];
  others: readonly string[];
};

const COURSES: readonly CourseFixture[] = [
  {
    name: "biyoloji",
    wide: "Kalıtım",
    points: ["Kan grupları", "Cinsiyete bağlı kalıtım", "Soyağacı"],
    others: ["Hücre zarı", "Mitoz evreleri", "Mayoz evreleri", "Protein sentezi", "Hücresel solunum", "Boşaltım sistemi"],
  },
  {
    name: "kpss",
    wide: "Anayasa",
    points: ["Yasama organı", "Yürütme organı", "Yargı organı"],
    others: ["Temel haklar", "Seçim sistemi", "İdare hukuku", "Vergi hukuku", "Ceza hukuku", "Borçlar hukuku"],
  },
  {
    name: "kimya",
    wide: "Kimyasal denge",
    points: ["Denge sabiti", "Tepkime yönü", "Asit baz dengesi"],
    others: ["Mol kavramı", "Gaz kanunları", "Çözelti derişimi", "Periyodik eğilim", "Bağ türleri", "Tepkime hızı"],
  },
  {
    name: "matematik",
    wide: "Türev",
    points: ["Türev tanımı", "Zincir kuralı", "Kritik noktalar"],
    others: ["Limit kavramı", "Süreklilik", "İntegral hesabı", "Fonksiyon türleri", "Trigonometri", "Olasılık"],
  },
  {
    name: "ingilizce",
    wide: "Present perfect",
    points: ["Time expressions", "Already and yet", "Since and for"],
    others: ["Past simple", "Present continuous", "Conditionals", "Relative clauses", "Modal verbs", "Passive voice"],
  },
];

function coursePages(headings: readonly string[]): { text: string }[] {
  return [{ text: [...headings.map((heading) => `# ${heading}`), "oran 3:2"].join("\n") }];
}

function gradeItem(topicLabel: string, index: number): MockGradeItem {
  return {
    questionId: String(index),
    userAnswer: "A",
    isCorrect: true,
    pointsEarned: 1,
    pointsMax: 1,
    verdict: "dogru",
    explanation: "",
    feedback: null,
    topicId: null,
    topicLabel,
  };
}

describe("yazılı deneme her dersin alt başlığını ve kilit bilgisini kapsar", () => {
  it("ürün kodu tek bir dersin kelimesine dallanmaz", () => {
    const root = path.resolve(__dirname, "../..");
    const sources = [
      "src/lib/learning/mock-exam/fact-coverage.ts",
      "src/lib/learning/student-safe-text.ts",
    ].map((file) => readFileSync(path.join(root, file), "utf8"));
    for (const source of sources) expect(source).not.toMatch(SUBJECT_BRANCH);
    expect(coverageAsk(["birinci nokta", "ikinci nokta"])).not.toMatch(SUBJECT_BRANCH);
  });

  it.each(COURSES)("$name: 20 soru 7 konuyu ve alt başlıkları birer kez sorar", (course) => {
    const topics = [
      { id: "wide", label: course.wide, passageChars: 10_000, pages: coursePages(course.points) },
      ...course.others.map((label, index) => ({
        id: `t${index}`,
        label,
        passageChars: 100,
        pages: coursePages([`${label} ayrıntısı`]),
      })),
    ];
    const allocation = allocateQuestions(
      topics.map((topic) => slotFromTopicRow(topic)),
      20,
    );
    expect(allocation).toHaveLength(7);
    expect(allocation.reduce((sum, row) => sum + row.count, 0)).toBe(20);
    expect(allocation.every((row) => row.count >= 1)).toBe(true);
    // Paket A (28 Ekim 2026): dağılım metin uzunluğuna bakmaz; kurulumun gösterdiği eşit paylaşım (3+3+…+2).
    const counts = allocation.map((row) => row.count);
    expect(Math.max(...counts) - Math.min(...counts)).toBeLessThanOrEqual(1);

    const pointsByTopic = new Map(
      topics.map((topic) => [topic.label, topicCoveragePoints(topic.pages, topic.label)]),
    );
    const assigned = assignExamCoverage(allocation, pointsByTopic);
    expect(assigned).toHaveLength(20);
    const signatures = assigned.map((slot) => slot.signature).filter(Boolean);
    expect(new Set(signatures).size).toBe(signatures.length);

    const wide = assigned.filter((slot) => slot.topicLabel === course.wide);
    expect(wide).toHaveLength(allocation.find((row) => row.topicLabel === course.wide)!.count);
    // Geniş konunun yerleri kendi alt başlıklarından ve kilit bilgisinden, her biri bir kez.
    const own = [...course.points, "3:2"];
    expect(wide.every((slot) => own.includes(slot.point ?? ""))).toBe(true);
    expect(new Set(wide.map((slot) => slot.point)).size).toBe(wide.length);

    const report = buildTopicReport(assigned.map((slot, index) => gradeItem(slot.topicLabel, index)));
    for (const row of allocation) {
      expect(report.find((item) => item.topicLabel === row.topicLabel)?.total).toBe(row.count);
    }
    const asked = wide.map((slot) => slot.point).filter((point): point is string => Boolean(point));
    const ask = coverageAsk(asked);
    for (const point of asked) expect(ask).toContain(` ${point}`);
    const first = asked[0]!;
    expect(ask.match(new RegExp(first.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "g"))).toHaveLength(1);
  });
});
