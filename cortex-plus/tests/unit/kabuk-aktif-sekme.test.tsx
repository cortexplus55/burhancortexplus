// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { StudentAccountContext } from "@/lib/student/account-context";

/*
  13 Kasım 2026 (kabuk, ürün sahibinin kararı): bulunulan sayfanın sekmesi beyaz yazı ve cam hapla gösterilir;
  ekran okuyucuya aria-current="page" gider. Gerçek rota adlarıyla: /ogretmen → Ana Sayfa, /deneme-sinavlari ve
  hazırlığın alt sayfaları → Sınavlar.
*/

const route = vi.hoisted(() => ({ path: "/ogretmen" }));
vi.mock("next/navigation", () => ({
  usePathname: () => route.path,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/parity/gamification", () => ({
  readStreakFromStorage: () => 0,
  GamificationGate: () => null,
}));
vi.mock("@/components/parity/parity-dialog-host", () => ({ ParityDialogHost: () => null, MenuDialogUrlSync: () => null }));
vi.mock("@/components/paywall/plus-limit-banner", () => ({ PlusLimitBanner: () => null }));
vi.mock("@/components/paywall/promo-banner", () => ({ PromoBanner: () => null }));
vi.mock("@/components/parity/exam-chat-menu", () => ({ ExamChatMenu: () => null }));

import { ParitySorShell } from "@/components/parity/sor-shell";

afterEach(() => cleanup());

const account = {
  audience: "plus",
  balance: 0,
  freeAllowanceRemaining: 0,
  isPremium: true,
  showsUpgradeChrome: false,
  subscriptionBadge: "Plus",
  subscriptionAllowance: null,
  subscriptionPeriodEnd: null,
  canSpend: true,
  isAdmin: false,
  resetsAtLabel: "",
  periodKind: "monthly",
  usedPercent: 0,
  extraPercent: null,
} as unknown as StudentAccountContext;

function activeTabs(path: string, chrome: "app" | "focus" | "exam" = "app") {
  route.path = path;
  const { container } = render(
    <ParitySorShell userInitial="Ö" account={account} chrome={chrome}>
      <div>sayfa</div>
    </ParitySorShell>,
  );
  const top = [...container.querySelectorAll<HTMLAnchorElement>(".cx-home-tray .cx-home-tab")];
  const bottom = [...container.querySelectorAll<HTMLAnchorElement>(".cp-sor-bottomnav-link")];
  const current = (links: HTMLAnchorElement[]) =>
    links.filter((link) => link.getAttribute("aria-current") === "page").map((link) => ({
      text: link.textContent?.trim(),
      glass: link.classList.contains("cx-glass"),
    }));
  return { top: current(top), bottom: current(bottom) };
}

describe("aktif sekme", () => {
  it("/ogretmen → Ana Sayfa (üstte cam hap, altta da işaretli)", () => {
    const tabs = activeTabs("/ogretmen", "app");
    expect(tabs.top).toEqual([{ text: "Ana Sayfa", glass: true }]);
    expect(tabs.bottom.map((tab) => tab.text)).toEqual(["Ana Sayfa"]);
  });

  it("/deneme-sinavlari → Sınavlar", () => {
    expect(activeTabs("/deneme-sinavlari", "app").top).toEqual([{ text: "Sınavlar", glass: true }]);
  });

  it("hazırlık sayfası ve alt sayfaları da Sınavlar", () => {
    expect(activeTabs("/deneme-sinavlari/abc", "focus").top).toEqual([{ text: "Sınavlar", glass: true }]);
    expect(activeTabs("/deneme-sinavlari/abc/podcast", "focus").top).toEqual([{ text: "Sınavlar", glass: true }]);
    expect(activeTabs("/deneme-sinavlari/abc/sohbet", "exam").top).toEqual([{ text: "Sınavlar", glass: true }]);
  });

  it("Çalışma Stüdyosu sayfasında yalnız o sekme; başka sayfada sekme işaretli değil", () => {
    expect(activeTabs("/araclar").top).toEqual([{ text: "Çalışma Stüdyosu", glass: true }]);
    expect(activeTabs("/dokumanlar").top).toEqual([]);
  });

  it("aktif sekmenin yazısı beyaz (text-primary)", async () => {
    const { readFileSync } = await import("node:fs");
    const css = readFileSync("src/styles/cx-shell.css", "utf8");
    expect(css).toMatch(/\.cx-home-tab:hover,\s*\n\s*\.cx-home-tab\.is-active \{\s*color: var\(--cx-text-primary\);/);
  });
});
