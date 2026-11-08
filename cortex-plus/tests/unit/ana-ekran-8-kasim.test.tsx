// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { HOME_STUDIOS, HomeStudios, studioNeedsPlus } from "@/components/parity/home-studios";
import { PLUS_ONLY_ACTIONS } from "@/lib/billing/free-meters";

/*
  8 Kasım 2026, ürün sahibi (ücretsiz öğrencinin ilk gördüğü ekran): "Plus ile bu ay" kartı altta kalıyor, yanında
  ikinci bir Plus kartı sohbetin üstüne biniyor, "yükselt" bandı mod düğmelerinin arkasında, Sokratik / Adım Adım /
  Doğrudan Çöz ortalanmıyor; Çalışma Stüdyoları ana ekranda yok. Telefonda ve tablette de kullanılmalı.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

afterEach(() => cleanup());

describe("Çalışma Stüdyoları ana ekranda", () => {
  it("sekiz stüdyo, her biri kendi sayfasına gider", () => {
    render(<HomeStudios freeAccount={false} />);
    expect(screen.getByRole("heading", { name: "Bugün nasıl çalışmak istersin?" })).toBeTruthy();
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toEqual([
      "/araclar",
      "/soru-coz",
      "/studio/quiz",
      "/studio/flashcard",
      "/studio/dogru-yanlis",
      "/studio/podcast",
      "/studio/sozlu",
      "/studio/yazili",
      "/studio/anlat",
    ]);
    // Plus hesapta rozet yok.
    expect(screen.queryByText("Plus")).toBeNull();
  });

  it("ücretsiz hesapta yalnız Plus'ta açılan işler rozet taşır (açık liste, fiyattan türetilmez)", () => {
    render(<HomeStudios freeAccount />);
    const badged = HOME_STUDIOS.filter((studio) => studioNeedsPlus(studio, true)).map((studio) => studio.id);
    expect(badged).toEqual(["podcast", "sozlu", "yazili"]);
    expect(screen.getAllByText("Plus")).toHaveLength(3);
    for (const studio of HOME_STUDIOS) {
      if (studio.action) expect(PLUS_ONLY_ACTIONS).toContain(studio.action);
    }
  });

  it("her stüdyonun sayfası depoda var", () => {
    for (const studio of HOME_STUDIOS) {
      const path = studio.href === "/soru-coz" ? "src/app/soru-coz/page.tsx" : `src/app${studio.href}/page.tsx`;
      expect(() => read(path), studio.href).not.toThrow();
    }
  });
});

describe("ana ekran sırası ve üste binmeler", () => {
  const page = read("src/app/ogretmen/page.tsx");
  const chat = read("src/components/chat/chat-panel.tsx");
  const shell = read("src/styles/parity-shell.css");
  const css = read("src/styles/home-studios.css");

  it("stüdyolar herkese; sıra: stüdyolar → ilk adım → Plus", () => {
    expect(page).toContain("<HomeStudios freeAccount={showPlus} />");
    const studios = page.indexOf("<HomeStudios");
    expect(studios).toBeLessThan(page.indexOf("<FirstStepLauncher"));
    expect(page.indexOf("<FirstStepLauncher")).toBeLessThan(page.indexOf("<PlusMonth"));
  });

  it("yazma alanı tek başına ve ortada; yanında kart yok", () => {
    expect(chat).not.toContain("UpgradeAside");
    expect(chat).toContain('className="cp-sor-composer-zone"');
    expect(read("src/styles/upgrade-gate.css")).not.toContain(".ug-aside");
  });

  it("besteci arkasını örter, mod düğmeleri ortada, kart varsa selam üstten başlar", () => {
    expect(shell).toContain(".cp-sor-root:not(.cp-sor-root--exam) .cp-sor-composer-zone::before");
    expect(shell).toMatch(/\.cp-sor-root:not\(\.cp-sor-root--exam\) \.cp-tutor-mode \{[^}]*justify-content: safe center/);
    expect(chat).toContain('cn("cp-sor-hero", heroFooter ? "cp-sor-hero--rich" : null)');
    expect(shell).toMatch(/\.cp-sor-hero\.cp-sor-hero--rich \{[^}]*justify-content: flex-start/);
    // Ölçülen boşluğa bestecinin üstündeki geçiş payı eklenir: son kart geçişin altında kalmaz.
    expect(shell).toContain("padding-bottom: calc(var(--cp-sor-composer-clearance) + 2.5rem);");
    expect(shell).toContain("scroll-padding-bottom: calc(var(--cp-sor-composer-clearance) + 2.5rem);");
    // Kartlı ana ekran sabit yükseklikte kabuk: kaydırılan yalnız kartların kutusu (önce vh, sonra dvh).
    expect(shell).toContain(".cp-sor-root:has(.cp-sor-hero--rich) {\n  height: 100vh;\n  height: 100dvh;");
  });

  it("sohbet sonundaki Plus satırı akışta ve yanıt yazılırken görünmez", () => {
    expect(chat).toContain("showUpgrade && messages.length > 0 && !loading ?");
    expect(chat).not.toContain("cp-upgrade-banner");
  });

  it("öğrenci balonu okunur: yazı rengi zemin rengi değil", () => {
    expect(shell).toMatch(/\.cp-sor-root \.cp-sor-msg-user \{[^}]*color: var\(--cp-text\)/);
  });

  it("tablette üst menü yalnız simge; ad ekran okuyucuda kalır", () => {
    expect(read("src/components/parity/sor-shell.tsx")).toContain('<span className="cp-sor-topnav-label">{tab.label}</span>');
    expect(shell).toContain("@media (min-width: 768px) and (max-width: 1179px)");
    expect(shell).toMatch(/\.cp-sor-topnav-label,\n\s*\.cp-sor-more--center \.cp-sor-more-label \{[^}]*clip: rect\(0 0 0 0\)/);
  });

  it("stüdyo kartları: telefonda iki sütun, metin 14 px altına inmez, hareket azaltmada durur", () => {
    expect(css).toContain("grid-template-columns: repeat(4, minmax(0, 1fr));");
    expect(css).toContain("grid-template-columns: repeat(2, minmax(0, 1fr));");
    expect(css).not.toMatch(/\.hs-blurb \{[^}]*font-size: 0\.8125rem/);
    expect(css).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
