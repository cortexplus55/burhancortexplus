import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  parseTeacherAnalysis,
  SOURCE_PAGE_FORMULA_RULE,
  teacherBriefForTopic,
  teacherNoteGroundedInSource,
} from "@/lib/learning/teacher-brain";
import {
  lessonDraftForVerifier,
  lessonPublishIssues,
  parseModelJson,
  publishLessonDraft,
} from "@/lib/learning/teaching-standards";

/**
 * Canlı red (e58afd8): düğüm sayfalarında ideal gaz yokken üretici PV = nRT
 * yazdı. Öğretmen analizi sayfa 7'yi biliyor; doğrulayıcı yalnızca düğümün
 * sayfalarına bakıyor. Not vurgu kalır, formül kaynak metninde yoksa düşer.
 */
const nodePages =
  "Sayfa 2. Basınç, birim alana dik gelen kuvvettir. P = F / A. " +
  "Sayfa 3. Sıcaklık termometre ile ölçülür. Mutlak sıcaklık santigrata 273 eklenerek bulunur.";

const analysis = parseTeacherAnalysis({
  language: "tr",
  summary: "Belge basıncı ve sonraki konuda ideal gazı anlatır.",
  objectives: [
    { statement: "Öğrenci basıncı kuvvet ve alandan okur.", pageNumbers: [2] },
    { statement: "Öğrenci ideal gaz yasasını uygular.", pageNumbers: [7] },
  ],
  examFocus: {
    questionTypes: ["hesap"],
    keyFormulas: [
      { expression: "P = F / A", meaning: "basınç", pageNumbers: [2] },
      { expression: "PV = nRT", meaning: "ideal gaz", pageNumbers: [2, 7] },
    ],
    keyDefinitions: [
      { term: "basınç", definition: "Birim alana gelen kuvvettir.", pageNumbers: [2] },
    ],
  },
  misconceptions: [
    {
      mistake: "Basınç yalnız ağırlıktır.",
      correction: "Basınç kuvvetin alana bölümüdür.",
      pageNumbers: [2],
    },
    {
      mistake: "Sıcaklık basıncı değiştirmez.",
      correction: "İdeal gaz yasası PV = nRT bunu bağlar.",
      pageNumbers: [7],
    },
  ],
  topics: [
    {
      title: "Basınç ve Sıcaklık Kavramları",
      emphasis: "core",
      prerequisites: ["Kuvvet"],
      pageNumbers: [2, 3],
      strategy: {
        examples: ["P = F / A ile okunur", "İdeal gaz denkleminden PV = nRT"],
        analogies: [],
        mnemonics: [],
        workedExamplePlan: "Önce kuvveti alana böl.",
        checkQuestions: ["Basınç nasıl tanımlanır?"],
      },
    },
  ],
});

function lessonAsk(note: string, source: string): string {
  return `Konu: Basınç ve Sıcaklık Kavramları.\n${note}\n${SOURCE_PAGE_FORMULA_RULE}\n${source}`;
}

describe("teacher note versus node pages", () => {
  it("keeps a formula the analysis tags on the topic even when the node text lacks it", () => {
    expect(analysis).not.toBeNull();
    const brief = teacherBriefForTopic(analysis!, "Basınç ve Sıcaklık Kavramları");
    expect(brief).toContain("PV = nRT");
    expect(brief).toContain("P = F / A");
    expect(brief).not.toContain("ideal gaz yasasını uygular");
    expect(brief).not.toContain("Sıcaklık basıncı değiştirmez");
  });

  it("drops that formula from the prompt the lesson generator and verifier share", () => {
    const brief = teacherBriefForTopic(analysis!, "Basınç ve Sıcaklık Kavramları");
    const note = teacherNoteGroundedInSource(brief, nodePages);
    const ask = lessonAsk(note, nodePages);
    expect(ask).toContain(SOURCE_PAGE_FORMULA_RULE);
    expect(ask).toContain("P = F / A");
    expect(ask).toContain("vurgu");
    expect(ask).not.toContain("PV = nRT");
    expect(ask).not.toContain("nRT");
    expect(ask).not.toContain("İdeal gaz");
    expect(ask).not.toContain("ideal gaz");
  });

  it("uses the same grounding on lesson, podcast, chat, and voice prompts", () => {
    const node = readFileSync("src/app/api/learning/exam-prep/node/route.ts", "utf8");
    const lesson = readFileSync("src/app/api/learning/exam-prep/lesson/route.ts", "utf8");
    const chat = readFileSync("src/lib/learning/exam-chat-context.ts", "utf8");
    const chatRoute = readFileSync("src/app/api/ai/chat/route.ts", "utf8");
    const voice = readFileSync("src/app/api/learning/exam-prep/voice/route.ts", "utf8");
    for (const source of [node, lesson, chat, chatRoute, voice]) {
      expect(source).toContain("teacherNoteGroundedInSource");
      expect(source).toContain("SOURCE_PAGE_FORMULA_RULE");
    }
    const podcast = node.slice(node.indexOf('input.kind === "podcast"'));
    expect(podcast).toContain("podcastDraftForVerifier");
    expect(node.indexOf("teacherNoteGroundedInSource")).toBeLessThan(
      node.indexOf('input.kind === "podcast"'),
    );
  });
});

