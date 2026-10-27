// @vitest-environment jsdom
import { useState } from "react";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExamNodeCoach, type CoachMessage } from "@/components/parity/exam-node-coach";
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
  it("soru değişince sohbeti silmez ve ayraç ekler", () => {
    render(<TutorHarness />);
    expect(screen.getByText("Bunu anlat")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Sonraki soru" }));
    expect(screen.getByText("Bunu anlat")).toBeTruthy();
    expect(screen.getByText("Şöyle düşün.")).toBeTruthy();
    expect(screen.getByText("📌 Soru 2 için soruluyor")).toBeTruthy();
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
