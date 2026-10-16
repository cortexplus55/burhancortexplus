// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

vi.mock("server-only", () => ({}));

import { toPrepCard } from "@/lib/learning/prep-cards";
import { MyPrepsView } from "@/components/parity/my-preps-view";
import { ParityExamPrep } from "@/components/parity/exam-prep";

afterEach(cleanup);

/* "Sınav hazırlıklarım" — Astra'daki ayrı sayfa (1 Ekim 2026). */
const prep = (id: string, examDate: string | null, viewCount = 0) =>
  toPrepCard(
    { id, title: `Hazırlık ${id}`, exam_type: "Matematik", target_score: 75, exam_date: examDate, view_count: viewCount },
    [],
    [{ status: "ready" }],
    "2026-10-02",
  );

describe("sınav hazırlıklarım", () => {
  it("sınav günü geçenler geçmişe düşer; bugün yaklaşan sayılır", () => {
    expect(prep("a", "2026-10-01").past).toBe(true);
    expect(prep("b", "2026-10-02").past).toBe(false);
    expect(prep("c", null).past).toBe(false);
    expect(prep("d", "2026-11-01", 4).joinCount).toBe(4);
  });

  it("Yaklaşan / Geçmiş sekmeleri ve üstte sayılar", () => {
    const cards = [prep("a", "2026-10-20", 3), prep("b", "2026-09-01", 2), prep("c", null)];
    render(<MyPrepsView cards={cards} userInitial="B" />);
    expect(screen.getByText("3 hazırlık · 5 katılım")).toBeTruthy();
    expect(screen.getByRole("tab", { name: "Yaklaşan (2)" }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByText("Hazırlık a")).toBeTruthy();
    expect(screen.queryByText("Hazırlık b")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Geçmiş (1)" }));
    expect(screen.getByText("Hazırlık b")).toBeTruthy();
    expect(screen.queryByText("Hazırlık a")).toBeNull();
  });

  it("ana liste Yaklaşan / Geçmiş ızgarası; başlık hazırlıklarım sayfasını açar", () => {
    expect(readFileSync("src/app/deneme-sinavlari/page.tsx", "utf8")).toContain("loadPrepCards(supabase, user.id, 24)");
    expect(readFileSync("src/app/deneme-sinavlari/hazirliklarim/page.tsx", "utf8")).toContain("loadPrepCards(supabase, user.id, 100)");
    expect(readFileSync("src/components/parity/exam-prep.tsx", "utf8")).toContain('href="/deneme-sinavlari/hazirliklarim"');
  });
});

// 17 Ekim 2026, Astra ile yan yana: üç kutu ayrı sayfa, iki sütunlu ızgara, Yaklaşan / Geçmiş,
// yarım kurulum "Taslaklar"da.
describe("sınavlar listesi (Astra düzeni)", () => {
  it("üç kutu ayrı sayfaları açar; eski sekme bağlantısı yönlenir", () => {
    render(<ParityExamPrep cards={[]} />);
    expect(screen.getByRole("link", { name: /Okulum/ }).getAttribute("href")).toBe("/deneme-sinavlari/okulum");
    expect(screen.getByRole("link", { name: /Müfredat/ }).getAttribute("href")).toBe("/deneme-sinavlari/mufredat");
    expect(screen.getByRole("link", { name: /Resmî sınavlar/ }).getAttribute("href")).toBe("/deneme-sinavlari/resmi");
    expect(screen.getByRole("link", { name: /Yeni hazırlık/ }).getAttribute("href")).toBe("/deneme-sinavlari/olustur");
    const page = readFileSync("src/app/deneme-sinavlari/page.tsx", "utf8");
    expect(page).toContain('mufredat: "/deneme-sinavlari/mufredat"');
    for (const route of ["okulum", "mufredat", "resmi"]) {
      expect(readFileSync(`src/app/deneme-sinavlari/${route}/page.tsx`, "utf8")).toContain('export const dynamic = "force-dynamic"');
    }
  });

  it("Yaklaşan / Geçmiş anahtarı aynı ızgarada", () => {
    const cards = [prep("a", "2026-10-20"), prep("b", "2026-09-01")];
    render(<ParityExamPrep cards={cards} />);
    expect(screen.getByText("Hazırlık a")).toBeTruthy();
    expect(screen.queryByText("Hazırlık b")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Geçmiş" }));
    expect(screen.getByText("Hazırlık b")).toBeTruthy();
    expect(screen.queryByText("Hazırlık a")).toBeNull();
  });

  it("yarım kurulum Taslaklar'da; tamamla ya da sil", () => {
    window.localStorage.setItem(
      "cortex:exam-wizard-draft:v1",
      JSON.stringify({ v: 1, step: "topics", subject: "Pediatri", title: "", materials: [], updatedAt: new Date().toISOString() }),
    );
    render(<ParityExamPrep cards={[]} />);
    expect(screen.getByText("Taslaklar")).toBeTruthy();
    expect(screen.getByText("Pediatri")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Oluşturmayı tamamla/ }).getAttribute("href")).toBe("/deneme-sinavlari/olustur");
    fireEvent.click(screen.getByRole("button", { name: "Taslağı sil" }));
    expect(screen.queryByText("Taslaklar")).toBeNull();
    expect(window.localStorage.getItem("cortex:exam-wizard-draft:v1")).toBeNull();
  });
});
