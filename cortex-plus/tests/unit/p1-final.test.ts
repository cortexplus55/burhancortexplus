import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  FINAL_CHECK_LIMIT,
  FINAL_SECTION_TITLE,
  finalCardTopics,
  finalCheckSelection,
  inFinalSection,
  interleaveByTopic,
  roundRobinCounts,
} from "@/lib/learning/final-block";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { buildPathSections, type PathSectionNode } from "@/lib/learning/path-sections";

function node(
  id: string,
  kind: PathSectionNode["kind"],
  sortOrder: number,
  topicTitle?: string,
  adaptive?: string,
): PathSectionNode {
  return { id, kind, sortOrder, status: "locked", sessionMeta: { topicTitle: topicTitle ?? null, adaptive } };
}

function question(topic: string, text = `${topic} sorusu`): QuizQuestion {
  return { text, options: ["a", "b", "c", "d"], correct: ["a"], multi: false, topic };
}

describe("P1-4 final bölümü", () => {
  it("son konudan sonraki hazırlık geneli adımlar tek final bölümünde, 1. konunun adıyla değil", () => {
    const sections = buildPathSections(
      [
        node("a1", "lesson", 0, "Hücre"),
        node("a2", "quiz", 1, "Hücre"),
        node("b1", "lesson", 2, "Mitoz"),
        node("w", "written_exam", 3, "Hücre"),
        node("f", "flashcards", 4, "Hücre"),
        node("fc", "final_check", 5, "Hücre"),
      ],
      null,
    );
    expect(sections.map((section) => section.title)).toEqual(["Hücre", "Mitoz", FINAL_SECTION_TITLE]);
    expect(sections.at(-1)?.nodes.map((item) => item.id)).toEqual(["w", "f", "fc"]);
    expect(FINAL_SECTION_TITLE).toBe("🏁 Sınav Finali ve Eksik Kapatma");
  });

  it("uyarlamalı odaklı pratik kendi konu bloğunda kalır", () => {
    expect(inFinalSection("focused", { adaptive: "low" })).toBe(false);
    expect(inFinalSection("focused", null)).toBe(true);
    const sections = buildPathSections(
      [node("a1", "lesson", 0, "Hücre"), node("af", "focused", 1, "Hücre", "low"), node("fc", "final_check", 2)],
      null,
    );
    expect(sections.map((section) => section.title)).toEqual(["Hücre", FINAL_SECTION_TITLE]);
    expect(sections[0]?.nodes.map((item) => item.id)).toEqual(["a1", "af"]);
  });

  it("yolun ortasındaki hazırlık geneli adım sırasını korur", () => {
    const sections = buildPathSections(
      [node("a1", "lesson", 0, "Hücre"), node("w", "written_exam", 1, "Hücre"), node("b1", "lesson", 2, "Mitoz")],
      null,
    );
    expect(sections.flatMap((section) => section.nodes.map((item) => item.id))).toEqual(["a1", "w", "b1"]);
    expect(sections.map((section) => section.title)).not.toContain(FINAL_SECTION_TITLE);
  });
});

describe("P1-4 son kontrol", () => {
  it("konu başına bir soru; havuzda sorusu olmayan konu eksik listesine düşer", () => {
    const pool = [question("Hücre", "h1"), question("Hücre", "h2"), question("Mitoz")];
    const picked = finalCheckSelection(["Hücre", "Mitoz", "Mayoz", "hücre"], pool);
    expect(picked.questions.map((item) => item.text)).toEqual(["h1", "Mitoz sorusu"]);
    expect(picked.missingTopics).toEqual(["Mayoz"]);
  });

  it("en çok 12 konu", () => {
    const topics = Array.from({ length: 20 }, (_, index) => `Konu ${index + 1}`);
    const picked = finalCheckSelection(topics, []);
    expect(picked.missingTopics).toHaveLength(FINAL_CHECK_LIMIT);
    expect(FINAL_CHECK_LIMIT).toBe(12);
  });

  it("rota eksik konuları konu başına tek ücretle üretir", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toMatch(/kind === "final_check" && input\.finalFill/);
    expect(route).toMatch(/fillTopicQuestions\(/);
    const fill = readFileSync("src/lib/learning/prep-topic-fill.ts", "utf8");
    expect(fill).toMatch(/heldReservationId: held/);
    expect(fill).toMatch(/reserveCredits\(/);
  });
});

describe("P1-4 son tekrar kartları", () => {
  it("güçlü konular dışarıda, en zayıf önce; hepsi güçlüyse yine kart çıkar", () => {
    expect(
      finalCardTopics([
        { label: "A", confidence: 0.9 },
        { label: "B", confidence: 0.3 },
        { label: "C", confidence: null },
        { label: "D", confidence: 0.6 },
      ]),
    ).toEqual(["B", "D", "C"]);
    expect(finalCardTopics([{ label: "A", confidence: 0.95 }])).toEqual(["A"]);
  });

  it("8 kart 3 konuya 3-3-2 dağılır ve sırayla birleşir", () => {
    expect(roundRobinCounts(["A", "B", "C"], 8).map((row) => row.count)).toEqual([3, 3, 2]);
    expect(interleaveByTopic([["a1", "a2", "a3"], ["b1", "b2"], ["c1"]], 5)).toEqual(["a1", "b1", "c1", "a2", "b2"]);
  });

  it("rota son tekrar kartlarını konu konu yazar", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    expect(route).toMatch(/loadFinalCardTopics\(/);
    expect(route).toMatch(/interleaveByTopic\(/);
  });
});
