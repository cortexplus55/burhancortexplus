// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

/*
  Sohbetteki Plus kartı (6 Kasım 2026, ürün sahibinin kararı): yalnız ücretsiz hesapta, yazma alanının yanında duruyor
  ve kapatılamıyordu. "×" ile 24 saat gizlenir (tarayıcıda); kurucuya hiç çizilmez; tarayıcı kaydı bozuksa kart görünür.
*/

const founder = vi.hoisted(() => ({ value: false }));
vi.mock("@/lib/student/student-shell-context", () => ({ useIsFounder: () => founder.value }));
vi.mock("@/components/brand/cortex-mark", () => ({ CortexMark: () => null }));
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));

import { UPGRADE_ASIDE_HIDE_MS, UPGRADE_ASIDE_STORAGE_KEY, UpgradeAside, upgradeAsideHidden } from "@/components/paywall/upgrade-aside";

describe("gizlenme kuralı (saf)", () => {
  it("gelecekteki bitiş gizler; geçmiş, boş ya da bozuk kayıt gizlemez", () => {
    const now = 1_000_000;
    expect(upgradeAsideHidden(String(now + 1), now)).toBe(true);
    expect(upgradeAsideHidden(String(now - 1), now)).toBe(false);
    expect(upgradeAsideHidden(null, now)).toBe(false);
    expect(upgradeAsideHidden("bozuk", now)).toBe(false);
    expect(UPGRADE_ASIDE_HIDE_MS).toBe(24 * 60 * 60 * 1000);
  });
});

describe("kart", () => {
  beforeEach(() => {
    founder.value = false;
    window.localStorage.clear();
  });
  afterEach(() => cleanup());

  it("ücretsiz hesapta görünür; × kartı kapatır ve 24 saatlik bitişi kaydeder", () => {
    const before = Date.now();
    render(<UpgradeAside returnPath="/ogretmen" />);
    expect(screen.getByLabelText("Plus tanıtımı")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Plus'a geç/ }).getAttribute("href")).toBe("/pay?returnTo=%2Fogretmen");
    fireEvent.click(screen.getByRole("button", { name: "Plus kartını kapat" }));
    expect(screen.queryByLabelText("Plus tanıtımı")).toBeNull();
    const until = Number(window.localStorage.getItem(UPGRADE_ASIDE_STORAGE_KEY));
    expect(until).toBeGreaterThanOrEqual(before + UPGRADE_ASIDE_HIDE_MS);
  });

  it("kapatılmışsa yeni açılışta da çizilmez; süre dolunca yeniden görünür", () => {
    window.localStorage.setItem(UPGRADE_ASIDE_STORAGE_KEY, String(Date.now() + 60_000));
    render(<UpgradeAside />);
    expect(screen.queryByLabelText("Plus tanıtımı")).toBeNull();
    cleanup();
    window.localStorage.setItem(UPGRADE_ASIDE_STORAGE_KEY, String(Date.now() - 1));
    render(<UpgradeAside />);
    expect(screen.getByLabelText("Plus tanıtımı")).toBeTruthy();
  });

  it("kurucuya hiç çizilmez", () => {
    founder.value = true;
    render(<UpgradeAside />);
    expect(screen.queryByLabelText("Plus tanıtımı")).toBeNull();
  });
});
