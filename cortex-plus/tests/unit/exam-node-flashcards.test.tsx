// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExamNodeSession } from "@/components/parity/exam-node-session";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock("@/lib/student/student-shell-context", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/student/student-shell-context")>()),
  useIsFounder: () => false,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const CARDS = [
  { front: "Hedef boy nasıl hesaplanır?", back: "Anne ve baba boyu toplanır, cinsiyete göre 13 cm düzeltilir, ikiye bölünür." },
  { front: "3. persentil kaç SD'ye denk gelir?", back: "Yaklaşık -1,88 SD." },
];

function renderResumedDeck() {
  vi.stubGlobal(
    "fetch",
    vi.fn((_input: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? "{}")) as { action?: string };
      const data =
        body.action === "resume"
          ? { resumed: true, attemptId: "attempt-1", payload: { type: "cards", cards: CARDS } }
          : {};
      return Promise.resolve(new Response(JSON.stringify(data), { status: 200 }));
    }),
  );
  return render(
    <ExamNodeSession
      prepId="prep-1"
      nodeId="node-1"
      kind="flashcards"
      prepTitle="Pediatri"
      topicLabel="Büyüme"
      resumeEnabled
    />,
  );
}

describe("exam-prep flashcards — reveal before self-assessment", () => {
  it("does not offer Evet/Hayır before the card has been flipped", async () => {
    renderResumedDeck();
    await screen.findByText("Hedef boy nasıl hesaplanır?");
    expect(screen.queryByRole("button", { name: "Evet" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Hayır" })).toBeNull();
    expect(screen.getByText(/Önce kendin hatırlamaya çalış/)).toBeTruthy();
  });

  it("shows the answer and the self-assessment after flipping", async () => {
    renderResumedDeck();
    await screen.findByText("Hedef boy nasıl hesaplanır?");
    fireEvent.click(screen.getByRole("button", { name: /Kartı çevir, cevabı göster/ }));
    expect(screen.getByText(/13 cm düzeltilir/)).toBeTruthy();
    expect(screen.getByText("Cevap")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Evet" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hayır" })).toBeTruthy();
  });

  it("keeps the self-assessment available if the student flips back to the question side", async () => {
    renderResumedDeck();
    await screen.findByText("Hedef boy nasıl hesaplanır?");
    fireEvent.click(screen.getByRole("button", { name: /Kartı çevir, cevabı göster/ }));
    fireEvent.click(screen.getByRole("button", { name: /Kartı soru yüzüne çevir/ }));
    expect(screen.getByText("Hedef boy nasıl hesaplanır?")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Evet" })).toBeTruthy();
  });

  it("moves to the next card with the question side and self-assessment hidden again", async () => {
    renderResumedDeck();
    await screen.findByText("Hedef boy nasıl hesaplanır?");
    fireEvent.click(screen.getByRole("button", { name: /Kartı çevir, cevabı göster/ }));
    fireEvent.click(screen.getByRole("button", { name: "Evet" }));
    expect(await screen.findByText("3. persentil kaç SD'ye denk gelir?")).toBeTruthy();
    expect(screen.getByText("2/2")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Evet" })).toBeNull();
  });
});
