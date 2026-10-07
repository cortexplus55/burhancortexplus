// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExamPrepHome, type HomeNode } from "@/components/parity/exam-prep-home";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(cleanup);

const lesson: HomeNode = {
  id: "lesson-1",
  kind: "lesson",
  title: "Giriş Dersi",
  dayIndex: 1,
  sortOrder: 0,
  status: "ready",
};

const podcast: HomeNode = {
  id: "pod-1",
  kind: "podcast",
  title: "Podcast Dinle",
  dayIndex: 1,
  sortOrder: 1,
  status: "locked",
};

function renderHome(overrides: Partial<Parameters<typeof ExamPrepHome>[0]> = {}) {
  return render(
    <ExamPrepHome
      prepId="prep-1"
      title="Termodinamik"
      examType="Okul"
      examDate={null}
      daysLabel=""
      progressPct={0}
      nodes={[lesson, podcast]}
      hasTopic
      needsIntro={false}
      startHref="/deneme-sinavlari/prep-1/sonraki"
      topicCount={2}
      topicsDone={0}
      topicLabels={["Sistemler", "Enerji"]}
      materials={[
        {
          id: "doc-a",
          name: "pdf-a.pdf",
          kindLabel: "PDF · 10 sayfa",
          href: "/dokumanlar/doc-a",
        },
      ]}
      {...overrides}
    />,
  );
}

function openOptions() {
  fireEvent.click(screen.getByRole("button", { name: "Hazırlık seçenekleri" }));
}

describe("exam prep home path (Astra düzeni, 29 Eylül 2026)", () => {
  it("draws the zig-zag path and the next-activity card before any progress", () => {
    const { container } = renderHome();
    // Aşama başlıkları yok; yol tek zikzak.
    expect(screen.queryByRole("heading", { name: "Bugün başla" })).toBeNull();
    const card = container.querySelector(".cp-path-next") as HTMLElement;
    expect(card.querySelector(".cp-path-next-kind")?.textContent).toBe("Giriş Dersi");
    const start = screen.getByRole("link", { name: "Devam et" });
    expect(start.getAttribute("href")).toBe("/deneme-sinavlari/prep-1/dugum/lesson-1");
    expect(container.querySelectorAll(".cp-path-lines path")).toHaveLength(1);
  });

  it("keeps Devam et on the next step once a node is done", () => {
    renderHome({
      nodes: [{ ...lesson, status: "done" }, { ...podcast, status: "ready" }],
      topicsDone: 1,
    });
    const next = screen.getByRole("link", { name: "Devam et" });
    expect(next.getAttribute("href")).toBe("/deneme-sinavlari/prep-1/sonraki");
    expect(screen.queryByRole("link", { name: "Hadi öğrenmeye başlayalım" })).toBeNull();
  });

  it("has only two views: path and progress with a percentage", () => {
    renderHome();
    const tabs = screen.getAllByRole("tab").filter((tab) =>
      tab.closest("[aria-label=\"Hazırlık görünümü\"]"),
    );
    expect(tabs.map((tab) => tab.textContent)).toEqual(["Çalışma yolu", "İlerleme%0"]);
  });

  it("lists source documents under Kaynaklar in the options menu", () => {
    renderHome();
    openOptions();
    fireEvent.click(screen.getByRole("button", { name: "Kaynaklar" }));
    const doc = screen.getByRole("link", { name: /pdf-a.pdf/ });
    expect(doc.getAttribute("href")).toBe("/dokumanlar/doc-a");
    expect(screen.getByText("PDF · 10 sayfa")).toBeTruthy();
  });

  it("opens a locked podcast from the path and starts a new one from the hub", () => {
    renderHome({
      topicOptions: [
        { id: "topic-sistemler", label: "Sistemler" },
        { id: "topic-enerji", label: "Enerji" },
      ],
    });
    const locked = screen.getByRole("button", { name: /Podcast Dinle/ });
    expect((locked as HTMLButtonElement).disabled).toBe(false);
    expect(locked.getAttribute("aria-label")).toMatch(/önerilen sırada/);
    expect(screen.queryByRole("link", { name: "Podcast oluştur" })).toBeNull();
    openOptions();
    fireEvent.click(screen.getByRole("button", { name: "Ders oluştur" }));
    fireEvent.change(screen.getByLabelText("Konu seç"), { target: { value: "Sistemler" } });
    const podcast = screen.getByRole("link", { name: "Podcast" });
    expect(podcast.getAttribute("href")).toBe(
      "/deneme-sinavlari/prep-1/podcast?topicId=topic-sistemler",
    );
  });

  it("shows the Astra progress view: score, target, sub-tabs and topics", () => {
    renderHome();
    fireEvent.click(screen.getByRole("tab", { name: /İlerleme/ }));
    expect(screen.getByText("Hazırlık puanı")).toBeTruthy();
    expect(screen.getByText("hedef %75")).toBeTruthy();
    expect(screen.getByText("hedefe ulaşan konu")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Denemeler" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Tempo" })).toBeTruthy();
    // Konu adı hem konu listesinde hem haftalık tabloda geçiyor.
    expect(screen.getAllByText("Sistemler").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Enerji").length).toBeGreaterThan(0);
    expect(screen.getByText("Tahmin, ilk derslerinden sonra görünür")).toBeTruthy();
  });

  it("shows a lock icon (not a step number) on a locked trail node", () => {
    renderHome();
    const locked = screen.getByRole("button", { name: /Podcast Dinle/ });
    expect(locked.querySelector("svg.lucide-lock")).toBeTruthy();
  });

  it("shows the activity glyph on a done node, marked done", () => {
    renderHome({ nodes: [{ ...lesson, status: "done" }, podcast] });
    const done = screen.getByRole("button", { name: /Giriş Dersi/ });
    expect(done.className).toMatch(/cp-exam-trail-node--done/);
    expect(done.querySelector("svg.lucide-lock")).toBeNull();
    expect(done.querySelector("svg")).toBeTruthy();
  });

  it("zig-zags the nodes and marks the next one as current", () => {
    const { container } = renderHome();
    const items = Array.from(container.querySelectorAll<HTMLElement>(".cp-exam-trail-item"));
    expect(items).toHaveLength(2);
    expect(items[0].style.left).not.toBe(items[1].style.left);
    expect(container.querySelector(".cp-exam-trail-item--left")).toBeNull();
    const current = container.querySelector(".cp-exam-trail-node.is-current");
    expect(current?.getAttribute("aria-label")).toMatch(/Giriş Dersi/);
  });

  it("uses letters for tests and a hexagon for podcasts", () => {
    const quiz: HomeNode = { ...podcast, id: "quiz-1", kind: "quiz", title: "Test", status: "ready" };
    const { container } = renderHome({ nodes: [{ ...lesson, status: "done" }, { ...podcast, status: "done" }, quiz] });
    expect(container.querySelector(".cp-path-node--hex")).toBeTruthy();
    expect(container.querySelector(".cp-path-letters")?.textContent).toBe("ABCD");
  });
});
