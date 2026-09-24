// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type { LessonV2 } from "@/lib/learning/teaching-standards";
import { ExamLessonSteps } from "@/components/parity/exam-lesson-steps";
import {
  calloutTone,
  checkPresentation,
  reviewGateLead,
  reviewGateQuestion,
  trueFalseIndexes,
} from "@/lib/learning/lesson-chrome";

Element.prototype.scrollIntoView = vi.fn();
afterEach(cleanup);

const lesson = {
  title: "Termodinamiğe Giriş: Sistemler ve Temel Kavramlar",
  objective: "Sistem, çevre ve sınırı ayırt edebileceksin.",
  overview:
    "Termodinamik, enerji dönüşümlerini ve maddenin bu süreçlerdeki davranışlarını inceler.",
  sections: [
    {
      heading: "Sistem, Çevre ve Sınır",
      body: "İnceleme altına alınan bölgeye **sistem** denir. Dışarıda kalan her şey **çevre**dir.",
      check: {
        type: "trueFalse" as const,
        prompt: "Termodinamikte sistemi çevreden ayıran gerçek veya hayali yüzeye sınır denir.",
        options: ["Doğru", "Yanlış"],
        answerIndex: 0,
        explanation: "Metinde sistem ile çevreyi ayıran yüzey sınır olarak adlandırılır.",
        review: {
          prompt: "Sistem ile çevre arasındaki yüzeye ne ad verilir?",
          options: ["Yanlış", "Doğru"],
          answerIndex: 1,
        },
      },
      note: {
        title: "Sınırın Hareketliliği",
        body: "Piston hareket ettikçe sistemin sınırı da hareket eder.",
      },
      cards: [
        { title: "Kapalı Sistem", body: "Kütle geçişi olmaz, enerji geçişi olabilir." },
        { title: "Açık Sistem", body: "Kütle de enerji de geçebilir." },
      ],
    },
    {
      heading: "Sistem Türleri",
      body: "**Kapalı sistem** kütle geçirmez. **Açık sistem** kütle geçirir.",
      check: {
        type: "mcq" as const,
        prompt: "Sınırlarından kütle geçişi olmayan sistem hangisidir?",
        options: ["Açık Sistem", "Kapalı Sistem", "Kontrol Hacmi", "Yalıtılmış Sistem"],
        answerIndex: 1,
        explanation: "Kütle geçişi olmayan sistem kapalı sistemdir.",
      },
    },
  ],
  example: { prompt: "Piston örneği nedir?", solution: "Kapalı sisteme örnektir." },
  commonMistake: {
    claim: "Sınır her zaman sabittir.",
    correction: "Hareketli sınır da sınırdır.",
  },
  infoCheck: { prompt: "Sınır nedir?", answer: "Sistemi çevreden ayıran yüzey." },
  summary: ["Sistem inceleme bölgesidir.", "Sınır onu çevreden ayırır."],
  nextFocus: ["Özellikler"],
} satisfies LessonV2;

