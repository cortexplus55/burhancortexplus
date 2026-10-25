import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { avoidListBlock, dropNearDuplicates, nearDuplicate } from "@/lib/learning/item-dedup";
import { quizUserPrompt } from "@/lib/learning/teacher-quiz";
import { cardsUserPrompt } from "@/lib/learning/teacher-cards";
import {
  cardTextsFromPayload,
  collectPreviousItems,
  quizStemsFromPayload,
} from "@/lib/learning/previous-items";
import { backboneSlice, practiceCoverage, practiceVariantFromTitle } from "@/lib/learning/practice-coverage";
import {
  BLOCK_INTERACTIVE_ROTATION,
  blockInteractiveKind,
  buildExamScheduleV2,
  practiceActivity,
  scheduleSessionsToNodeDrafts,
} from "@/lib/learning/exam-schedule-v2";
import { mergeStudyPathTemplate, PLAN_NODE_META } from "@/lib/learning/exam-prep-plan";
import { parseSessionMeta } from "@/lib/learning/teaching-standards";

/*
 * Canlı test P1-2 (25 Ekim 2026): aynı konunun üç testi aynı soruları sordu, sonraki konunun kartları
 * öncekini kopyaladı, "Testler ve Doğru/Yanlış" adımında doğru/yanlış yoktu. Kurallar ders bağımsız.
 */
describe("tekrar süzgeci", () => {
  it("aynı bilgiyi soran kök başka kalıpla da tekrar sayılır", () => {
    expect(nearDuplicate("Mutlak butlan hangi durumda ortaya çıkar?", "Mutlak butlan hangi durumlarda ortaya çıkar")).toBe(true);
    expect(
      nearDuplicate(
        "Aşağıdakilerden hangisi kurucu unsuru eksik işlemin sonucudur?",
        "Kurucu unsuru eksik işlemin sonucu aşağıdakilerden hangisidir?",
      ),
    ).toBe(true);
  });

  it("harf, kısaltma ve sayı ayırır: başka soru düşmez", () => {
    expect(nearDuplicate("Hepatit A bulaş yolu ve kuluçka süresi nedir?", "Hepatit B bulaş yolu ve kuluçka süresi nedir?")).toBe(false);
    expect(nearDuplicate("Bebek 2. ayda hangi aşıları olur ve hangi kontroller yapılır?", "Bebek 6. ayda hangi aşıları olur ve hangi kontroller yapılır?")).toBe(false);
    expect(nearDuplicate("Hücre zarının yapısı nedir?", "Mitokondrinin görevi nedir?")).toBe(false);
  });

  it("önceki listeyle ve kendi içinde kopya düşer, sıra korunur", () => {
    const kept = dropNearDuplicates(
      ["Yasama yetkisi kime aittir ve devredilebilir mi?", "Yürütme yetkisi kime aittir?", "Yasama yetkisi kime aittir, devredilebilir mi?"],
      (text) => text,
      ["Yürütme yetkisi kime aittir"],
    );
    expect(kept).toEqual(["Yasama yetkisi kime aittir ve devredilebilir mi?"]);
  });

  it("yazar yasak listeyi ve testin kapsamını görür", () => {
    const prompt = quizUserPrompt({
      mode: "document",
      focus: "practice",
      topicLabel: "Hücre",
      prepTitle: "YKS",
      pages: [{ page: 1, text: "Hücre zarı seçici geçirgendir." }],
      count: 5,
      previousStems: ["Hücre zarının görevi nedir?"],
      coverage: practiceCoverage(1, ["Zar yapısı", "Taşıma"]),
    } as never);
    expect(prompt).toContain("DAHA ÖNCE SORULAN VE TEKRARLANMASI YASAK SORULAR");
    expect(prompt).toContain("- Hücre zarının görevi nedir?");
    expect(prompt).toContain("BU TESTİN KAPSAMI:");
    expect(prompt).toContain("Taşıma");
    expect(avoidListBlock("X", [])).toBe("");
  });

  it("kart yazarı önceki kartları görür", () => {
    const prompt = cardsUserPrompt({
      topicLabel: "Hücre",
      prepTitle: "YKS",
      pages: [{ page: 1, text: "Hücre zarı seçici geçirgendir." }],
      mode: "document",
      count: 8,
      focus: "cards",
      avoid: ["Hücre zarı nedir? Seçici geçirgen katman"],
    } as never);
    expect(prompt).toContain("DAHA ÖNCE YAZILAN KARTLAR");
    expect(prompt).toContain("Seçici geçirgen katman");
  });
});

describe("önceki kayıtlar", () => {
  it("test ve kart kayıtlarından kök toplanır; tekrarsız, yeni önce", () => {
    const payloads = [
      { type: "quiz", questions: [{ text: "Soru 1" }, { text: "Soru 2" }] },
      { type: "cards", cards: [{ front: "Ön", back: "Arka" }] },
      { type: "quiz", questions: [{ text: "soru 1" }, { text: "Soru 3" }] },
      null,
    ];
    expect(collectPreviousItems(payloads, quizStemsFromPayload)).toEqual(["Soru 1", "Soru 2", "Soru 3"]);
    expect(collectPreviousItems(payloads, cardTextsFromPayload)).toEqual(["Ön Arka"]);
    expect(collectPreviousItems(payloads, quizStemsFromPayload, 2)).toHaveLength(2);
  });
});

