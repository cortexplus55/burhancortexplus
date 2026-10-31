import { readdirSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/*
  Lansman zırhı (31 Ekim 2026): 1.000 eşzamanlı öğrenci ve kötüye kullanım için kapanan açıklar. Hepsi kodda ölçülerek
  bulundu (ajan taraması + canlı veritabanı): yurtta/okulda tek IP'den düello, telefon yüklemesi; bütün cihazlardan
  çıkış; OpenAI kredisi bitince sessiz arıza ve boşuna yeniden deneme; veritabanının 500 MB sınırını gösteren yerin
  olmaması; davet kodunun e-posta onayı başka tarayıcıda açılınca kaybolması; düelloda paylaşım ve davetsiz kayıt
  bağlantısı.
*/

const read = (path: string) => readFileSync(path, "utf8");

beforeEach(() => {
  // Testler yerel .env.local'daki gerçek Redis'e yazmasın: sayaçlar bellekte.
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
  vi.stubEnv("KV_REST_API_URL", "");
  vi.stubEnv("KV_REST_API_TOKEN", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

vi.mock("@/lib/abuse/record", () => ({
  recordAbuse: vi.fn(async () => undefined),
  hashIp: () => "h",
  requestIp: () => "1.2.3.4",
}));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn(), createServiceClient: vi.fn() }));

function requestFrom(ip: string): Request {
  return new Request("https://cortexplus.app/api/duels/abc123/run", { headers: { "x-forwarded-for": ip } });
}

describe("düello ve telefon yüklemesi: okul ağında sayaç kişiye bağlı", () => {
  it("aynı IP'den 50 oturumlu öğrenci birbirini engellemez; her öğrencinin kendi 10'luk sınırı var", async () => {
    const { duelLimit, DUEL_USER_LIMIT } = await import("@/lib/api/guards");
    const scope = `duel-run-test-${Math.random()}`;
    const results = await Promise.all(
      Array.from({ length: 50 }, (_, index) => duelLimit(requestFrom("10.0.0.1"), scope, `user-${index}`)),
    );
    expect(results.every((result) => result === null)).toBe(true);
    for (let call = 1; call < DUEL_USER_LIMIT; call += 1) {
      expect(await duelLimit(requestFrom("10.0.0.1"), scope, "user-0")).toBeNull();
    }
    const blocked = await duelLimit(requestFrom("10.0.0.1"), scope, "user-0");
    expect(blocked?.status).toBe(429);
  });

  it("misafir IP'den sayılır ama sınır bir sınıfa yeter (60)", async () => {
    const { duelLimit, DUEL_GUEST_IP_LIMIT } = await import("@/lib/api/guards");
    expect(DUEL_GUEST_IP_LIMIT).toBeGreaterThanOrEqual(50);
    const scope = `duel-bot-test-${Math.random()}`;
    const results = [];
    for (let call = 0; call < DUEL_GUEST_IP_LIMIT; call += 1) results.push(await duelLimit(requestFrom("10.0.0.2"), scope, null));
    expect(results.every((result) => result === null)).toBe(true);
    expect((await duelLimit(requestFrom("10.0.0.2"), scope, null))?.status).toBe(429);
  });

  it("telefon yüklemesi bağlantının koduyla sayılır; 30 masaüstü aynı IP'den yoklayabilir", async () => {
    const { phoneUploadLimit } = await import("@/lib/api/guards");
    const tokens = Array.from({ length: 30 }, (_, index) => `token-${index}-${Math.random()}`);
    for (let round = 0; round < 20; round += 1) {
      const results = await Promise.all(tokens.map((token) => phoneUploadLimit(requestFrom("10.0.0.3"), token, { scope: "phone-upload-poll", limit: 60 })));
      expect(results.every((result) => result === null)).toBe(true);
    }
  });

  it("uçlar yeni sınırı kullanıyor (kaynak bekçisi)", () => {
    const run = read("src/app/api/duels/[code]/run/route.ts");
    expect(run).toContain('await duelLimit(request, "duel-run", sessionUserId)');
    expect(run).not.toContain('guestLimit(request, { scope: "duel-run", limit: 10 })');
    expect(read("src/app/api/duels/[code]/bot/route.ts")).toContain('await duelLimit(request, "duel-bot", userId)');
    for (const path of [
      "src/app/api/uploads/phone/[token]/route.ts",
      "src/app/api/uploads/phone/[token]/prepare/route.ts",
      "src/app/api/uploads/phone/[token]/complete/route.ts",
    ]) {
      expect(read(path)).toContain("phoneUploadLimit(request, token,");
      expect(read(path)).not.toContain("guestLimit(");
    }
  });
});

describe("çıkış yalnız bu cihazdan", () => {
  it("çıkış ucu local kapsamla; hesap silme bütün oturumları kapatır", () => {
    expect(read("src/app/api/auth/signout/route.ts")).toContain('signOut({ scope: "local" })');
    expect(read("src/app/actions.ts")).toContain("await supabase.auth.signOut();");
  });
});

describe("OpenAI kredisi bitince", () => {
  it("kota bitti hatası geçici sayılmaz (yeniden denenmez); hız sınırı 429'u sayılır", async () => {
    const { isTransientProviderError } = await import("@/lib/ai/transient-retry");
    expect(isTransientProviderError({ status: 429, code: "insufficient_quota" })).toBe(false);
    expect(isTransientProviderError(Object.assign(new Error("You exceeded your current quota"), { status: 429 }))).toBe(false);
    expect(isTransientProviderError({ status: 429, code: "rate_limit_exceeded" })).toBe(true);
    expect(isTransientProviderError({ status: 503 })).toBe(true);
  });

  it("Retry-After dinlenir (en çok 20 sn); yeniden deneme o kadar bekler", async () => {
    const { retryAfterMs, withTransientRetry } = await import("@/lib/ai/transient-retry");
    expect(retryAfterMs({ headers: new Headers({ "retry-after-ms": "1500" }) })).toBe(1500);
    expect(retryAfterMs({ headers: new Headers({ "retry-after": "7" }) })).toBe(7000);
    expect(retryAfterMs({ headers: new Headers({ "retry-after": "120" }) })).toBe(20_000);
    expect(retryAfterMs({ headers: { "retry-after": "2" } })).toBe(2000);
    expect(retryAfterMs({})).toBe(0);
    const waits: number[] = [];
    let calls = 0;
    const value = await withTransientRetry(
      async () => {
        calls += 1;
        if (calls === 1) throw Object.assign(new Error("slow down"), { status: 429, headers: new Headers({ "retry-after": "5" }) });
        return "ok";
      },
      { startedAt: Date.now(), callTimeoutMs: 1_000, sleep: async (ms) => void waits.push(ms) },
    );
    expect(value).toBe("ok");
    expect(waits).toEqual([5_000]);
  });

  it("istemci 429 gövdesinde 'insufficient_quota' görünce uyarır; SDK'nın gördüğü cevap aynı", async () => {
    const note = vi.fn(async () => "mailed" as const);
    vi.doMock("@/lib/ai/provider-quota", () => ({ noteProviderQuotaExhausted: note }));
    const { openaiClient, isQuotaExhaustedText } = await import("@/lib/ai/openai-client");
    expect(isQuotaExhaustedText('{"error":{"code":"insufficient_quota"}}')).toBe(true);
    expect(isQuotaExhaustedText('{"error":{"code":"rate_limit_exceeded"}}')).toBe(false);
    const body = JSON.stringify({ error: { message: "You exceeded your current quota", type: "insufficient_quota", code: "insufficient_quota" } });
    const fetchStub = vi.fn(async () => new Response(body, { status: 429, headers: { "content-type": "application/json" } }));
    const client = openaiClient({ apiKey: "sk-test", maxRetries: 0, fetch: fetchStub as unknown as typeof fetch });
    const error = await client.models.list().then(() => null, (caught: unknown) => caught);
    expect((error as { status?: number }).status).toBe(429);
    expect((error as { code?: string }).code).toBe("insufficient_quota");
    await vi.waitFor(() => expect(note).toHaveBeenCalledTimes(1));
    vi.doUnmock("@/lib/ai/provider-quota");
  });

  it("kurucuya saatte en çok bir e-posta (Redis yoksa bu sunucuda)", async () => {
    const { noteProviderQuotaExhausted, resetProviderQuotaForTests } = await import("@/lib/ai/provider-quota");
    resetProviderQuotaForTests();
    const send = vi.fn(async () => ({ ok: true as const }));
    const at = new Date("2026-10-31T10:00:00Z");
    expect(await noteProviderQuotaExhausted({ now: at, send, env: {} })).toBe("mailed");
    expect(await noteProviderQuotaExhausted({ now: new Date(at.getTime() + 30 * 60_000), send, env: {} })).toBe("noted");
    expect(await noteProviderQuotaExhausted({ now: new Date(at.getTime() + 61 * 60_000), send, env: {} })).toBe("mailed");
    expect(send).toHaveBeenCalledTimes(2);
    expect(send.mock.calls[0]![0]).toMatchObject({ to: "cortexplus@cortexplus.app", subject: "Dikkat · OpenAI kredisi bitti" });
    resetProviderQuotaForTests();
    expect(await noteProviderQuotaExhausted({ now: at, send, env: { ADMIN_DIGEST_EMAIL: "off" } })).toBe("disabled");
  });

  it("bütün OpenAI istemcileri ortak fabrikadan açılır", () => {
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = `${dir}/${entry.name}`;
        if (entry.isDirectory()) walk(path);
        else if (/\.tsx?$/.test(entry.name) && read(path).includes("new OpenAI(")) found.push(path);
      }
    };
    walk("src");
    expect(found).toEqual(["src/lib/ai/openai-client.ts"]);
  });
});

