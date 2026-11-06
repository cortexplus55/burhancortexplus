// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render } from "@testing-library/react";
import type { StudentAccountContext } from "@/lib/student/account-context";

/*
  Yönetim paneli temeli, ekran tarafı (6 Kasım 2026): öğrenci kabuğundaki "🛡️ Yönetim Paneli" düğmesi
  yalnız sunucunun `adminPanel` dediği hesapta; yönetim menüsünde kurucuya özel öğeler yöneticiye kilitli.
*/

vi.mock("next/navigation", () => ({
  usePathname: () => "/admin",
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/components/parity/gamification", () => ({
  readStreakFromStorage: () => 0,
  GamificationGate: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));
vi.mock("@/components/parity/parity-dialog-host", () => ({ ParityDialogHost: () => null, MenuDialogUrlSync: () => null }));
vi.mock("@/components/paywall/plus-limit-banner", () => ({ PlusLimitBanner: () => null }));
vi.mock("@/components/paywall/promo-banner", () => ({ PromoBanner: () => null }));
vi.mock("@/components/parity/exam-chat-menu", () => ({ ExamChatMenu: () => null }));

import { ParitySorShell } from "@/components/parity/sor-shell";
import { AdminNavLinks } from "@/components/admin/admin-nav-links";

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

function account(over: Partial<StudentAccountContext> = {}): StudentAccountContext {
  return {
    audience: "free",
    balance: 0,
    freeAllowanceRemaining: 0,
    isPremium: false,
    showsUpgradeChrome: true,
    subscriptionBadge: null,
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

function openMenu(container: HTMLElement) {
  const button = container.querySelector<HTMLButtonElement>("button.cp-sor-more--side, button.cp-sor-more");
  if (!button) throw new Error("Daha fazla düğmesi yok");
  fireEvent.click(button);
}

describe("öğrenci kabuğundaki Yönetim Paneli düğmesi", () => {
  it("öğrenci görmez", () => {
    const { container, queryByTestId } = render(
      <ParitySorShell userInitial="Ö" streak={0} account={account()}>
        <div>ana</div>
      </ParitySorShell>,
    );
    openMenu(container);
    expect(queryByTestId("admin-panel-link")).toBeNull();
    expect(container.textContent).not.toContain("Yönetim Paneli");
  });

  it("yönetici ya da kurucu görür (karar sunucudan: adminPanel); önizlemede de kalır", () => {
    for (const over of [{ isAdmin: true, adminPanel: true }, { isAdmin: false, freePreview: true, adminPanel: true }]) {
      const { container, getByTestId, unmount } = render(
        <ParitySorShell userInitial="K" streak={0} account={account(over)}>
          <div>ana</div>
        </ParitySorShell>,
      );
      openMenu(container);
      const link = getByTestId("admin-panel-link");
      expect(link.getAttribute("href")).toBe("/admin");
      expect(link.textContent).toContain("🛡️ Yönetim Paneli");
      unmount();
    }
  });
});

describe("yönetim menüsü", () => {
  it("yöneticiye kurucuya özel öğeler kilitli (bağlantı değil); kurucuya açık", () => {
    const admin = render(<AdminNavLinks role="admin" />);
    const lockedAdmin = [...admin.container.querySelectorAll(".adm-nav-link--locked")].map((node) => node.textContent);
    expect(lockedAdmin).toEqual(["Yöneticiler ve Yetkiler", "Paket Fiyatları", "Kredi Kuralları", "Özellik Anahtarları"]);
    expect(admin.container.querySelector('a[href="/admin/yoneticiler"]')).toBeNull();
    expect(admin.container.querySelector('a[href="/admin/destek"]')).not.toBeNull();
    expect(admin.container.querySelector('a[href="/admin"]')?.getAttribute("aria-current")).toBe("page");
    admin.unmount();

    const founder = render(<AdminNavLinks role="founder" />);
    expect(founder.container.querySelectorAll(".adm-nav-link--locked")).toHaveLength(0);
    expect(founder.container.querySelector('a[href="/admin/yoneticiler"]')).not.toBeNull();
    expect(founder.container.querySelector('a[href="/admin#karantina"]')?.getAttribute("aria-current")).toBeNull();
  });
});
