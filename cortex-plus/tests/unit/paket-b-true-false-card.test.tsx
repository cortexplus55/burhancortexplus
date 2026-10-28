// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { TrueFalseFocusCard } from "@/components/learning/true-false-focus-card";

function card(overrides: Partial<Parameters<typeof TrueFalseFocusCard>[0]> = {}) {
  const onPick = vi.fn<(value: boolean) => void>();
  const onNext = vi.fn<() => void>();
  const props = {
    index: 2,
    total: 8,
    statement: "Mutlak butlanı herkes ileri sürebilir.",
    picked: null,
    correct: true,
    revealed: false,
    explanation: "✏️ Doğrusu: …",
    nextLabel: "Sonraki önerme",
    onPick,
    onNext,
    ...overrides,
  };
  return { props: { ...props, onPick, onNext }, ...render(<TrueFalseFocusCard {...props} />) };
}

describe("Paket B · 3 doğru/yanlış odak kartı", () => {
  afterEach(cleanup);

  it("geniş kart, iki büyük düğme, sayaç", () => {
    const { container } = card();
    expect(screen.getByText("Önerme 3 / 8")).toBeTruthy();
    expect(container.querySelector(".tf-focus-card .tf-focus-statement")!.textContent).toContain("Mutlak butlan");
    expect(container.querySelectorAll(".tf-focus-choice")).toHaveLength(2);
    expect(screen.getByText("Dokun ya da klavyede ← Doğru · → Yanlış")).toBeTruthy();
  });

  it("tek dokunuş cevaplar; ← Doğru, → Yanlış, D ve Y de", () => {
    const { props } = card();
    fireEvent.click(screen.getByRole("button", { name: /Doğru/ }));
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    fireEvent.keyDown(window, { key: "ArrowRight" });
    fireEvent.keyDown(window, { key: "y" });
    expect(props.onPick.mock.calls.map((call) => call[0])).toEqual([true, true, false, false]);
    expect(props.onNext).not.toHaveBeenCalled();
  });

  it("cevaptan sonra Enter sonraki önermeye geçer; düğmeler kilitli, açıklama görünür", () => {
    const { props } = card({ revealed: true, picked: false });
    fireEvent.keyDown(window, { key: "ArrowLeft" });
    expect(props.onPick).not.toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Enter" });
    expect(props.onNext).toHaveBeenCalledTimes(1);
    expect(screen.getByText("✕ Bu sefer olmadı")).toBeTruthy();
    expect(screen.getByText("✏️ Doğrusu: …")).toBeTruthy();
    for (const button of screen.getAllByRole("button", { pressed: false }).concat(screen.getAllByRole("button", { pressed: true }))) {
      expect((button as HTMLButtonElement).disabled).toBe(true);
    }
  });

  it("yazı alanındayken tuşlar dinlenmez (karalama defteri)", () => {
    const { props } = card();
    const area = document.createElement("textarea");
    document.body.appendChild(area);
    fireEvent.keyDown(area, { key: "ArrowLeft" });
    expect(props.onPick).not.toHaveBeenCalled();
    area.remove();
  });
});
