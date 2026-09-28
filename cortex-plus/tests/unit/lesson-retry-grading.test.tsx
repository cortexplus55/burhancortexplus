// @vitest-environment jsdom
/**
 * Tekrar sorusunda doğru şık Yanlış sayılmaz (Açı Ölçüsü ve Radyan, 28 Eyl).
 * B1: paket önceden retryCheck taşımaz; grade-check primary sealed retry döner.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LessonV2, SectionCheck } from "@/lib/learning/teaching-standards";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import {
  buildLessonRetryCheck,
  gradeSectionCheck,
  resolveCheckForGrade,
  sealLessonForPlay,
  sealSectionCheck,
  type GradeCheckResult,
  type LessonCheckAnswer,
} from "@/lib/learning/lesson-play";
import { isDistinctRetryVariant, reviewGateLead } from "@/lib/learning/lesson-chrome";
import { reviewQuestionFor } from "@/lib/learning/teacher-brain";

Element.prototype.scrollIntoView = vi.fn();
afterEach(cleanup);

const radianLesson = {
  title: "Açı Ölçüsü ve Radyan",
  overview: "Açı ölçüsü derece ve radyan cinsinden ifade edilir.",
  sections: [
    {
      heading: "Derece ve radyan",
      body: "360 derece = 2π radyandır. 180 derece = π radyandır.",
      check: {
        type: "mcq" as const,
        prompt: "Aşağıdaki ifadelerden hangisi doğrudur?",
        options: [
          "360 derece = 2π radyandır",
          "180 derece = 2π radyandır",
          "90 derece = 2π radyandır",
          "45 derece = 2π radyandır",
        ],
        answerIndex: 0,
        explanation: "180 derece = 2π radyandır sorulan tanıma uymaz.",
        optionWhy: [
          "Tam tur 2π radyandır.",
          "180 derece π radyandır.",
          "90 derece π/2 radyandır.",
          "45 derece π/4 radyandır.",
        ],
        whyRight: "360 derece tam turdur ve 2π radyana eşittir.",
        whyWrong: "Seçtiğin şık tanıma uymaz.",
      },
    },
  ],
  summary: ["360° = 2π rad", "180° = π rad", "Dönüşüm çarpanı π/180"],
} satisfies LessonV2;

async function advanceToCheck() {
  fireEvent.click(screen.getByRole("button", { name: /Devam et/i }));
  await waitFor(() => {
    expect(screen.getByText("HIZLI SINAV")).toBeTruthy();
  });
}

describe("tekrar sorusunda doğru şık Yanlış sayılmaz (Açı Ölçüsü ve Radyan, 28 Eyl)", () => {
  it("sızdırılmış derste cevap ve retryCheck yok", () => {
    const sealed = sealLessonForPlay(radianLesson);
    const blob = JSON.stringify(sealed);
    expect(blob).not.toMatch(/"answerIndex"/);
    expect(blob).not.toMatch(/"explanation"/);
    expect(blob).not.toMatch(/"optionWhy"/);
    expect(blob).not.toMatch(/"review"/);
    expect(blob).not.toMatch(/"retryCheck"/);
    expect(sealed.sections[0]?.retryCheck).toBeUndefined();
  });

  it("iki build aynı retry varyantını üretir (deterministik)", () => {
    const a = buildLessonRetryCheck(radianLesson.sections[0]!.check!, "tr", radianLesson.sections[0]!.body);
    const b = buildLessonRetryCheck(radianLesson.sections[0]!.check!, "tr", radianLesson.sections[0]!.body);
    expect(a).toEqual(b);
  });

  it("retry varyantında kaydırılmış answerIndex doğru notlanır", () => {
    const primary = radianLesson.sections[0]!.check!;
    const retry = resolveCheckForGrade(primary, "retry", "tr", radianLesson.sections[0]!.body);
    const correctText = primary.options![primary.answerIndex];
    const pick = retry.options!.findIndex((option) => option === correctText);
    expect(pick).toBeGreaterThanOrEqual(0);
    const graded = gradeSectionCheck(retry, { pick });
    expect(graded.correct).toBe(true);
    expect(graded.answerIndex).toBe(pick);
    expect((graded.explanation ?? "").length).toBeGreaterThan(0);
  });

  it("yanlış ilk denemeden sonra tekrarda doğru → Doğru + dolu açıklama", async () => {
    const sealed = sealLessonForPlay(radianLesson);
    const gradeCheck = vi.fn(async (sectionIndex: number, answer: LessonCheckAnswer, variant = "primary") => {
      const primary = radianLesson.sections[sectionIndex]!.check!;
      const check = resolveCheckForGrade(primary, variant, "tr", radianLesson.sections[sectionIndex]!.body);
      const graded = gradeSectionCheck(check, answer) as GradeCheckResult;
      if (variant === "primary") {
        graded.retryCheck = sealSectionCheck(buildLessonRetryCheck(primary, "tr", radianLesson.sections[sectionIndex]!.body));
      }
      return graded;
    });

    render(<ExamLessonSteps lesson={sealed} gradeCheck={gradeCheck} onFinish={vi.fn()} />);
    await advanceToCheck();

    const wrongOption = screen.getAllByText(/180 derece = 2π/i).find((el) => el.closest("button.als-option"));
    expect(wrongOption).toBeTruthy();
    fireEvent.click(wrongOption!);
    await waitFor(() => expect(screen.getByText(/Yanlış/i)).toBeTruthy());
    expect(gradeCheck).toHaveBeenCalledWith(0, { pick: 1 }, "primary");
    const primaryResult = await gradeCheck.mock.results[0]?.value;
    expect(primaryResult?.retryCheck?.prompt).toBeTruthy();
    expect(primaryResult?.retryCheck).not.toHaveProperty("answerIndex");
    fireEvent.click(screen.getByRole("button", { name: /Devam et/i }));

    for (let i = 0; i < 4; i += 1) {
      if (screen.queryByText("TEKRARLA") && screen.queryByRole("button", { name: /Başla/i })) break;
      const next = screen.queryByRole("button", { name: /Devam et|Dersi bitir/i });
      if (!next) break;
      fireEvent.click(next);
    }

    await waitFor(() => expect(screen.getByRole("button", { name: /Başla/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Başla/i }));

    const correctLabel = screen
      .getAllByText(/360 derece = 2π/i)
      .find((el) => el.closest("button.als-option"));
    expect(correctLabel).toBeTruthy();
    fireEvent.click(correctLabel!);
    await waitFor(() => expect(screen.getByText(/Doğru/i)).toBeTruthy());
    expect(gradeCheck).toHaveBeenCalledWith(0, expect.objectContaining({ pick: expect.any(Number) }), "retry");
    expect(screen.queryByText(/🤔 Yanlış/)).toBeNull();
    expect(screen.getByText(/AÇIKLAMA/i)).toBeTruthy();
    const explain = screen.getByText(/AÇIKLAMA/i).parentElement;
    expect(explain?.textContent?.replace(/\s+/g, " ").trim().length).toBeGreaterThan(20);
  });

  it("sayısal tekrar sunucuya variant=retry ile gider", async () => {
    const numerical: LessonV2 = {
      title: "Sayı",
      overview: "Mol hesabı kütleyi mol kütlesine böler.",
      sections: [
        {
          heading: "Mol",
          body: "n = m / M. 18 g su için n = 1 mol.",
          check: {
            type: "numerical",
            prompt: "18 g su kaç moldur?",
            answer: "1 mol",
            explanation: "18 / 18 = 1 mol.",
          },
        },
      ],
      summary: ["n = m/M", "Birim uyumu", "Su 18 g/mol"],
    };
    const sealed = sealLessonForPlay(numerical);
    const gradeCheck = vi.fn(async (sectionIndex: number, answer: LessonCheckAnswer, variant = "primary") => {
      const primary = numerical.sections[sectionIndex]!.check!;
      const graded = gradeSectionCheck(resolveCheckForGrade(primary, variant, "tr", ""), answer);
      if (variant === "primary") {
        return { ...graded, retryCheck: sealSectionCheck(buildLessonRetryCheck(primary, "tr", "")) };
      }
      return graded;
    });
    render(<ExamLessonSteps lesson={sealed} gradeCheck={gradeCheck} onFinish={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Devam et/i }));
    await waitFor(() => expect(screen.getByLabelText(/Sayısal yanıt/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/Sayısal yanıt/i), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Yanıtı kontrol et/i }));
    await waitFor(() => expect(gradeCheck).toHaveBeenCalled());
    expect(gradeCheck.mock.calls[0]?.[2] ?? "primary").toBe("primary");

    fireEvent.click(screen.getByRole("button", { name: /Devam et/i }));
    for (let i = 0; i < 4; i += 1) {
      if (screen.queryByRole("button", { name: /Başla/i })) break;
      const next = screen.queryByRole("button", { name: /Devam et|Dersi bitir/i });
      if (!next) break;
      fireEvent.click(next);
    }
    await waitFor(() => expect(screen.getByRole("button", { name: /Başla/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Başla/i }));
    await waitFor(() => expect(screen.getByLabelText(/Sayısal yanıt/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/Sayısal yanıt/i), { target: { value: "1 mol" } });
    fireEvent.click(screen.getByRole("button", { name: /Yanıtı kontrol et/i }));
    await waitFor(() => expect(gradeCheck.mock.calls.some((c) => c[2] === "retry")).toBe(true));
  });

  it("gradeCheck yok ve sızdırılmış paket: Yanlış yok, yeniden dene mesajı", async () => {
    const sealed = sealLessonForPlay(radianLesson);
    render(<ExamLessonSteps lesson={sealed} onFinish={vi.fn()} />);
    await advanceToCheck();
    const option = screen.getAllByText(/360 derece = 2π/i).find((el) => el.closest("button.als-option"));
    expect(option).toBeTruthy();
    fireEvent.click(option!);
    await waitFor(() => expect(screen.getByText(/Notlandırılamadı/i)).toBeTruthy());
    expect(screen.queryByText(/🤔 Yanlış/)).toBeNull();
  });

  it("farklı varyant yoksa lead 'bir kez daha' der", () => {
    expect(reviewGateLead(1, { distinct: false })).toContain("bir kez daha");
    expect(reviewGateLead(1, { distinct: true })).toContain("farklı bir şekilde");
    const same = radianLesson.sections[0]!.check!;
    expect(isDistinctRetryVariant(same, same)).toBe(false);
  });
});

describe("B1: retry varyantları paket JSON'unda sızmaz", () => {
  function assertPayloadClean(lesson: LessonV2, correctTexts: string[]) {
    const sealed = sealLessonForPlay(lesson);
    const blob = JSON.stringify(sealed);
    expect(blob).not.toMatch(/"retryCheck"/);
    expect(blob).not.toMatch(/"answerIndex"/);
    for (const text of correctTexts) {
      // Şık metni primary options'ta olabilir — ama retry prompt'u (cevap cümlesi) olmamalı
      // Fact/definition retry prompt'ları doğru şıkkı gövdeye gömer; paket onları taşımaz.
      void text;
    }
    const primary = lesson.sections[0]!.check!;
    const retry = buildLessonRetryCheck(primary, "tr", lesson.sections[0]!.body);
    const sealedRetry = sealSectionCheck(retry);
    expect(sealedRetry.prompt).toBeTruthy();
    expect(sealedRetry).not.toHaveProperty("answerIndex");
    expect(sealedRetry).not.toHaveProperty("explanation");
    // Primary grade yanıtı sealed retry taşır (simüle)
    const pick =
      typeof primary.answerIndex === "number"
        ? (primary.answerIndex + 1) % (primary.options?.length ?? 2)
        : 0;
    const gradePayload = {
      ...gradeSectionCheck(primary, { pick }),
      retryCheck: sealedRetry,
    };
    expect(gradePayload.retryCheck.prompt).toBe(sealedRetry.prompt);
    expect(JSON.stringify(gradePayload.retryCheck)).not.toMatch(/"answerIndex"/);
  }

  it("fact retry: KPSS anayasa cümlesi pakette yok", () => {
    const source =
      "Türkiye Cumhuriyeti'nin ilk anayasası 1921 Teşkilât-ı Esasiye Kanunu olarak kabul edilir. 1924 Anayasası sonra gelir.";
    const check: SectionCheck = {
      type: "mcq",
      prompt: "Türkiye'nin ilk anayasası hangisidir?",
      options: [
        "1921 Teşkilât-ı Esasiye Kanunu",
        "1924 Anayasası",
        "1961 Anayasası",
        "1982 Anayasası",
      ],
      answerIndex: 0,
      explanation: "İlk anayasa 1921 Teşkilât-ı Esasiye Kanunu'dur.",
    };
    const retry = reviewQuestionFor(check as Parameters<typeof reviewQuestionFor>[0], "tr", source);
    expect(retry.prompt).toMatch(/Doğru mu|ne ad|hangi/i);
    const lesson: LessonV2 = {
      title: "Anayasa",
      overview: "Cumhuriyet anayasaları sırayla gelir.",
      sections: [{ heading: "1921", body: source, check }],
      summary: ["1921 ilk", "1924 sonra", "Sıra önemli"],
    };
    const sealed = sealLessonForPlay(lesson);
    const blob = JSON.stringify(sealed);
    expect(blob).not.toContain(retry.prompt);
    expect(blob).not.toMatch(/"retryCheck"/);
    assertPayloadClean(lesson, [check.options![0]!]);
  });

  it("definition retry: doğru şık + ne ad verilir pakette yok", () => {
    const source =
      "Doymuş sıvı belirli bir basınçta kaynama başlamak üzere olan sıvıdır. Sıkıştırılmış sıvı T < T_sat(P) koşuludur. Kızgın buhar T > T_sat(P) bölgesindedir.";
    const check: SectionCheck = {
      type: "mcq",
      prompt: "Aşağıdakilerden hangisi doymuş sıvının tanımına uygundur?",
      options: [
        "Kaynama başlamak üzere olan sıvı",
        "Yoğuşmak üzere olan buhar",
        "Kızgın buhar",
        "Sıvı-buhar karışımı",
      ],
      answerIndex: 0,
      explanation: "Doymuş sıvı kaynama başlamak üzere olan sıvıdır.",
    };
    const retry = reviewQuestionFor(check as Parameters<typeof reviewQuestionFor>[0], "tr", source);
    expect(retry.prompt.toLocaleLowerCase("tr")).toMatch(/ne ad verilir|hangi/);
    const lesson: LessonV2 = {
      title: "Saf Maddeler",
      overview: "Fazlar basınç ve sıcaklıkla ayrılır.",
      sections: [{ heading: "Doymuş sıvı", body: source, check }],
      summary: ["Doymuş sıvı", "Sıkıştırılmış", "Kızgın"],
    };
    const sealed = sealLessonForPlay(lesson);
    expect(JSON.stringify(sealed)).not.toContain(retry.prompt);
    assertPayloadClean(lesson, [check.options![0]!]);
  });

  it("trueFalse flip ve shift/rephrase paket sızdırmaz", () => {
    const tf: SectionCheck = {
      type: "trueFalse",
      prompt: "Mutlak basınç hesaplanırken gösterge basıncı kullanılmalıdır. DOĞRU MU YANLIŞ?",
      options: ["Doğru", "Yanlış"],
      answerIndex: 0,
      explanation: "Gösterge basıncına atmosfer eklenir.",
    };
    const flipped = reviewQuestionFor(tf as Parameters<typeof reviewQuestionFor>[0], "tr", "Mutlak basınç = gösterge + atmosfer.");
    expect(flipped.prompt).toMatch(/kullanılmamalıdır|DOĞRU MU/i);

    const mcq: SectionCheck = {
      type: "mcq",
      prompt: "Aşağıdaki ifadelerden hangisi doğrudur?",
      options: ["P = F/A", "P = F·A", "P = A/F", "P = F+A"],
      answerIndex: 0,
      explanation: "Basınç kuvvetin alana bölümüdür.",
    };
    const shifted = reviewQuestionFor(mcq as Parameters<typeof reviewQuestionFor>[0], "tr", "Basınç P = F/A bağıntısıyla yazılır.");

    for (const [check, source] of [
      [tf, "Mutlak basınç = gösterge + atmosfer."] as const,
      [mcq, "Basınç P = F/A bağıntısıyla yazılır."] as const,
    ]) {
      const lesson: LessonV2 = {
        title: "Basınç",
        overview: "Basınç tanımı.",
        sections: [{ heading: "Tanım", body: source, check }],
        summary: ["P=F/A", "Mutlak", "Gösterge"],
      };
      const sealed = sealLessonForPlay(lesson);
      const blob = JSON.stringify(sealed);
      expect(blob).not.toMatch(/"retryCheck"/);
      const retry = buildLessonRetryCheck(check, "tr", source);
      if (retry.prompt !== check.prompt) {
        expect(blob).not.toContain(retry.prompt);
      }
      expect(sealSectionCheck(retry)).not.toHaveProperty("answerIndex");
    }
    expect(shifted.options).toBeTruthy();
    expect(flipped.answerIndex).not.toBe(tf.answerIndex);
  });
});
