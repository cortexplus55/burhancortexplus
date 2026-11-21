// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SolutionView } from "@/components/learning/question-solver";
import { parseSolution } from "@/lib/solve/question-solver";
import { parseStudentWork, withStudentCheck } from "@/lib/solve/student-work";
import type { SolveDone } from "@/lib/solve/solve-client";

/*
  El yazısı çözüm kontrolünün kartı (21 Kasım 2026, `teacher.v2`): satırlar ✓ / ✗ / ·, ilk hata vurgulu, tek cümle
  açıklama ve tek soru; doğru cevap DOM'da yok, "Doğrusunu göster" deyince açılır. Kontrolsüz çözüm bugünkü kart.
  Örnek sentetik.
*/

afterEach(cleanup);

const json = {
  readable: true,
  subject: "Örnek",
  question: "2x + 7 = 19 ise x kaçtır?",
  options: [
    { letter: "A", text: "4" },
    { letter: "B", text: "6" },
    { letter: "C", text: "12" },
    { letter: "D", text: "13" },
    { letter: "E", text: "26" },
  ],
  kind: "mcq",
  intro: "Bilinmeyeni yalnız bırakıyoruz.",
  given: ["2x + 7 = 19"],
  asked: "x",
  steps: [
    { title: "Sabiti karşıya geçir", math: "2x = 19 - 7 = 12", say: "7 karşıya eksi olarak geçer." },
    { title: "Katsayıya böl", math: "x = 12 / 2 = 6", say: "İki tarafı 2'ye böldük." },
  ],
  answer: { letter: "B", value: "6", text: "x = 6 bulunur." },
  optionsWhy: [],
  trap: "Sabit karşıya geçerken işareti değişir.",
  tip: "Önce sabiti, sonra katsayıyı at.",
  check: "Kontrol: 2·6 + 7 = 19",
};

function phaseWith(studentWork: Record<string, unknown> | null): SolveDone {
  const solution = parseSolution(json)!;
  return {
    kind: "done",
    solution: studentWork ? withStudentCheck(solution, parseStudentWork({ ...json, studentWork })) : solution,
    status: "checked",
    verifying: false,
    agreed: true,
    ms: 6000,
  };
}

const WRONG = {
  present: true,
  lines: ["2x + 7 = 19", "2x = 19 + 7", "2x = 26", "x = 13"],
  answer: { letter: "D" },
  steps: [{ n: 1, ok: true }, { n: 2, ok: false, kind: "isaret" }, { n: 3, ok: true }, { n: 4, ok: true }],
  hint: "",
  question: "",
};

