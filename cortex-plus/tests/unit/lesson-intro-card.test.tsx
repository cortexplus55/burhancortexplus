// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import type { LessonV2 } from "@/lib/learning/teaching-standards";

afterEach(cleanup);

/* Astra gibi ders giriş kartı (1 Ekim 2026). */
const lesson: LessonV2 = {
  title: "Birim Çember",
  overview: "Trigonometrinin bütün tanımları tek bir çemberden çıkar.",
  sections: [
    {
      heading: "Birim çember nedir",
      lead: "Bütün tanımların çıktığı çember",
      body: "Merkezi orijinde, yarıçapı bir birim olan çemberdir.",
      check: { type: "trueFalse", prompt: "Yarıçap bir birimdir.", options: ["Doğru", "Yanlış"], answerIndex: 0, explanation: "Tanım gereği." },
    },
    { heading: "Kosinüs ve sinüs", body: "Çember üzerindeki noktanın x koordinatı kosinüs, y koordinatı sinüstür." },
    { heading: "Bölgeler ve işaretler", body: "Birinci bölgede iki koordinat da pozitiftir." },
  ],
  summary: ["Yarıçap bir birim.", "x kosinüs, y sinüs."],
} as LessonV2;

describe("ders giriş kartı", () => {
  it("okuma süresi, adım sayısı, bölüm planı ve soru notuyla açılır; Devam et ilk bölüme geçer", () => {
    render(<ExamLessonSteps lesson={lesson} closeHref="/deneme-sinavlari/p" />);
    expect(screen.getByRole("heading", { level: 1, name: "Birim Çember" })).toBeTruthy();
    expect(screen.getByText(/dk okuma · \d+ adım/)).toBeTruthy();
    expect(screen.getByText("Trigonometrinin bütün tanımları tek bir çemberden çıkar.")).toBeTruthy();
    const plan = screen.getByRole("region", { name: "Bu derste neler var" });
    expect([...plan.querySelectorAll("li")].map((item) => item.textContent)).toEqual([
      // Altındaki satır: modelin lead'i, yoksa bölümün kısa ilk cümlesi.
      "1Birim çember nedirBütün tanımların çıktığı çember",
      "2Kosinüs ve sinüsÇember üzerindeki noktanın x koordinatı kosinüs, y koordinatı sinüstür.",
      "3Bölgeler ve işaretlerBirinci bölgede iki koordinat da pozitiftir.",
    ]);
    expect(plan.textContent).toContain("Arada 1 kısa soru, sonunda özet");

    fireEvent.click(screen.getByRole("button", { name: "Devam et" }));
    expect(screen.getByText("Merkezi orijinde, yarıçapı bir birim olan çemberdir.")).toBeTruthy();
  });

  it("tek konulu derste boş kart açılmaz", () => {
    render(
      <ExamLessonSteps
        lesson={{ title: "Mol", sections: [{ heading: "Mol", body: "Mol bir sayma birimidir." }] } as LessonV2}
        closeHref="/deneme-sinavlari/p"
      />,
    );
    expect(screen.getByText("Mol bir sayma birimidir.")).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Bu derste neler var" })).toBeNull();
  });
});