describe("test dilimi", () => {
  const backbone = ["Tanım", "Sınıflama", "Eşikler", "Tedavi", "Komplikasyon"];
  it("ilk test ilk yarı, ikinci ikinci yarı, üçüncü bütün omurga", () => {
    expect(backboneSlice(backbone, 0)).toEqual(["Tanım", "Sınıflama", "Eşikler"]);
    expect(backboneSlice(backbone, 1)).toEqual(["Tedavi", "Komplikasyon"]);
    expect(backboneSlice(backbone, 2)).toEqual(backbone);
    expect(backboneSlice([], 1)).toEqual([]);
    expect(practiceCoverage(0, backbone)).toMatch(/^Temel düzey/);
    expect(practiceCoverage(1, backbone)).toMatch(/^Uygulama düzeyi/);
    expect(practiceCoverage(2, [])).toMatch(/^Sentez düzeyi/);
    expect(practiceCoverage(null, [])).toContain("başka konunun bilgisini sorma");
  });

  it("eski düğümde varyant başlıktan okunur; metada varsa metadan", () => {
    expect(practiceVariantFromTitle("Mol · İkinci test")).toBe(1);
    expect(practiceVariantFromTitle("Mol · Üçüncü test")).toBe(2);
    expect(practiceVariantFromTitle("Mol · Testler ve Doğru/Yanlış")).toBe(0);
    expect(parseSessionMeta({ practiceVariant: 1 })?.practiceVariant).toBe(1);
    expect(parseSessionMeta({ practiceVariant: -1 })?.practiceVariant).toBeUndefined();
  });
});

describe("yol: konu testi adı, gerçek D/Y, dönüşümlü etkileşim", () => {
  const topics = [0, 1, 2, 3].map((index) => ({
    id: `t${index}`,
    title: `Konu ${index}`,
    pageNumbers: [index * 3 + 1, index * 3 + 2],
    examHeavy: index === 0,
  }));
  const plan = buildExamScheduleV2({
    daysToExam: 20,
    dailyMinutes: 60,
    studyDays: [1, 2, 3, 4, 5, 6, 7],
    topics,
    fromDate: new Date("2026-10-01T12:00:00"),
  });
  const drafts = scheduleSessionsToNodeDrafts(plan.sessions);

  it("ilk test 'Konu testi'; D/Y sözü yalnız D/Y düğümünde", () => {
    expect(practiceActivity(0).label).toBe("Konu testi");
    expect(PLAN_NODE_META.quiz.title).toBe("Konu testi");
    for (const draft of drafts.filter((node) => node.kind === "quiz")) {
      expect(draft.title).not.toMatch(/Doğru\/Yanlış/);
    }
  });

  it("her konu bloğunda konu testinin hemen ardından D/Y, sonra dönüşümlü etkileşim", () => {
    for (const [index, topic] of topics.entries()) {
      const block = drafts.filter((node) => node.meta?.topicId === topic.id);
      const kinds = block.map((node) => node.kind);
      const quiz = kinds.indexOf("quiz");
      expect(kinds[quiz + 1]).toBe("true_false");
      expect(kinds[quiz + 2]).toBe(blockInteractiveKind(index));
      expect(block.find((node) => node.kind === "true_false")?.title).toBe(`${topic.title} · Doğru/Yanlış`);
    }
    expect(BLOCK_INTERACTIVE_ROTATION).toEqual(["podcast", "qa", "oral"]);
    expect([0, 1, 2, 3].map(blockInteractiveKind)).toEqual(["podcast", "qa", "oral", "podcast"]);
  });

  it("şablon D/Y'yi atlamaz ve aynı türü ikinci kez koymaz", () => {
    const merged = mergeStudyPathTemplate(drafts);
    expect(merged.filter((node) => node.kind === "true_false")).toHaveLength(topics.length);
    expect(merged.filter((node) => node.kind === "qa")).toHaveLength(1);
    expect(merged.filter((node) => node.kind === "oral")).toHaveLength(1);
    const lonely = mergeStudyPathTemplate([
      { kind: "lesson", title: "A · Ders", dayIndex: 1, sortOrder: 0 },
      { kind: "quiz", title: "A · Konu testi", dayIndex: 1, sortOrder: 1 },
    ]);
    expect((lonely as { kind: string }[]).some((node) => node.kind === "true_false")).toBe(true);
  });

  it("varyant testin metasına yazılır", () => {
    const heavyTests = drafts.filter((node) => node.meta?.topicId === "t0" && node.kind === "quiz");
    expect(heavyTests.map((node) => node.meta?.practiceVariant)).toEqual(heavyTests.map((_, index) => index));
  });
});

describe("kablolama", () => {
  const node = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
  it("test önceki kökleri ve dilimi alır; kartlar yalnız konunun sayfalarından ve önceki kartsız", () => {
    expect(node).toMatch(/kind: "quiz",\s+excludeNodeId/);
    expect(node).toContain("practiceCoverage(variant, lessonBackbone(clean");
    expect(node).toContain("teacherPages(input, core ? { ...core, support: [] } : core)");
    expect(node).toContain('kind: "cards",');
  });

  it("motorlar üretimden sonra süzer", () => {
    expect(readFileSync("src/lib/learning/teacher-quiz-run.ts", "utf8")).toContain("dropNearDuplicates(loop.questions");
    expect(readFileSync("src/lib/learning/teacher-cards.ts", "utf8")).toContain("dropNearDuplicates(");
  });
});
