// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExamPrepHome, type HomeNode } from "@/components/parity/exam-prep-home";
import { openStudyActivity, resolveStudyToolNode, studyActivityHref, studyToolHref } from "@/lib/learning/study-tools";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(cleanup);

function node(
  id: string,
  kind: HomeNode["kind"],
  status: HomeNode["status"],
  topicTitle: string,
  sortOrder: number,
  title = topicTitle,
): HomeNode {
  return {
    id,
    kind,
    title,
    dayIndex: 1,
    sortOrder,
    status,
    sessionMeta: { topicTitle, topicId: topicTitle },
  };
}

const chemistryNodes: HomeNode[] = [
  node("les-sto", "lesson", "ready", "Stokiyometri", 0),
  node("pod-sto", "podcast", "locked", "Stokiyometri", 1),
  node("oral-sto", "oral", "locked", "Stokiyometri", 2, "AI ile Sözlü Deneme"),
  node("quiz-sto", "quiz", "locked", "Stokiyometri", 3),
  node("write-sto", "written_exam", "locked", "Stokiyometri", 4),
  node("card-sto", "flashcards", "locked", "Stokiyometri", 5),
  node("qa-sto", "qa", "locked", "Stokiyometri", 6),
  node("oral-gaz", "oral", "locked", "Gazlar", 7, "AI ile Sözlü Deneme"),
];

const lawNodes: HomeNode[] = [
  node("les-law", "lesson", "ready", "Borçlar Hukuku", 0),
  node("pod-law", "podcast", "locked", "Borçlar Hukuku", 1),
  node("oral-law", "oral", "locked", "Borçlar Hukuku", 2, "AI ile Sözlü Deneme"),
  node("quiz-law", "quiz", "locked", "Borçlar Hukuku", 3),
  node("oral-ana", "oral", "locked", "Anayasa", 4, "AI ile Sözlü Deneme"),
];

function renderPrep(title: string, nodes: HomeNode[], topics: string[], files: { id: string; name: string }[]) {
  return render(
    <ExamPrepHome
      prepId="prep-1"
      title={title}
      examType="Okul"
      examDate={null}
      daysLabel=""
      progressPct={0}
      nodes={nodes}
      hasTopic
      needsIntro={false}
      startHref="/deneme-sinavlari/prep-1/sonraki"
      topicCount={topics.length}
      topicsDone={0}
      topicLabels={topics}
      materials={files.map((file) => ({
        id: file.id,
        name: file.name,
        kindLabel: "PDF",
        href: `/dokumanlar/${file.id}`,
      }))}
    />,
  );
}

describe("study tools hub regression", () => {
  it("opens a locked oral exam from the hub on a multi-file chemistry prep", () => {
    renderPrep("Kimya", chemistryNodes, ["Stokiyometri", "Gazlar"], [
      { id: "a", name: "not-1.pdf" },
      { id: "b", name: "not-2.pdf" },
    ]);
    const oralOnPath = screen.getAllByRole("button", { name: /AI ile Sözlü Deneme, önerilen sırada/ });
    expect(oralOnPath.length).toBeGreaterThan(0);
    for (const button of oralOnPath) {
      expect((button as HTMLButtonElement).disabled).toBe(false);
      expect(button.getAttribute("aria-label")).not.toMatch(/kilitli/);
    }

    fireEvent.click(screen.getByRole("button", { name: "Ders oluştur" }));
    expect(screen.getByRole("dialog", { name: "Ders oluştur" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Konu seç"), { target: { value: "Gazlar" } });
    const oral = screen.getByRole("link", { name: "Sözlü deneme" });
    expect(oral.getAttribute("href")).toBe("/deneme-sinavlari/prep-1/dugum/oral-gaz");
    expect(screen.getByRole("link", { name: "Yazılı deneme" }).getAttribute("href")).toBe(
      studyActivityHref("prep-1", "write-sto", "Gazlar"),
    );
    expect(screen.getByRole("link", { name: "Kartlar" }).getAttribute("href")).toBe(
      studyActivityHref("prep-1", "card-sto", "Gazlar"),
    );
    expect(screen.getByRole("link", { name: "AI öğretmen" }).getAttribute("href")).toBe(
      studyActivityHref("prep-1", "qa-sto", "Gazlar"),
    );
    expect(screen.getByRole("link", { name: "Podcast" }).getAttribute("href")).toBe(
      "/deneme-sinavlari/prep-1/podcast",
    );
    expect(screen.queryByText("Bu konuda bu etkinlik yok")).toBeNull();
  });

  it("starts the oral exam for a non-science prep from the same hub", () => {
    renderPrep("Hukuk", lawNodes, ["Borçlar Hukuku", "Anayasa"], [
      { id: "c", name: "medeni.pdf" },
      { id: "d", name: "anayasa.pdf" },
    ]);
    fireEvent.click(screen.getByRole("tab", { name: "Konular" }));
    fireEvent.click(screen.getByRole("button", { name: "Anayasa için ders oluştur" }));
    const oral = screen.getByRole("link", { name: "Sözlü deneme" });
    expect(oral.getAttribute("href")).toBe(studyToolHref("prep-1", "oral-ana"));
    expect(screen.getByRole("link", { name: "Konu anlatımı" }).getAttribute("href")).toBe(
      studyActivityHref("prep-1", "les-law", "Anayasa"),
    );
    expect(screen.getByRole("link", { name: "Test" }).getAttribute("href")).toBe(
      studyActivityHref("prep-1", "quiz-law", "Anayasa"),
    );
    expect(resolveStudyToolNode(lawNodes, "podcast", { label: "Anayasa" })).toBeNull();
    expect(screen.getByRole("link", { name: "Podcast" }).getAttribute("href")).toBe(
      "/deneme-sinavlari/prep-1/podcast",
    );
    expect(screen.getAllByText("Bu konuda bu etkinlik yok").map((node) => node.parentElement?.textContent)).toEqual(
      expect.arrayContaining([expect.stringContaining("Yazılı deneme")]),
    );
  });

  it("keeps every existing activity for a biology topic that only has a lesson node", () => {
    const biology: HomeNode[] = [
      node("les-mit", "lesson", "ready", "Mitoz", 0),
      node("oral-may", "oral", "locked", "Mayoz", 1, "AI ile Sözlü Deneme"),
    ];
    renderPrep("Biyoloji", biology, ["Mitoz", "Mayoz"], [{ id: "e", name: "hucre.pdf" }]);
    fireEvent.click(screen.getByRole("button", { name: "Ders oluştur" }));
    fireEvent.change(screen.getByLabelText("Konu seç"), { target: { value: "Mitoz" } });
    expect(screen.getByRole("link", { name: "Konu anlatımı" }).getAttribute("href")).toBe(
      "/deneme-sinavlari/prep-1/dugum/les-mit",
    );
    expect(screen.getByRole("link", { name: "Sözlü deneme" }).getAttribute("href")).toBe(
      studyActivityHref("prep-1", "oral-may", "Mitoz"),
    );
    expect(
      resolveStudyToolNode(
        [node("oral-sto", "oral", "ready", "Stokiyometri: sınırlayıcı bileşen ve verim", 0)],
        "oral",
        { label: "Stokiyometri" },
      )?.id,
    ).toBe("oral-sto");
    expect(openStudyActivity(biology, "oral", { label: "Mitoz" })?.topicQuery).toBe("Mitoz");
  });
});
