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
    // 17 Ekim 2026, Astra ile yan yana: kartta "SIRADAKİ" ve tür rozeti.
    expect([...card.querySelectorAll(".cp-prep-badge")].map((item) => item.textContent)).toEqual(["Sıradaki", "Giriş Dersi"]);
    const start = screen.getByRole("link", { name: "Devam et" });
    expect(start.getAttribute("href")).toBe("/deneme-sinavlari/prep-1/dugum/lesson-1");
    // 17 Ekim 2026 (tasarım 5. adım, Astra): yolu birleştiren çizgi yok; düğüm üç boyutlu
    // disk, sıradakinin üstünde tür simgeli ışık huzmesi.
    expect(container.querySelectorAll(".cp-path-lines")).toHaveLength(0);
    expect(container.querySelectorAll(".cp-puck").length).toBe(container.querySelectorAll(".cp-exam-trail-node").length);
    expect(container.querySelectorAll(".cp-puck--current")).toHaveLength(1);
    expect(container.querySelectorAll(".cp-path-beam")).toHaveLength(1);
  });

  it("Astra sol kartı: başlık altında hazırlık ve tamamlanan ders özeti, Ders düğmesi, simgeli sekmeler", () => {
    const { container } = renderHome({ nodes: [{ ...lesson, status: "done" }, { ...podcast, status: "ready" }], topicsDone: 1 });
    const aside = container.querySelector(".cp-prep-aside") as HTMLElement;
    expect(aside).toBeTruthy();
    expect(aside.querySelector(".cp-prep-hero-meta")?.textContent).toMatch(/Hazırlık: %\d+1 ders tamamlandı/);
    expect(aside.querySelector(".cp-prep-hero-action--lesson")?.textContent).toBe("Ders");
    expect(aside.querySelectorAll(".cp-prep-tab-icon")).toHaveLength(2);
    expect(container.querySelector(".cp-prep-main .cp-path-next")).toBeTruthy();
    expect(container.querySelector(".cp-path-done-label")?.textContent).toBeTruthy();
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

  // 18 Ekim 2026 canlı deneme: etiket "Soru-Cevap · Büyüme" derken Devam et Beslenme'nin
  // kartlarını açıyordu. Kart, bağlantının gerçekten açtığı düğümü anlatmalı.
  it("Sıradaki kartı Devam et'in açtığı düğümü anlatır, yoldaki ilk açık düğümü değil", () => {
    const cards: HomeNode = {
      id: "cards-3",
      kind: "flashcards",
      title: "Kartlar",
      dayIndex: 2,
      sortOrder: 2,
      status: "ready",
      sessionMeta: { topicTitle: "Beslenme" },
    };
    const { container } = renderHome({
      nodes: [{ ...lesson, status: "done" }, { ...podcast, status: "ready" }, cards],
      topicsDone: 1,
      startHref: "/deneme-sinavlari/prep-1/dugum/cards-3",
    });
    const card = container.querySelector(".cp-path-next") as HTMLElement;
    expect(card.querySelector(".cp-path-next-title")?.textContent).toContain("Beslenme");
    const badges = [...card.querySelectorAll(".cp-prep-badge")].map((item) => item.textContent);
    expect(badges[0]).toBe("Sıradaki");
    expect(badges[1]).not.toBe("Podcast Dinle");
    expect(screen.getByRole("link", { name: "Devam et" }).getAttribute("href")).toBe(
      "/deneme-sinavlari/prep-1/dugum/cards-3",
    );
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

  it("keeps a locked podcast closed on the path and starts a new one from the hub", () => {
    renderHome({
      topicOptions: [
        { id: "topic-sistemler", label: "Sistemler" },
        { id: "topic-enerji", label: "Enerji" },
      ],
    });
    const locked = screen.getByRole("button", { name: /Podcast Dinle/ });
    expect(locked.getAttribute("aria-label")).toMatch(/kilitli/);
    // Astra (18 Ekim 2026): kilitli adım açılmaz, seçilir; alt kart nedenini söyler.
    fireEvent.click(locked);
    expect(screen.getByText("Bu adım, öncekileri bitirince açılır.")).toBeTruthy();
    expect(locked.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Sıradakine dön" }));
    expect(screen.queryByText("Bu adım, öncekileri bitirince açılır.")).toBeNull();
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

// 17 Ekim 2026, Astra ile yan yana: başlık alanı, sıradaki etiketi, son sonuç kartı,
// hazırlık düzeyi beşgeni ve "Deneme sınavı oluştur".
describe("hazırlık sayfası: Astra düzeni (17 Ekim 2026)", () => {
  it("başlık alanında ders etiketi ve etiketli Düello / Daha fazla; üst çubukta sohbet ve +", () => {
    const { container } = renderHome({ canShare: true });
    expect(container.querySelector(".cp-prep-hero-kicker")?.textContent).toBe("Okul");
    expect(screen.getByRole("heading", { level: 1, name: "Termodinamik" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Düello/ }).getAttribute("href")).toBe("/deneme-sinavlari/prep-1/duello");
    expect(screen.getByRole("button", { name: "Okulunla paylaş" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hazırlık seçenekleri" }).textContent).toContain("Daha fazla");
    const toolbar = screen.getByRole("toolbar", { name: "Hazırlık işlemleri" });
    expect(toolbar.querySelectorAll("a, button")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Etkinlik oluştur" })).toBeTruthy();
  });

  it("sıradaki düğümün yanında 'Sıradaki' ve konunun adı", () => {
    const { container } = renderHome();
    const label = container.querySelector(".cp-path-current-label");
    expect(label?.textContent).toContain("Sıradaki");
    expect(label?.textContent).toContain("Giriş Dersi");
  });

  it("son biten etkinlik yüzdesiyle kart; 'Sonuçları gör' sonucu açar, etkinliği baştan kurmaz", () => {
    renderHome({
      nodes: [{ ...lesson, status: "done" }, { ...podcast, status: "ready" }],
      lastResult: { nodeId: "lesson-1", pct: 80 },
    });
    const card = screen.getByRole("region", { name: "Son etkinlik" });
    expect(card.textContent).toContain("%80");
    // 17 Ekim 2026: düğümü açmak etkinliği baştan kuruyordu; Astra önceki sonucu gösteriyor.
    expect(screen.getByRole("link", { name: "Sonuçları gör" }).getAttribute("href")).toBe("/deneme-sinavlari/prep-1/dugum/lesson-1/sonuc");
  });

  it("yolun sonunda hazırlık düzeyi; 'Deneme sınavı oluştur' pencereyi Sınav sekmesinde açar", () => {
    renderHome();
    const goal = screen.getByRole("region", { name: "Hazırlık düzeyi" });
    expect(goal.textContent).toContain("Gerçek sınavda nasıl yapacağını merak ediyor musun?");
    fireEvent.click(screen.getByRole("button", { name: /Deneme sınavı oluştur/ }));
    expect(screen.getByRole("tab", { name: /Sınav/ }).getAttribute("aria-selected")).toBe("true");
  });
});

// Astra ile yan yana (18 Ekim 2026): sıradaki kartta konunun adı, biten adımda yüzde.
describe("path labels like Astra", () => {
  it("titles a generic next activity with its topic and shows the done score", () => {
    renderHome({
      nodes: [
        { ...lesson, status: "done" },
        { ...podcast, status: "ready", sessionMeta: { topicTitle: "Hücre zarı ve madde geçişi" } },
      ],
      nodeScores: { "lesson-1": 80 },
    });
    expect(screen.getByRole("heading", { name: "Hücre zarı ve madde geçişi" })).toBeTruthy();
    expect(screen.getByText("%80")).toBeTruthy();
    expect(screen.getByRole("button", { name: /Giriş Dersi · Giriş Dersi, tamamlandı, %80/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Başka birini seç" })).toBeTruthy();
  });

  it("shows the lock card when a locked node's address was opened", () => {
    renderHome({ lockedPickId: "pod-1" });
    expect(screen.getByText("Bu adım, öncekileri bitirince açılır.")).toBeTruthy();
  });
});
