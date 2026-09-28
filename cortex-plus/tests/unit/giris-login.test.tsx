// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";

const push = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push, refresh: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(search),
}));

const toastError = vi.fn();
vi.mock("sonner", () => ({ toast: { error: (m: string) => toastError(m), success: vi.fn() } }));

const signInWithPassword = vi.fn();
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { signInWithPassword } }),
}));

import GirisPage from "@/app/giris/giris-inner";

afterEach(() => {
  cleanup();
  push.mockReset();
  toastError.mockReset();
  signInWithPassword.mockReset();
});

function submit() {
  fireEvent.change(screen.getByLabelText("E-posta"), { target: { value: "ogrenci@example.com" } });
  fireEvent.change(screen.getByLabelText("Şifre"), { target: { value: "Sifre1234!" } });
  fireEvent.submit(screen.getByRole("button", { name: "Giriş yap" }).closest("form")!);
}

describe("giriş sayfası", () => {
  it("does not follow an off-site next after a password login (open redirect)", async () => {
    search = "next=https://evil.example/steal";
    signInWithPassword.mockResolvedValue({ error: null });
    render(<GirisPage />);
    submit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/dashboard"));
  });

  it("still follows a same-site next", async () => {
    search = "next=/pay";
    signInWithPassword.mockResolvedValue({ error: null });
    render(<GirisPage />);
    submit();
    await waitFor(() => expect(push).toHaveBeenCalledWith("/pay"));
  });

  it("says the email needs confirming and offers a resend link instead of 'wrong credentials'", async () => {
    search = "";
    signInWithPassword.mockResolvedValue({ error: { message: "Email not confirmed" } });
    render(<GirisPage />);
    submit();
    await waitFor(() => expect(toastError).toHaveBeenCalledWith(expect.stringMatching(/doğrulaman gerekiyor/)));
    expect(screen.getByRole("link", { name: "yenisini gönder" }).getAttribute("href")).toBe("/email-dogrula");
  });

  it("shows the consent notice next to Google sign-in", () => {
    search = "";
    render(<GirisPage />);
    expect(screen.getByText(/Google ile devam ederek/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Kullanım Koşulları" }).getAttribute("href")).toBe("/kullanim-kosullari");
  });
});
