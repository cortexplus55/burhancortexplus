// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { ExamPrepHome, type HomeNode } from "@/components/parity/exam-prep-home";
import { PATH_FAR_NOTE, PATH_LOOKAHEAD, farNodeIds } from "@/lib/learning/study-path-window";

/*
  20 Ekim 2026, ürün sahibi: "Astra mantığına geçelim — sıralamayı 2 ileri adımla aça aça
  ilerleyelim." Karar: yolun tamamı görünür; şu anki adım ve sonraki iki adım kesin plan,
  sonrası sonuçlara göre değişebilir ve soluk çizilir.
*/

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(cleanup);

const node = (index: number, status: HomeNode["status"]): HomeNode => ({
  id: `n${index}`,
  kind: index % 2 ? "quiz" : "lesson",
  title: index % 2 ? "Konu Testi" : "Ders",
  dayIndex: 1 + Math.floor(index / 3),
  sortOrder: index,
  status,
});

describe("2 adım ileri: pencere", () => {
  it("şu anki adımdan iki adım sonrası uzak sayılır; bitenler sayılmaz", () => {
    expect(PATH_LOOKAHEAD).toBe(2);
    const ordered = [
      { id: "a", status: "done" },
      { id: "b", status: "ready" },
      { id: "c", status: "locked" },
      { id: "d", status: "locked" },
      { id: "e", status: "locked" },
      { id: "f", status: "done" },
      { id: "g", status: "locked" },
    ];
    expect([...farNodeIds(ordered, "b")]).toEqual(["e", "g"]);
    expect(farNodeIds(ordered, null).size).toBe(0);
    expect(farNodeIds(ordered, "yok").size).toBe(0);
  });

  it("yolda şu anki + 2 adım net, sonrası soluk ve notlu", () => {
    const nodes = [node(0, "done"), node(1, "ready"), node(2, "locked"), node(3, "locked"), node(4, "locked"), node(5, "locked")];
    const { container } = render(
      <ExamPrepHome
        prepId="prep-1"
        title="Biyoloji"
        examType="Okul"
        examDate={null}
        daysLabel=""
        progressPct={10}
        nodes={nodes}
        hasTopic
        needsIntro={false}
        startHref="/deneme-sinavlari/prep-1/sonraki"
        topicCount={3}
        topicsDone={0}
        topicLabels={["Hücre", "Doku", "Organ"]}
        materials={[]}
      />,
    );
    const items = [...container.querySelectorAll(".cp-path-list .cp-exam-trail-item")];
    const far = items.map((item) => item.classList.contains("is-far"));
    // n0 bitti, n1 sıradaki, n2-n3 sonraki iki adım; n4 ve n5 uzak.
    expect(far).toEqual([false, false, false, false, true, true]);
    const notes = container.querySelectorAll(".cp-path-far-note");
    expect(notes).toHaveLength(1);
    expect(notes[0]?.textContent).toBe(PATH_FAR_NOTE);
    expect(items[4]?.querySelector("button")?.getAttribute("aria-label")).toContain("plan sonuçlarına göre değişebilir");
  });
});