describe("cosmetic lesson shape", () => {
  const check = {
    type: "mcq" as const,
    prompt: "Basınç hangi oranla tanımlanır?",
    options: ["Kuvvet bölü alan", "Kütle bölü hacim", "Enerji bölü zaman"],
    answerIndex: 0,
    explanation: "Kütle bölü hacim yoğunluktur; basınç kuvvetin alana bölümüdür.",
  };

  it("fills a missing overview and bolds a term that is already in the section", () => {
    const raw = {
      title: "Basınç ve sıcaklık",
      objective: "Basıncı kuvvet ve alandan okuyabileceksin.",
      sections: [
        {
          heading: "Basınç",
          body: "Basınç birim alana gelen kuvvettir ve tablodan okunur.",
          check,
        },
        {
          heading: "Sıcaklık",
          body: "Sıcaklık termometre ile ölçülür ve santigrattan okunur.",
          check: {
            type: "trueFalse" as const,
            prompt: "Santigrat değer mutlak sıcaklığın kendisidir.",
            options: ["Doğru", "Yanlış"],
            answerIndex: 1,
            explanation: "Mutlak sıcaklık santigrata 273 eklenerek bulunur, kendisi değildir.",
          },
        },
        {
          heading: "Ölçek",
          body: "Ölçek kelvin ile santigrat arasında 273 fark taşır.",
          check,
        },
      ],
      example: {
        prompt: "Genişleyen pistonun basıncı nasıl okunur?",
        solution: "Kuvvet alana bölünür, bu yüzden alan artınca basınç düşer.",
      },
      commonMistake: {
        claim: "Santigrat ile kelvin aynı sayıdır.",
        correction: "Kelvin, santigrata 273 eklenmiş ölçektir.",
      },
    };
    const published = publishLessonDraft(raw);
    expect(published?.overview?.toLocaleLowerCase("tr")).toContain("basınç");
    expect(published?.sections[0].body).toContain("**Basınç**");
    expect(published?.infoCheck?.answer).toContain("Kuvvet");
    expect(published?.summary?.length).toBeGreaterThanOrEqual(2);
    expect(lessonPublishIssues(raw).some((issue) => issue.includes("koyu"))).toBe(false);
    expect(lessonPublishIssues(raw).some((issue) => issue.includes("şemasını"))).toBe(false);
  });

  it("parses fenced JSON with a trailing comma before review", () => {
    const fenced =
      '```json\n{"overview":"Basınç birim alana gelen kuvvettir ve okunur.","sections":[{"heading":"Basınç","body":"Basınç birim alana gelen kuvvettir.","check":{"review":"bozuk"}}],}\n```';
    expect(parseModelJson(fenced)).toMatchObject({
      overview: "Basınç birim alana gelen kuvvettir ve okunur.",
    });
    const stripped = lessonDraftForVerifier(fenced);
    expect(stripped.startsWith("{")).toBe(true);
    expect(stripped).toContain("Basınç");
    expect(stripped).not.toContain("bozuk");
  });
});
