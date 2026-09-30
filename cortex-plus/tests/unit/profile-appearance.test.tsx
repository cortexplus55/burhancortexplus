// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const setTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme }),
}));

import { ProfilePanel } from "@/components/parity/profile-panel";
import type { ProfileDashboard } from "@/lib/student/profile-dashboard";

afterEach(() => {
  cleanup();
  setTheme.mockReset();
});

const data: ProfileDashboard = {
  fullName: "Ada",
  schoolName: null,
  gradeLevel: "11. sınıf",
  currentStreak: 2,
  longestStreak: 4,
  week: [],
  upcomingEvents: 0,
};

describe("profil menüsü (Astra: Görünüm menüde)", () => {
  it("Geçmiş konuşmaların altında Görünüm seçimi var ve temayı değiştiriyor", () => {
    render(<ProfilePanel data={data} email={null} isPremium={false} subscriptionBadge={null} />);
    const group = screen.getByRole("radiogroup", { name: "Görünüm" });
    expect(group).toBeTruthy();
    expect(screen.getByRole("radio", { name: "Koyu" }).getAttribute("aria-checked")).toBe("true");
    fireEvent.click(screen.getByRole("radio", { name: "Açık" }));
    expect(setTheme).toHaveBeenCalledWith("light");
    const menu = screen.getByRole("navigation", { name: "Hesap" });
    const order = Array.from(menu.children).map((el) => el.textContent ?? "");
    const history = order.findIndex((text) => text.includes("Geçmiş konuşmalar"));
    expect(order[history + 1]).toMatch(/^Görünüm/);
  });

  it("kurucuda 'Ücretsiz plan' değil 'Kurucu' yazıyor ve satın alma yok", () => {
    render(<ProfilePanel data={data} email={null} isPremium={false} subscriptionBadge={null} isAdmin />);
    expect(screen.getByText("Kurucu")).toBeTruthy();
    expect(screen.queryByText("Ücretsiz plan")).toBeNull();
    expect(screen.queryByText("Daha hızlı öğren")).toBeNull();
  });
});
