// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { FlashcardLibrary } from "@/components/learning/flashcard-deck";

afterEach(cleanup);

const decks = [
  { id: "a", title: "Hücre", cards: [{ id: "1", front: "Mitokondri", back: "Enerji" }] },
  { id: "b", title: "Doku", cards: [{ id: "2", front: "Epitel", back: "Örtü" }] },
];

describe("çalışma kartları kütüphanesi", () => {
  it("desteleri ızgarada tutar; seçilince SM-2 yargılarını gösterir", () => {
    render(<FlashcardLibrary decks={decks} />);
    expect(screen.queryByText("Zorlandım")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /Hücre/ }));
    expect(screen.getByRole("button", { name: "Zorlandım" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hatırladım" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Çok Kolaydı" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Kartı cevaba çevir" }));
    fireEvent.click(screen.getByRole("button", { name: "Hatırladım" }));
    expect(screen.getByText(/Deste kapandı/)).toBeTruthy();
    expect(screen.getByText(/Hatırladım: 1/)).toBeTruthy();
  });
});
