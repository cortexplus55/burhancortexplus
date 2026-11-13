import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { describe, expect, it } from "vitest";
import { studentBottomTabs } from "@/components/parity/student-shell-nav";

/*
  3 Ekim 2026, son kıyas ürünü turu (canlıda yan yana bakıldı):
  - Oturumda (ders, test, podcast) kıyas ürününde üst çubuk yok; yalnız ilerleme ve ×.
    Bizde uygulama menüsü + içeride ikinci "Geri" ve "×" vardı.
  - Hazırlık simgeleri (sohbet, düello, paylaş, ⋮) kıyas ürününde üst çubukta.
  - "Seviyeni henüz ölçmedik" bandı kıyas ürününde yok; tanı yolun ilk düğümü.
  - Belgeler sekmesi kıyas ürününde yok; "Daha fazla" menüsünde, yeni tasarımda.
  - Ana sayfa "Başla": yuvarlak ışıltı düğmesi.
*/
describe("son kıyas ürünü turu", () => {
  it("oturum sayfaları üst çubuksuz; tek çıkış ×", () => {
    for (const page of [
      "src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx",
      "src/app/deneme-sinavlari/[prepId]/ders/[lessonId]/page.tsx",
      "src/app/deneme-sinavlari/[prepId]/deneme/[examId]/page.tsx",
    ]) {
      expect(readSource(page)).toContain('chrome="session"');
    }
    const shell = readSource("src/components/parity/sor-shell.tsx");
    // 13 Kasım 2026 (kabuk): oturumda üst çubuk ve logo yok.
    expect(shell).toContain('const showTopBar = chrome !== "session";');
    expect(shell).toMatch(/\{showTopBar \? \(\s*<header className="cx-home-top">/);
    expect(readSource("src/components/parity/exam-node-session.tsx")).not.toContain("← Geri");
  });

  it("hazırlık simgeleri üst çubukta; bant yok, tanı yolun başında", () => {
    const home = readSource("src/components/parity/exam-prep-home.tsx");
    expect(home).toContain("createPortal(toolbar, topSlot)");
    expect(home).not.toContain("<strong>Seviyeni henüz ölçmedik.</strong>");
    expect(home).toContain("lead={introPending ? introNode : null}");
    // 13 Kasım 2026 (kabuk): üst çubuk bütün sayfalarda aynı; hazırlığın simgeleri sayfanın başında durur
    // (yuva yoksa araç çubuğu yerinde çizilir).
    expect(readSource("src/components/parity/sor-shell.tsx")).not.toContain('id="cp-sor-top-slot"');
    expect(home).toContain("{topSlot ? createPortal(toolbar, topSlot) : toolbar}");
  });

  it("Belgeler menüde değil, Daha fazla'da; sayfada ayrı yükleme formu yok", () => {
    expect(studentBottomTabs.some((tab) => tab.href === "/dokumanlar")).toBe(false);
    expect(readSource("src/components/parity/sor-shell.tsx")).toContain('{ href: "/dokumanlar", label: "Belgelerim", icon: FileText }');
    const docs = readSource("src/app/dokumanlar/page.tsx");
    expect(docs).not.toContain("<DocumentUpload");
    expect(docs).toContain("cp-docs-card");
  });

  it("ana sayfa Başla yuvarlak ışıltı düğmesi", () => {
    const panel = readSource("src/components/chat/chat-panel.tsx");
    expect(panel).toContain('<span className="cp-sor-start-orb" aria-hidden>');
    expect(panel).not.toContain('"+ " + startLabel');
  });
});
