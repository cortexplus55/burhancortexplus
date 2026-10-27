// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ExamPrepHome, type HomeNode } from "@/components/parity/exam-prep-home";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, replace: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  cleanup();
  push.mockReset();
});

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
    expect([...card.querySelectorAll(".cp-prep-badge")].map((item) => item.textContent)).toEqual(["Sıradaki adım", "Giriş Dersi"]);
    const start = screen.getByRole("link", { name: "Devam et" });
    expect(start.getAttribute("href")).toBe("/deneme-sinavlari/prep-1/dugum/lesson-1");
    expect(screen.getByRole("button", { name: /Öğren ve Pratik Yap/ }).getAttribute("aria-expanded")).toBe("false");
    expect(container.querySelectorAll(".cp-exam-trail-item")).toHaveLength(1);
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
    expect(screen.getByRole("button", { name: /Bugün başla/ }).textContent).toMatch(/Tamamlandı/);
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
    expect(card.querySelector(".cp-path-next-title")?.textContent).toBe("Kartlar");
    const badges = [...card.querySelectorAll(".cp-prep-badge")].map((item) => item.textContent);
    expect(badges[0]).toBe("Sıradaki adım");
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
    fireEvent.click(screen.getByRole("button", { name: /Öğren ve Pratik Yap/ }));
    const locked = screen.getByRole("button", { name: /Podcast Dinle/ });
    expect(locked.getAttribute("aria-label")).toMatch(/kilitli/);
    // Astra (18 Ekim 2026): kilitli adım açılmaz, seçilir; alt kart nedenini söyler.
    fireEvent.click(locked);
    expect(screen.getByRole("button", { name: "Bu Etkinliği Şimdi Başlat" })).toBeTruthy();
    expect(locked.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Sıradakine dön" }));
    expect(screen.queryByRole("button", { name: "Bu Etkinliği Şimdi Başlat" })).toBeNull();
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
    expect(screen.getAllByText("hedef %75").length).toBeGreaterThan(0);
    expect(screen.getByText("hedefe ulaşan konu")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Denemeler" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Tempo" })).toBeTruthy();
    // Konu adı hem konu listesinde hem haftalık tabloda geçiyor.
    expect(screen.getAllByText("Sistemler").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Enerji").length).toBeGreaterThan(0);
    expect(screen.getByText("Tahmin, ilk dersinden sonra görünür")).toBeTruthy();
  });

  it("shows a lock icon (not a step number) on a locked trail node", () => {
    renderHome();
    fireEvent.click(screen.getByRole("button", { name: /Öğren ve Pratik Yap/ }));
    const locked = screen.getByRole("button", { name: /Podcast Dinle/ });
    expect(locked.querySelector("svg.lucide-lock")).toBeTruthy();
  });

  it("shows the activity glyph on a done node, marked done", () => {
    renderHome({ nodes: [{ ...lesson, status: "done" }, podcast] });
    fireEvent.click(screen.getByRole("button", { name: /Bugün başla/ }));
    const done = screen.getByRole("button", { name: /Giriş Dersi/ });
    expect(done.className).toMatch(/cp-exam-trail-node--done/);
    expect(done.querySelector("svg.lucide-lock")).toBeNull();
    expect(done.querySelector("svg")).toBeTruthy();
  });

  it("zig-zags the nodes and marks the next one as current", () => {
    const quiz: HomeNode = { ...podcast, id: "quiz-1", kind: "quiz", title: "Test", status: "locked", sortOrder: 2 };
    const { container } = renderHome({
      nodes: [{ ...lesson, status: "done" }, { ...podcast, status: "ready" }, quiz],
    });
    const items = Array.from(container.querySelectorAll<HTMLElement>(".cp-exam-trail-item"));
    expect(items).toHaveLength(2);
    expect(items[0].style.left).not.toBe(items[1].style.left);
    expect(container.querySelector(".cp-exam-trail-item--left")).toBeNull();
    expect(container.querySelectorAll(".cp-path-lines path").length).toBeGreaterThan(0);
    const current = container.querySelector(".cp-exam-trail-node.is-current");
    expect(current?.getAttribute("aria-label")).toMatch(/Podcast Dinle/);
  });

  it("uses letters for tests and a hexagon for podcasts", () => {
    const quiz: HomeNode = { ...podcast, id: "quiz-1", kind: "quiz", title: "Test", status: "ready" };
    const { container } = renderHome({ nodes: [{ ...lesson, status: "done" }, { ...podcast, status: "done" }, quiz] });
    expect(container.querySelector(".cp-path-node--hex")).toBeTruthy();
    expect(container.querySelector(".cp-path-letters")?.textContent).toBe("ABCD");
  });
});