describe("işletme göstergeleri", () => {
  it("veritabanı payı: %70 uyarı, %85 kritik; sınır SUPABASE_DB_LIMIT_MB ile", async () => {
    const { databaseLevel, databaseLimitBytes, readDatabaseSize } = await import("@/lib/admin/ops-gauges");
    expect(databaseLevel(0.31)).toBe("ok");
    expect(databaseLevel(0.7)).toBe("warn");
    expect(databaseLevel(0.86)).toBe("critical");
    expect(databaseLimitBytes({})).toBe(500 * 1024 * 1024);
    expect(databaseLimitBytes({ SUPABASE_DB_LIMIT_MB: "8192" })).toBe(8192 * 1024 * 1024);
    const service = {
      rpc: async () => ({ data: { total_bytes: 154 * 1024 * 1024, tables: [{ name: "document_embeddings", bytes: 85 * 1024 * 1024 }] }, error: null }),
    };
    const size = await readDatabaseSize(service as never, {});
    expect(size).toMatchObject({ level: "ok", tables: [{ name: "document_embeddings" }] });
    expect(Math.round(size!.share * 100)).toBe(31);
    const missing = { rpc: async () => ({ data: null, error: { code: "PGRST202" } }) };
    expect(await readDatabaseSize(missing as never, {})).toBeNull();
  });

  it("OpenAI gideri jeton toplamı × fiyat; '-fast' iki kat; fiyatı olmayan ayrıca sayılır", async () => {
    const { aiSpendFrom } = await import("@/lib/admin/ops-gauges");
    const prices = new Map([["gpt-6-luna", { input: 0.001, output: 0.004 }]]);
    const spend = aiSpendFrom(
      [
        { model: "gpt-6-luna", calls: 10, tokens_in: 100_000, tokens_out: 10_000 },
        { model: "gpt-6-luna-fast", calls: 2, tokens_in: 10_000, tokens_out: 1_000 },
        { model: "bilinmeyen", calls: 3, tokens_in: 1, tokens_out: 1 },
      ],
      prices,
    );
    expect(spend.usd).toBeCloseTo(0.1 + 0.04 + 0.02 + 0.008, 6);
    expect(spend.calls).toBe(15);
    expect(spend.unpricedCalls).toBe(3);
  });

  it("günlük özet veritabanını ve gideri yazar, eşikte 'Dikkat' der; sistem sayfası gösterir", async () => {
    vi.doMock("@/lib/email/mailer", () => ({ sendEmail: vi.fn() }));
    const { renderDailyDigest, digestNeedsAttention } = await import("@/lib/admin/daily-digest");
    const base = {
      from: "2026-10-30T06:00:00Z",
      to: "2026-10-31T06:00:00Z",
      signups: 0,
      payments: { paid: 0, paidKurus: 0, failed: 0, pending: 0, refunded: 0 },
      failures: { total: 0, slow: 0, byReason: [] },
      stuck: 0,
    };
    const calm = {
      ...base,
      database: { totalBytes: 154 * 1024 * 1024, limitBytes: 500 * 1024 * 1024, share: 0.308, level: "ok" as const, tables: [] },
      aiSpend: { usd: 3.2, calls: 1200, unpricedCalls: 0, byModel: [] },
    };
    expect(digestNeedsAttention(calm)).toBe(false);
    const mail = renderDailyDigest(calm, "https://cortexplus.app");
    expect(mail.text).toContain("Veritabanı: 154 MB / 500 MB · %31");
    expect(mail.text).toContain("OpenAI gideri: 3.20 $ · 1.200 çağrı");
    const full = { ...calm, database: { ...calm.database, share: 0.9, level: "critical" as const } };
    expect(digestNeedsAttention(full)).toBe(true);
    expect(renderDailyDigest(full).text).toContain("KRİTİK");
    expect(digestNeedsAttention({ ...calm, aiSpend: { ...calm.aiSpend, usd: 25 } })).toBe(true);
    vi.doUnmock("@/lib/email/mailer");
    const page = read("src/app/admin/sistem/page.tsx");
    expect(page).toContain("readDatabaseSize(service)");
    expect(page).toContain("providerQuotaSeenAt()");
  });
});

