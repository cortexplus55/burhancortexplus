import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
  Lansman zırhı #1 (5 Kasım 2026): küresel günlük harcama sigortası ve okunamayan fotoğraf döngüsü.
  Sigorta atınca yalnız ÜCRETSİZ hesabın maliyetli işi durur; abone ve kurucu sürer; derse dahil yardım sürer.
  Kredi ayırması sigortayı RPC'den ÖNCE sorar (cüzdana dokunulmadan 402). Gider okunamazsa sigorta atmaz.
*/

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const mocks = vi.hoisted(() => ({
  premium: false,
  exempt: false,
  spendUsd: 0 as number | null,
  flagMetadata: null as unknown,
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/billing/entitlements", () => ({ isPremiumUser: vi.fn(async () => mocks.premium) }));
vi.mock("@/lib/billing/free-preview", () => ({ billingExempt: vi.fn(async () => mocks.exempt) }));
vi.mock("@/lib/admin/ops-gauges", () => ({
  readAiSpend: vi.fn(async () => (mocks.spendUsd == null ? null : { usd: mocks.spendUsd, calls: 1, unpricedCalls: 0, byModel: [] })),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => ({
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { metadata: mocks.flagMetadata } }) }) }) }),
  }),
}));

const fakeService = {} as never;

describe("tavan ve anahtar (saf)", () => {
  it("tavan sırası: bayrak → ortam → varsayılan 25 $; aralık dışı değer bir sonrakine düşer", async () => {
    const { resolveSpendCap, DEFAULT_DAILY_SPEND_CAP_USD, readCapValue } = await import("@/lib/billing/spend-breaker-copy");
    expect(DEFAULT_DAILY_SPEND_CAP_USD).toBe(25);
    expect(resolveSpendCap({ flagMetadata: { cap_usd: 40 }, envValue: "60" })).toEqual({ capUsd: 40, source: "flag" });
    expect(resolveSpendCap({ flagMetadata: { cap_usd: "12,5" }, envValue: undefined })).toEqual({ capUsd: 12.5, source: "flag" });
    expect(resolveSpendCap({ flagMetadata: null, envValue: "60" })).toEqual({ capUsd: 60, source: "env" });
    expect(resolveSpendCap({ flagMetadata: { cap_usd: 0 }, envValue: "yok" })).toEqual({ capUsd: 25, source: "default" });
    expect(readCapValue(10_001)).toBeNull();
  });

  it("anahtar: on/off açık; verilmemişse yalnız Vercel'de açık (yerel ve testte kapalı)", async () => {
    const { breakerSwitch } = await import("@/lib/billing/spend-breaker-copy");
    expect(breakerSwitch({})).toBe(false);
    expect(breakerSwitch({ VERCEL_ENV: "production" })).toBe(true);
    expect(breakerSwitch({ VERCEL_ENV: "production", AI_SPEND_BREAKER: "off" })).toBe(false);
    expect(breakerSwitch({ AI_SPEND_BREAKER: "on" })).toBe(true);
  });

  it("atma kuralı: gider tavana ulaştıysa; gider okunamadıysa atmaz", async () => {
    const { breakerTripped } = await import("@/lib/billing/spend-breaker-copy");
    const cap = { capUsd: 25, source: "default" as const };
    expect(breakerTripped(24.99, cap)).toBe(false);
    expect(breakerTripped(25, cap)).toBe(true);
    expect(breakerTripped(null, cap)).toBe(false);
  });
});

