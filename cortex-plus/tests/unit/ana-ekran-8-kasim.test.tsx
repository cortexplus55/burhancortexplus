// @vitest-environment jsdom
import { existsSync, readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { StudioGallery } from "@/components/parity/studio-gallery";
import { STUDIOS, studioNeedsPlus } from "@/lib/parity/studios";
import { PLUS_ONLY_ACTIONS, defaultFreeMeter, needsPlusOutsideFirstLesson } from "@/lib/billing/free-meters";
import { studentBottomTabs } from "@/components/parity/student-shell-nav";

/*
  8 Kasım 2026, ürün sahibi:
  1) Ücretsiz öğrencinin ilk ekranında Plus kartları üst üste biniyor, mod düğmeleri ortalanmıyor (#604).
  2) "Plus ile bu ay kartını oradan tamamen kaldır; orası öğretmenle konuşma alanı." Araçlar sekmesinin adı
     "Çalışma Stüdyosu" olsun, doğrudan stüdyolarımızı kullanacak şekilde ve daha iyi kartlarla tasarlansın.
     Stüdyo kartları ana ekrandan da kalksın (ürün sahibinin seçimi).
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

afterEach(() => cleanup());

describe("ana ekran yalnız öğretmenle sohbet", () => {
  const page = read("src/app/ogretmen/page.tsx");
  const chat = read("src/components/chat/chat-panel.tsx");

  it("Plus kartı ve stüdyo kartları ana ekranda yok; yalnız yeni öğrenciye ilk adım", () => {
    expect(page).not.toContain("PlusMonth");
    expect(page).not.toContain("loadPlusPrices");
    expect(page).not.toContain("HomeStudios");
    expect(page).not.toContain("StudioGallery");
    expect(page).toContain("!params.sohbet && prepCount === 0 ? (");
    expect(existsSync("src/components/parity/home-studios.tsx")).toBe(false);
  });

  it("sohbette de Plus tanıtımı yok: yan kart, bant ve satır kalktı", () => {
    expect(chat).not.toContain("UpgradeAside");
    expect(chat).not.toContain("cp-upgrade-banner");
    expect(chat).not.toContain("cp-sor-upgrade-row");
    expect(chat).not.toContain("showUpgrade");
    expect(read("src/styles/upgrade-gate.css")).not.toContain(".ug-aside");
  });
});

describe("yerleşim: üste binme yok (#604)", () => {
  const chat = read("src/components/chat/chat-panel.tsx");
  const shell = read("src/styles/parity-shell.css");

  it("besteci arkasını örter, mod düğmeleri ortada, kart varsa selam üstten başlar", () => {
    // 13 Kasım 2026: ana ekran göstergesinde aynı kap ince çubuğu da taşır (cx-home-composer); sınıf cn() ile.
    expect(chat).toContain('className={cn("cp-sor-composer-zone"');
    expect(shell).toContain(".cp-sor-root:not(.cp-sor-root--exam) .cp-sor-composer-zone::before");
    expect(shell).toMatch(/\.cp-sor-root:not\(\.cp-sor-root--exam\) \.cp-tutor-mode \{[^}]*justify-content: safe center/);
    // 10 Kasım 2026: kart selamla Başla'nın arasında da olabilir (heroLead); ikisi de kartlı kabuğu açar.
    expect(chat).toContain('cn("cp-sor-hero", heroFooter || heroLead ? "cp-sor-hero--rich" : null');
    expect(shell).toMatch(/\.cp-sor-hero\.cp-sor-hero--rich \{[^}]*justify-content: flex-start/);
    expect(shell).toContain("padding-bottom: calc(var(--cp-sor-composer-clearance) + 2.5rem);");
    expect(shell).toContain("scroll-padding-bottom: calc(var(--cp-sor-composer-clearance) + 2.5rem);");
    expect(shell).toContain(
      ".cp-sor-root:has(.cp-sor-hero--rich),\n.cp-sor-root:not(.cp-sor-root--exam):has(.cp-sor-view > .cp-sor-messages) {\n  height: 100vh;\n  height: 100dvh;",
    );
  });

  it("öğrenci balonu okunur; tablette üst menü yalnız simge", () => {
    expect(shell).toMatch(/\.cp-sor-root \.cp-sor-msg-user \{[^}]*color: var\(--cp-text\)/);
    // 13 Kasım 2026: kabuğun üst çubuğu (cx-shell.css); tablette sekme yazısı görsel olarak gizli, ad ekran okuyucuda.
    expect(read("src/components/parity/sor-shell.tsx")).toContain("<span>{tab.label}</span>");
    expect(read("src/styles/cx-shell.css")).toMatch(/\.cx-home-tab span,\n\s*\.cx-home-more-label \{[^}]*clip: rect\(0 0 0 0\)/);
  });
});

describe("Çalışma Stüdyosu sekmesi", () => {
  it("sekmenin adı Çalışma Stüdyosu; telefonun alt menüsünde Stüdyo; adres aynı", () => {
    const tab = studentBottomTabs.find((item) => item.id === "tools")!;
    expect(tab.label).toBe("Çalışma Stüdyosu");
    expect(tab.shortLabel).toBe("Stüdyo");
    expect(tab.href).toBe("/araclar");
    expect(read("src/components/parity/sor-shell.tsx")).toContain("{tab.shortLabel ?? tab.label}");
    expect(read("src/app/araclar/page.tsx")).toContain('title: "Çalışma Stüdyosu"');
  });

  it("sayfa stüdyolarla başlar; sekme, arama ve ders süzgeci kalktı", () => {
    const hub = read("src/components/parity/tools-hub.tsx");
    expect(hub).toContain("<StudioGallery freeAccount={freeAccount} />");
    expect(hub.indexOf("<StudioGallery")).toBeLessThan(hub.indexOf("İnteraktif laboratuvarlar"));
    expect(hub).not.toContain("tools-tabs");
    expect(hub).not.toContain("tools-search");
  });

  it("sekiz stüdyo, her biri kendi sayfasını açar; sayfalar depoda var", () => {
    render(<StudioGallery freeAccount={false} />);
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual([
      "/soru-coz",
      "/studio/quiz",
      "/studio/flashcard",
      "/studio/dogru-yanlis",
      "/studio/podcast",
      "/studio/sozlu",
      "/studio/yazili",
      "/studio/anlat",
    ]);
    expect(screen.getAllByText("Başla")).toHaveLength(8);
    for (const studio of STUDIOS) {
      const path = studio.href === "/soru-coz" ? "src/app/soru-coz/page.tsx" : `src/app${studio.href}/page.tsx`;
      expect(existsSync(path), studio.href).toBe(true);
      expect(studio.facts).toHaveLength(2);
    }
  });

  // 11 Kasım 2026 akşamı (ürün sahibinin kararı): ücretsiz hesap = tek ders. Stüdyo'da ders sayacına düşen üretimler
  // (Konu Testi, Kartlar, Doğru / Yanlış) da Plus rozetli; Fotoğraftan Çözüm ve Anlatarak Öğren günlük haklarla açık.
  it("ücretsizde Plus işleri ve ders sayacına düşen üretimler rozetli ve 'İncele' der (tek kural)", () => {
    render(<StudioGallery freeAccount />);
    expect(STUDIOS.filter((studio) => studioNeedsPlus(studio, true)).map((studio) => studio.id)).toEqual([
      "quiz",
      "flashcard",
      "dogru-yanlis",
      "podcast",
      "sozlu",
      "yazili",
    ]);
    expect(screen.getAllByText("Plus")).toHaveLength(6);
    expect(screen.getAllByText("İncele")).toHaveLength(6);
    expect(screen.getAllByText("Başla")).toHaveLength(2);
    for (const studio of STUDIOS) {
      if (!studio.action) continue;
      expect(needsPlusOutsideFirstLesson(studio.action), studio.id).toBe(true);
      expect(PLUS_ONLY_ACTIONS.includes(studio.action) || defaultFreeMeter(studio.action) === "lesson", studio.id).toBe(true);
    }
    // Abone ve kurucu rozet görmez.
    expect(STUDIOS.some((studio) => studioNeedsPlus(studio, false))).toBe(false);
  });

  it("kartlar: telefonda tek sütun, masaüstünde üç; metin 14 px altına inmez; hareket azaltmada durur", () => {
    const css = read("src/styles/studio-gallery.css");
    expect(css).toContain("grid-template-columns: repeat(3, minmax(0, 1fr));");
    expect(css).toMatch(/@media \(max-width: 560px\) \{\n  \.sg-grid \{\n    grid-template-columns: minmax\(0, 1fr\);/);
    expect(css).not.toMatch(/\.sg-blurb \{[^}]*font-size: 0\.8125rem/);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
