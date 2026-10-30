// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DUEL_COUNTDOWN_SECONDS, DuelPlay } from "@/components/duel/duel-play";

/*
  30 Ekim 2026 canlı tur: bot turu hazırlanınca 1. sorunun süresi hemen başlıyordu; öğrenci 1. soruyu kaçırdı.
  Artık oyun 3-2-1 geri sayımla başlar, sorunun süresi ancak sonra işler.
*/

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("düello geri sayımı", () => {
  it("botla başlayınca önce geri sayım, sonra ilk soru", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({ level: "derece", name: "🤖 Derece Öğrencisi", steps: [{ ms: 50, correct: true, points: 15 }], correct: 1, score: 15, total: 1 }),
          { status: 200, headers: { "content-type": "application/json" } },
        ),
      ),
    );
    render(
      <DuelPlay
        code="geri1234"
        title="Fotosentez"
        topic={null}
        creatorName="Deniz"
        questions={[{ text: "Klorofil hangi organelde bulunur?", options: ["Kloroplast", "Ribozom", "Lizozom", "Koful"] }]}
        initialBoard={[]}
        signedIn
        countdownSeconds={1}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /ile başla/ }));
    await waitFor(() => expect(document.querySelector(".cp-duel-countdown")?.textContent).toBe("1"));
    expect(screen.queryByText("Klorofil hangi organelde bulunur?")).toBeNull();
    await waitFor(() => expect(screen.getByText("Klorofil hangi organelde bulunur?")).toBeTruthy(), { timeout: 2500 });
    expect(DUEL_COUNTDOWN_SECONDS).toBe(3);
  });
});
