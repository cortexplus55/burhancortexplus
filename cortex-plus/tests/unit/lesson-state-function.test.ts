import { describe, expect, it } from "vitest";
import { runIndependentValidation } from "@/lib/learning/validation-pipeline";
import {
  definitionalInversionIssues,
  inversionIssuesInValue,
  mistakeTeachesInversion,
} from "@/lib/learning/unit-inversions";
import { groundLearnerLesson, groundLessonDraft } from "@/lib/learning/lesson-grounding";

const LIVE_PROMPT =
  "Bir sistem yalnızca başlangıç ve son haline göre tanımlanıyorsa, değişim hal fonksiyonu olarak adlandırılır.";
const LIVE_EXPLANATION = "Değişim hal fonksiyonu, başlangıç ve son halden bağımsızdır.";
const LIVE_CLAIM = "Bir proses sırasında net enerji değişimi sıfırdır.";
const LIVE_CORRECTION =
  "Bir proses sırasında enerji değişimi hal özelliklerine bağlıdır, net değişim ortam koşullarına göre değişebilir.";

const STATE_SENTENCE =
  "Hal fonksiyonunun değişimi yalnızca başlangıç ve son hale bağlıdır ve yoldan bağımsızdır.";
const CYCLE_SENTENCE =
  "Bir çevrimde net enerji değişimi sıfırdır; bir proseste değişim uç hallere bağlıdır.";

const source = [
  STATE_SENTENCE,
  "Isı ve iş yol fonksiyonudur.",
  CYCLE_SENTENCE,
  "Kapalı sistemde kütle geçişi olmaz. Açık sistemde kütle geçişi olur.",
  "Adyabatik süreçte ısı geçişi yoktur. İzotermal süreçte sıcaklık sabittir.",
  "Yarı dengeli süreç ara hallerin her birinde dengeye yakındır.",
].join(" ");

const BODY =
  "Hal fonksiyonunun değişimi yalnızca başlangıç ve son hale bağlıdır ve yoldan bağımsızdır. Isı ve iş yol fonksiyonudur. Bir çevrimde net enerji değişimi sıfırdır; bir proseste değişim uç hallere bağlıdır.";

function liveLesson() {
  return {
    title: "Denge, Proses ve Çevrim",
    objective: "Hal fonksiyonunu yoldan, çevrimi prosesten ayırt edebileceksin.",
    sections: [
      {
        heading: "Hal ve yol fonksiyonu",
        body: BODY,
        check: {
          type: "trueFalse" as const,
          prompt: LIVE_PROMPT,
          options: ["Doğru", "Yanlış"],
          answerIndex: 0,
          explanation: LIVE_EXPLANATION,
        },
      },
    ],
    commonMistake: { claim: LIVE_CLAIM, correction: LIVE_CORRECTION },
    summary: ["Hal fonksiyonu yoldan bağımsızdır.", LIVE_EXPLANATION, LIVE_CORRECTION],
  };
}

