// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { StudentAccountContext } from "@/lib/student/account-context";
import { FOUNDER_CREDIT_LABEL } from "@/lib/credits/chip-label";

vi.mock("next/navigation", () => ({
  usePathname: () => "/deneme-sinavlari/x/dugum/y",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
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

describe("sor-shell kurucu çipi", () => {
  it("14) exam chrome + isAdmin → FounderChip; seri kredi gibi görünmez", () => {
    const { container } = render(
      <ParitySorShell
        userInitial="K"
        streak={8}
        account={account({ isAdmin: true, canSpend: true, showsUpgradeChrome: false })}
        chrome="exam"
      >
        <div>ders</div>
      </ParitySorShell>,
    );
    expect(container.querySelector(".cp-founder-chip")).not.toBeNull();
    expect(container.textContent).toContain(FOUNDER_CREDIT_LABEL);
    const streak = container.querySelector(".cp-sor-streak");
    expect(streak?.getAttribute("aria-label")).toMatch(/Seri:\s*8/);
    expect(container.querySelector(".cp-sor-credit-chip")).toBeNull();
  });

  it("14) app chrome + isAdmin → Kurucu · Sınırsız", () => {
    const { container } = render(
      <ParitySorShell
        userInitial="K"
        account={account({ isAdmin: true, canSpend: true, showsUpgradeChrome: false })}
        chrome="app"
      >
        <div>app</div>
      </ParitySorShell>,
    );
    expect(container.textContent).toContain(FOUNDER_CREDIT_LABEL);
  });
});
