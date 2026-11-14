// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ExamQuizPlay } from "@/components/parity/exam-quiz-play";

/* Faz 5A: tekrar ekranlarının kancaları ve bayrak kuralları. Şık sayısı veriden; görünüm yalnız sarmalayıcı altında. */

afterEach(cleanup);

const question = (options: string[]) => ({ id: "q1", text: "Hangisi doğrudur?", options, correct: [options[0]!] });

describe("şık sayısı veriden, kanca görünümü değiştirmez", () => {
  it("4 şıklıda E yok, 5 şıklıda var; her şıkta data-cx-option", () => {
    const { unmount } = render(<ExamQuizPlay questions={[question(["a", "b", "c", "d"])] as never} index={0} value={undefined} onChange={() => undefined} onContinue={() => undefined} continueLabel="Sonraki" />);
    expect(document.querySelectorAll("[data-cx-option]")).toHaveLength(4);
    expect(screen.queryByText("E")).toBeNull();
    unmount();
    render(<ExamQuizPlay questions={[question(["a", "b", "c", "d", "e"])] as never} index={0} value={undefined} onChange={() => undefined} onContinue={() => undefined} continueLabel="Sonraki" />);
    expect(document.querySelectorAll("[data-cx-option]")).toHaveLength(5);
    expect(screen.getByText("E")).toBeTruthy();
    expect([...document.querySelectorAll("[data-cx-option]")].every((el) => el.getAttribute("data-cx-option") === "idle")).toBe(true);
  });
});

describe("tekrar katmanı yalnız [data-ui~=tekrar] altında", () => {
  it("her seçici sarmalayıcıyla başlar; ham renk, outline:none, bulanıklık yok", () => {
    const css = readFileSync("src/styles/ui-v2-tekrar.css", "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
    for (const rule of css.match(/[^{}]+\{/g) ?? []) {
      const selector = rule.replace("{", "").trim();
      if (!selector || selector.startsWith("@") || selector === ".cx-ui-scope") continue;
      for (const part of selector.split(",")) expect(part.trim(), part).toMatch(/^\[data-ui~="tekrar"\]/);
    }
    expect(css).not.toMatch(/#[0-9a-f]{3,8}\b/i);
    expect(css).not.toMatch(/outline:\s*none/);
    expect(css).not.toMatch(/backdrop-filter/);
  });
  it("sayfa tekrar türlerinde bayrağı okur; Gate tekrar ekranlarına konmadı", () => {
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx", "utf8");
    expect(page).toContain('uiV2("tekrar", user.id)');
    expect(page).toMatch(/TEKRAR_KINDS[^\n]*\["quiz", "true_false", "flashcards", "spaced"\]/);
    for (const file of ["src/components/parity/exam-node/quiz.tsx", "src/components/parity/exam-node/true-false.tsx", "src/components/parity/exam-node/cards.tsx", "src/components/parity/exam-quiz-play.tsx"]) {
      expect(readFileSync(file, "utf8"), file).not.toMatch(/<Gate\b/);
    }
  });
});
