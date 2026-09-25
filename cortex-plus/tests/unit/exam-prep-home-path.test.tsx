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

describe("exam prep home path", () => {
  it("shows phase headings and the start CTA before any progress", () => {
    renderHome();
    expect(screen.getByRole("heading", { name: "Bugün başla" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Öğren ve Pratik Yap" })).toBeTruthy();
    expect(screen.getByText("0 / 2 konu")).toBeTruthy();
    const start = screen.getByRole("link", { name: "Hadi öğrenmeye başlayalım" });
    expect(start.getAttribute("href")).toBe("/deneme-sinavlari/prep-1/dugum/lesson-1");
  });

  it("keeps Devam et once a node is done", () => {
    renderHome({
      nodes: [{ ...lesson, status: "done" }, { ...podcast, status: "ready" }],
      topicsDone: 1,
    });
    const next = screen.getByRole("link", { name: "Devam et" });
    expect(next.getAttribute("href")).toBe("/deneme-sinavlari/prep-1/sonraki");
    expect(screen.queryByRole("link", { name: "Hadi öğrenmeye başlayalım" })).toBeNull();
  });

  it("lists source documents on the materials tab", () => {
    renderHome();
    fireEvent.click(screen.getByRole("tab", { name: "Materyaller" }));
    const doc = screen.getByRole("link", { name: /pdf-a.pdf/ });
    expect(doc.getAttribute("href")).toBe("/dokumanlar/doc-a");
    expect(screen.getByText("PDF · 10 sayfa")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Bugün başla" })).toBeNull();
  });

  it("keeps a locked podcast node locked and still offers an off-path studio", () => {
    renderHome({
      topicOptions: [
        { id: "topic-1", label: "Sistemler" },
        { id: "topic-2", label: "Enerji" },
      ],
    });
    const locked = screen.getByRole("button", { name: /Podcast Dinle/ });
    expect((locked as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Podcast / Ders oluştur" }));
    expect(screen.getByRole("option", { name: "Sistemler" })).toBeTruthy();
    expect(screen.getByText("Özet · ~1 dk")).toBeTruthy();
    expect((screen.getByRole("button", { name: /Podcast Dinle/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lists topics without leaving the prep", () => {
    renderHome();
    fireEvent.click(screen.getByRole("tab", { name: "Konular" }));
    expect(screen.getByText("Sistemler")).toBeTruthy();
    expect(screen.getByText("Enerji")).toBeTruthy();
  });
});
