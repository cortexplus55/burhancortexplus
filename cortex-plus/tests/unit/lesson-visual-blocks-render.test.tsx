// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import { GenerationWarmup } from "@/components/parity/generation-warmup";
import type { LessonV3 } from "@/lib/learning/lesson-v3";

Element.prototype.scrollIntoView = vi.fn();
afterEach(cleanup);

const lesson: LessonV3 = {
  format: 3,
  title: "Sinüs",
  screens: [
    {
      heading: "Sinüs",
      blocks: [
        { type: "text", text: "Sinüs karşı kenarın hipotenüse oranıdır." },
        {
          type: "formula",
          formula: {
            title: "Sinüs bağıntısı",
            expression: "sin θ = karşı / hipotenüs",
            symbols: [{ symbol: "θ", meaning: "açı" }],
          },
        },
        {
          type: "exam_trap_card",
          trap: {
            title: "Sinüs ile kosinüs",
            wrong: "Sinüs komşu kenarın oranıdır.",
            right: "Sinüs karşı kenarın oranıdır.",
          },
        },
        {
          type: "memory_hook_card",
          hook: { kind: "shortcut", title: "SOH", body: "Sinüs = Opposite / Hypotenuse." },
        },
        {
          type: "comparison_carousel",
          carousel: {
            mode: "compare",
            slides: [
              { title: "Sinüs", body: "Karşı / hipotenüs" },
              { title: "Kosinüs", body: "Komşu / hipotenüs" },
            ],
          },
        },
        {
          type: "note",
          note: { title: "Genel bilgi: derece", body: "Tam tur 360 derecedir.", tone: "general" },
        },
      ],
    },
  ],
};

describe("ders ekranı görsel kartlar", () => {
  it("formül simgelerini, tuzak, çivi, karşılaştırma ve genel bilgi rozetini çizer", () => {
    render(<ExamLessonSteps lesson={lesson} closeHref="/deneme-sinavlari/p" />);
    expect(screen.getByLabelText("Formül ve kural")).toBeTruthy();
    expect(screen.getByText("θ")).toBeTruthy();
    expect(screen.getByText("açı")).toBeTruthy();
    expect(screen.getByLabelText("Sınav tuzağı")).toBeTruthy();
    expect(screen.getByText("Sinüs komşu kenarın oranıdır.")).toBeTruthy();
    expect(screen.getByLabelText("Hafıza çivisi")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Kosinüs" })).toBeTruthy();
    fireEvent.click(screen.getByRole("tab", { name: "Kosinüs" }));
    expect(screen.getByText("Komşu / hipotenüs")).toBeTruthy();
    expect(screen.getByText("Genel bilgi")).toBeTruthy();
    expect(screen.getByText("1 / 1")).toBeTruthy();
    expect(screen.getByText("10")).toBeTruthy();
  });
});

describe("bekleme ısıtması", () => {
  it("kartı çevirir; konuyla ilgisiz refleks sorusu göstermez", () => {
    render(<GenerationWarmup topic="Mitoz" />);
    expect(screen.getByText("Hazırlanırken Hızlı Zihin Isıtma")).toBeTruthy();
    fireEvent.click(screen.getByText("Çevir"));
    expect(screen.getByText("Soruya dön")).toBeTruthy();
    // 10 Kasım 2026: hazır işlem sorusu kalktı; hazırlığın kendi sorusu verilmedikçe sekme yok.
    expect(screen.queryByRole("tab", { name: "Refleks" })).toBeNull();
  });

  it("hazırlığın kendi sorusu verilirse refleks sekmesi o soruyu sorar", () => {
    render(
      <GenerationWarmup
        topic="Mitoz"
        reflex={{ prompt: "Mitozda kromozom sayısı nasıl değişir?", options: ["Yarıya iner", "Değişmez"], answerIndex: 1, why: "Mitozda kromozom sayısı korunur." }}
      />,
    );
    fireEvent.click(screen.getByRole("tab", { name: "Refleks" }));
    expect(screen.getByText("Mitozda kromozom sayısı nasıl değişir?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Değişmez" }));
    expect(screen.getByText("Mitozda kromozom sayısı korunur.")).toBeTruthy();
  });
});
