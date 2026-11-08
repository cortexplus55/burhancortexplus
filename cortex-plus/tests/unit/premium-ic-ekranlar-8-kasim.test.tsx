// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

import { SourceModePill } from "@/components/chat/source-mode-pill";
import { PrepCard } from "@/components/parity/exam-prep";
import { nextPrepStep, toPrepCard } from "@/lib/learning/prep-cards";
import { nodeHeading } from "@/lib/learning/node-heading";
import { PLUS_ONLY_NODE_KINDS } from "@/lib/billing/free-meters";

afterEach(cleanup);

const read = (path: string) => readFileSync(path, "utf8");

/*
  İç ekranlar, premium turu (8 Kasım 2026). Ürün sahibi kurucu hesabıyla bütün sayfaları gezdirdi; sekiz öneri
  onaylandı (sohbet altı kompakt, Soru Çöz stüdyo dili, yol önce, anket şeridi, stüdyo renkleri, kartta sıradaki
  adım, renkli öneri çipleri, öğrenci balonu + öğretmen imzası) ve gezide bulunan altı kusur kapandı.
*/
describe("sohbet altı tek satır: kaynak hapı", () => {
  it("dokununca üç seçenek açılır, seçim bildirilir ve menü kapanır", () => {
    const onChange = vi.fn();
    render(<SourceModePill value="general" onChange={onChange} />);
    const pill = screen.getByRole("button", { name: "Kaynak: Genel sohbet" });
    expect(screen.queryByRole("menu")).toBeNull();
    fireEvent.click(pill);
    expect(screen.getAllByRole("menuitemradio")).toHaveLength(3);
    expect(screen.getByRole("menuitemradio", { name: /Genel sohbet/ }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("menuitemradio", { name: /Yalnızca belgem/ }));
    expect(onChange).toHaveBeenCalledWith("only");
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("Escape menüyü kapatır", () => {
    render(<SourceModePill value="mixed" onChange={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Kaynak: Belgem + genel bilgi" }));
    expect(screen.getByRole("menu")).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("menu")).toBeNull();
  });

  it("sohbet paneli kaynak, mod ve ders seçimini tek satırda çizer; açık sohbette sınav geri sayımı gizlenir", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel).toContain('className="cp-sor-controls"');
    expect(panel).toContain("<SourceModePill");
    expect(panel).toContain("cp-ctrl-pill cp-sor-subject-pill");
    const css = read("src/styles/chat-teaching.css");
    expect(css).toMatch(/:has\(\.cp-sor-view > \.cp-sor-messages\) \.cp-exam-due-bar\s*\{\s*display:\s*none/);
  });
});

describe("öğretmen imzası, öğrenci balonu, renkli öneriler", () => {
  it("öğretmen cevabı imzayla başlar; öneri çipleri simgeli ve türüne göre sınıflı", () => {
    const panel = read("src/components/chat/chat-panel.tsx");
    expect(panel).toContain('className="cp-teacher-sign"');
    expect(panel).toContain("Cortex öğretmen");
    expect(panel).toContain("`cp-followup--${item.id}`");
    for (const icon of ["🧩", "🔁", "✅"]) expect(panel).toContain(icon);
    const css = read("src/styles/chat-teaching.css");
    expect(css).toContain(".cp-sor-root .cp-sor-messages .cp-sor-msg-user");
    expect(css).toContain(".cp-followup--quiz");
  });
});

describe("Sınavlar kartında sıradaki adım", () => {
  const nodes = [
    { status: "done" as const, id: "n0", kind: "lesson", title: "Giriş Dersi", sortOrder: 0 },
    { status: "ready" as const, id: "n2", kind: "quiz", title: "Konu testi", sortOrder: 2, sessionMeta: { topicTitle: "Hücre bölünmesi" } },
    { status: "ready" as const, id: "n1", kind: "podcast", title: "Podcast Dinle", sortOrder: 1, sessionMeta: { topicTitle: "Hücre bölünmesi", activityMinutes: 7 } },
  ];

  it("ilk açık adım sıra numarasıyla seçilir; ücretsiz hesapta Plus adımı atlanır", () => {
    const plus = nextPrepStep("p1", nodes);
    expect(plus).toMatchObject({ kind: "podcast", heading: "Hücre bölünmesi", minutes: 7, href: "/deneme-sinavlari/p1/dugum/n1" });
    const free = nextPrepStep("p1", nodes, PLUS_ONLY_NODE_KINDS);
    expect(free).toMatchObject({ kind: "quiz", kindLabel: "Konu testi", href: "/deneme-sinavlari/p1/dugum/n2" });
    expect(nextPrepStep("p1", [{ status: "done", id: "x", kind: "lesson" }])).toBeNull();
  });

  it("sınavı geçmiş hazırlıkta sıradaki adım yazılmaz", () => {
    const past = toPrepCard(
      { id: "p1", title: "Biyoloji", exam_type: "YKS", target_score: 70, exam_date: "2026-10-01" },
      [],
      nodes,
      "2026-11-08",
    );
    expect(past.next).toBeNull();
  });

  it("kart sıradaki adımı türünün renginde gösterir, Devam et oraya gider", () => {
    const card = toPrepCard(
      { id: "p1", title: "Biyoloji", exam_type: "YKS", target_score: 70, exam_date: "2026-12-01" },
      [],
      nodes,
      "2026-11-08",
    );
    render(<PrepCard card={card} showTargetLabel={false} />);
    expect(screen.getByText("Sıradaki · Podcast Dinle")).toBeTruthy();
    expect(screen.getByText("~7 dk")).toBeTruthy();
    expect(document.querySelector(".cp-prep-card-next")?.getAttribute("data-kind")).toBe("podcast");
    expect(screen.getByRole("link", { name: "Devam et" }).getAttribute("href")).toBe("/deneme-sinavlari/p1/dugum/n1");
  });

  it("hazırlık sayfası ve kart aynı adı yazar (tek kaynak)", () => {
    expect(nodeHeading({ kind: "lesson", title: "9. Sınıf · Hücre" })).toBe("Hücre");
    expect(nodeHeading({ kind: "final_check", title: "Son kontrol" })).toContain("Tüm konular");
    expect(read("src/components/parity/exam-prep-home.tsx")).toContain('import { nodeHeading } from "@/lib/learning/node-heading"');
  });
});

describe("Soru Çöz stüdyo dilinde", () => {
  it("kartla aynı simge, ad ve renk; geri Çalışma Stüdyosu'na; fotoğraf hakkı yalnız ücretsiz hesapta", () => {
    const page = read("src/app/soru-coz/page.tsx");
    const hero = read("src/components/learning/solver-hero.tsx");
    expect(hero).toContain('STUDIOS.find((item) => item.id === "soru-coz")');
    expect(page).toContain('href="/araclar"');
    expect(page).toContain("<SolverHero freeAccount={freeAccount} />");
    expect(hero).toMatch(/freeAccount \? <span className="cp-solver-hero-quota">/);
    expect(page).not.toContain("Ücretsiz hesapta günde 1 fotoğraf sorusu");
  });
});

describe("hazırlık sayfası: yol önce", () => {
  it("sınav sabahı kâğıdı ve paylaşım yolun altında", () => {
    const home = read("src/components/parity/exam-prep-home.tsx");
    expect(home.indexOf("<PrepShareTools")).toBeGreaterThan(home.indexOf("<PathSections"));
  });
});

describe("stüdyo seçimleri kendi renginde", () => {
  it("seçili düğme --ls-accent'le; podcast örnek bölümü başlığın altında küçük düğme", () => {
    const css = read("src/styles/learning-studio.css");
    expect(css).toMatch(/\.ls-seg button\[aria-pressed="true"\]\s*\{[^}]*var\(--ls-accent\)/);
    const podcast = read("src/components/learning/studio/podcast-studio.tsx");
    expect(podcast).toContain("belowHero={");
    expect(podcast).not.toContain('className="ls-pod-lock"');
  });
});

describe("gezide bulunan kusurlar", () => {
  it("tablette kurucu çipi kısa adıyla, menü ortada (Daha fazla üstüne binmez)", () => {
    const css = read("src/styles/parity-shell.css");
    expect(css).toMatch(/@media \(min-width: 768px\) and \(max-width: 1179px\)\s*\{[^@]*\.cp-founder-chip__full \{\s*display: none;/);
  });

  it("kamp teklifi kurucuya ve Plus'a çıkmaz", () => {
    expect(read("src/app/deneme-sinavlari/[prepId]/page.tsx")).toContain(
      "showsUpgradeChrome: ent.showsUpgradeChrome && (shell.account?.showsUpgradeChrome ?? false)",
    );
  });

  it("Yanlışlar Defteri'nde altın düğme yok; Krediler sekme adı sayfayla aynı", () => {
    const notebook = read("src/components/parity/mistake-notebook-view.tsx");
    expect(notebook).not.toMatch(/amber-/);
    expect(read("src/app/krediler/page.tsx")).toContain('title: "Kullanım limitleri"');
  });

  it("beşgenin ortasındaki yüzde noktayla karışmasın diye zeminle çevrelenir", () => {
    expect(read("src/styles/parity-shell.css")).toMatch(/\.cp-radar-score,\s*\.cp-radar-goal\s*\{[^}]*paint-order: stroke/);
  });
});
