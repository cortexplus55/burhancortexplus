import { describe, expect, it } from "vitest";
import { lessonSectionDetails } from "@/lib/learning/lesson-section-text";
import { lessonPodcastBrief, podcastNumbersOutsideLesson } from "@/lib/learning/podcast-from-lesson";
import { isScaffoldHeading, type LessonV2 } from "@/lib/learning/teaching-standards";

function lesson(section: Partial<LessonV2["sections"][number]>): LessonV2 {
  return {
    title: "Hedef Boy",
    sections: [
      {
        heading: "Hedef Boy Hesabı",
        body: "Hedef boy, çocuğun genetik olarak ulaşması beklenen boyun merkezidir.",
        ...section,
      },
    ],
  };
}

const PROCEDURE = {
  steps: [
    { label: "Boyları topla", detail: "Anne ve baba boyu toplanır, örneğin 160 + 176 = 336 cm." },
    { label: "Cinsiyete göre düzelt", detail: "Erkekte 13 cm eklenir, kızda 13 cm çıkarılır." },
    { label: "İkiye böl", detail: "Toplam 2'ye bölünür." },
  ],
};

describe("lessonSectionDetails", () => {
  it("returns nothing for a section with only heading and body", () => {
    expect(lessonSectionDetails(lesson({}).sections[0]!)).toEqual([]);
  });

  it("renders formula, ordered procedure steps and table pairs as sentence-style lines", () => {
    const details = lessonSectionDetails(
      lesson({
        formula: { title: "Hedef boy", expression: "(anne + baba ± 13) / 2" },
        procedure: PROCEDURE,
        table: { columns: ["Persentil", "SD"], rows: [["3", "-1.88"], ["50", "0"]] },
      }).sections[0]!,
    );
    expect(details).toHaveLength(3);
    expect(details[0]).toContain("(anne + baba ± 13) / 2");
    expect(details[1]).toMatch(/1\) Boyları topla: .*2\) Cinsiyete göre düzelt: .*3\) İkiye böl/);
    expect(details[2]).toContain("Persentil 3, SD -1.88");
  });

  it("never starts a line with a scaffold heading word (would lock podcast generation)", () => {
    const details = lessonSectionDetails(
      lesson({ formula: { title: "Hedef boy", expression: "x" }, procedure: PROCEDURE }).sections[0]!,
    );
    for (const line of details) {
      const label = line.split(":")[0]!;
      expect(isScaffoldHeading(label)).toBe(false);
    }
  });
});

describe("lessonPodcastBrief with structured blocks", () => {
  it("forwards procedure steps and table values, not just the section body", () => {
    const brief = lessonPodcastBrief(
      lesson({
        procedure: PROCEDURE,
        table: { columns: ["Persentil", "SD"], rows: [["3", "-1.88"], ["97", "1.88"]] },
      }),
    );
    expect(brief).toContain("Cinsiyete göre düzelt");
    expect(brief).toContain("13 cm");
    expect(brief).toContain("Persentil 97, SD 1.88");
  });

  it("does not flag numbers that come from the lesson's procedure or table as outside the lesson", () => {
    const brief = lessonPodcastBrief(
      lesson({
        procedure: PROCEDURE,
        table: { columns: ["Persentil", "SD"], rows: [["3", "-1.88"], ["97", "1.88"]] },
      }),
    );
    const podcast = "Anne ve baba boyunu topla: 336 santimetre. Kızsa 13 çıkar. 97. persentil yaklaşık 1,88 SD eder.";
    expect(podcastNumbersOutsideLesson(podcast, brief)).toEqual([]);
  });

  it("still flags a number that appears nowhere in the lesson", () => {
    const brief = lessonPodcastBrief(lesson({ procedure: PROCEDURE }));
    expect(podcastNumbersOutsideLesson("Kızsa 17 cm çıkar.", brief)).toEqual(["17"]);
  });
});
