// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const updateUser = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { updateUser } }),
}));
vi.mock("sonner", () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { EmailChangeCard } from "@/components/profile/email-change-card";

afterEach(() => {
  cleanup();
  updateUser.mockReset();
});

describe("e-posta kartı", () => {
  it("shows the current address", () => {
    render(<EmailChangeCard email="ogrenci@example.com" pendingEmail={null} hasPasswordLogin />);
    expect(screen.getByText("ogrenci@example.com")).toBeTruthy();
  });

  it("asks Supabase for a confirmed change and says both addresses must confirm", async () => {
    updateUser.mockResolvedValue({ error: null });
    render(<EmailChangeCard email="ogrenci@example.com" pendingEmail={null} hasPasswordLogin />);
    fireEvent.click(screen.getByRole("button", { name: "E-posta adresini değiştir" }));
    fireEvent.change(screen.getByLabelText("Yeni e-posta"), { target: { value: " Yeni@Example.com " } });
    fireEvent.submit(screen.getByRole("button", { name: "Onay bağlantısı gönder" }).closest("form")!);
    await waitFor(() =>
      expect(updateUser).toHaveBeenCalledWith(
        { email: "yeni@example.com" },
        { emailRedirectTo: `${window.location.origin}/auth/confirm?next=/ayarlar` },
      ),
    );
    expect((await screen.findByRole("status")).textContent).toMatch(/biri şu anki adresine, biri yeni adresine/);
  });

  it("does not send when the new address equals the current one", async () => {
    render(<EmailChangeCard email="ogrenci@example.com" pendingEmail={null} hasPasswordLogin />);
    fireEvent.click(screen.getByRole("button", { name: "E-posta adresini değiştir" }));
    fireEvent.change(screen.getByLabelText("Yeni e-posta"), { target: { value: "OGRENCI@example.com" } });
    fireEvent.submit(screen.getByRole("button", { name: "Onay bağlantısı gönder" }).closest("form")!);
    await new Promise((r) => setTimeout(r, 0));
    expect(updateUser).not.toHaveBeenCalled();
  });

  it("shows a pending change that survived a reload", () => {
    render(<EmailChangeCard email="eski@example.com" pendingEmail="yeni@example.com" hasPasswordLogin />);
    expect(screen.getByRole("status").textContent).toContain("yeni@example.com");
  });

  it("offers no change form for a Google-only account, and 'set a password' instead of 'change'", () => {
    render(<EmailChangeCard email="g@gmail.com" pendingEmail={null} hasPasswordLogin={false} />);
    expect(screen.queryByRole("button", { name: "E-posta adresini değiştir" })).toBeNull();
    expect(screen.getByText(/Google hesabından geliyor/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Şifre belirle" }).getAttribute("href")).toBe("/sifre-yenile");
  });
});
