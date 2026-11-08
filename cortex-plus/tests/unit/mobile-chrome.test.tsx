// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { SubscriptionCards } from "@/components/parity/subscription-cards";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));

afterEach(cleanup);

const shell = readFileSync("src/styles/parity-shell.css", "utf8");
const upgrade = readFileSync("src/styles/upgrade-gate.css", "utf8");
const pricing = readFileSync("src/styles/parity-app.css", "utf8");
const cards = readFileSync("src/components/parity/subscription-cards.tsx", "utf8");
const chat = readFileSync("src/components/chat/chat-panel.tsx", "utf8");

const plans = [
  {
    id: "plus-month",
    name: "Plus Aylık",
    description: null,
    price_try: 59900,
    credit_amount: 100,
    is_premium: true,
    billing_period: "monthly",
    tier: "plus",
    period_days: 30,
  },
  {
    id: "sigma-month",
    name: "Sigma Aylık",
    description: null,
    price_try: 99900,
    credit_amount: 300,
    is_premium: true,
    billing_period: "monthly",
    tier: "sigma",
    period_days: 30,
  },
];

describe("öğretmen ekranında yükseltme kartı yazma alanının yanında değil (8 Kasım 2026)", () => {
  it("yan kart ve onun yerleşimi kalktı; sohbette Plus tanıtımı yok", () => {
    expect(chat).not.toContain("UpgradeAside");
    expect(chat).not.toContain("cp-sor-composer-upgrade");
    expect(chat).not.toContain("cp-sor-composer-zone--aside");
    expect(chat).not.toContain("cp-sor-upgrade-row");
    expect(shell).not.toContain("composer-zone--aside");
    expect(shell).not.toContain("cp-sor-composer-upgrade");
    expect(upgrade).not.toContain("ug-aside");
  });
});

describe("fiyatlandırma karşılaştırması", () => {
  it("dar ekranda kart, geniş ekranda tablo; Sigma metni kırpılmaz", () => {
    expect(cards).not.toContain("min-w-[36rem]");
    expect(cards).toContain("tier-compare-cards");
    expect(pricing).toContain(".tier-compare-cards");
    expect(pricing).toMatch(/@media \(min-width: 1024px\)[\s\S]*\.tier-compare-cards\s*\{\s*display:\s*none/);
    expect(pricing).toContain("overflow-wrap: anywhere");

    render(<SubscriptionCards plans={plans} guestMode checkoutEnabled={false} />);

    // 6 Kasım 2026: fiyat ve satın alma önce; tablo plan kartlarının altında ve isteyene açılır.
    expect(screen.queryByText("Ön izleme, ücretsiz ve premium")).toBeNull();
    const toggle = screen.getByRole("button", { name: /Planların tüm farklarını gör/ });
    const buy = screen.getAllByRole("button", { name: /Yakında|Plus'a yükselt/ })[0]!;
    expect(buy.compareDocumentPosition(toggle) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    fireEvent.click(toggle);
    expect(screen.getAllByText("Ön izleme, ücretsiz ve premium")).toHaveLength(1);
    expect(screen.getAllByText("Ayda yaklaşık 20.000 mesaj ya da 2.000 ders").length).toBeGreaterThan(0);
    // 19 Ekim 2026: "Gelişmiş model" satırı kalktı (her plan aynı model); yerine hız satırı.
    expect(screen.queryAllByText("Gelişmiş")).toHaveLength(0);
    expect(screen.getAllByText("Hızlı").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sigma").length).toBeGreaterThan(0);
    expect(document.querySelector(".tier-compare-cards")).not.toBeNull();
    expect(document.querySelector(".tier-compare-table")).not.toBeNull();
  });
});
