// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExamSetupChat, type SetupAnswers } from "@/components/parity/exam-setup-chat";

/**
 * Kurulum sohbeti.
 *
 * Üç soru aynı anda değil sırayla soruluyor; cevaplanan soru tek satıra
 * katlanıp canlı soruya yer bırakıyor. Buradaki testler biçimi değil
 * DAVRANIŞI tutuyor: tek soru görünür, cevap değiştirilebilir, serbest
 * metin kaybolmaz ve "Sen karar ver" akışı tıkamaz.
 */

// jsdom'da scrollIntoView yok; tarayıcıların hepsinde var. Eksik olan
// ortam, kod değil.
Element.prototype.scrollIntoView = vi.fn();

// Otomatik temizlik yalnızca globals açıkken geliyor; burada elle.
afterEach(cleanup);

function setup() {
  const onDone = vi.fn<(answers: SetupAnswers) => void>();
  render(<ExamSetupChat onDone={onDone} />);
  return onDone;
}

describe("ExamSetupChat", () => {
  it("shows one question at a time", () => {
    setup();
    expect(screen.getByText("Dersi nasıl anlatayım?")).toBeTruthy();
    expect(screen.queryByText("Günde ne kadar vaktin var?")).toBeNull();
  });

  it("walks the three questions and reports the answers", () => {
    const onDone = setup();
    fireEvent.click(screen.getByText("Örnekle göster"));
    fireEvent.click(screen.getByText("Eksikleri tamamla"));
    fireEvent.click(screen.getByText("30 dk"));
    fireEvent.click(screen.getByText("Yolumu göster"));

    expect(onDone).toHaveBeenCalledWith({
      style: "examples",
      onlyMyFiles: false,
      dailyMinutes: 30,
      notes: "",
    });
  });

  it("keeps answered questions on screen so the student can read them back", () => {
    setup();
    fireEvent.click(screen.getByText("Örnekle göster"));
    // Katlanmış satır: kısa ad + verilen cevap.
    expect(screen.getByText("Anlatım")).toBeTruthy();
    expect(screen.getByText("Örnekle göster")).toBeTruthy();
  });

  it("lets the student change an answer instead of starting over", () => {
    const onDone = setup();
    fireEvent.click(screen.getByText("Örnekle göster"));
    fireEvent.click(screen.getByText("Eksikleri tamamla"));
    fireEvent.click(screen.getByText("30 dk"));

    // Katlanmış "Anlatım" satırına dönülüyor ve cevap değiştiriliyor.
    fireEvent.click(screen.getByText("Anlatım"));
    fireEvent.click(screen.getByText("Önce anlat"));
    fireEvent.click(screen.getByText("Yolumu göster"));

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({ style: "theory", dailyMinutes: 30 }),
    );
  });

  it("carries the student's own words to the lesson", () => {
    // Serbest metin yazılıp hiçbir yere ulaşmayan bir alan olmamalı.
    const onDone = setup();
    const box = screen.getByLabelText(
      "Dersi nasıl anlatayım? — kendi cevabın",
    ) as HTMLInputElement;
    fireEvent.change(box, { target: { value: "formülleri tabloyla göster" } });
    fireEvent.keyDown(box, { key: "Enter" });

    fireEvent.click(screen.getByText("Yalnızca belgem"));
    fireEvent.click(screen.getByText("45 dk"));
    fireEvent.click(screen.getByText("Yolumu göster"));

    expect(onDone).toHaveBeenCalledWith(
      expect.objectContaining({
        notes: "Anlatım: formülleri tabloyla göster",
        // Serbest metin eşlenemeyeceği için yapısal değer varsayılanda kalır.
        style: "mixed",
      }),
    );
  });

  it("never dead-ends: 'Sen karar ver' answers with the default", () => {
    const onDone = setup();
    fireEvent.click(screen.getAllByText("Sen karar ver")[0]);
    fireEvent.click(screen.getAllByText("Sen karar ver")[0]);
    fireEvent.click(screen.getAllByText("Sen karar ver")[0]);
    fireEvent.click(screen.getByText("Yolumu göster"));

    expect(onDone).toHaveBeenCalledWith({
      style: "mixed",
      onlyMyFiles: true,
      dailyMinutes: 45,
      notes: "",
    });
  });

  it("does not offer the way out before every question is answered", () => {
    setup();
    expect(screen.queryByText("Yolumu göster")).toBeNull();
    fireEvent.click(screen.getByText("İkisi de"));
    expect(screen.queryByText("Yolumu göster")).toBeNull();
  });
});