describe("lesson chrome helpers", () => {
  it("maps Doğru/Yanlış regardless of option order", () => {
    expect(trueFalseIndexes(["Doğru", "Yanlış"])).toEqual({ wrong: 1, right: 0 });
    expect(trueFalseIndexes(["kapalı", "açık"])).toBeNull();
  });

  it("keeps quick quiz and true/false presentations apart", () => {
    expect(checkPresentation({ type: "trueFalse" })).toBe("trueFalse");
    expect(checkPresentation({ type: "mcq" })).toBe("quickQuiz");
  });

  it("picks callout tone from the title when none is stored", () => {
    expect(calloutTone({ title: "Sınırın Hareketliliği" })).toBe("warn");
    expect(calloutTone({ title: "Birim Dikkat" })).toBe("unit");
    expect(calloutTone({ title: "Hal ve Yol Fonksiyonları" })).toBe("info");
    expect(calloutTone({ title: "Herhangi", tone: "unit" })).toBe("unit");
  });

  it("writes the review gate in topic-question counts", () => {
    expect(reviewGateLead(2)).toContain("2 kontrol sorusunu");
    expect(reviewGateLead(2)).toContain("farklı bir şekilde");
  });

  it("shows a stored rephrase and otherwise keeps the same correct option", () => {
    const stored = reviewGateQuestion({
      type: "mcq",
      prompt: "Sınırından kütle geçen düzeneğe ne denir?",
      options: ["Kapalı sistem", "Açık sistem", "Yalıtılmış sistem"],
      answerIndex: 1,
      explanation: "Kütle geçişi olan düzenek açık sistemdir.",
      review: {
        prompt: "Hem madde hem enerji çıkan türbin hangi sınıftadır?",
        options: ["Yalıtılmış sistem", "Kapalı sistem", "Açık sistem"],
        answerIndex: 2,
      },
    });
    expect(stored.prompt).toBe("Hem madde hem enerji çıkan türbin hangi sınıftadır?");
    expect(stored.prompt).not.toContain("Sınırından kütle");
    expect(stored.options[stored.answerIndex]).toBe("Açık sistem");

    const fallback = reviewGateQuestion({
      type: "mcq",
      prompt: "Sınırından kütle geçen düzeneğe ne denir?",
      options: ["Kapalı sistem", "Açık sistem", "Yalıtılmış sistem"],
      answerIndex: 1,
      explanation: "Kütle geçişi olan düzenek açık sistemdir.",
    });
    expect(fallback.prompt).not.toBe("Sınırından kütle geçen düzeneğe ne denir?");
    expect(fallback.options[fallback.answerIndex]).toBe("Açık sistem");
    expect(fallback.answerIndex).not.toBe(1);
  });
});

describe("ExamLessonSteps", () => {
  it("walks a slide, a true/false miss, and the review gate", () => {
    const onFinish = vi.fn();
    render(<ExamLessonSteps lesson={lesson} onFinish={onFinish} closeHref="/deneme-sinavlari/p" />);

    expect(screen.getByText("1 / 6")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Devam et" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Devam et" }));

    expect(screen.getByText("DOĞRU MU YANLIŞ MI?")).toBeTruthy();
    expect(screen.getByText("Sınırın Hareketliliği")).toBeTruthy();
    expect(screen.getByText("Kapalı Sistem")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Yanlış" }));

    expect(screen.getByText("AÇIKLAMA")).toBeTruthy();
    expect(screen.getByText("Dersin sonunda buna geri döneceğiz.")).toBeTruthy();
    expect(screen.getByText("🤔 Yanlış")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Devam et" }));

    expect(screen.getByText("HIZLI SINAV")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Kapalı Sistem/ }));
    expect(screen.getByText("🎉 Doğru")).toBeTruthy();

    // Kalan slaytlar: örnek, hata, özet, tekrar kapısı.
    fireEvent.click(screen.getByRole("button", { name: "Devam et" }));
    fireEvent.click(screen.getByRole("button", { name: "Devam et" }));
    fireEvent.click(screen.getByRole("button", { name: "Devam et" }));
    fireEvent.click(screen.getByRole("button", { name: "Devam et" }));
    expect(screen.getByText("TEKRARLA")).toBeTruthy();
    expect(screen.getByText("Bitirmeden önce kısa tekrar")).toBeTruthy();
    expect(screen.getByText(/1 kontrol sorusunu/)).toBeTruthy();
    expect(screen.getByText(/farklı bir şekilde/)).toBeTruthy();
    expect(onFinish).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Devam et" }));
    expect(
      screen.getByText("Sistem ile çevre arasındaki yüzeye ne ad verilir?"),
    ).toBeTruthy();
    expect(
      screen.queryByText(
        "Termodinamikte sistemi çevreden ayıran gerçek veya hayali yüzeye sınır denir.",
      ),
    ).toBeNull();
  });
});
