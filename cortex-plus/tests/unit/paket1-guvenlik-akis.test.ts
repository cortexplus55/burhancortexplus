import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { NextResponse } from "next/server";

/* Paket 1 güvenlik düzeltmeleri (6 Kasım 2026): oturum, ödeme, yönetici kapısı, düello, gömme kaydı. */

const state = vi.hoisted(() => ({
  user: null as null | { id: string; app_metadata?: Record<string, unknown> },
  exchangeError: null as null | { message: string },
  signOut: vi.fn(async (_opts?: unknown) => ({ error: null as null | { message: string } })),
  updateUserById: vi.fn(async (_id: string, _attrs: unknown) => ({ error: null as null | { message: string } })),
  isAdmin: false,
  getUnitContent: vi.fn(async () => ({ status: "hit", ms: 1, content: {} })),
  rpc: vi.fn(async (_name: string, _args?: unknown) => ({ data: null as unknown, error: null as unknown })),
  from: vi.fn((_table: string): unknown => ({})),
  auditLog: vi.fn(async (_service: unknown, _params: unknown) => undefined),
  awardInvite: vi.fn(async () => 0),
  awardStars: vi.fn(async () => 25),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user } }),
      exchangeCodeForSession: async () => ({ data: { user: state.user }, error: state.exchangeError }),
      signOut: state.signOut,
    },
  }),
  createServiceClient: () => ({
    auth: { admin: { updateUserById: state.updateUserById } },
    rpc: state.rpc,
    from: state.from,
  }),
}));
vi.mock("@/lib/auth/roles", () => ({ isAdminUser: async () => state.isAdmin }));
vi.mock("@/lib/content-pool/pool", () => ({ getUnitContent: state.getUnitContent }));
vi.mock("@/lib/content-pool/generate", () => ({ openaiLlm: () => ({}) }));
vi.mock("@/lib/content-pool/supabase-store", () => ({ supabasePoolStore: () => ({}) }));
vi.mock("@/lib/payments/paytr", async (orig) => ({
  ...(await orig<typeof import("@/lib/payments/paytr")>()),
  verifyPaytrCallbackHash: () => true,
}));
vi.mock("@/lib/audit", () => ({ auditLog: state.auditLog }));
vi.mock("@/lib/stars/invite", () => ({ awardInviteSubscribed: state.awardInvite }));
vi.mock("@/lib/stars/award", () => ({ awardStars: state.awardStars }));
vi.mock("@/lib/api/guards", async (orig) => ({
  ...(await orig<typeof import("@/lib/api/guards")>()),
  duelLimit: async () => null,
}));

