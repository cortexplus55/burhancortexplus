import { readFileSync } from "node:fs";
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
      expect(readFileSync(page, "utf8")).toContain('chrome="session"');
    }
    const shell = readFileSync("src/components/parity/sor-shell.tsx", "utf8");
    expect(shell).toContain('{chrome === "session" ? null : <header className="cp-sor-top">');
    expect(readFileSync("src/components/parity/exam-node-session.tsx", "utf8")).not.toContain("← Geri");
  });

  it("hazırlık simgeleri üst çubukta; bant yok, tanı yolun başında", () => {
    const home = readFileSync("src/components/parity/exam-prep-home.tsx", "utf8");
    expect(home).toContain("createPortal(toolbar, topSlot)");
    expect(home).not.toContain("<strong>Seviyeni henüz ölçmedik.</strong>");
    expect(home).toContain("lead={introPending ? introNode : null}");
    expect(readFileSync("src/components/parity/sor-shell.tsx", "utf8")).toContain('id="cp-sor-top-slot"');
  });

  it("Belgeler menüde değil, Daha fazla'da; sayfada ayrı yükleme formu yok", () => {
    expect(studentBottomTabs.some((tab) => tab.href === "/dokumanlar")).toBe(false);
    expect(readFileSync("src/components/parity/sor-shell.tsx", "utf8")).toContain('{ href: "/dokumanlar", label: "Belgelerim", icon: FileText }');
    const docs = readFileSync("src/app/dokumanlar/page.tsx", "utf8");
    expect(docs).not.toContain("<DocumentUpload");
    expect(docs).toContain("cp-docs-card");
  });

  it("ana sayfa Başla yuvarlak ışıltı düğmesi", () => {
    const panel = readFileSync("src/components/chat/chat-panel.tsx", "utf8");
    expect(panel).toContain('<span className="cp-sor-start-orb" aria-hidden>');
    expect(panel).not.toContain('"+ " + startLabel');
  });
});
