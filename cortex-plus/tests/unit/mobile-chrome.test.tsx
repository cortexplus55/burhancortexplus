// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
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

describe("mobil öğretmen yükseltme kartı", () => {
  it("boş ekranda kart ders çipinin üstündeki yığında durur, hero kopyası yoktur", () => {
    expect(chat).toContain("cp-sor-composer-upgrade--empty-deferred");
    expect(chat).not.toContain("cp-sor-empty-upgrade");

    expect(shell).toContain(".cp-sor-composer-upgrade--empty-deferred");
    expect(shell).toContain("order: -1");
    expect(shell).not.toMatch(
      /\.cp-sor-composer-upgrade--empty-deferred\s*\{[^}]*display:\s*none/,
    );

    expect(upgrade).toContain(
      ".cp-sor-composer-upgrade--empty-deferred .ug-aside",
    );
    expect(upgrade).toContain("display: grid !important");
    expect(upgrade).not.toMatch(
      /\.cp-sor-composer-zone \.ug-aside\s*\{[^}]*display:\s*none/,
    );
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

    expect(screen.getAllByText("Misafir, ücretsiz ve premium")).toHaveLength(1);
    expect(screen.getAllByText("Daha yüksek aylık kota").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Gelişmiş").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Sigma").length).toBeGreaterThan(0);
    expect(document.querySelector(".tier-compare-cards")).not.toBeNull();
    expect(document.querySelector(".tier-compare-table")).not.toBeNull();
  });
});
