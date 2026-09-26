/** @vitest-environment jsdom */
import { describe, expect, it } from "vitest";
import { act, render, screen } from "@testing-library/react";
import { FlashcardSession } from "@/components/learning/flashcard-session";

describe("FlashcardSession rating gate", () => {
  it("disables rating buttons until the card is flipped", () => {
    render(
      <FlashcardSession
        cards={[
          {
            front: "Cumhuriyet hangi yılda ilan edildi?",
            back: "1923",
            kind: "fact",
            cardKey: "node:test",
            cardSource: "node",
          },
        ]}
      />,
    );
    act(() => {
      screen.getByRole("button", { name: "Tekrara başla" }).click();
    });
    const missed = screen.getByRole("button", { name: /Bilmedim/i });
    const hard = screen.getByRole("button", { name: /Zorlandım/i });
    const knew = screen.getByRole("button", { name: /Bildim/i });
    expect((missed as HTMLButtonElement).disabled).toBe(true);
    expect((hard as HTMLButtonElement).disabled).toBe(true);
    expect((knew as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByText(/Önce kartı çevir/i)).toBeTruthy();
  });
});