beforeEach(() => {
  state.user = null;
  state.exchangeError = null;
  state.isAdmin = false;
  state.signOut.mockClear();
  state.updateUserById.mockReset();
  state.updateUserById.mockResolvedValue({ error: null });
  state.getUnitContent.mockClear();
  state.rpc.mockReset();
  state.from.mockReset();
  state.auditLog.mockReset();
  state.awardInvite.mockReset();
  state.awardStars.mockClear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("Google ile sahiplenme: öbür oturumlar kapanır, hata günlüğe yazılır", () => {
  const unverifiedGoogle = { id: "u1", app_metadata: { email_unverified: true, providers: ["email", "google"] } };

  it("sahiplenme başarılıysa signOut({ scope: 'others' }) çağrılır ve giriş sürer", async () => {
    state.user = unverifiedGoogle;
    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request("https://cortexplus.app/auth/callback?code=abc&next=/ogretmen"));
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("https://cortexplus.app/ogretmen");
    expect(state.updateUserById).toHaveBeenCalledTimes(1);
    expect(state.signOut).toHaveBeenCalledWith({ scope: "others" });
  });

  it("sahiplenme düşerse console.error('unverified_claim_failed'), oturumlar kapatılmaz, giriş sürer", async () => {
    state.user = unverifiedGoogle;
    state.updateUserById.mockResolvedValue({ error: { message: "boom" } });
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { GET } = await import("@/app/auth/callback/route");
    const response = await GET(new Request("https://cortexplus.app/auth/callback?code=abc&next=/ogretmen"));
    expect(response.headers.get("location")).toBe("https://cortexplus.app/ogretmen");
    expect(errors).toHaveBeenCalledWith("unverified_claim_failed", expect.objectContaining({ userId: "u1" }));
    expect(state.signOut).not.toHaveBeenCalled();
  });

  it("doğrulanmış hesapta hiçbir şey yapılmaz", async () => {
    state.user = { id: "u2", app_metadata: { providers: ["google"] } };
    const { GET } = await import("@/app/auth/callback/route");
    await GET(new Request("https://cortexplus.app/auth/callback?code=abc"));
    expect(state.updateUserById).not.toHaveBeenCalled();
    expect(state.signOut).not.toHaveBeenCalled();
  });
});

describe("şifre yenileme ve e-posta değişikliği: yükleniyor durumu finally'de", () => {
  it("şifre değişince öbür oturumlar kapanır; setLoading(false) finally içinde", () => {
    const src = readFileSync("src/app/sifre-yenile/page.tsx", "utf8");
    expect(src).toMatch(/signOut\(\{ scope: "others" \}\)/);
    expect(src).toMatch(/finally \{\s*setLoading\(false\);/);
    expect(src.indexOf("updateUser")).toBeLessThan(src.indexOf('scope: "others"'));
  });

  it("e-posta kartında setBusy(false) finally içinde", () => {
    const src = readFileSync("src/components/profile/email-change-card.tsx", "utf8");
    expect(src).toMatch(/finally \{\s*setBusy\(false\);/);
  });
});

describe("ortak ünite ucu yalnız yöneticiye", () => {
  it("oturumsuz 401, yönetici olmayan 403 ve üretim tetiklenmez", async () => {
    const { GET } = await import("@/app/api/content/unit/route");
    const url = "https://cortexplus.app/api/content/unit?unit=yks-2026-tarih%231";
    expect((await GET(new Request(url))).status).toBe(401);
    state.user = { id: "student" };
    expect((await GET(new Request(url))).status).toBe(403);
    expect(state.getUnitContent).not.toHaveBeenCalled();
  });

  it("yönetici içeriği alır", async () => {
    state.user = { id: "admin" };
    state.isAdmin = true;
    const { GET } = await import("@/app/api/content/unit/route");
    const response = await GET(new Request("https://cortexplus.app/api/content/unit?unit=yks-2026-tarih%231"));
    expect(response.status).toBe(200);
    expect(state.getUnitContent).toHaveBeenCalledTimes(1);
  });
});

describe("velime ödeme linki: APP_SECRET zorunlu", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/env");
    vi.resetModules();
  });

  it("APP_SECRET yoksa servis anahtarına düşmez: bağlantı üretilmez, doğrulanmaz", async () => {
    vi.resetModules();
    vi.doMock("@/lib/env", () => ({ env: { APP_SECRET: undefined, SUPABASE_SECRET_KEY: "service-key" } }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { createParentPayToken, verifyParentPayToken } = await import("@/lib/payments/parent-link");
    expect(
      createParentPayToken({ studentId: "0b7c1e2a-1111-4222-8333-944455556666", planId: "1b7c1e2a-1111-4222-8333-944455556666" }),
    ).toBeNull();
    expect(verifyParentPayToken("veli.a.b.1.n.sig")).toEqual({ ok: false, reason: "unconfigured" });
  });
});

describe("PayTR bildirimi: yan işler 'OK'u engellemez, eksik tutar alarm verir", () => {
  function paymentsTable(amount: number) {
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { amount_try: amount }, error: null }) }) }),
    };
  }

  function callbackRequest(totalAmount: string) {
    const form = new FormData();
    form.set("merchant_oid", "CP123");
    form.set("status", "success");
    form.set("total_amount", totalAmount);
    form.set("hash", "h");
    return new Request("https://cortexplus.app/api/payments/paytr/callback", { method: "POST", body: form });
  }

  it("denetim kaydı ve yıldız patlasa da OK döner", async () => {
    state.rpc.mockResolvedValue({ data: { result: "completed", payer_id: "p1", beneficiary_id: "s1" }, error: null });
    state.from.mockImplementation(() => paymentsTable(10_000));
    state.auditLog.mockRejectedValue(new Error("audit down"));
    state.awardInvite.mockRejectedValue(new Error("stars down"));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await import("@/app/api/payments/paytr/callback/route");
    const response = await POST(callbackRequest("10000"));
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("OK");
    expect(errors).toHaveBeenCalledWith("paytr_callback_audit_failed", expect.anything());
    expect(errors).toHaveBeenCalledWith("paytr_callback_stars_failed", expect.anything());
  });

  it("bildirilen tutar kayıttakinden azsa paytr_amount_mismatch yazılır, kesinleşme durmaz", async () => {
    state.rpc.mockResolvedValue({ data: { result: "completed", payer_id: "p1" }, error: null });
    state.from.mockImplementation(() => paymentsTable(10_000));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await import("@/app/api/payments/paytr/callback/route");
    const response = await POST(callbackRequest("5000"));
    expect(await response.text()).toBe("OK");
    expect(state.rpc).toHaveBeenCalledWith("finalize_paytr_payment", expect.anything());
    expect(errors).toHaveBeenCalledWith("paytr_amount_mismatch", { merchantOid: "CP123", expected: 10_000, paid: 5000 });
    expect(state.auditLog).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: "payment.amount_mismatch", metadata: { expected_kurus: 10_000, paid_kurus: 5000 } }),
    );
  });

  it("taksit farkıyla fazla gelen tutar alarm değildir", async () => {
    state.rpc.mockResolvedValue({ data: { result: "completed", payer_id: "p1" }, error: null });
    state.from.mockImplementation(() => paymentsTable(10_000));
    const errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { POST } = await import("@/app/api/payments/paytr/callback/route");
    await POST(callbackRequest("10450"));
    expect(errors).not.toHaveBeenCalledWith("paytr_amount_mismatch", expect.anything());
  });

  it("veritabanı hatası yine RETRY (500)", async () => {
    state.rpc.mockResolvedValue({ data: null, error: { message: "db" } });
    const { POST } = await import("@/app/api/payments/paytr/callback/route");
    expect((await POST(callbackRequest("10000"))).status).toBe(500);
  });
});

