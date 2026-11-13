// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import { HOME_START_EVENT } from "@/lib/ui/home-events";
import type { StudentAccountContext } from "@/lib/student/account-context";
import { FOUNDER_CREDIT_LABEL } from "@/lib/credits/chip-label";

const push = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({
  usePathname: () => "/deneme-sinavlari/x/dugum/y",
  useRouter: () => ({ replace: vi.fn(), push, refresh: vi.fn() }),
}));

vi.mock("@/components/parity/gamification", () => ({
  readStreakFromStorage: () => 0,
  GamificationGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

vi.mock("@/components/parity/parity-dialog-host", () => ({
  ParityDialogHost: () => null,
  MenuDialogUrlSync: () => null,
}));

vi.mock("@/components/paywall/plus-limit-banner", () => ({
  PlusLimitBanner: () => null,
}));

vi.mock("@/components/paywall/promo-banner", () => ({
  PromoBanner: () => null,
}));

vi.mock("@/components/parity/exam-chat-menu", () => ({
  ExamChatMenu: () => null,
}));

import { ParitySorShell } from "@/components/parity/sor-shell";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function account(over: Partial<StudentAccountContext> = {}): StudentAccountContext {
  return {
    audience: "free",
    balance: 8,
    freeAllowanceRemaining: 0,
    isPremium: true,
    showsUpgradeChrome: false,
    subscriptionBadge: "Plus",
    subscriptionAllowance: null,
    subscriptionPeriodEnd: null,
    canSpend: true,
    isAdmin: false,
    resetsAtLabel: "26 Eylül 2026 03:00",
    periodKind: "monthly",
    usedPercent: 0,
    extraPercent: null,
    ...over,
  };
}

/*
  13 Kasım 2026 (kabuk, ürün sahibinin kararı): bütün öğrenci sayfalarında ana ekranın üst çubuğu. Kurucu çipi
  ("Kurucu · Sınırsız") ve plan rozeti çubukta yok (renk disiplini: Plus'ta rozet yok); seri kredi gibi görünmez.
  Önceki kural (14: sınav ve uygulama kabuğunda kurucu çipi) bilerek değişti.
*/
describe("sor-shell kurucu", () => {
  for (const chrome of ["exam", "app", "focus"] as const) {
    it(`${chrome} kabuğunda yeni üst çubuk; kurucu çipi yok, seri kredi gibi görünmez`, () => {
      const { container } = render(
        <ParitySorShell
          userInitial="K"
          streak={8}
          account={account({ isAdmin: true, canSpend: true, showsUpgradeChrome: false })}
          chrome={chrome}
        >
          <div>ders</div>
        </ParitySorShell>,
      );
      expect(container.querySelector("header.cx-home-top")).not.toBeNull();
      expect(container.querySelector(".cp-founder-chip")).toBeNull();
      expect(container.textContent).not.toContain(FOUNDER_CREDIT_LABEL);
      const streak = container.querySelector(".cx-home-streak");
      expect(streak?.getAttribute("aria-label")).toMatch(/Seri:\s*8/);
      expect(container.querySelector(".cp-sor-credit-chip")).toBeNull();
    });
  }

  it("oturum kabuğunda (ders, test, fiyat) çubuk ve logo yok; fiyatta tek cam kapat", () => {
    const session = render(
      <ParitySorShell userInitial="K" account={account()} chrome="session">
        <div>ders</div>
      </ParitySorShell>,
    );
    expect(session.container.querySelector("header")).toBeNull();
    expect(session.container.querySelector(".cx-home-logo")).toBeNull();
    expect(session.container.querySelector(".cp-sor-bottomnav")).toBeNull();
    expect(session.container.querySelector(".cx-shell-close")).toBeNull();
    session.unmount();
    const pay = render(
      <ParitySorShell userInitial="K" account={account()} chrome="session" closeHref="/ogretmen">
        <div>fiyat</div>
      </ParitySorShell>,
    );
    expect(pay.container.querySelector("header")).toBeNull();
    const close = pay.container.querySelector(".cx-shell-close");
    expect(close?.getAttribute("href")).toBe("/ogretmen");
    expect(close?.getAttribute("aria-label")).toBe("Kapat");
  });

  it("Başla: sayfada öğretmen sohbeti dinliyorsa orada açılır, yoksa ana ekrana gider", () => {
    const { container } = render(
      <ParitySorShell userInitial="K" account={account()} chrome="app">
        <div>sınavlar</div>
      </ParitySorShell>,
    );
    push.mockClear();
    fireEvent.click(container.querySelector(".cx-home-start")!);
    expect(push).toHaveBeenCalledWith("/ogretmen?basla=1");
    push.mockClear();
    const listen = (event: Event) => event.preventDefault();
    window.addEventListener(HOME_START_EVENT, listen);
    fireEvent.click(container.querySelector(".cx-home-start")!);
    window.removeEventListener(HOME_START_EVENT, listen);
    expect(push).not.toHaveBeenCalled();
  });
});
