// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { COACH_ASKS, ExamNodeCoach, threadFor, type CoachMessage } from "@/components/parity/exam-node-coach";
import { ScratchPad } from "@/components/parity/scratch-pad";

afterEach(() => cleanup());

function TutorHarness() {
  const [index, setIndex] = useState(0);
  const [messages, setMessages] = useState<CoachMessage[]>([
    { role: "user", content: "Bunu anlat" },
    { role: "assistant", content: "Şöyle düşün." },
  ]);
  return (
    <>
      <button type="button" onClick={() => setIndex(1)}>
        Sonraki soru
      </button>
      <button type="button" onClick={() => setIndex(0)}>
        Önceki soru
      </button>
      <ExamNodeCoach
        prepId="11111111-1111-4111-8111-111111111111"
        nodeId="22222222-2222-4222-8222-222222222222"
        itemText={index === 0 ? "Soru 1" : "Soru 2"}
        returnPath="/"
        messages={messages}
        onMessagesChange={setMessages}
        questionIndex={index}
      />
    </>
  );
}

describe("paket 1 öğretmen ve işlem tahtası", () => {
  // 8 Kasım 2026 (ürün sahibi: "başka soruya geçince eski konuşma hâlâ duruyor"): her soru kendi sohbetini görür.
  // Önceki soruya dönülünce o sorunun konuşması yine görünür; kayıt oturum boyunca durur.
  it("soru değişince önceki sorunun sohbeti ekrandan kalkar, geri dönülünce görünür", () => {
    render(<TutorHarness />);
    expect(screen.getByText("Bunu anlat")).toBeTruthy();
    expect(screen.getByText("Soru 1 hakkında sor; cevabı söylemeden adım adım anlatır.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sonraki soru" }));
    expect(screen.queryByText("Bunu anlat")).toBeNull();
    expect(screen.queryByText("Şöyle düşün.")).toBeNull();
    expect(screen.getByText("Soru 2 hakkında sor; cevabı söylemeden adım adım anlatır.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Önceki soru" }));
    expect(screen.getByText("Bunu anlat")).toBeTruthy();
    expect(screen.getByText("Şöyle düşün.")).toBeTruthy();
  });

  it("modele yalnız o sorunun konuşması gider; hızlı istekler hazır", () => {
    const messages: CoachMessage[] = [
      { role: "user", content: "a", q: 0 },
      { role: "assistant", content: "b", q: 0 },
      { role: "marker", content: "eski ayraç" },
      { role: "user", content: "c", q: 1 },
    ];
    expect(threadFor(messages, 1)).toEqual([{ role: "user", content: "c" }]);
    expect(threadFor(messages, 0)).toEqual([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
    ]);
    expect(COACH_ASKS.map((ask) => ask.label)).toEqual(["Bilmiyorum, sen anlat", "Bir ipucu ver", "Örnekle anlat"]);
  });

  it("işlem tahtasını canvas olarak açar", () => {
    render(<ScratchPad />);
    expect(document.querySelector("canvas")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "İşlem Tahtası" }));
    const canvas = document.querySelector("canvas");
    expect(canvas).toBeTruthy();
    expect(canvas?.getAttribute("aria-label")).toBe("İşlem tahtası");
    expect(screen.getByRole("button", { name: "Mavi" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Silgi" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Temizle" })).toBeTruthy();
  });
});