// 17 Ekim 2026, Astra ile yan yana: başlık alanı, sıradaki etiketi, son sonuç kartı,
// hazırlık düzeyi (radar + tahmin) ve "Deneme sınavı oluştur".
describe("hazırlık sayfası: Astra düzeni (17 Ekim 2026)", () => {
  it("başlık alanında ders etiketi ve etiketli Düello / Daha fazla; üst çubukta sohbet ve +", () => {
    const { container } = renderHome({ canShare: true });
    expect(container.querySelector(".cp-prep-hero-kicker")?.textContent).toBe("Okul");
    expect(screen.getByRole("heading", { level: 1, name: "Termodinamik" })).toBeTruthy();
    expect(screen.getByRole("link", { name: /Düello/ }).getAttribute("href")).toBe("/deneme-sinavlari/prep-1/duello");
    expect(screen.getByRole("button", { name: "Okulunla paylaş" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Hazırlık seçenekleri" }).textContent).toContain("Daha fazla");
    const toolbar = screen.getByRole("toolbar", { name: "Hazırlık işlemleri" });
    // 23 Ekim 2026: sohbet, soru çöz (ürün sahibinin kararı: hazırlık sayfasında da) ve +.
    expect(toolbar.querySelectorAll("a, button")).toHaveLength(3);
    expect(screen.getByRole("link", { name: "Soru çöz" }).getAttribute("href")).toBe("/soru-coz?hazirlik=prep-1");
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

  it("yolun sonunda hazırlık düzeyi; radar ve tahmin ilerleme sekmesinde", () => {
    const { container } = renderHome();
    const goal = screen.getByRole("region", { name: "Hazırlık düzeyi" });
    expect(goal.querySelector(".cp-radar-svg")).toBeNull();
    expect(goal.querySelector(".cp-forecast-svg")).toBeNull();
    expect(goal.textContent).toContain("Gerçek sınavda nasıl yapacağını merak ediyor musun?");
    fireEvent.click(screen.getByRole("tab", { name: /İlerleme/ }));
    const progress = screen.getByRole("region", { name: "İlerleme" });
    expect(progress.querySelector(".cp-radar-svg")).toBeTruthy();
    expect(progress.querySelector(".cp-forecast-svg")).toBeTruthy();
    expect(container.querySelector(".cp-prep-goal .cp-radar-svg")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Çalışma yolu" }));
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
    expect(screen.getByRole("button", { name: /Bugün başla/ }).textContent).toMatch(/%80/);
    fireEvent.click(screen.getByRole("button", { name: /Bugün başla/ }));
    expect(screen.getByRole("button", { name: /Giriş Dersi · Giriş Dersi, tamamlandı, %80/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Başka birini seç" })).toBeTruthy();
  });

  it("shows the lock card when a locked node's address was opened", () => {
    renderHome({ lockedPickId: "pod-1" });
    expect(screen.getByRole("button", { name: "Bu Etkinliği Şimdi Başlat" })).toBeTruthy();
  });
});

describe("kompakt yol ve bitmiş adım (25 Ekim 2026)", () => {
  it("bitmiş dersi yoldan seçince kredisiz inceleme ve sıradaki adımı sunar", () => {
    renderHome({
      nodes: [{ ...lesson, status: "done" }, { ...podcast, status: "ready" }],
    });
    fireEvent.click(screen.getByRole("button", { name: /Bugün başla/ }));
    fireEvent.click(screen.getByRole("button", { name: /Giriş Dersi/ }));
    expect(screen.getByRole("region", { name: "Tamamlanan adım" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "📖 Dersi / İçeriği Tekrar İncele (Kredisiz)" }).getAttribute("href")).toBe(
      "/deneme-sinavlari/prep-1/dugum/lesson-1?incele=1",
    );
    expect(screen.getByRole("link", { name: "⏭️ Sıradaki Etkinliğe Git" }).getAttribute("href")).toBe(
      "/deneme-sinavlari/prep-1/sonraki",
    );
    expect(push).not.toHaveBeenCalled();
  });

  it("yalnız aktif konunun düğümlerini açık tutar", () => {
    const topics = ["Hücre", "Doku", "Organ", "Sistem", "Enerji", "Kalıtım"];
    const kinds = ["lesson", "quiz", "podcast", "oral"] as const;
    const nodes: HomeNode[] = topics.flatMap((topic, topicIndex) =>
      kinds.map((kind, step) => ({
        id: `${topic}-${kind}`,
        kind,
        title: `${topic} ${kind}`,
        dayIndex: topicIndex + 1,
        sortOrder: topicIndex * 4 + step,
        status: topicIndex === 0 && step === 0 ? "ready" : "locked",
        sessionMeta: { topicTitle: topic },
      })),
    );
    const { container } = renderHome({ nodes, topicCount: 6, topicLabels: topics });
    expect(container.querySelectorAll(".cp-path-section")).toHaveLength(3);
    expect(container.querySelectorAll(".cp-exam-trail-item")).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Kalan kilitli konular (3 konu)" })).toBeTruthy();
    const collapsed = screen.getByRole("button", { name: /Doku/ });
    expect(collapsed.getAttribute("aria-expanded")).toBe("false");
    expect(collapsed.textContent).toMatch(/4 adım · Kilitli/);
    fireEvent.click(collapsed);
    expect(container.querySelectorAll(".cp-exam-trail-item")).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Kalan kilitli konular (3 konu)" }));
    expect(container.querySelectorAll(".cp-path-section")).toHaveLength(6);
  });

  it("ilerleme listesi ilk 8 konudan sonrasını açılır tutar", () => {
    const topicLabels = Array.from({ length: 10 }, (_, index) => `Konu ${index + 1}`);
    renderHome({ topicLabels, topicCount: 10 });
    fireEvent.click(screen.getByRole("tab", { name: /İlerleme/ }));
    expect(screen.getByRole("button", { name: "Konu 8 için ders oluştur" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Konu 9 için ders oluştur" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tüm Konuları Göster (10 konu)" }));
    expect(screen.getByRole("button", { name: "Konu 10 için ders oluştur" })).toBeTruthy();
  });
});