describe("PayTR token isteği süre sınırıyla", () => {
  it("get-token fetch'i paytrFetchInit'in sinyalini taşır", async () => {
    const { createPaytrCheckout } = await import("@/lib/payments/checkout");
    const { PAYTR_FETCH_TIMEOUT_MS } = await import("@/lib/payments/paytr");
    expect(PAYTR_FETCH_TIMEOUT_MS).toBe(20_000);
    state.from.mockImplementation(() => ({
      insert: async () => ({ error: null }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }));
    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValue(new Response(JSON.stringify({ status: "failed", reason: "x" })));
    const { createServiceClient } = await import("@/lib/supabase/server");
    const result = await createPaytrCheckout(createServiceClient() as never, {
      userId: "u",
      beneficiaryId: "u",
      plan: { id: "p", name: "Plus", price_try: 10_000 },
      email: "a@b.c",
      userIp: "1.1.1.1",
      userName: "A",
      productName: "Plus",
      okUrl: "https://x/ok",
      failUrl: "https://x/fail",
      actorId: "u",
      via: "self",
    });
    expect(result.ok).toBe(false);
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit;
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(init.method).toBe("POST");
  });
});

describe("oturum ara katmanı: yönlendirme yenilenen çerezleri taşır", () => {
  it("redirectCarryingCookies çerezleri kopyalar; getUser sonrası çıplak yönlendirme kalmadı", async () => {
    const { redirectCarryingCookies } = await import("@/lib/supabase/middleware");
    const carry = NextResponse.next();
    carry.cookies.set("sb-access-token", "yeni", { path: "/" });
    const response = redirectCarryingCookies("https://cortexplus.app/giris", carry);
    expect(response.headers.get("location")).toBe("https://cortexplus.app/giris");
    expect(response.cookies.get("sb-access-token")?.value).toBe("yeni");

    const src = readFileSync("src/lib/supabase/middleware.ts", "utf8");
    const afterGetUser = src.slice(src.indexOf("await supabase.auth.getUser()"));
    expect(afterGetUser).not.toMatch(/NextResponse\.redirect\(/);
  });
});

describe("düello: misafire cevap anahtarı gitmez", () => {
  const questions = [
    { text: "S1", options: ["a", "b", "c", "d"], answer: 1 },
    { text: "S2", options: ["a", "b", "c", "d"], answer: 2 },
  ];

  function duelService() {
    state.from.mockImplementation((table: string) => {
      if (table === "prep_duels") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { id: "d1", questions } }) }) }) };
      }
      if (table === "profiles") {
        return { select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { full_name: "Ayşe Y" } }) }) }) };
      }
      // prep_duel_runs: kayıt, tablo ve "daha iyi" sayısı.
      const chain = {
        insert: async () => ({ error: null }),
        select: (_cols: string, opts?: { head?: boolean }) =>
          opts?.head
            ? { eq: () => ({ gt: async () => ({ count: 0 }) }) }
            : { eq: () => ({ order: () => ({ order: () => ({ limit: async () => ({ data: [] }) }) }) }) },
      };
      return chain;
    });
  }

  function runRequest(name?: string) {
    return new Request("https://cortexplus.app/api/duels/abcdef/run", {
      method: "POST",
      body: JSON.stringify({ answers: [{ choice: 1, ms: 3000 }, { choice: 0, ms: 4000 }], name }),
    });
  }

  it("misafir yalnız doğru/yanlış alır, yıldız verilmez", async () => {
    duelService();
    const { POST } = await import("@/app/api/duels/[code]/run/route");
    const response = await POST(runRequest("Misafir"), { params: Promise.resolve({ code: "abcdef" }) });
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body.answers).toBeUndefined();
    expect(body.results).toEqual([true, false]);
    expect(body.correct).toBe(1);
    expect(state.awardStars).not.toHaveBeenCalled();
  });

  it("hesaplı oyuncu anahtarı alır; yıldız düello başına tekil ref'le", async () => {
    state.user = { id: "player-1" };
    duelService();
    const { POST } = await import("@/app/api/duels/[code]/run/route");
    const response = await POST(runRequest(), { params: Promise.resolve({ code: "abcdef" }) });
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.answers).toEqual([1, 2]);
    expect(body.results).toBeUndefined();
    expect(state.awardStars).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ source: "duel", ref: "duel:d1", userId: "player-1" }));
  });

  it("oyun ekranı misafir sonucunu anahtarsız çizer", async () => {
    const { duelCorrectIndexes, duelRowRight } = await import("@/components/duel/duel-play");
    const guest = { total: 3, results: [true, false, false] };
    const answers = [
      { choice: 2, ms: 1000 },
      { choice: 0, ms: 1000 },
      { choice: null, ms: 0 },
    ];
    expect(duelRowRight(guest, 0, 2)).toBe(true);
    expect(duelRowRight(guest, 1, 0)).toBe(false);
    expect(duelCorrectIndexes(guest, answers)).toEqual([2, -1, -1]);
    expect(duelCorrectIndexes({ total: 2, answers: [1, 3] }, answers)).toEqual([1, 3]);
  });
});

