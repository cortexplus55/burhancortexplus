// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
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

  24 Ekim 2026: ücretsiz katman sayıya dayalı (haftada 3 ders, günde 3 mesaj, günde 1 fotoğraf). "Plus'ta"
  kararı fiyattan değil açık listeden (`PLUS_ONLY_ACTIONS`); fotoğraf ücretsizde açık, kendi sayacıyla.
*/
const read = (path: string) => readSource(path).replace(/\r\n/g, "\n");

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

  it("podcast, sözlü, deneme, video ve ses Plus'ta; ders, test, kart, mesaj, fotoğraf sayaçla açık", () => {
    for (const code of ["PODCAST_GENERATE", "ORAL_EXAM_GENERATE", "PRACTICE_EXAM_GENERATE", "VIDEO_GENERATE", "VOICE_TURN", "AUDIO_SYNTHESIZE"] as const) {
      expect(exceedsFreeDaily(code), code).toBe(true);
    }
    for (const code of ["STUDY_PLAN_GENERATE", "QUIZ_GENERATE", "FLASHCARD_GENERATE", "AI_CHAT_STANDARD", "IMAGE_SOLUTION"] as const) {
      expect(exceedsFreeDaily(code), code).toBe(false);
    }
    // Liste SQL'deki plus_only_action ile aynı.
    const sql = read("supabase/migrations/20261024121000_free_tier_counts.sql");
    for (const code of ["PODCAST_GENERATE", "ORAL_EXAM_GENERATE", "PRACTICE_EXAM_GENERATE", "VIDEO_GENERATE", "VOICE_TURN", "AUDIO_SYNTHESIZE"]) {
      expect(sql.slice(sql.indexOf("FUNCTION public.plus_only_action"), sql.indexOf("FUNCTION public.plus_only_action") + 600)).toContain(`'${code}'`);
    }
    expect(["podcast", "oral", "written_exam", "video"].every(toolBeyondFreeDaily)).toBe(true);
    expect(["lesson", "quiz", "flashcards", "true_false"].some(toolBeyondFreeDaily)).toBe(false);
  });

  it("kapı cümlesi: ücretsizde podcast 'doldu' demez; ders sayacı gerçekten doldu", () => {
    expect(creditGateCopy("podcast", false)).toEqual({
      message: expect.stringContaining("Podcast Plus'ta. Ücretsiz hesapta ilk hazırlığında 1. konu tam açık"),
      beyondFreeDaily: true,
    });
    expect(creditGateCopy("written_exam", false).beyondFreeDaily).toBe(true);
    expect(creditGateCopy("lesson", false)).toEqual({
      message: "Bu haftaki 3 ücretsiz ders hakkın bitti.",
      beyondFreeDaily: false,
      meter: "lesson",
    });
    // Yolda test ve kartlar derse dahil: dolan sayaç dersin sayacı.
    expect(creditGateCopy("quiz", false).meter).toBe("lesson");
    expect(creditGateCopy("podcast", true)).toEqual({ message: "Bu dönemki kullanım hakkın doldu.", beyondFreeDaily: false });
  });

  it("kapı, iş Plus'taysa cümleyi kendisi değiştirir; sayaçlı işte verilen cümle kalır", () => {
    render(
      <CreditGate open onOpenChange={() => undefined} message="Podcast için kullanım hakkın doldu." action="PODCAST_GENERATE" actionLabel="Podcast" />,
    );
    expect(screen.getByText(/Podcast Plus'ta\. Ücretsiz hesapta/)).toBeTruthy();
    expect(screen.queryByText(/hakkın doldu/)).toBeNull();
    cleanup();
    render(
      <CreditGate open onOpenChange={() => undefined} message="Bugünkü 1 ücretsiz fotoğraftan çözüm hakkın bitti." action="IMAGE_SOLUTION" meter="photo" />,
    );
    expect(screen.getByText("Bugünkü 1 ücretsiz fotoğraftan çözüm hakkın bitti.")).toBeTruthy();
  });

  it("kapılar iş koduyla bağlı; deneme kurulumu 'Kredin yetersiz' demiyor", () => {
    expect(read("src/components/parity/exam-node-session.tsx")).toContain("gateCopy.message");
    const solver = read("src/components/learning/question-solver.tsx");
    expect(solver).toContain(`action={paywallMeter === "chat" ? "AI_CHAT_STANDARD" : "IMAGE_SOLUTION"}`);
    expect(solver).toContain("meter={paywallMeter}");
    expect(read("src/components/learning/studio/podcast-studio.tsx")).toContain(`action="PODCAST_GENERATE"`);
    expect(read("src/components/learning/studio/oral-studio.tsx")).toContain(`action="ORAL_EXAM_GENERATE"`);
    expect(read("src/components/parity/prep-podcast-session.tsx")).toContain(`action="PODCAST_GENERATE"`);
    const mock = read("src/components/parity/mock-exam-setup.tsx");
    expect(mock).toContain(`action="PRACTICE_EXAM_GENERATE"`);
    expect(mock).not.toContain("Kredin yetersiz");
    expect(read("src/components/parity/study-tools-hub.tsx")).toContain("toolBeyondFreeDaily(tool.id)");
  });
});
