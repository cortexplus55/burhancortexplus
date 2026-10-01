// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ActivityHistory } from "@/components/student/activity-history";

afterEach(cleanup);

describe("Aktivitelerim", () => {
  it("sayfa başlığı menüdeki adla aynı", () => {
    const page = readFileSync("src/app/ilerleme/page.tsx", "utf8");
    expect(page).toContain('title: "Aktivitelerim"');
    expect(page).toContain(">Aktivitelerim</h1>");
  });

  it("gün etiketleri ham ISO tarih değil", () => {
    const today = new Date().toISOString();
    const { container } = render(<ActivityHistory timestamps={[today]} />);
    const titles = [...container.querySelectorAll("[title]")].map((node) => node.getAttribute("title") ?? "");
    expect(titles.length).toBeGreaterThan(0);
    expect(titles.some((title) => /\d{4}-\d{2}-\d{2}/.test(title))).toBe(false);
    expect(screen.queryAllByText(/\d{4}-\d{2}-\d{2}/)).toHaveLength(0);
  });
});
