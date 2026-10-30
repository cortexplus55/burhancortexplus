// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ExamPrepHome, type HomeNode } from "@/components/parity/exam-prep-home";
import { openStudyActivity, resolveStudyToolNode, studyActivityHref, studyToolHref } from "@/lib/learning/study-tools";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
  vi.unstubAllGlobals();
});

/** "Ders oluştur" Astra gibi sekmeli (1 Ekim 2026). */
const tab = (name: string) => fireEvent.click(screen.getByRole("tab", { name }));

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

function renderPrep(
  title: string,
  nodes: HomeNode[],
  topics: string[],
  files: { id: string; name: string }[],
  openMisconceptions = 0,
) {
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
      openMisconceptions={openMisconceptions}
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
    // Yolda kilitli (18 Ekim 2026, Astra); menüden seçilince açılır.
    const oralOnPath = screen.getAllByRole("button", { name: /AI ile Sözlü Deneme, kilitli/ });
    expect(oralOnPath.length).toBeGreaterThan(0);

    fireEvent.click(screen.getByRole("button", { name: "Hazırlık seçenekleri" }));
    fireEvent.click(screen.getByRole("button", { name: "Ders oluştur" }));
    expect(screen.getByRole("dialog", { name: "Ders oluştur" })).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Konu seç"), { target: { value: "Gazlar" } });
    tab("Sınav");
    const oral = screen.getByRole("link", { name: "Sözlü deneme" });
    expect(oral.getAttribute("href")).toBe("/deneme-sinavlari/prep-1/dugum/oral-gaz");
    expect(screen.getByRole("link", { name: "Yazılı deneme" }).getAttribute("href")).toBe(
      studyActivityHref("prep-1", "write-sto", "Gazlar"),
    );
    expect(screen.queryByText("Bu konuda yok")).toBeNull();
    tab("Öğren");
    // 30 Ekim 2026: konuya kurulabilen etkinlik başka konunun düğümünde `?konu=` ile açılmaz (kayıt o konunun adımına
    // yazılıyordu); Gazlar'ın kart destesi yok → aynı uçla kurulur.
    expect(screen.queryByRole("link", { name: "Kartlar" })).toBeNull();
    expect(screen.getByRole("button", { name: "Kartlar" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "AI öğretmen" }).getAttribute("href")).toBe(
      studyActivityHref("prep-1", "qa-sto", "Gazlar"),
    );
    expect(screen.getByRole("link", { name: "Podcast" }).getAttribute("href")).toBe(
      "/deneme-sinavlari/prep-1/podcast",
    );
  });

  it("starts the oral exam for a non-science prep from the same hub", () => {
    renderPrep("Hukuk", lawNodes, ["Borçlar Hukuku", "Anayasa"], [
      { id: "c", name: "medeni.pdf" },
      { id: "d", name: "anayasa.pdf" },
    ]);
    fireEvent.click(screen.getByRole("tab", { name: /İlerleme/ }));
    fireEvent.click(screen.getByRole("button", { name: "Anayasa için ders oluştur" }));
    // 30 Ekim 2026: Anayasa'nın dersi ve testi yok → Borçlar Hukuku'nun düğümünde `?konu=` ile açılmaz, kurulur.
    expect(screen.queryByRole("link", { name: "Konu anlatımı" })).toBeNull();
    expect(screen.getByRole("button", { name: "Konu anlatımı" })).toBeTruthy();
    expect(resolveStudyToolNode(lawNodes, "podcast", { label: "Anayasa" })).toBeNull();
    expect(screen.getByRole("link", { name: "Podcast" }).getAttribute("href")).toBe(
      "/deneme-sinavlari/prep-1/podcast",
    );
    tab("Pratik yap");
    expect(screen.queryByRole("link", { name: "Konu testi" })).toBeNull();
    expect(screen.getByRole("button", { name: "Konu testi" })).toBeTruthy();
    tab("Sınav");
    const oral = screen.getByRole("link", { name: "Sözlü deneme" });
    expect(oral.getAttribute("href")).toBe(studyToolHref("prep-1", "oral-ana"));
    // 30 Ekim 2026 (Paket I #12): düğümü olmayan yazılı deneme kuruluma gider, "Bu konuda yok" yok.
    expect(screen.getByRole("link", { name: "Yazılı deneme" }).getAttribute("href")).toBe(
      "/deneme-sinavlari/prep-1/deneme/kurulum",
    );
    expect(screen.queryByText("Bu konuda yok")).toBeNull();
  });

  it("keeps every existing activity for a biology topic that only has a lesson node", () => {
    const biology: HomeNode[] = [
      node("les-mit", "lesson", "ready", "Mitoz", 0),
      node("oral-may", "oral", "locked", "Mayoz", 1, "AI ile Sözlü Deneme"),
    ];
    renderPrep("Biyoloji", biology, ["Mitoz", "Mayoz"], [{ id: "e", name: "hucre.pdf" }]);
    fireEvent.click(screen.getByRole("button", { name: "Hazırlık seçenekleri" }));
    fireEvent.click(screen.getByRole("button", { name: "Ders oluştur" }));
    fireEvent.change(screen.getByLabelText("Konu seç"), { target: { value: "Mitoz" } });
    expect(screen.getByRole("link", { name: "Konu anlatımı" }).getAttribute("href")).toBe(
      "/deneme-sinavlari/prep-1/dugum/les-mit",
    );
    tab("Sınav");
    // 30 Ekim 2026: Mitoz'un sözlüsü yok → Mayoz'un sözlü adımı `?konu=Mitoz` ile açılmaz (sonuç Mayoz'a yazılıyordu).
    expect(screen.queryByRole("link", { name: "Sözlü deneme" })).toBeNull();
    expect(screen.getByRole("button", { name: "Sözlü deneme" })).toBeTruthy();
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

describe("ders oluştur: Astra gibi üç sekme ve önerilen", () => {
  const nodes: HomeNode[] = [
    node("les-1", "lesson", "done", "Birim Çember", 0),
    node("card-1", "flashcards", "ready", "Birim Çember", 1),
    node("quiz-1", "quiz", "locked", "Birim Çember", 2),
    node("gaps-1", "gaps", "locked", "Birim Çember", 3),
    node("foc-1", "focused", "locked", "Birim Çember", 4),
    node("rev-1", "spaced", "locked", "Birim Çember", 5),
  ];

  it("sıradaki etkinliğin sekmesinde açılır ve onu Önerilen diye işaretler", () => {
    renderPrep("Trigonometri", nodes, ["Birim Çember"], [{ id: "t", name: "trig.pdf" }]);
    fireEvent.click(screen.getByRole("button", { name: "Hazırlık seçenekleri" }));
    fireEvent.click(screen.getByRole("button", { name: "Ders oluştur" }));
    expect(screen.getByRole("tab", { name: "Öğren" }).getAttribute("aria-selected")).toBe("true");
    const cards = screen.getByRole("link", { name: "Kartlar" });
    expect(cards.textContent).toContain("Önerilen");
    // Astra gibi: yanlış yokken Bilgi boşlukları kilitli (1 Ekim 2026).
    expect(screen.queryByRole("link", { name: "Bilgi boşlukları" })).toBeNull();
    expect(screen.getByText("🔒 Bilgi boşlukları")).toBeTruthy();
  });

  it("açık yanılgı varsa Bilgi boşlukları açılır; hiçbir şey bitmemişse Tekrar kilitli", () => {
    const fresh = nodes.map((item) => ({ ...item, status: item.status === "done" ? ("ready" as const) : item.status }));
    renderPrep("Trigonometri", fresh, ["Birim Çember"], [{ id: "t", name: "trig.pdf" }], 2);
    fireEvent.click(screen.getByRole("button", { name: "Hazırlık seçenekleri" }));
    fireEvent.click(screen.getByRole("button", { name: "Ders oluştur" }));
    tab("Öğren");
    expect(screen.getByRole("link", { name: "Bilgi boşlukları" }).getAttribute("href")).toBe(
      studyToolHref("prep-1", "gaps-1"),
    );
    tab("Pratik yap");
    expect(screen.queryByRole("link", { name: "Tekrar" })).toBeNull();
    expect(screen.getByText(/İlk dersini ya da testini bitirince açılır/)).toBeTruthy();
  });

  it("pratik sekmesinde alıştırma ve tekrar kendi düğümünü, doğru/yanlış konu testini açar", () => {
    renderPrep("Trigonometri", nodes, ["Birim Çember"], [{ id: "t", name: "trig.pdf" }]);
    fireEvent.click(screen.getByRole("button", { name: "Hazırlık seçenekleri" }));
    fireEvent.click(screen.getByRole("button", { name: "Ders oluştur" }));
    tab("Pratik yap");
    expect(screen.getByRole("link", { name: "Alıştırma" }).getAttribute("href")).toBe(studyToolHref("prep-1", "foc-1"));
    expect(screen.getByRole("link", { name: "Tekrar" }).getAttribute("href")).toBe(studyToolHref("prep-1", "rev-1"));
    // Ayrı doğru/yanlış düğümü yok: test zaten doğru/yanlış içeriyor.
    expect(screen.getByRole("link", { name: "Doğru / Yanlış" }).getAttribute("href")).toBe(
      studyToolHref("prep-1", "quiz-1"),
    );
  });
});

// 18 Ekim 2026 (Astra'daki gibi): yol sırayla açılır; öğrencinin seçtiği etkinlik ise hemen.
describe("Başka birini seç: seçilen kilitli etkinlik açılır", () => {
  it("opens the hub from the next card", () => {
    renderPrep("Kimya", chemistryNodes, ["Stokiyometri", "Gazlar"], [{ id: "a", name: "not-1.pdf" }]);
    fireEvent.click(screen.getByRole("button", { name: "Başka birini seç" }));
    expect(screen.getByRole("dialog", { name: "Ders oluştur" })).toBeTruthy();
  });

  it("unlocks the chosen node before going there", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    renderPrep("Kimya", chemistryNodes, ["Stokiyometri", "Gazlar"], [{ id: "a", name: "not-1.pdf" }]);
    fireEvent.click(screen.getByRole("button", { name: "Hazırlık seçenekleri" }));
    fireEvent.click(screen.getByRole("button", { name: "Ders oluştur" }));
    fireEvent.change(screen.getByLabelText("Konu seç"), { target: { value: "Gazlar" } });
    tab("Sınav");
    fireEvent.click(screen.getByRole("link", { name: "Sözlü deneme" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/deneme-sinavlari/prep-1/dugum/oral-gaz"));
    const init = (fetchMock.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(JSON.parse(String(init.body))).toMatchObject({ prepId: "prep-1", nodeId: "oral-gaz", action: "choose" });
  });
});
