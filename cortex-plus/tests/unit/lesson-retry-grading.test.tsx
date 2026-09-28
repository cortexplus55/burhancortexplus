// @vitest-environment jsdom
/**
 * Tekrar sorusunda doğru şık Yanlış sayılmaz (Açı Ölçüsü ve Radyan, 28 Eyl).
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { LessonV2 } from "@/lib/learning/teaching-standards";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import {
  buildLessonRetryCheck,
  gradeSectionCheck,
  resolveCheckForGrade,
  sealLessonForPlay,
  type GradeCheckResult,
  type LessonCheckAnswer,
} from "@/lib/learning/lesson-play";
import { isDistinctRetryVariant, reviewGateLead } from "@/lib/learning/lesson-chrome";

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
  it("sızdırılmış derste cevap sızmaz; retryCheck de sızdırılmıştır", () => {
    const sealed = sealLessonForPlay(radianLesson);
    const blob = JSON.stringify(sealed);
    expect(blob).not.toMatch(/"answerIndex"/);
    expect(blob).not.toMatch(/"explanation"/);
    expect(blob).not.toMatch(/"optionWhy"/);
    expect(blob).not.toMatch(/"review"/);
    expect(sealed.sections[0]?.retryCheck?.prompt).toBeTruthy();
    expect(sealed.sections[0]?.retryCheck).not.toHaveProperty("answerIndex");
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
      return gradeSectionCheck(check, answer) as GradeCheckResult;
    });

    render(<ExamLessonSteps lesson={sealed} gradeCheck={gradeCheck} onFinish={vi.fn()} />);
    await advanceToCheck();

    // İlk kontrol — yanlış şık B (metin gövdede de geçebilir; şık düğmesini seç)
    const wrongOption = screen.getAllByText(/180 derece = 2π/i).find((el) => el.closest("button.als-option"));
    expect(wrongOption).toBeTruthy();
    fireEvent.click(wrongOption!);
    await waitFor(() => expect(screen.getByText(/Yanlış/i)).toBeTruthy());
    expect(gradeCheck).toHaveBeenCalledWith(0, { pick: 1 }, "primary");
    fireEvent.click(screen.getByRole("button", { name: /Devam et/i }));

    // Özet vb. adımları geç
    for (let i = 0; i < 4; i += 1) {
      if (screen.queryByText("TEKRARLA") && screen.queryByRole("button", { name: /Başla/i })) break;
      const next = screen.queryByRole("button", { name: /Devam et|Dersi bitir/i });
      if (!next) break;
      fireEvent.click(next);
    }

    await waitFor(() => expect(screen.getByRole("button", { name: /Başla/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Başla/i }));

    // Tekrar — doğru seçeneğin metni (sıra kaymış olabilir)
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

  it("sayısal ve explain tekrarları da sunucuya gider", async () => {
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
      return gradeSectionCheck(resolveCheckForGrade(primary, variant, "tr", ""), answer);
    });
    render(<ExamLessonSteps lesson={sealed} gradeCheck={gradeCheck} onFinish={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Devam et/i }));
    await waitFor(() => expect(screen.getByLabelText(/Sayısal yanıt/i)).toBeTruthy());
    fireEvent.change(screen.getByLabelText(/Sayısal yanıt/i), { target: { value: "2" } });
    fireEvent.click(screen.getByRole("button", { name: /Yanıtı kontrol et/i }));
    await waitFor(() => expect(gradeCheck).toHaveBeenCalled());
    expect(gradeCheck.mock.calls[0]?.[2] ?? "primary").toBe("primary");
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