describe("thermodynamic concept pairs", () => {
  it("keeps textbook sentences and flags the inverted live strings", () => {
    const clean = [
      STATE_SENTENCE,
      "Isı ve iş yol fonksiyonudur; yola bağlıdır.",
      "Isı bir yol fonksiyonudur, hal fonksiyonu değildir.",
      "Hal fonksiyonu yola bağlı değildir.",
      "Bir çevrimde net enerji değişimi sıfırdır.",
      "Bir çevrimde ΔU = ΔH = ΔE = 0.",
      "Kapalı sistemde kütle geçişi olmaz. Açık sistemde kütle geçişi olur.",
      "Adyabatik süreçte ısı geçişi yoktur. İzotermal süreçte sıcaklık sabittir.",
      "Yarı dengeli süreç ara hallerin her birinde dengeye yakındır.",
      "Yarı dengeli süreç dengeden uzaklaşmadan ilerler.",
      "Sıcaklık yeğin bir özelliktir.",
      "Kütle yaygın bir özelliktir.",
      "Özgül hacim yeğin bir özelliktir.",
    ];
    for (const sentence of clean) {
      expect(definitionalInversionIssues(sentence), sentence).toEqual([]);
    }

    const wrong = [
      LIVE_EXPLANATION,
      LIVE_PROMPT,
      LIVE_CORRECTION,
      LIVE_CLAIM,
      "Hal fonksiyonu yola bağlıdır.",
      "Isı bir hal fonksiyonudur.",
      "Adyabatik süreçte sıcaklık sabittir.",
      "İzotermal süreçte ısı geçişi yoktur.",
      "Kapalı sistem kütle geçirir.",
      "Açık sistemde kütle geçişi olmaz.",
      "Sıcaklık yaygın bir özelliktir.",
      "Kütle yeğin bir özelliktir.",
      "Yarı dengeli süreç dengeden uzaktır.",
      "Bir çevrimde net enerji değişimi sıfır değildir.",
    ];
    for (const sentence of wrong) {
      expect(definitionalInversionIssues(sentence).length, sentence).toBeGreaterThan(0);
    }
    expect(definitionalInversionIssues(LIVE_CORRECTION).join(" ")).toMatch(/Belirsiz fizik/);
    expect(definitionalInversionIssues(LIVE_EXPLANATION).join(" ")).toMatch(/hal fonksiyonu/);
  });

  it("keeps a process-zero claim when the correction names the cycle", () => {
    const repair = "Bir çevrimde net enerji değişimi sıfırdır; bir proseste değişim uç hallere bağlıdır.";
    expect(mistakeTeachesInversion(LIVE_CLAIM, repair)).toBe(false);
    expect(
      inversionIssuesInValue({
        claim: LIVE_CLAIM,
        correction: repair,
      }),
    ).toEqual([]);
    expect(mistakeTeachesInversion(LIVE_CLAIM, LIVE_CORRECTION)).toBe(true);
  });

  it("treats a Doğru-keyed prompt as the lesson and a Yanlış-keyed prompt as the misconception", () => {
    const taught = inversionIssuesInValue({
      prompt: LIVE_PROMPT,
      options: ["Yanlış", "Doğru"],
      answerIndex: 1,
      explanation: STATE_SENTENCE,
    });
    expect(taught.length).toBeGreaterThan(0);

    const misconception = inversionIssuesInValue({
      prompt: LIVE_PROMPT,
      options: ["Doğru", "Yanlış"],
      answerIndex: 1,
      explanation: STATE_SENTENCE,
    });
    expect(misconception).toEqual([]);
  });

  it("replaces ungrounded check feedback with the source sentence and drops the muddled card", () => {
    const raw = liveLesson();
    const blocked = runIndependentValidation({
      draft: JSON.stringify(raw),
      parsed: raw,
      pedagogyIssues: [],
    });
    expect(blocked.failedStage).toBe("domain");
    expect(blocked.issues.some((issue) => issue.code === "definition_inversion")).toBe(true);

    const grounded = groundLearnerLesson(raw, source);
    const lesson = grounded.lesson as {
      sections: { body: string; check?: { prompt: string; explanation: string; answerIndex: number } }[];
      commonMistake?: unknown;
      summary?: string[];
    };
    expect(grounded.removed.join(" ")).toMatch(/explanation_replaced|prompt_replaced/);
    expect(grounded.removed.join(" ")).toMatch(/commonMistake/);
    expect(lesson.commonMistake).toBeUndefined();
    const check = lesson.sections[0]?.check;
    expect(check?.prompt).toContain("başlangıç ve son hale bağlıdır");
    expect(check?.explanation).toContain("başlangıç ve son hale bağlıdır");
    expect(check?.prompt).not.toContain("halden bağımsız");
    expect(check?.explanation).not.toContain("halden bağımsız");
    expect(check?.explanation).not.toContain("ortam koşullarına");
    expect(JSON.stringify(lesson)).not.toContain(LIVE_EXPLANATION);
    expect(JSON.stringify(lesson)).not.toContain("ortam koşullarına");
    expect(lesson.summary?.some((item) => item.includes("halden bağımsız"))).toBe(false);

    const opened = runIndependentValidation({
      draft: JSON.stringify(lesson),
      parsed: lesson,
      pedagogyIssues: [],
    });
    expect(opened.issues.filter((issue) => issue.code === "definition_inversion")).toEqual([]);
    expect(opened.failedStage).toBeNull();

    const again = groundLearnerLesson(lesson, source);
    expect(again.removed).toEqual([]);
    expect(groundLessonDraft(JSON.stringify(lesson), source)).toBe(JSON.stringify(lesson));
  });

  it("drops the check when the source has no sentence for the concept", () => {
    const raw = liveLesson();
    const grounded = groundLearnerLesson(raw, "Basınç, yüzeye dik kuvvetin alana oranıdır. P = F/A.");
    const lesson = grounded.lesson as {
      sections: { check?: unknown }[];
      commonMistake?: unknown;
    };
    expect(lesson.sections[0]?.check).toBeUndefined();
    expect(lesson.commonMistake).toBeUndefined();
    expect(JSON.stringify(lesson)).not.toContain("halden bağımsız");
    expect(JSON.stringify(lesson)).not.toContain("ortam koşullarına");
  });

  it("keeps a repaired common-mistake card", () => {
    const raw = liveLesson();
    raw.commonMistake = {
      claim: LIVE_CLAIM,
      correction: CYCLE_SENTENCE,
    };
    raw.sections[0].check = {
      type: "trueFalse",
      prompt: LIVE_PROMPT,
      options: ["Doğru", "Yanlış"],
      answerIndex: 1,
      explanation: STATE_SENTENCE,
    };
    const grounded = groundLearnerLesson(raw, source);
    const lesson = grounded.lesson as {
      commonMistake?: { claim: string; correction: string };
      sections: { check?: { prompt: string; explanation: string } }[];
    };
    expect(lesson.commonMistake?.correction).toBe(CYCLE_SENTENCE);
    expect(lesson.sections[0]?.check?.prompt).toBe(LIVE_PROMPT);
    expect(lesson.sections[0]?.check?.explanation).toBe(STATE_SENTENCE);
  });
});
