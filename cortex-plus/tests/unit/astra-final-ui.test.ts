import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { describe, expect, it } from "vitest";
import { studentBottomTabs } from "@/components/parity/student-shell-nav";

/*
  3 Ekim 2026, son Astra turu (canlıda yan yana bakıldı):
  - Oturumda (ders, test, podcast) Astra'da üst çubuk yok; yalnız ilerleme ve ×.
    Bizde uygulama menüsü + içeride ikinci "Geri" ve "×" vardı.
  - Hazırlık simgeleri (sohbet, düello, paylaş, ⋮) Astra'da üst çubukta.
  - "Seviyeni henüz ölçmedik" bandı Astra'da yok; tanı yolun ilk düğümü.
  - Belgeler sekmesi Astra'da yok; "Daha fazla" menüsünde, yeni tasarımda.
  - Ana sayfa "Başla": yuvarlak ışıltı düğmesi.
*/
describe("son Astra turu", () => {
  it("oturum sayfaları üst çubuksuz; tek çıkış ×", () => {
    for (const page of [
      "src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx",
      "src/app/deneme-sinavlari/[prepId]/ders/[lessonId]/page.tsx",
      "src/app/deneme-sinavlari/[prepId]/deneme/[examId]/page.tsx",
    ]) {
      expect(readSource(page)).toContain('chrome="session"');
    }
    const shell = readSource("src/components/parity/sor-shell.tsx");
    expect(shell).toContain('{chrome === "session" ? null : <header className="cp-sor-top">');
    expect(readSource("src/components/parity/exam-node-session.tsx")).not.toContain("← Geri");
  });

  it("hazırlık simgeleri üst çubukta; bant yok, tanı yolun başında", () => {
    const home = readSource("src/components/parity/exam-prep-home.tsx");
    expect(home).toContain("createPortal(toolbar, topSlot)");
    expect(home).not.toContain("<strong>Seviyeni henüz ölçmedik.</strong>");
    expect(home).toContain("lead={introPending ? introNode : null}");
    expect(readSource("src/components/parity/sor-shell.tsx")).toContain('id="cp-sor-top-slot"');
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
