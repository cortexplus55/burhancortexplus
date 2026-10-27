// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), message: vi.fn() } }));

import { MockExamSetup } from "@/components/parity/mock-exam-setup";
import { PaperExamRunner } from "@/components/parity/paper-exam-runner";
import { paperAnswers, paperReadUserPrompt, parsePaperRead, type PaperQuestion } from "@/lib/learning/paper-exam";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  push.mockReset();
});

/*
  Kâğıtta çöz (17 Ekim 2026, ürün sahibinin kararı: Astra'daki gibi). Astra canlıda:
  "Nasıl çözmek istiyorsun? Uygulamada / Kağıtta" → "Çalışma kağıdın hazır" → Yazdır
  ("Önce çalışma kağıdını yazdır", Başla kapalı) → "89:59 kaldı" → "Bitir ve çözümlerini
  yükle" → en fazla 10 fotoğraf → el yazısı okunup notlandırılır.
*/
const questions: PaperQuestion[] = [
  { id: "q1", text: "Havlar öksürük ve stridor hangi hastalığı düşündürür?", options: ["Bronşiolit", "Krup", "Astım", "Pnömoni"], question_type: "mcq" },
  { id: "q2", text: "Hangileri krupta beklenir?", options: ["Havlar öksürük", "Stridor", "Fokal ral", "Wheezing"], question_type: "multi_mcq" },
  { id: "q3", text: "Bronşiolit en sık viral etkenle olur.", options: ["Doğru", "Yanlış"], question_type: "true_false" },
  { id: "q4", text: "Bronşiolitte tedavinin temelini açıkla.", options: [], question_type: "open" },
];

describe("kâğıttan okunan cevaplar", () => {
  it("harf şık metnine, çok cevaplı listeye, yazılı cevap metne çevrilir; okunamayan boş", () => {
    const read = parsePaperRead({
      answers: [
        { n: 1, choices: ["b"] },
        { n: 2, choices: ["A", "B"] },
        { n: 3, choices: ["A", "B"] },
        { n: 4, unreadable: true },
      ],
    });
    const { answers, unread } = paperAnswers(questions, read);
    expect(answers).toEqual({ q1: "Krup", q2: ["Havlar öksürük", "Stridor"] });
    // Tek cevaplıda iki işaret boş sayılır ("tek kutucuğu işaretle").
    expect(answers.q3).toBeUndefined();
    expect(unread).toEqual([4]);
  });

  it("okuma istemi soru türünü ve şık harflerini verir, cevabı çözdürmez", () => {
    const prompt = paperReadUserPrompt(questions);
    expect(prompt).toContain("1. şıklı soru; şıklar: A, B, C, D");
    expect(prompt).toContain("2. şıklı soru (birden fazla işaret olabilir); şıklar: A, B, C, D");
    expect(prompt).toContain("4. yazılı cevaplı soru");
    const route = readFileSync("src/app/api/learning/exam/paper-read/route.ts", "utf8");
    expect(route).toContain('actionCode: "PRACTICE_EXAM_GRADE"');
    expect(route).toContain("if (!exam || exam.user_id !== userId) return errorResponse(404, \"not_found\");");
    expect(readFileSync("src/lib/learning/paper-exam.ts", "utf8")).toContain("Cevabı sen çözme; yalnız öğrencinin yazdığını oku.");
  });
});

describe("kurulumda çözüm yolu", () => {
  it("önce 'Nasıl çözmek istiyorsun?'; kâğıt seçilince kurulum kâğıt notuyla açılır", () => {
    render(<MockExamSetup prepId="p1" topics={[]} formatSummary={null} isAdmin={false} />);
    expect(screen.getByRole("heading", { name: "Nasıl çözmek istiyorsun?" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Kâğıtta/ }));
    expect(screen.getByText(/Kâğıdı yazdırıp süre tutarak çözersin/)).toBeTruthy();
    expect(readFileSync("src/components/parity/mock-exam-setup.tsx", "utf8")).toContain('answerMode === "paper" ? "?kagit=1" : ""');
  });
});

describe("kâğıt oynatıcısı", () => {
  it("Başla yazdırınca açılır; sayaç; yükleme adımı", async () => {
    const print = vi.fn();
    vi.stubGlobal("print", print);
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ timeLeftSec: 5399, untimed: false }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const { container } = render(<PaperExamRunner examId="e1" prepId="p1" title="Solunum" questions={questions} />);
    expect(screen.getByRole("heading", { name: "Çalışma kâğıdın hazır" })).toBeTruthy();
    expect(screen.getByText("+ 1 soru daha")).toBeTruthy();
    // Baskıya giden kâğıt: kutucuklar ve yönerge.
    expect(container.querySelectorAll(".cp-paper-sheet-box")).toHaveLength(10);
    expect(container.querySelector(".cp-paper-sheet-rule")?.textContent).toContain("tek kutucuğu işaretle");

    const start = screen.getByRole("button", { name: "Başla" }) as HTMLButtonElement;
    expect(start.disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: /Yazdır/ }));
    expect(print).toHaveBeenCalledOnce();
    window.dispatchEvent(new Event("afterprint"));
    await waitFor(() => expect((screen.getByRole("button", { name: "Başla" }) as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Başla" }));
    await waitFor(() => expect(screen.getByText("89:59")).toBeTruthy());
    expect(fetchMock).toHaveBeenCalledWith("/api/learning/exam/session?action=start", expect.objectContaining({ method: "POST" }));

    fireEvent.click(screen.getByRole("button", { name: "Bitir ve çözümlerini yükle" }));
    expect(screen.getByRole("heading", { name: "Çözdüğün çalışma kâğıdını yükle" })).toBeTruthy();
    expect((screen.getByRole("button", { name: "En az bir fotoğraf ekle" }) as HTMLButtonElement).disabled).toBe(true);
    expect(container.querySelector('input[capture="environment"]')).toBeTruthy();
  });

  it("telefondan açılınca doğrudan yükleme adımı", () => {
    render(<PaperExamRunner examId="e1" prepId="p1" title="Solunum" questions={questions} startAtUpload />);
    expect(screen.getByRole("heading", { name: "Çözdüğün çalışma kâğıdını yükle" })).toBeTruthy();
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/deneme/[examId]/page.tsx", "utf8");
    expect(page).toContain('startAtUpload={yukle === "1"}');
  });
});
