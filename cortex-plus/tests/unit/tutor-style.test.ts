import { describe, expect, it } from "vitest";
import { contentDifficultyLine } from "@/lib/learning/session-signals";
import {
  QA_TEACHER_PROMPT,
  TUTOR_ANSWER_DISCIPLINE,
  tutorStylePrompt,
} from "@/lib/learning/tutor-style";

describe("tutor prompt snapshot", () => {
  it("locks the answer-first discipline for every style (P1-5)", () => {
    expect(tutorStylePrompt("step_by_step")).toBe(
      `${TUTOR_ANSWER_DISCIPLINE} Öğrenci adım adım stili seçti: ilk cümlede sonucu ver, sonra her adımı gerekçesiyle ayrı satırda yaz.`,
    );
    expect(tutorStylePrompt("hints_first")).toBe(
      `${TUTOR_ANSWER_DISCIPLINE} Öğrenci ipucu öncelikli stili seçti: problem çözümünde tam çözümü başta verme; kavram sorusunda yine ilk cümle cevaptır.`,
    );
    expect(tutorStylePrompt("direct_solve")).toBe(
      `${TUTOR_ANSWER_DISCIPLINE} Öğrenci doğrudan çözüm istedi: ilk cümlede sonucu ver, sonra kısa ve gerekçeli çözüm.`,
    );
    expect(TUTOR_ANSWER_DISCIPLINE).toContain("ilk cümle tam cevaptır");
    expect(TUTOR_ANSWER_DISCIPLINE).toContain("yalnız öğrenci kendi çözümünü yazdıysa");
    expect(TUTOR_ANSWER_DISCIPLINE).not.toContain("Cevabı baştan yapıştırma");
    expect(TUTOR_ANSWER_DISCIPLINE).toContain("Boş alkış yok");
    expect(QA_TEACHER_PROMPT).toContain("misconceptionTag");
    expect(QA_TEACHER_PROMPT).toContain("Filler yok");
    // 24 Ekim 2026: beş soru aynı kalıptaydı.
    expect(QA_TEACHER_PROMPT).toContain("aynı soru kökü kalıbı en çok iki soruda");
  });
});

describe("exam item difficulty follows focus and diagnosis", () => {
  it("starts easier on a focus topic or a weak measurement", () => {
    expect(
      contentDifficultyLine({
        requested: "orta",
        familiarity: "basics",
        focusTopic: true,
        measuredLevel: "solid",
      }),
    ).toContain("odak konusu");
    expect(
      contentDifficultyLine({
        requested: "orta",
        familiarity: "good",
        focusTopic: false,
        measuredLevel: "weak",
      }),
    ).toContain("düşük tanı");
  });

  it("uses exam-level distractors when the diagnosis is solid", () => {
    expect(
      contentDifficultyLine({
        requested: "orta",
        familiarity: "good",
        focusTopic: false,
        measuredLevel: "solid",
      }),
    ).toContain("sınav seviyesinde");
  });
});
