import { describe, expect, it, vi } from "vitest";
import { resolveFullName } from "@/lib/auth/resolve-full-name";

const exchange = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { exchangeCodeForSession: exchange } }),
}));

describe("resolveFullName (Google ile kayıtta boş ad)", () => {
  it("keeps the name the student typed", () => {
    expect(resolveFullName("  Ayşe Yılmaz ", { email: "a@b.co", user_metadata: { full_name: "Google Adı" } })).toBe("Ayşe Yılmaz");
  });

  it("falls back to the provider's full_name when the form name is empty", () => {
    expect(resolveFullName("", { email: "a@b.co", user_metadata: { full_name: "Ayşe Yılmaz" } })).toBe("Ayşe Yılmaz");
  });

  it("uses `name` when full_name is missing, and ignores a 1-character typed name", () => {
    expect(resolveFullName("A", { email: "a@b.co", user_metadata: { name: "Ayşe" } })).toBe("Ayşe");
  });

  it("falls back to the email local part as a last resort", () => {
    expect(resolveFullName(undefined, { email: "ayse.yilmaz@example.com", user_metadata: {} })).toBe("ayse.yilmaz");
  });
});

describe("auth callback", () => {
  async function callback(query: string) {
    const { GET } = await import("@/app/auth/callback/route");
    const res = await GET(new Request(`https://cortexplus.app/auth/callback${query}`));
    return res.headers.get("location");
  }

  it("sends a cancelled/failed Google consent to the provider message, not 'link expired'", async () => {
    expect(await callback("?error=access_denied&error_description=cancelled")).toBe(
      "https://cortexplus.app/auth/auth-code-error?neden=saglayici",
    );
    expect(exchange).not.toHaveBeenCalled();
  });

  it("still sends an unusable email link to the generic link-error page", async () => {
    exchange.mockResolvedValueOnce({ error: { message: "invalid" } });
    expect(await callback("?code=abc")).toBe("https://cortexplus.app/auth/auth-code-error");
  });

  it("sends an expired email link to the link page, not the Google page", async () => {
    expect(
      await callback("?error=access_denied&error_code=otp_expired&error_description=Email+link+is+invalid+or+has+expired"),
    ).toBe("https://cortexplus.app/auth/auth-code-error");
  });

  it("says 'opened in another browser' when the PKCE verifier is missing, keeping next", async () => {
    exchange.mockResolvedValueOnce({
      error: { name: "AuthPKCECodeVerifierMissingError", code: "pkce_code_verifier_not_found", message: "PKCE code verifier not found in storage." },
    });
    expect(await callback("?code=abc&next=/kayit/tamamla")).toBe(
      "https://cortexplus.app/auth/auth-code-error?neden=baska-tarayici&next=%2Fkayit%2Ftamamla",
    );
  });

  it("redirects a successful exchange to a safe next path only", async () => {
    exchange.mockResolvedValue({ error: null });
    expect(await callback("?code=abc&next=/pay")).toBe("https://cortexplus.app/pay");
    expect(await callback("?code=abc&next=https://evil.example")).toBe("https://cortexplus.app/dashboard");
  });
});
