import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  buildBlueprint,
  expandedAllocationNote,
  pickTopicsForCount,
  promisedAllocation,
  slotFromTopicRow,
} from "@/lib/learning/mock-exam/allocate";
import { MOCK_CUSTOM_MAX, MOCK_CUSTOM_MIN } from "@/lib/learning/mock-exam/types";
import { balancedOralTopics, oralQuestionPlan } from "@/lib/learning/oral-scope";

/*
  Paket I #4 (30 Ekim 2026). Stres testinde 22 konulu hazırlıkta "Kısa" da "Standart" da 22 soru çıktı (konu sayısı
  seçilen sayıyı aşınca toplam büyüyordu); gerçek sınav 25 soru / 60 dk iken seçenek yalnız 10 ve 20'ydi; en ağır konu
  en az soruyu aldı. Örnek konular farklı derslerden.
*/

const slot = (id: string, label: string, weightPercent: number | null = null, examHeavy = false) => ({
  ...slotFromTopicRow({ id, label }),
  weightPercent,
  examHeavy,
});

const algorithms = Array.from({ length: 22 }, (_, index) => slot(`a${index}`, `Veri yapıları konu ${index + 1}`));

describe("toplam seçilen sayıdır, konu sayısından bağımsız", () => {
  it("22 konuda Kısa 10, Standart 20 soru; ikisi farklı ve kurulum hangilerinin sorulmadığını söyler", () => {
    const short = promisedAllocation(algorithms, 10);
    const standard = promisedAllocation(algorithms, 20);
    expect(short.total).toBe(10);
    expect(standard.total).toBe(20);
    expect(short.skippedTopics).toHaveLength(12);
    expect(standard.skippedTopics).toHaveLength(2);
    expect(expandedAllocationNote(short)).toContain("22 konudan 10 tanesi soruluyor");
    expect(buildBlueprint({ topics: algorithms, preset: "short", syllabus: null, allowNumeric: false, questionCount: 10 }).slots).toHaveLength(10);
  });

  it("ağırlıksız konular baştan sona yayılır (ilk ve son konu dahil)", () => {
    const picked = pickTopicsForCount(algorithms, 5).map((topic) => topic.topicLabel);
    expect(picked[0]).toBe("Veri yapıları konu 1");
    expect(picked.at(-1)).toBe("Veri yapıları konu 22");
    expect(new Set(picked).size).toBe(5);
  });

  it("sınav ağırlığı yüksek konu önce seçilir ve daha çok soru alır", () => {
    const accounting = [
      slot("k1", "Hesap kavramı", 5),
      slot("k2", "Yevmiye defteri", 35, true),
      slot("k3", "Büyük defter", 10),
      slot("k4", "Mizan", 10),
      slot("k5", "KDV", 15),
      slot("k6", "Amortisman", 15),
      slot("k7", "Envanter", 5),
      slot("k8", "Bilanço", 5),
    ];
    const promised = promisedAllocation(accounting, 25);
    const byLabel = Object.fromEntries(promised.rows.map((row) => [row.topicLabel, row.count]));
    expect(promised.total).toBe(25);
    expect(byLabel["Yevmiye defteri"]).toBeGreaterThan(byLabel["Hesap kavramı"]!);
    expect(Math.max(...promised.rows.map((row) => row.count))).toBe(byLabel["Yevmiye defteri"]);
    const few = promisedAllocation(accounting, 3).rows.map((row) => row.topicLabel);
    expect(few).toContain("Yevmiye defteri");
    expect(few).toEqual(expect.arrayContaining(["KDV", "Amortisman"]));
  });
});

describe("kendi sınavım: öğrenci soru sayısını girer", () => {
  it("uç ve kurulum aynı sınırları kullanır; kurulum seçilen sayıyı gönderir", () => {
    expect(MOCK_CUSTOM_MIN).toBe(5);
    expect(MOCK_CUSTOM_MAX).toBe(40);
    const route = readFileSync("src/app/api/learning/exam-prep/mock-exam/route.ts", "utf8");
    expect(route).toContain("questionCount: z.number().int().min(MOCK_CUSTOM_MIN).max(MOCK_CUSTOM_MAX).optional()");
    expect(route).toContain("questionCount: fields.questionCount,");
    const setup = readFileSync("src/components/parity/mock-exam-setup.tsx", "utf8");
    expect(setup).toContain('...(preset === "custom" ? { questionCount: customCount } : { preset })');
    expect(setup).toContain("Kendi sınavım ·");
    expect(promisedAllocation(algorithms, 25).total).toBe(25);
  });
});

describe("sözlü tüm sınav aynı seçim işlevini kullanır", () => {
  it("ağırlıksızda eski eşit aralıklı seçim aynen; ağırlık verilirse ağırlıklı konu önce", () => {
    const labels = ["Diziler", "Bağlı liste", "Yığın", "Kuyruk", "Ağaç", "Heap", "Hash", "Graf"];
    // Dizinler round(i·7/3): 0, 2, 5, 7 — eski `balancedOralTopics` ile aynı.
    expect(balancedOralTopics(labels, 4)).toEqual(["Diziler", "Yığın", "Heap", "Graf"]);
    expect(balancedOralTopics(labels, 1)).toEqual(["Diziler"]);
    expect(oralQuestionPlan(labels, 3)).toHaveLength(3);
    const weighted = balancedOralTopics(labels, 2, (label) => ({ percent: label === "Heap" ? 40 : null, heavy: false }));
    expect(weighted).toContain("Heap");
  });
});

describe("belgedeki sınav ağırlığı konulara eşlenir", () => {
  it("tahtadaki ağırlıklar ipucuyla eşlenir; vergi oranı ağırlık sayılmaz", async () => {
    const { topicWeightsFromText } = await import("@/lib/learning/mock-exam/weights-from-text");
    const board = "Vize konu ağırlıkları\nYevmiye defteri %35\nBüyük defter %20\nMizan %15";
    const weights = topicWeightsFromText(board, ["Yevmiye defteri", "Büyük defter", "Mizan", "KDV"]);
    expect(Object.fromEntries(weights)).toEqual({ "Yevmiye defteri": 35, "Büyük defter": 20, Mizan: 15 });
    expect(topicWeightsFromText("KDV oranı %20 olarak uygulanır.", ["KDV"]).size).toBe(0);
    expect(topicWeightsFromText("Finalde Graf soruları %40 ağırlıkla çıkar.", ["Graf algoritmaları"]).get("Graf algoritmaları")).toBe(40);
    // Toplam %100'ü belirgin aşıyorsa yüzdeler ağırlık değil.
    expect(topicWeightsFromText("Sınav istatistiği: Anayasa %80, İdare %70", ["Anayasa", "İdare"]).size).toBe(0);
  });

  it("kurulum ve üretimin ortak yükleyicisi kayıtta ağırlık yoksa belgeden doldurur", () => {
    const create = readFileSync("src/lib/learning/mock-exam/create.ts", "utf8");
    expect(create).toContain("const textWeights = topicWeightsFromText(syllabusText, topics.map((t) => t.label));");
    expect(create).toContain("if (slot.weightPercent == null && textWeights.has(t.label))");
  });
});
