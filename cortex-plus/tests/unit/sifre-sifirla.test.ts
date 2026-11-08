import { beforeEach, describe, expect, it, vi } from "vitest";

/*
  Şifre sıfırlama bizim posta hattımızdan (8 Kasım 2026): Supabase'in kendi e-postası gelmiyordu. Uç her durumda aynı
  cevabı verir (kayıtlı adres dışarıdan sınanamasın); bağlantı /auth/confirm üzerinden şifre yenilemeye açılır.
*/
const state = { linkError: null as string | null, sendOk: true, sent: [] as { to: string; url: string }[] };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/email/mailer", () => ({
  sendPasswordResetEmail: async (input: { to: string; url: string }) => {
    state.sent.push(input);
    return state.sendOk ? { ok: true } : { ok: false, reason: "resend_failed" };
  },
}));
vi.mock("@/lib/api/guards", () => ({ guestLimit: async () => null }));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    auth: {
      admin: {
        generateLink: async () =>
          state.linkError
            ? { data: null, error: { message: state.linkError } }
            : { data: { properties: { hashed_token: "abc123" } }, error: null },
      },
    },
  }),
}));
vi.mock("@/lib/app-url", () => ({ appOrigin: () => "https://cortexplus.app" }));

const { recoveryUrl } = await import("@/lib/auth/password-reset");
const { POST } = await import("@/app/api/auth/sifre-sifirla/route");

const request = (body: unknown) =>
  new Request("http://x/api/auth/sifre-sifirla", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => {
  state.linkError = null;
  state.sendOk = true;
  state.sent = [];
});

describe("şifre sıfırlama", () => {
  it("bağlantı /auth/confirm üzerinden şifre yenilemeye açılır", () => {
    expect(recoveryUrl("https://cortexplus.app/", "h1")).toBe(
      "https://cortexplus.app/auth/confirm?token_hash=h1&type=recovery&next=%2Fsifre-yenile",
    );
  });

  it("kayıtlı adrese bizim hattımızdan e-posta gider", async () => {
    const response = await POST(request({ email: " Ogrenci@Ornek.com " }));
    expect(await response.json()).toEqual({ ok: true });
    expect(state.sent).toEqual([
      { to: "ogrenci@ornek.com", url: "https://cortexplus.app/auth/confirm?token_hash=abc123&type=recovery&next=%2Fsifre-yenile" },
    ]);
  });

  it("kayıtsız adreste ve gönderim düşünce de cevap aynı", async () => {
    state.linkError = "User not found";
    expect(await (await POST(request({ email: "yok@ornek.com" }))).json()).toEqual({ ok: true });
    expect(state.sent).toEqual([]);
    state.linkError = null;
    state.sendOk = false;
    expect(await (await POST(request({ email: "var@ornek.com" }))).json()).toEqual({ ok: true });
  });

  it("bozuk adres 400", async () => {
    expect((await POST(request({ email: "adres-degil" }))).status).toBe(400);
  });
});