describe("sigorta kararı (ortam on, sahte gider)", () => {
  beforeEach(async () => {
    process.env.AI_SPEND_BREAKER = "on";
    mocks.premium = false;
    mocks.exempt = false;
    mocks.spendUsd = 0;
    mocks.flagMetadata = null;
    (await import("@/lib/billing/spend-breaker")).resetSpendBreakerForTests();
  });
  afterEach(() => {
    delete process.env.AI_SPEND_BREAKER;
  });

  it("tavanın altında kimse durmaz", async () => {
    const { spendBreakerBlocks, spendBreakerState } = await import("@/lib/billing/spend-breaker");
    mocks.spendUsd = 10;
    const state = await spendBreakerState(undefined, new Date("2026-11-05T10:00:00Z"), { fresh: true });
    expect(state).toMatchObject({ enabled: true, tripped: false, spentUsd: 10, cap: { capUsd: 25, source: "default" } });
    expect(await spendBreakerBlocks(fakeService, "u-free")).toBe(false);
  });

  it("tavan aşılınca ücretsiz durur; abone, kurucu ve derse dahil yardım sürer", async () => {
    const { spendBreakerBlocks, resetSpendBreakerForTests } = await import("@/lib/billing/spend-breaker");
    mocks.spendUsd = 25;
    expect(await spendBreakerBlocks(fakeService, "u-free")).toBe(true);
    expect(await spendBreakerBlocks(fakeService, "u-free", { meter: "included" })).toBe(false);
    mocks.premium = true;
    expect(await spendBreakerBlocks(fakeService, "u-plus")).toBe(false);
    mocks.premium = false;
    mocks.exempt = true;
    expect(await spendBreakerBlocks(fakeService, "u-founder")).toBe(false);
    // Kokpitten yazılan tavan okunur: 100 $ ise 25 $ gider sigortayı atmaz.
    mocks.exempt = false;
    mocks.flagMetadata = { cap_usd: 100 };
    resetSpendBreakerForTests();
    expect(await spendBreakerBlocks(fakeService, "u-free")).toBe(false);
  });

  it("gider okunamazsa sigorta atmaz (öğrenci kapıda kalmaz); anahtar kapalıysa hiç bakmaz", async () => {
    const { spendBreakerBlocks, resetSpendBreakerForTests } = await import("@/lib/billing/spend-breaker");
    mocks.spendUsd = null;
    expect(await spendBreakerBlocks(fakeService, "u-free")).toBe(false);
    mocks.spendUsd = 999;
    resetSpendBreakerForTests();
    process.env.AI_SPEND_BREAKER = "off";
    expect(await spendBreakerBlocks(fakeService, "u-free")).toBe(false);
  });
});

describe("kredi ayırması, ret kodları ve ekran", () => {
  it("refusalCode: sigorta → spend_cap_free, fotoğraf döngüsü → free_photo_abuse_limit", async () => {
    const { refusalCode } = await import("@/lib/credits/service");
    expect(refusalCode({ reason: "insufficient_credits", refusal: { kind: "spend_cap" } })).toBe("spend_cap_free");
    expect(refusalCode({ reason: "insufficient_credits", refusal: { kind: "photo_abuse" } })).toBe("free_photo_abuse_limit");
    expect(refusalCode({ reason: "insufficient_credits", refusal: { kind: "free_limit", meter: "photo" } })).toBe("free_photo_limit");
  });

  it("reserveCredits sigortayı RPC'den önce sorar: atmışsa cüzdana dokunmadan 402 reddi", async () => {
    const credits = await import("@/lib/credits/service");
    const breaker = await import("@/lib/billing/spend-breaker");
    const blocks = vi.spyOn(breaker, "spendBreakerBlocks").mockResolvedValue(true);
    const rpc = vi.fn();
    const result = await credits.reserveCredits({ rpc } as never, "u-free", "STUDY_PLAN_GENERATE", "k1");
    expect(result).toEqual({ ok: false, reason: "insufficient_credits", refusal: { kind: "spend_cap" } });
    expect(rpc).not.toHaveBeenCalled();
    expect(blocks).toHaveBeenCalledWith({ rpc }, "u-free", { meter: "lesson" });
    blocks.mockRestore();
  });

  it("kullanıcıya giden metin ve ekran eylemi: hazır müfredata yönlendirir, yeniden denemek açmaz", async () => {
    const guards = read("src/lib/api/guards.ts");
    expect(guards).toContain("spend_cap_free:");
    expect(guards).toContain("Hazır Müfredat Havuzu ve Plus üyelerimiz için anlık AI üretimi aktiftir");
    expect(guards).toContain("free_photo_abuse_limit:");
    const { describeGenerationFailure } = await import("@/lib/learning/generation-failure");
    const cap = describeGenerationFailure("spend_cap_free");
    expect(cap.canRetryNow).toBe(false);
    expect(cap.action).toEqual({ href: "/mufredat", label: "Hazır müfredata git" });
    const photo = describeGenerationFailure("free_photo_abuse_limit");
    expect(photo.canRetryNow).toBe(false);
  });

  it("önceden yazım da sigortaya bakar; kurucu kokpiti tavanı yazar ve durumu gösterir", () => {
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(route).toContain('spendBreakerBlocks(createServiceClient(), caller.userId, { meter: "lesson" })');
    expect(route.indexOf("spendBreakerBlocks(")).toBeLessThan(route.indexOf("after(async () =>"));
    const actions = read("src/app/admin/cockpit-actions.ts");
    expect(actions).toContain("export async function saveDailySpendCap(");
    expect(actions).toContain("key: SPEND_CAP_FLAG");
    const page = read("src/app/admin/page.tsx");
    expect(page).toContain("Günlük harcama sigortası");
    expect(page).toContain("<SpendCapForm");
    const loader = read("src/lib/admin/cockpit.ts");
    expect(loader).toContain("spendBreakerState(service, now, { fresh: true })");
  });
});

