import { describe, expect, it } from "vitest";
import { podcastNumbersOutsideLesson } from "@/lib/learning/podcast-from-lesson";
import { unsupportedQuantities } from "@/lib/learning/teacher-brain";
import { lessonPublishIssues, publishLessonDraft } from "@/lib/learning/teaching-standards";
import { runIndependentValidation } from "@/lib/learning/validation-pipeline";

const source = "Basınç, birim alana dik gelen kuvvettir. Mutlak sıcaklık santigrat değerine 273 eklenerek bulunur.";

const section = (
  heading: string,
  check: {
    type: "mcq" | "trueFalse";
    prompt: string;
    options: string[];
    answerIndex: number;
    explanation: string;
    review?: unknown;
  },
) => ({
  heading,
  body: `**${heading}** basınç ve sıcaklık tablosundan okunur.`,
  check,
});

const lesson = {
  title: "Basınç ve sıcaklık",
  objective: "Basıncı kuvvet ve alandan, sıcaklığı mutlak ölçekten okuyabileceksin.",
  overview: "Basınç birim alana gelen kuvvettir; mutlak sıcaklık santigrattan türetilir.",
  sections: [
    section("Basınç Kuvvet Bölü Alandır", {
      type: "mcq",
      prompt: "Basınç hangi oranla tanımlanır?",
      options: ["Kuvvet bölü alan", "Kütle bölü hacim", "Enerji bölü zaman"],
      answerIndex: 0,
      explanation: "Kütle bölü hacim yoğunluktur; basınç kuvvetin alana bölümüdür.",
      review: { prompt: "TEKRAR-KOKU birim alana gelen etki nedir?", options: ["uydurma"] },
    }),
    section("Mutlak Sıcaklık", {
      type: "trueFalse",
      prompt: "Santigrat değer mutlak sıcaklığın kendisidir.",
      options: ["Doğru", "Yanlış"],
      answerIndex: 1,
      explanation: "Mutlak sıcaklık santigrata 273 eklenerek bulunur, kendisi değildir.",
      review: "bozuk-tekrar",
    }),
    section("Tablo Nasıl Okunur", {
      type: "mcq",
      prompt: "Tabloda basınç hangi sütunda durur?",
      options: ["Birinci sütun", "İkinci sütun", "Üçüncü sütun"],
      answerIndex: 0,
      explanation: "Doğru yanıt birinci sütundur.",
    }),
    section("Kelvin Dönüşümü", {
      type: "trueFalse",
      prompt: "Mutlak sıcaklık santigratın kendisidir.",
      options: ["Doğru", "Yanlış"],
      answerIndex: 1,
      explanation: "Santigrata 273 eklenir; iki ölçek aynı sayı değildir.",
    }),
  ],
  example: {
    prompt: "Genişleyen pistonun basıncı nasıl okunur?",
    solution: "Kuvvet alana bölünür, bu yüzden alan artınca basınç düşer.",
  },
  commonMistake: {
    claim: "Santigrat ile kelvin aynı sayıdır.",
    correction: "Kelvin, santigrata 273 eklenmiş ölçektir.",
  },
  infoCheck: { prompt: "Basınç nedir?", answer: "Birim alana gelen kuvvettir." },
  summary: ["Basınç kuvvet bölü alandır.", "Kelvin santigrata 273 ekler."],
  nextFocus: ["Hal değişimi"],
};

describe("lesson verifier path", () => {

  it("still blocks a quantity the source does not contain", () => {
    const invented = {
      ...lesson,
      sections: lesson.sections.map((item, index) =>
        index === 2
          ? {
              ...item,
              check: {
                ...item.check,
                explanation: "İkinci sütun sıcaklıktır; basınç birinci sütundadır.",
              },
            }
          : item,
      ),
      overview: "Tablodaki örnek P = 300 kPa diye okunur ve buradan gidilir.",
    };
    expect(unsupportedQuantities(invented.overview, source)).toContain("300");
    const verdict = runIndependentValidation({
      draft: JSON.stringify(invented),
      parsed: invented,
      pedagogyIssues: ["Kaynakta olmayan nicelik: 300"],
      sourceExcerpt: source,
      requireSourceSupport: true,
    });
    expect(verdict.ok).toBe(false);
    expect(verdict.failedStage).toBe("pedagogy");
  });

  it("keeps one weak check on a short lesson instead of rejecting for a second question", () => {
    const thin = {
      ...lesson,
      sections: lesson.sections.slice(0, 2).map((item) => ({
        ...item,
        check: {
          ...item.check,
          explanation: "Doğru yanıt budur.",
        },
      })),
    };
    expect(lessonPublishIssues(thin).some((issue) => issue.includes("kontrol sorusu"))).toBe(
      false,
    );
    const published = publishLessonDraft(thin);
    expect(published?.sections.filter((section) => section.check).length).toBe(1);

    const wide = {
      ...lesson,
      sections: lesson.sections.slice(0, 3).map((item) => ({
        ...item,
        check: {
          ...item.check,
          explanation: "Doğru yanıt budur.",
        },
      })),
    };
    expect(lessonPublishIssues(wide).some((issue) => issue.includes("3 kontrol sorusu"))).toBe(
      false,
    );
  });

  it("still rejects a lesson that has no check question left to keep", () => {
    const empty = {
      ...lesson,
      infoCheck: undefined,
      sections: lesson.sections.map(({ check: _check, ...section }) => section),
    };
    expect(lessonPublishIssues(empty).some((issue) => issue.includes("kontrol sorusu"))).toBe(
      true,
    );
  });

  it("accepts a short lesson whose only answered question is the info check", () => {
    const onlyInfo = {
      ...lesson,
      sections: lesson.sections.slice(0, 2).map(({ check: _check, ...section }) => section),
    };
    expect(lessonPublishIssues(onlyInfo).some((issue) => issue.includes("kontrol sorusu"))).toBe(
      false,
    );
    const wide = {
      ...lesson,
      sections: lesson.sections.map(({ check: _check, ...section }) => section),
    };
    expect(lessonPublishIssues(wide).some((issue) => issue.includes("3 kontrol sorusu"))).toBe(
      false,
    );
  });
});

describe("podcast verifier path", () => {
  const chapter = (title: string, text: string) => ({
    title,
    lines: [
      { speaker: "ada" as const, text },
      { speaker: "ada" as const, text: `${text} Sınavda bu ayrım sorulur.` },
    ],
  });

  const podcast = {
    title: "Basınç",
    objective: "Basıncı kuvvet ve alandan anlatmak.",
    sourcePoints: ["Basınç kuvvet bölü alandır.", "Alan artınca basınç düşer."],
    chapters: [
      chapter("Basınç Kuvvet Bölü Alandır", "Basınç, kuvvetin alana bölümüdür."),
      chapter("Alan Artınca Basınç Düşer", "Aynı kuvvet daha geniş alana yayılır."),
      chapter("Mutlak Sıcaklık", "Santigrata iki yüz yetmiş üç eklenir."),
      chapter("Tablo Sütunu", "Basınç birinci sütundan okunur."),
      chapter("Özet", "Anlamadan tablo okumak yanlıştır."),
    ],
  };

  it("still blocks a number that is not in the lesson", () => {
    const outside = podcastNumbersOutsideLesson(
      "Standart değer 101 kPa diye okunur.",
      "Basınç kuvvet bölü alandır.",
    );
    expect(outside).toContain("101");
  });
});
