// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { CreditGate } from "@/components/paywall/credit-gate";
import {
  NODE_KIND_ACTION,
  actionForNodeKind,
  creditGateCopy,
  exceedsFreeDaily,
  toolBeyondFreeDaily,
} from "@/lib/billing/free-reach";

/*
  19 Ekim 2026: ücretsiz öğrenci podcast'i kurup "oluştur"a basınca "Bu ders için kullanım hakkın
  doldu" ve yenilenme geri sayımı görüyordu. Hakkını hiç kullanmamış olabilirdi; podcast (12) ücretsiz
  günlük haktan (6) büyük olduğu için beklemek hiçbir şeyi değiştirmiyordu. Şimdi kapı bunu söyler,
  geri sayım göstermez; araç seçicide bu işler ücretsizde "Plus" rozetli.
*/
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

afterEach(cleanup);

describe("ücretsiz hakkı aşan işler", () => {
  it("eşleme düğüm rotasıyla aynı", () => {
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    const body = route.slice(route.indexOf("function actionForKind"), route.indexOf("async function knownTopicLabels"));
    expect(body).toContain(`if (kind === "flashcards" || kind === "spaced") return "FLASHCARD_GENERATE"`);
    expect(body).toContain(`if (kind === "lesson") return "STUDY_PLAN_GENERATE"`);
    expect(body).toContain(`if (kind === "podcast") return "PODCAST_GENERATE"`);
    expect(body).toContain(`if (kind === "oral") return "ORAL_EXAM_GENERATE"`);
    expect(body).toContain(`return "QUIZ_GENERATE"`);
    expect(Object.keys(NODE_KIND_ACTION).sort()).toEqual(["flashcards", "lesson", "oral", "podcast", "spaced"]);
    expect(actionForNodeKind("quiz")).toBe("QUIZ_GENERATE");
  });

  it("podcast, sözlü, deneme, fotoğraf, video aşar; ders, test, kart aşmaz", () => {
    for (const code of ["PODCAST_GENERATE", "ORAL_EXAM_GENERATE", "PRACTICE_EXAM_GENERATE", "IMAGE_SOLUTION", "VIDEO_GENERATE"] as const) {
      expect(exceedsFreeDaily(code), code).toBe(true);
    }
    for (const code of ["STUDY_PLAN_GENERATE", "QUIZ_GENERATE", "FLASHCARD_GENERATE", "AI_CHAT_STANDARD"] as const) {
      expect(exceedsFreeDaily(code), code).toBe(false);
    }
    expect(["podcast", "oral", "written_exam", "video"].every(toolBeyondFreeDaily)).toBe(true);
    expect(["lesson", "quiz", "flashcards", "true_false"].some(toolBeyondFreeDaily)).toBe(false);
  });

  it("kapı cümlesi: ücretsizde podcast 'doldu' demez; ders gerçekten doldu", () => {
    expect(creditGateCopy("podcast", false)).toEqual({
      message: expect.stringContaining("Podcast, ücretsiz günlük haktan büyük bir iş; Plus'ta açık."),
      beyondFreeDaily: true,
    });
    expect(creditGateCopy("lesson", false)).toEqual({ message: "Bugünkü ücretsiz hakkın doldu.", beyondFreeDaily: false });
    expect(creditGateCopy("podcast", true)).toEqual({ message: "Bu dönemki kullanım hakkın doldu.", beyondFreeDaily: false });
  });

  it("kapı, iş kodu ücretsiz hakkı aşınca cümleyi kendisi değiştirir", () => {
    render(
      <CreditGate open onOpenChange={() => undefined} message="Fotoğraftan çözüm için kullanım hakkın doldu." action="IMAGE_SOLUTION" actionLabel="Fotoğraftan çözüm" />,
    );
    expect(screen.getByText(/Fotoğraftan çözüm, ücretsiz günlük haktan büyük bir iş/)).toBeTruthy();
    expect(screen.queryByText(/hakkın doldu/)).toBeNull();
  });

  it("kapılar iş koduyla bağlı; deneme kurulumu 'Kredin yetersiz' demiyor", () => {
    expect(read("src/components/parity/exam-node-session.tsx")).toContain("gateCopy.message");
    expect(read("src/components/learning/question-solver.tsx")).toContain(`action="IMAGE_SOLUTION"`);
    expect(read("src/components/learning/studio/podcast-studio.tsx")).toContain(`action="PODCAST_GENERATE"`);
    expect(read("src/components/learning/studio/oral-studio.tsx")).toContain(`action="ORAL_EXAM_GENERATE"`);
    expect(read("src/components/parity/prep-podcast-session.tsx")).toContain(`action="PODCAST_GENERATE"`);
    const mock = read("src/components/parity/mock-exam-setup.tsx");
    expect(mock).toContain(`action="PRACTICE_EXAM_GENERATE"`);
    expect(mock).not.toContain("Kredin yetersiz");
    expect(read("src/components/parity/study-tools-hub.tsx")).toContain("toolBeyondFreeDaily(tool.id)");
  });
});