describe("dış istek süre sınırları ve gömme gider kaydı", () => {
  afterEach(() => {
    vi.doUnmock("@/lib/ai/openai-client");
    vi.doUnmock("@/lib/credits/service");
    vi.doUnmock("@/lib/env");
    vi.resetModules();
  });

  it("embedTexts 30 sn / 1 yeniden deneme ve text-embedding-3-small kullanımını kaydeder", async () => {
    vi.resetModules();
    const clientOptions: unknown[] = [];
    const recordUsage = vi.fn(async () => undefined);
    vi.doMock("@/lib/ai/openai-client", () => ({
      openaiClient: (options: unknown) => {
        clientOptions.push(options);
        return {
          embeddings: {
            create: async () => ({
              data: [{ index: 0, embedding: [0.1, 0.2] }],
              usage: { prompt_tokens: 42, total_tokens: 42 },
            }),
          },
        };
      },
    }));
    vi.doMock("@/lib/credits/service", async (orig) => ({
      ...(await orig<typeof import("@/lib/credits/service")>()),
      recordUsage,
    }));
    vi.doMock("@/lib/env", async (orig) => {
      const real = await orig<typeof import("@/lib/env")>();
      return { ...real, env: { ...real.env, OPENAI_API_KEY: "test-key" } };
    });
    const { embedTexts } = await import("@/lib/rag/pipeline");
    const service = {} as never;
    expect(await embedTexts(["merhaba"], { service, userId: "u1", actionCode: "DOCUMENT_PAGE_PROCESS" })).toEqual([[0.1, 0.2]]);
    expect(clientOptions[0]).toMatchObject({ timeout: 30_000, maxRetries: 1 });
    expect(recordUsage).toHaveBeenCalledWith(service, {
      userId: "u1",
      actionCode: "DOCUMENT_PAGE_PROCESS",
      model: "text-embedding-3-small",
      tokensIn: 42,
      tokensOut: 0,
    });

    // Kayıt patlarsa gömme yine döner.
    recordUsage.mockRejectedValueOnce(new Error("db down"));
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    expect(await embedTexts(["x"], { service, userId: "u1", actionCode: "AI_CHAT_STANDARD" })).toHaveLength(1);
  });

  it("transcribeAudio 45 sn / 1 yeniden deneme; transcribe rotası maxDuration 60", async () => {
    vi.resetModules();
    const clientOptions: unknown[] = [];
    vi.doMock("@/lib/ai/openai-client", () => ({
      openaiClient: (options: unknown) => {
        clientOptions.push(options);
        return { audio: { transcriptions: { create: async () => ({ text: "merhaba" }) } } };
      },
    }));
    vi.doMock("@/lib/env", async (orig) => {
      const real = await orig<typeof import("@/lib/env")>();
      return { ...real, env: { ...real.env, OPENAI_API_KEY: "test-key" } };
    });
    const { transcribeAudio } = await import("@/lib/ai/speech");
    expect(await transcribeAudio(new File(["x"], "a.webm", { type: "audio/webm" }))).toBe("merhaba");
    expect(clientOptions[0]).toMatchObject({ timeout: 45_000, maxRetries: 1 });
    expect(readFileSync("src/app/api/learning/oral/transcribe/route.ts", "utf8")).toMatch(/export const maxDuration = 60;/);
  });
});

describe("PWA bildirimi: tema rengi ve maskeli simge", () => {
  it("theme_color koyu temayla aynı, maskeli girdi kendi tam karo çizimine gider", async () => {
    const { default: manifest } = await import("@/app/manifest");
    const value = manifest();
    expect(value.theme_color).toBe("#0d0d0d");
    expect(readFileSync("src/app/layout.tsx", "utf8")).toContain('color: "#0d0d0d"');
    const maskable = (value.icons ?? []).filter((icon) => icon.purpose === "maskable");
    expect(maskable).toEqual([{ src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" }]);

    // 9 Kasım 2026: maskeli simge statik dosya (yeni 3B logo). Tam karo: köşeler opak, 512×512 PNG.
    const png = readFileSync("public/icon-maskable-512.png");
    expect(png.subarray(1, 4).toString("ascii")).toBe("PNG");
    expect(png.readUInt32BE(16)).toBe(512);
    expect(png.readUInt32BE(20)).toBe(512);
  });
});
