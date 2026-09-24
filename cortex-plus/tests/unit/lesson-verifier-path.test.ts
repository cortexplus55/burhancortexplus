import { describe, expect, it } from "vitest";
import { podcastNumbersOutsideLesson } from "@/lib/learning/podcast-from-lesson";
import { unsupportedQuantities } from "@/lib/learning/teacher-brain";
import {
  LESSON_V2_SCHEMA_HINT,
  lessonDraftForVerifier,
  lessonPublishIssues,
  podcastDraftForVerifier,
  publishLessonDraft,
  publishablePodcast,
  validatePodcastPedagogy,
} from "@/lib/learning/teaching-standards";
import { runIndependentValidation } from "@/lib/learning/validation-pipeline";

/**
 * #78 ders şemasında review yoktu ve denetçi dersi geçiriyordu.
 * #80 review'ı şık kopyasıyla aynı JSON şemasına yazdı.
 * #81 (62263c6) bunu `"review"?:{"prompt":string}` yaptı. `?` geçerli JSON
 * değil; denetçi bu formatı ve taslaktaki tekrar alanını görünce dersin
 * tamamını content_verification_failed ile reddediyor.
 */
const HINT_BROKEN_IN_81 = '"review"?:{"prompt":string}';

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
  it("does not put the #81 review token in the format the verifier grades", () => {
    expect(HINT_BROKEN_IN_81).toContain("review");
    expect(LESSON_V2_SCHEMA_HINT).not.toContain(HINT_BROKEN_IN_81);
    expect(LESSON_V2_SCHEMA_HINT).not.toContain("check.review");
  });

  it("drops a broken review and one weak check, then the independent gate passes", () => {
    const draft = JSON.stringify(lesson);
    const forVerifier = lessonDraftForVerifier(draft);
    expect(forVerifier).not.toContain("TEKRAR-KOKU");
    expect(forVerifier).not.toContain("bozuk-tekrar");

    const parsed = JSON.parse(forVerifier) as unknown;
    const published = publishLessonDraft(parsed);
    expect(published?.sections[2].check).toBeUndefined();
    expect(published?.sections[0].check?.review).toBeUndefined();
    expect(published?.sections[0].check?.prompt).toContain("Basınç");

    const pedagogy = lessonPublishIssues(parsed);
    expect(pedagogy).toEqual([]);
    const verdict = runIndependentValidation({
      draft: forVerifier,
      parsed,
      pedagogyIssues: pedagogy,
      sourceExcerpt: source,
      requireSourceSupport: true,
      sourcePages: [2, 3],
    });
    expect(verdict.ok).toBe(true);
  });

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

  it("fails the lesson when too few teaching checks remain", () => {
    const thin = {
      ...lesson,
      sections: lesson.sections.map((item) => ({
        ...item,
        check: {
          ...item.check,
          explanation: "Doğru yanıt budur.",
        },
      })),
    };
    expect(lessonPublishIssues(thin).some((issue) => issue.includes("kontrol sorusu"))).toBe(
      true,
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

  it("drops one scaffold chapter and still passes pedagogy", () => {
    expect(validatePodcastPedagogy(podcast).some((issue) => issue.includes("şablon"))).toBe(
      true,
    );
    const cleaned = JSON.parse(podcastDraftForVerifier(JSON.stringify(podcast))) as typeof podcast;
    expect(cleaned.chapters.map((item) => item.title)).not.toContain("Özet");
    expect(validatePodcastPedagogy(cleaned)).toEqual([]);
    const verdict = runIndependentValidation({
      draft: JSON.stringify(cleaned),
      parsed: cleaned,
      pedagogyIssues: validatePodcastPedagogy(publishablePodcast(cleaned)),
      minItems: 4,
      sourceExcerpt: source,
      requireSourceSupport: true,
    });
    expect(verdict.ok).toBe(true);
  });

  it("still blocks a number that is not in the lesson", () => {
    const outside = podcastNumbersOutsideLesson(
      "Standart değer 101 kPa diye okunur.",
      "Basınç kuvvet bölü alandır.",
    );
    expect(outside).toContain("101");
  });
});