describe("paylaşım ve davet", () => {
  it("düello WhatsApp metni ve misafirin kayıt bağlantısı kuranın davet koduyla", async () => {
    const { duelChallengeText, duelInviteText, duelSignupHref, whatsappShareHref } = await import("@/lib/learning/duel-share");
    expect(duelChallengeText(" Mitoz ", 6, 7)).toBe("“Mitoz” düellosunda 6/7 yaptım. Geçebilir misin?");
    expect(duelInviteText("Mitoz")).toContain("Hesap gerekmiyor");
    expect(whatsappShareHref("Gel", "https://cortexplus.app/duello/abc123")).toBe(
      "https://wa.me/?text=Gel%20https%3A%2F%2Fcortexplus.app%2Fduello%2Fabc123",
    );
    expect(duelSignupHref("ab12cd")).toBe("/kayit?ref=AB12CD");
    expect(duelSignupHref(null)).toBe("/kayit");
    expect(duelSignupHref("x y")).toBe("/kayit");
    const play = read("src/components/duel/duel-play.tsx");
    expect(play).toContain("whatsappShareHref(duelChallengeText(title, result.correct, result.total), shareUrl)");
    expect(play).toContain("<Link href={signupHref}");
    expect(read("src/app/duello/[code]/page.tsx")).toContain('select("full_name, referral_code")');
    expect(read("src/components/parity/referral-reward-card.tsx")).toContain("whatsappShareHref(referralShareText(), inviteUrl)");
  });

  it("davet kodu hesaba da yazılır; doğrulama başka tarayıcıda açılınca kurulum bağlar", () => {
    const wizard = read("src/app/kayit/signup-wizard.tsx");
    expect(wizard).toContain('referral_code: payload.referralCode ?? ""');
    const actions = read("src/app/kayit/actions.ts");
    expect(actions).toContain("payload.referralCode || metadataReferralCode(user.user_metadata)");
    expect(actions).toContain("export async function applySignupReferral()");
    expect(read("src/app/onboarding/page.tsx")).toContain("void applySignupReferral().catch(() => undefined);");
  });

  it("kayıtta Google ilk ve beyaz ana düğme; e-posta yolu altında; onay kutusu ikisinin de üstünde", () => {
    const wizard = read("src/app/kayit/signup-wizard.tsx");
    const account = wizard.slice(wizard.indexOf('step === "account"'));
    const consent = account.indexOf("onCheckedChange");
    const google = account.indexOf("<GoogleSignInButton");
    const form = account.indexOf("<form onSubmit={submitAccount}");
    expect(consent).toBeGreaterThan(0);
    expect(consent).toBeLessThan(google);
    expect(google).toBeLessThan(form);
    expect(wizard).toContain("await checkSignupEmail(email)");
  });
});
