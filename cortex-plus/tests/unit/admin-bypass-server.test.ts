import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

/*
  Kurucu muafiyetinin sunucu tarafı: rol tek yerden okunur, kotalar yöneticide
  sayılmaz, istek sınırı on katına çıkar ama kalkmaz. İstemcinin gönderdiği
  hiçbir işaret (gövde, çerez, başlık) ayrıcalık vermez.
*/

const rl = vi.hoisted(() => ({
  allowed: true,
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: rl.rateLimit,
  retryAfterSeconds: () => 3,
  userKey: (userId: string, scope: string) => `u:${scope}:${userId}`,
  dailyKey: (userId: string, scope: string) => `d:${scope}:${userId}`,
  clientKey: (_r: Request, scope: string) => `c:${scope}`,
  trackDistinct: vi.fn(async () => 1),
  peekCount: vi.fn(async () => 0),
}));
vi.mock("@/lib/abuse/record", () => ({
  recordAbuse: vi.fn(),
  hashIp: () => "h",
  requestIp: () => "1.1.1.1",
}));

const auth = vi.hoisted(() => ({
  user: { id: "66666666-6666-4666-8666-666666666666", email: "k@ornek.com" } as
    | { id: string; email: string }
    | null,
  isAdmin: false,
  rpcCalls: [] as { fn: string; args: unknown }[],
}));

function serviceClient() {
  const profiles = {
    select: () => profiles,
    eq: () => profiles,
    maybeSingle: async () => ({ data: { id: auth.user?.id, deleted_at: null }, error: null }),
  };
  return {
    from: () => profiles,
    rpc: vi.fn(async (fn: string, args: unknown) => {
      auth.rpcCalls.push({ fn, args });
      if (fn === "is_admin") return { data: auth.isAdmin, error: null };
      return { data: true, error: null };
    }),
  };
}

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: auth.user } }) },
  }),
  createServiceClient: () => serviceClient(),
}));

const { isAdminUser } = await import("@/lib/auth/roles");
const { withUser, ADMIN_RATE_MULTIPLIER, ADMIN_RATE_MESSAGE } = await import("@/lib/api/guards");
const { claimPhotoPages, releasePhotoPages } = await import("@/lib/documents/photo-quota");
const { claimHardUpgrade } = await import("@/lib/ai/model-upgrade");
const { freeImageAllowed } = await import("@/lib/ai/image-quota");

function asClient(value: unknown) {
  return value as SupabaseClient;
}

function request(extra: { body?: unknown; headers?: Record<string, string> } = {}) {
  return new Request("https://cortexplus.app/api/test", {
    method: "POST",
    headers: { cookie: "sb-access-token=x", ...(extra.headers ?? {}) },
    body: extra.body ? JSON.stringify(extra.body) : undefined,
  });
}

beforeEach(() => {
  auth.isAdmin = false;
  auth.user = { id: "66666666-6666-4666-8666-666666666666", email: "k@ornek.com" };
  auth.rpcCalls = [];
  rl.allowed = true;
  rl.rateLimit.mockReset();
  rl.rateLimit.mockImplementation(async () => ({
    allowed: rl.allowed,
    remaining: 0,
    resetAt: Date.now() + 3000,
  }));
});

describe("isAdminUser", () => {
  it("veritabanındaki is_admin fonksiyonunu sorar", async () => {
    const client = serviceClient();
    auth.isAdmin = true;
    expect(await isAdminUser(asClient(client), "u1")).toBe(true);
    expect(client.rpc).toHaveBeenCalledWith("is_admin", { uid: "u1" });
  });

  it("aynı istemcide sonucu bir kez sorar, yeni istemcide yeniden sorar", async () => {
    const first = serviceClient();
    await isAdminUser(asClient(first), "u1");
    await isAdminUser(asClient(first), "u1");
    expect(first.rpc).toHaveBeenCalledTimes(1);

    auth.isAdmin = true;
    const second = serviceClient();
    expect(await isAdminUser(asClient(second), "u1")).toBe(true);
    expect(second.rpc).toHaveBeenCalledTimes(1);
  });

  it("sorgu hata verirse ya da patlarsa yönetici saymaz", async () => {
    const failing = { rpc: vi.fn(async () => ({ data: true, error: { message: "down" } })) };
    expect(await isAdminUser(asClient(failing), "u1")).toBe(false);
    const throwing = { rpc: vi.fn(async () => { throw new Error("network"); }) };
    expect(await isAdminUser(asClient(throwing), "u1")).toBe(false);
  });

  it("yalnızca kesin true değerini kabul eder", async () => {
    const odd = { rpc: vi.fn(async () => ({ data: "true", error: null })) };
    expect(await isAdminUser(asClient(odd), "u1")).toBe(false);
  });
});

