// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

const setTheme = vi.fn();
vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: "dark", setTheme }),
}));
const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

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
  avatarEmoji: null,
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

describe("profil kartı: avatar ve takvim rozeti (Astra gibi, 1 Ekim 2026)", () => {
  it("seçilen emoji avatar olarak görünür, yoksa baş harf", () => {
    render(<ProfilePanel data={{ ...data, avatarEmoji: "🦊" }} email={null} isPremium={false} subscriptionBadge={null} />);
    expect(document.querySelector(".cp-pp-avatar")?.textContent).toBe("🦊");
    cleanup();
    render(<ProfilePanel data={data} email={null} isPremium={false} subscriptionBadge={null} />);
    expect(document.querySelector(".cp-pp-avatar")?.textContent).toBe("A");
  });

  it("Avatarı değiştir listeden seçip kaydeder", async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal("fetch", fetchMock);
    render(<ProfilePanel data={data} email={null} isPremium={false} subscriptionBadge={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Avatarı değiştir" }));
    fireEvent.click(screen.getByRole("button", { name: "Avatar 🦉" }));
    await vi.waitFor(() => expect(refresh).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/profile/me", expect.objectContaining({ method: "PATCH", body: JSON.stringify({ avatar_url: "🦉" }) }));
    vi.unstubAllGlobals();
  });

  it("Takvimim kartında yaklaşan sayı rozeti", () => {
    render(<ProfilePanel data={{ ...data, upcomingEvents: 7 }} email={null} isPremium={false} subscriptionBadge={null} />);
    expect(document.querySelector(".cp-pp-card-badge")?.textContent).toBe("7");
  });
});
