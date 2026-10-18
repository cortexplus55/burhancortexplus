// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { LevelSuggestCard } from "@/components/parity/level-suggest-card";
import {
  familiarityLevel,
  levelHintFromScores,
  prepFamiliarity,
  shiftFamiliarity,
} from "@/lib/learning/prep-level";
import { difficultyFromFamiliarity } from "@/lib/learning/lesson-open";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Astra ile yan yana (18 Ekim 2026): test bitince "Bu hazırlık sana fazla zor gelebilir".
describe("prep level suggestion", () => {
  it("suggests easier only when the last two scored results are both low", () => {
    expect(levelHintFromScores([40, 30], "basics")).toBe("too_hard");
    expect(levelHintFromScores([40, 70], "basics")).toBeNull();
    expect(levelHintFromScores([40], "basics")).toBeNull();
    // Zaten en kolay basamakta: önerilecek yer yok.
    expect(levelHintFromScores([20, 10], "heard")).toBeNull();
  });

  it("suggests harder when the last two are near perfect", () => {
    expect(levelHintFromScores([100, 90], "basics")).toBe("too_easy");
    expect(levelHintFromScores([100, 100], "confident")).toBeNull();
  });

  it("moves one effective step, so difficulty really changes", () => {
    expect(shiftFamiliarity("basics", "easier")).toBe("heard");
    expect(shiftFamiliarity("basics", "harder")).toBe("confident");
    expect(shiftFamiliarity("good", "easier")).toBe("heard");
    expect(shiftFamiliarity("new", "easier")).toBe("new");
    expect(shiftFamiliarity("confident", "harder")).toBe("confident");
    for (const value of ["heard", "basics", "confident"] as const) {
      expect(familiarityLevel(value)).not.toBe(familiarityLevel(shiftFamiliarity(value, value === "confident" ? "easier" : "harder")));
    }
    expect(difficultyFromFamiliarity(shiftFamiliarity("basics", "easier"))).toBe("kolay");
    expect(difficultyFromFamiliarity(shiftFamiliarity("basics", "harder"))).toBe("ileri");
  });

  it("reads the prep's level from the most common topic familiarity", () => {
    expect(prepFamiliarity(["heard", "heard", "basics"])).toBe("heard");
    expect(prepFamiliarity([null, undefined])).toBe("basics");
  });

  it("sends the student's choice and keeps the level on 'Tam kararında'", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    render(<LevelSuggestCard prepId="prep-1" hint="too_hard" />);
    expect(screen.getByText("Bu hazırlık sana fazla zor gelebilir")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Daha kolay" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toMatch(/daha kolay hazırlanacak/));
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toEqual({ prepId: "prep-1", direction: "easier" });

    cleanup();
    fetchMock.mockClear();
    render(<LevelSuggestCard prepId="prep-1" hint="too_hard" />);
    fireEvent.click(screen.getByRole("button", { name: "Tam kararında" }));
    expect(screen.getByRole("status").textContent).toMatch(/aynı kalıyor/);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
