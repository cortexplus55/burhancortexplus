import { describe, expect, it } from "vitest";
import {
  asksSolvedProblem,
  chatSolveNeedsGuard,
  mergeIndependentSolve,
  parseIndependentSolve,
  prepareChatSolution,
} from "@/lib/ai/chat-solve-check";

describe("sohbet çözüm sağlaması", () => {
  it("yalnız çöz ve adım adım modda, fotoğrafta veya şıklı/sayısal soruda çalışır", () => {
    expect(chatSolveNeedsGuard({ tutorStyle: "hints_first", hasImage: true, message: "fotoğraftaki soru" })).toBe(false);
    expect(chatSolveNeedsGuard({ tutorStyle: "direct_solve", hasImage: true, message: "bak" })).toBe(true);
    expect(chatSolveNeedsGuard({ tutorStyle: "step_by_step", hasImage: false, message: "A) 4\nB) 8 hangisi" })).toBe(true);
    expect(asksSolvedProblem("2x kaçtır, 2x=6")).toBe(true);
    expect(asksSolvedProblem("merhaba")).toBe(false);
    expect(asksSolvedProblem("çözüm yolunu anlat")).toBe(false);
  });

  it("tutmayan eşitliği düşürür; çelişen şıkta bağımsız çözümü yazar", () => {
    const cleaned = prepareChatSolution("Doğru şık B.\n2 + 2 = 5\nKaynak bu adımı böyle kurmuştu.");
    expect(cleaned).not.toContain("2 + 2 = 5");
    expect(cleaned).toContain("Doğru şık B");

    const replaced = mergeIndependentSolve("Doğru şık A. İşlem 2 + 2 = 4 diye kurulmuş.", {
      letter: "B",
      value: null,
      text: "Doğru şık B. İki artı iki dörttür ve bu şık B'yi işaret eder.",
    });
    expect(replaced).toContain("şık B");
    expect(replaced).not.toContain("şık A");
  });

  it("fotoğrafta iddiasız taslağı bağımsız metinle değiştirir", () => {
    const text = "Doğru şık C. Görseldeki işlem sonucu C şıkkına denk gelir.";
    const merged = mergeIndependentSolve("Bir bakalım, adım adım gidelim.", {
      letter: "C",
      value: null,
      text,
    }, { preferWhenUnclaimed: true });
    expect(merged).toContain("şık C");
    expect(parseIndependentSolve('{"letter":"C","value":null,"text":"kısa"}')).toMatchObject({ letter: "C" });
    expect(parseIndependentSolve("bozuk")).toBeNull();
  });
});