describe("withUser — istek sınırı", () => {
  it("normal kullanıcıda sınır aynen kalır", async () => {
    const guard = await withUser(request(), { scope: "exam-mock", limit: 8, dailyLimit: 60 });
    expect(guard.ok).toBe(true);
    expect(rl.rateLimit).toHaveBeenNthCalledWith(1, "u:exam-mock:" + auth.user!.id, 8, 60);
    expect(rl.rateLimit).toHaveBeenNthCalledWith(2, "d:exam-mock:" + auth.user!.id, 60, 86400);
    if (guard.ok) expect(guard.ctx.isAdmin).toBe(false);
  });

  it("yöneticide dakikalık ve günlük sınır on katına çıkar, kaldırılmaz", async () => {
    auth.isAdmin = true;
    const guard = await withUser(request(), { scope: "exam-mock", limit: 8, dailyLimit: 60 });
    expect(ADMIN_RATE_MULTIPLIER).toBe(10);
    expect(rl.rateLimit).toHaveBeenNthCalledWith(1, expect.any(String), 80, 60);
    expect(rl.rateLimit).toHaveBeenNthCalledWith(2, expect.any(String), 600, 86400);
    if (guard.ok) expect(guard.ctx.isAdmin).toBe(true);
  });

  it("yönetici sınıra takılırsa kredi dili değil hız mesajı görür", async () => {
    auth.isAdmin = true;
    rl.allowed = false;
    const guard = await withUser(request(), { scope: "flashcards", limit: 10 });
    expect(guard.ok).toBe(false);
    if (!guard.ok) {
      expect(guard.response.status).toBe(429);
      const body = await guard.response.json();
      expect(body.error).toBe(ADMIN_RATE_MESSAGE);
      expect(body.error).not.toMatch(/kredi|satın|plus/i);
    }
  });

  it("normal kullanıcının sınır mesajı değişmedi", async () => {
    rl.allowed = false;
    const guard = await withUser(request(), { scope: "flashcards", limit: 10 });
    if (!guard.ok) {
      expect((await guard.response.json()).error).toBe(
        "Çok fazla istek gönderildi. Lütfen biraz bekleyin.",
      );
    }
  });

  it("istemcinin gönderdiği işaretler ayrıcalık vermez", async () => {
    const forged = request({
      body: { isAdmin: true, role: "admin" },
      headers: {
        cookie: "sb-access-token=x; isAdmin=true; cortex-admin=1",
        "x-is-admin": "true",
        "x-role": "admin",
      },
    });
    const guard = await withUser(forged, { scope: "chat", limit: 40 });
    expect(guard.ok).toBe(true);
    if (guard.ok) expect(guard.ctx.isAdmin).toBe(false);
    expect(rl.rateLimit).toHaveBeenNthCalledWith(1, expect.any(String), 40, 60);
    expect(auth.rpcCalls.filter((c) => c.fn === "is_admin")).toEqual([
      { fn: "is_admin", args: { uid: auth.user!.id } },
    ]);
  });
});

describe("kotalar yöneticide sayılmaz", () => {
  it("fotoğraf sayfası: yönetici sayaç artırmadan geçer, iade de sayaca dokunmaz", async () => {
    auth.isAdmin = true;
    const client = serviceClient();
    expect(await claimPhotoPages(asClient(client), "u1", 5, "free")).toBe(true);
    await releasePhotoPages(asClient(client), "u1", 5);
    expect(auth.rpcCalls.map((c) => c.fn)).toEqual(["is_admin"]);
  });

  it("fotoğraf sayfası: normal kullanıcıda sayaç çalışır", async () => {
    const client = serviceClient();
    await claimPhotoPages(asClient(client), "u1", 2, "free");
    await releasePhotoPages(asClient(client), "u1", 2);
    expect(auth.rpcCalls.map((c) => c.fn)).toEqual([
      "is_admin",
      "claim_document_pages",
      "release_document_pages",
    ]);
  });

  it("zor soru yükseltmesi yöneticide aylık tavana yazılmaz", async () => {
    auth.isAdmin = true;
    expect(await claimHardUpgrade(serviceClient() as never, "u1")).toBe(true);
    expect(auth.rpcCalls.map((c) => c.fn)).not.toContain("claim_model_upgrade");
  });

  it("zor soru yükseltmesi normal kullanıcıda sayılır", async () => {
    await claimHardUpgrade(serviceClient() as never, "u1");
    expect(auth.rpcCalls.map((c) => c.fn)).toContain("claim_model_upgrade");
  });

  it("günlük ücretsiz fotoğraf sayacı yöneticide hiç artmaz", async () => {
    expect(await freeImageAllowed("u1", false, true)).toBe(true);
    expect(rl.rateLimit).not.toHaveBeenCalled();
    await freeImageAllowed("u1", false);
    expect(rl.rateLimit).toHaveBeenCalledTimes(1);
  });
});