describe("okunamayan fotoğraf döngüsü", () => {
  const savedEnv: Record<string, string | undefined> = {};
  beforeEach(() => {
    for (const key of ["UPSTASH_REDIS_REST_URL", "UPSTASH_REDIS_REST_TOKEN", "KV_REST_API_URL", "KV_REST_API_TOKEN"]) {
      savedEnv[key] = process.env[key];
      delete process.env[key];
    }
  });
  afterEach(() => {
    for (const [key, value] of Object.entries(savedEnv)) if (value !== undefined) process.env[key] = value;
  });

  it("saf kural: ücretsizde 3 okunamayan fotoğraftan sonra durur; abone/kurucu durmaz", async () => {
    const { photoAttemptsBlocked, PHOTO_UNREADABLE_DAILY_LIMIT } = await import("@/lib/billing/photo-abuse-guard");
    expect(PHOTO_UNREADABLE_DAILY_LIMIT).toBe(3);
    expect(photoAttemptsBlocked(2, false)).toBe(false);
    expect(photoAttemptsBlocked(3, false)).toBe(true);
    expect(photoAttemptsBlocked(30, true)).toBe(false);
  });

  it("üç okunamayan kayıttan sonra ücretsiz hesabın yeni fotoğraf denemesi durur (bellek sayacı)", async () => {
    const guard = await import("@/lib/billing/photo-abuse-guard");
    const userId = `u-${Date.now()}`;
    mocks.premium = false;
    mocks.exempt = false;
    expect(await guard.photoAbuseBlocked(fakeService, userId)).toBe(false);
    await guard.recordUnreadablePhoto(userId);
    await guard.recordUnreadablePhoto(userId);
    expect(await guard.photoAbuseBlocked(fakeService, userId)).toBe(false);
    await guard.recordUnreadablePhoto(userId);
    expect(await guard.unreadablePhotosToday(userId)).toBeGreaterThanOrEqual(3);
    expect(await guard.photoAbuseBlocked(fakeService, userId)).toBe(true);
    mocks.premium = true;
    expect(await guard.photoAbuseBlocked(fakeService, userId)).toBe(false);
  });

  it("kancalar: çözücü ve belge okuma okunamayanı sayar; kredi ayırması fotoğraf işinde sorar", () => {
    const solve = read("src/lib/solve/solve-run.ts");
    expect(solve).toContain("if (image) await recordUnreadablePhoto(userId);");
    const pipeline = read("src/lib/rag/pipeline.ts");
    expect(pipeline).toContain("if (await photoAbuseBlocked(service, userId)) return fail(PHOTO_ABUSE_CODE);");
    expect((pipeline.match(/await recordUnreadablePhoto\(userId\)/g) ?? []).length).toBeGreaterThanOrEqual(2);
    const credits = read("src/lib/credits/service.ts");
    expect(credits).toContain('actionCode === "IMAGE_SOLUTION" && (await photoAbuseBlocked(service, userId))');
    const errors = read("src/lib/documents/ingestion-errors.ts");
    expect(errors).toContain("free_photo_abuse_limit: {");
  });
});