describe("kontrol kartı", () => {
  it("satırlar işaretli, ilk hata vurgulu; cevap ve adımlar gizli", () => {
    const { container } = render(<SolutionView phase={phaseWith(WRONG)} />);
    expect(screen.getByText("Çözümünü kontrol ettim")).toBeTruthy();
    const items = container.querySelectorAll(".cp-solver-check-lines li");
    expect([...items].map((item) => item.getAttribute("data-status"))).toEqual(["ok", "error", "unknown", "unknown"]);
    expect(items[1]?.hasAttribute("data-first")).toBe(true);
    expect(items[1]?.textContent).toContain("Hatalı, ilk hata");
    expect(items[1]?.textContent).toContain("işaret hatası");
    expect(screen.getByText(/2\. satırda işaret hatası/)).toBeTruthy();
    expect(screen.getByText(/işaretine ne olur\?/)).toBeTruthy();
    // Doğru cevap ve çözüm adımları DOM'da yok (yalnız bulanık değil).
    const text = container.textContent ?? "";
    expect(text).not.toContain("Doğru cevap");
    expect(text).not.toContain("x = 6 bulunur.");
    expect(text).not.toContain("x = 12 / 2 = 6");
    expect(text).not.toContain(json.tip);
    expect(container.querySelector(".cp-solver-answer")).toBeNull();
  });

  it("'Doğrusunu göster' çözümü açar, odak başlığa gider; ipucu profili yeniden kilitlemez", () => {
    render(<SolutionView phase={phaseWith(WRONG)} initialTutorStyle="hints_first" />);
    fireEvent.click(screen.getByRole("button", { name: /Doğrusunu göster/ }));
    const heading = screen.getByRole("heading", { name: "Doğru çözüm" });
    expect(document.activeElement).toBe(heading);
    expect(screen.getByText("Doğru cevap")).toBeTruthy();
    expect(screen.getByText("B) 6")).toBeTruthy();
    expect(document.querySelector(".cp-solver-answer--locked")).toBeNull();
    expect(screen.queryByRole("button", { name: /Doğrusunu göster/ })).toBeNull();
    // Kontrol kartı açık kalır; soru başlığı ikinci kez çizilmez.
    expect(screen.getAllByText("Soruyu böyle okudum")).toHaveLength(1);
  });

  it("öğretmene sor cevabı taşımaz; açıldıktan sonra bugünkü istem", () => {
    const onDiscuss = vi.fn();
    render(<SolutionView phase={phaseWith(WRONG)} onDiscuss={onDiscuss} />);
    fireEvent.click(screen.getByRole("button", { name: /Hatamı Öğretmenle Bulayım/ }));
    const prompt = String(onDiscuss.mock.calls[0]?.[0]);
    expect(prompt).toContain("Benim satırlarım:");
    expect(prompt).not.toMatch(/(?<![\d.,])6(?![\d.,])/);
    fireEvent.click(screen.getByRole("button", { name: /Doğrusunu göster/ }));
    fireEvent.click(screen.getByRole("button", { name: /Anlamadığım Yeri Öğretmene Sor/ }));
    expect(String(onDiscuss.mock.calls[1]?.[0])).toContain("Çözümün sonucu:");
  });

  it("doğru çözümde onay; soru yok, örnek çözüm isteğe bağlı", () => {
    render(
      <SolutionView
        phase={phaseWith({
          present: true,
          lines: ["2x + 7 = 19", "2x = 19 - 7 = 12", "x = 12 / 2 = 6"],
          answer: { letter: "B" },
        })}
      />,
    );
    expect(screen.getAllByText(/Çözümün doğru/).length).toBeGreaterThan(0);
    expect(document.querySelector(".cp-solver-check-question")).toBeNull();
    expect(screen.getByRole("button", { name: /Örnek çözümü gör/ })).toBeTruthy();
  });

  it("satır görülmeyen kontrol isteği: 'göremedim' ve doğrusunu açma", () => {
    render(<SolutionView phase={phaseWith({ present: false, lines: [] })} />);
    expect(screen.getByText("Çözüm satırlarını göremedim")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Doğrusunu göster/ })).toBeTruthy();
  });

  it("kontrolsüz çözüm bugünkü kart", () => {
    render(<SolutionView phase={phaseWith(null)} initialTutorStyle="direct_solve" />);
    expect(screen.getByText("Doğru cevap")).toBeTruthy();
    expect(document.querySelector(".cp-solver-check")).toBeNull();
  });
});

describe("kartın stili", () => {
  const css = readFileSync("src/styles/question-solver.css", "utf8").replace(/\r\n/g, "\n");
  const block = css.slice(css.indexOf("/* El yazısı çözüm kontrolü"));

  it("renkler token'dan (açık/koyu tema aynı kural), ham renk yok; satır metni kırılır", () => {
    expect(block.length).toBeGreaterThan(100);
    expect(block).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
    expect(block).toMatch(/\.cp-solver-check-text \{[^}]*overflow-wrap: anywhere/);
    expect(block).toMatch(/\.cp-solver-check-lines li\[data-first\] \{[^}]*var\(--c-danger-soft\)/);
    expect(block).toContain("prefers-reduced-motion: no-preference");
  });

  it("'Doğrusunu göster' 48 px'lik ikincil düğme (telefonda tam genişlik)", () => {
    const view = readFileSync("src/components/learning/student-work-check.tsx", "utf8");
    expect(view).toContain('className="cp-solver-secondary cp-solver-reveal"');
    expect(css).toMatch(/\.cp-solver-secondary \{[^}]*\}/);
    expect(css).toMatch(/min-height: 48px/);
    expect(block).toMatch(/@media \(max-width: 480px\) \{[\s\S]*\.cp-solver-reveal \{\s*align-self: stretch;/);
  });

  it("fotoğraf tek küçültücüden gider (1600 piksel)", () => {
    const client = readFileSync("src/lib/solve/solve-client.ts", "utf8");
    expect(client).toContain('import { SOLVE_IMAGE_TYPES, compressImageForUpload } from "@/lib/upload/compress-image";');
    expect(client).toContain("compressImageForUpload(file, { accepts: SOLVE_IMAGE_TYPES })");
  });
});
