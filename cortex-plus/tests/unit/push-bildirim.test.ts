/**
 * Mobil uygulama, Aşama 1 (26 Kasım 2026): anlık bildirim.
 * - Sessiz saat (Türkiye saatiyle 22:00–08:00) hatırlatmalara uygulanır; hesap bildirimleri muaf.
 * - "Uygulama içi bildirimler" kapalıysa telefona da gitmez (hesap bildirimleri hariç).
 * - Kimlik bilgisi yoksa veritabanına hiç sorulmaz (testlerde ve yerelde davranış değişmez).
 * - APNs (ES256) ve FCM (RS256) imzaları doğrulanabilir; gövdede yalnız uygulama içi yol.
 * - Geçersizleşen cihaz anahtarı silinir.
 * - Göç: tablo yalnız sunucuya açık, anahtar tek hesaba bağlı, profil silinince gider (PGlite).
 * - Uygulama içi bildirim yazılınca yalnız YENİ satır telefona gider.
 */
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { generateKeyPairSync, verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const prefs = vi.hoisted(() => ({ inAppNotifications: true }));
vi.mock("@/lib/notifications/preferences", () => ({
  loadNotificationPreferences: vi.fn(async () => ({ ...prefs })),
}));

import { pushActionUrl, pushAllowedAt, pushConfigured, pushPayload, sendPushToUser } from "@/lib/notifications/push";
import { apnsBody, apnsProviderToken, apnsTokenInvalid } from "@/lib/notifications/push-apns";
import { fcmAssertion, fcmMessage, fcmTokenInvalid, sendFcm } from "@/lib/notifications/push-fcm";
import { notifyInApp } from "@/lib/notifications/in-app";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const USER = "11111111-1111-4111-8111-111111111111";
/** 14:00 İstanbul (11:00 UTC) ve 23:30 İstanbul (20:30 UTC). */
const AFTERNOON = new Date("2026-11-26T11:00:00Z");
const NIGHT = new Date("2026-11-26T20:30:00Z");

const rsa = generateKeyPairSync("rsa", { modulusLength: 2048 });
const ec = generateKeyPairSync("ec", { namedCurve: "prime256v1" });
const RSA_PEM = rsa.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
const EC_PEM = ec.privateKey.export({ type: "pkcs8", format: "pem" }).toString();

const ENV_KEYS = ["FCM_PROJECT_ID", "FCM_CLIENT_EMAIL", "FCM_PRIVATE_KEY", "APNS_KEY_ID", "APNS_TEAM_ID", "APNS_PRIVATE_KEY"];
const savedEnv: Record<string, string | undefined> = {};

function useFcmEnv() {
  process.env.FCM_PROJECT_ID = "cortex-test";
  process.env.FCM_CLIENT_EMAIL = "push@cortex-test.iam.gserviceaccount.com";
  process.env.FCM_PRIVATE_KEY = RSA_PEM.replace(/\n/g, "\\n");
}

beforeEach(() => {
  for (const key of ENV_KEYS) {
    savedEnv[key] = process.env[key];
    delete process.env[key];
  }
  prefs.inAppNotifications = true;
});

afterEach(() => {
  for (const key of ENV_KEYS) {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  }
  vi.unstubAllGlobals();
});

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

describe("kurallar (saf)", () => {
  it("sessiz saat: gece hatırlatma yok, hesap bildirimi var", () => {
    expect(pushAllowedAt(AFTERNOON, false)).toBe(true);
    expect(pushAllowedAt(NIGHT, false)).toBe(false);
    expect(pushAllowedAt(NIGHT, true)).toBe(true);
    // 08:00 İstanbul sınırı: 07:59 sessiz, 08:00 serbest.
    expect(pushAllowedAt(new Date("2026-11-26T04:59:00Z"), false)).toBe(false);
    expect(pushAllowedAt(new Date("2026-11-26T05:00:00Z"), false)).toBe(true);
  });

  it("yalnız uygulama içi yol; uzun metin kısalır", () => {
    expect(pushActionUrl("/deneme-sinavlari/x")).toBe("/deneme-sinavlari/x");
    expect(pushActionUrl("https://kotu.example")).toBeNull();
    expect(pushActionUrl("//kotu.example")).toBeNull();
    const payload = pushPayload({ title: "a".repeat(300), body: "b".repeat(500), actionUrl: "/ogretmen" });
    expect(payload.title.length).toBe(120);
    expect(payload.body.length).toBe(240);
    expect(payload.url).toBe("/ogretmen");
  });

  it("kimlik bilgisi yoksa hiçbir platform yapılandırılmış sayılmaz", () => {
    expect(pushConfigured()).toEqual({ ios: false, android: false });
    useFcmEnv();
    expect(pushConfigured()).toEqual({ ios: false, android: true });
  });
});

describe("imzalar ve gövdeler", () => {
  it("APNs sağlayıcı belirteci ES256 ile doğrulanır", () => {
    const token = apnsProviderToken({ keyId: "KEY123", teamId: "TEAM45", privateKey: EC_PEM }, 1_800_000_000);
    const [header, claims, signature] = token.split(".");
    expect(decode(header)).toEqual({ alg: "ES256", kid: "KEY123" });
    expect(decode(claims)).toEqual({ iss: "TEAM45", iat: 1_800_000_000 });
    const ok = verify(
      "sha256",
      Buffer.from(`${header}.${claims}`),
      { key: ec.publicKey, dsaEncoding: "ieee-p1363" },
      Buffer.from(signature, "base64url"),
    );
    expect(ok).toBe(true);
    // 50 dakika içinde aynı belirteç kullanılır.
    expect(apnsProviderToken({ keyId: "KEY123", teamId: "TEAM45", privateKey: EC_PEM }, 1_800_000_600)).toBe(token);
  });

  it("FCM onayı RS256 ile doğrulanır; kapsam yalnız bildirim", () => {
    const assertion = fcmAssertion({ clientEmail: "push@x.iam.gserviceaccount.com", privateKey: RSA_PEM }, 1_800_000_000);
    const [header, claims, signature] = assertion.split(".");
    expect(decode(header)).toEqual({ alg: "RS256", typ: "JWT" });
    expect(decode(claims)).toMatchObject({
      iss: "push@x.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/firebase.messaging",
      exp: 1_800_003_600,
    });
    expect(verify("sha256", Buffer.from(`${header}.${claims}`), rsa.publicKey, Buffer.from(signature, "base64url"))).toBe(true);
  });

  it("gövdeler: başlık, metin, yalnız yol", () => {
    expect(JSON.parse(apnsBody({ title: "T", body: "B", url: "/x" }))).toEqual({
      aps: { alert: { title: "T", body: "B" }, sound: "default" },
      url: "/x",
    });
    expect(fcmMessage("tok", { title: "T", body: "B", url: null })).toEqual({
      message: {
        token: "tok",
        notification: { title: "T", body: "B" },
        android: { priority: "HIGH", notification: { default_sound: true } },
      },
    });
  });

  it("geçersiz anahtar: APNs 410 / BadDeviceToken, FCM 404 / UNREGISTERED; başka hatalar değil", () => {
    expect(apnsTokenInvalid(410, "Unregistered")).toBe(true);
    expect(apnsTokenInvalid(400, "BadDeviceToken")).toBe(true);
    expect(apnsTokenInvalid(400, "PayloadTooLarge")).toBe(false);
    expect(apnsTokenInvalid(500, null)).toBe(false);
    expect(fcmTokenInvalid(404, null)).toBe(true);
    expect(fcmTokenInvalid(400, { error: { details: [{ errorCode: "UNREGISTERED" }] } })).toBe(true);
    expect(fcmTokenInvalid(400, { error: { status: "INVALID_ARGUMENT" } })).toBe(false);
    expect(fcmTokenInvalid(503, null)).toBe(false);
  });
});

type Call = { table: string; op: string; args: unknown[] };

function fakeService(rows: { token: string; platform: string }[]) {
  const calls: Call[] = [];
  const service = {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      const record = (op: string) => (...args: unknown[]) => {
        calls.push({ table, op, args });
        return chain;
      };
      for (const op of ["select", "eq", "in", "delete"]) chain[op] = record(op);
      chain.limit = (...args: unknown[]) => {
        calls.push({ table, op: "limit", args });
        return Promise.resolve({ data: rows, error: null });
      };
      chain.then = (resolve: (value: unknown) => void) => resolve({ data: null, error: null });
      return chain;
    },
  };
  return { service, calls };
}

function fcmFetch(failTokens: Record<string, number> = {}) {
  const sent: string[] = [];
  const fetcher = vi.fn(async (url: string | URL, init?: RequestInit) => {
    const href = String(url);
    if (href.includes("oauth2.googleapis.com")) {
      return new Response(JSON.stringify({ access_token: "erisim", expires_in: 3600 }), { status: 200 });
    }
    const body = JSON.parse(String(init?.body)) as { message: { token: string } };
    sent.push(body.message.token);
    const status = failTokens[body.message.token];
    if (status === 404) return new Response(JSON.stringify({ error: { status: "NOT_FOUND" } }), { status: 404 });
    if (status) return new Response("{}", { status });
    return new Response(JSON.stringify({ name: "ok" }), { status: 200 });
  });
  return { fetcher, sent };
}

describe("öğrenciye gönderim", () => {
  it("kimlik bilgisi yoksa veritabanına hiç sorulmaz", async () => {
    const { service, calls } = fakeService([]);
    const outcome = await sendPushToUser(service as never, USER, { title: "T", body: "B" }, AFTERNOON);
    expect(outcome.skipped).toBe("not_configured");
    expect(calls).toEqual([]);
  });

  it("gece hatırlatma gönderilmez, hesap bildirimi gönderilir", async () => {
    useFcmEnv();
    const { fetcher } = fcmFetch();
    vi.stubGlobal("fetch", fetcher);
    const { service } = fakeService([{ token: "android-token-0000001", platform: "android" }]);
    const quiet = await sendPushToUser(service as never, USER, { title: "Tekrar", body: "B" }, NIGHT);
    expect(quiet.skipped).toBe("quiet_hours");
    expect(fetcher).not.toHaveBeenCalled();
    const paid = await sendPushToUser(service as never, USER, { title: "Ödeme", body: "B", essential: true }, NIGHT);
    expect(paid.delivered).toBe(1);
  });

  it("öğrenci uygulama içi bildirimi kapattıysa hatırlatma gitmez", async () => {
    useFcmEnv();
    prefs.inAppNotifications = false;
    const { fetcher } = fcmFetch();
    vi.stubGlobal("fetch", fetcher);
    const { service } = fakeService([{ token: "android-token-0000001", platform: "android" }]);
    const outcome = await sendPushToUser(service as never, USER, { title: "T", body: "B" }, AFTERNOON);
    expect(outcome.skipped).toBe("muted");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("Android'e gönderir; geçersiz anahtarı yalnız bu öğrencinin satırından siler", async () => {
    useFcmEnv();
    const { fetcher, sent } = fcmFetch({ "android-token-eski0001": 404, "android-token-gecici01": 503 });
    vi.stubGlobal("fetch", fetcher);
    const { service, calls } = fakeService([
      { token: "android-token-0000001", platform: "android" },
      { token: "android-token-eski0001", platform: "android" },
      { token: "android-token-gecici01", platform: "android" },
      { token: "ios-token-kimliksiz01", platform: "ios" },
    ]);
    const outcome = await sendPushToUser(service as never, USER, { title: "T", body: "B", actionUrl: "/ogretmen" }, AFTERNOON);
    expect(outcome).toEqual({ delivered: 1, removed: 1, failed: 1 });
    // iOS kimlik bilgisi yok: iOS cihazına gönderilmez.
    expect(sent.sort()).toEqual(["android-token-0000001", "android-token-eski0001", "android-token-gecici01"]);
    const deletion = calls.filter((call) => call.op === "delete" || call.op === "in" || (call.op === "eq" && calls.some((c) => c.op === "delete")));
    expect(deletion.some((call) => call.op === "in" && JSON.stringify(call.args) === JSON.stringify(["token", ["android-token-eski0001"]]))).toBe(true);
    expect(calls.some((call) => call.op === "eq" && call.args[0] === "user_id" && call.args[1] === USER)).toBe(true);
  });

  it("erişim belirteci alınamazsa gönderim düşer ama atmaz", async () => {
    const fetcher = vi.fn(async () => new Response("{}", { status: 401 }));
    const result = await sendFcm(
      { projectId: "p", clientEmail: "baska@x.iam.gserviceaccount.com", privateKey: RSA_PEM },
      ["a-token-00000000001"],
      { title: "T", body: "B", url: null },
      fetcher as never,
    );
    expect(result).toEqual({ delivered: 0, invalidTokens: [], failed: 1 });
  });
});

describe("uygulama içi bildirim yazılınca telefona", () => {
  function notifyService(insertedReturn: unknown[]) {
    const tables: string[] = [];
    const service = {
      from(table: string) {
        tables.push(table);
        if (table === "in_app_notifications") {
          return {
            upsert: () => ({ select: async () => ({ data: insertedReturn, error: null }) }),
            insert: async () => ({ error: null }),
          };
        }
        const chain: Record<string, unknown> = {};
        for (const op of ["select", "eq", "in", "delete"]) chain[op] = () => chain;
        chain.limit = async () => ({ data: [{ token: "android-token-0000001", platform: "android" }], error: null });
        chain.then = (resolve: (value: unknown) => void) => resolve({ data: null, error: null });
        return chain;
      },
    };
    return { service, tables };
  }

  beforeEach(() => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(AFTERNOON);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("yeni yazılan bildirim gönderilir", async () => {
    useFcmEnv();
    const { fetcher, sent } = fcmFetch();
    vi.stubGlobal("fetch", fetcher);
    const { service } = notifyService([{ id: "n1", user_id: USER, dedupe_key: "video:1" }]);
    const outcome = await notifyInApp(service as never, {
      userId: USER,
      kind: "video_ready",
      title: "Videon hazır",
      body: "İzlemek için dokun.",
      actionUrl: "/deneme-sinavlari/x",
      dedupeKey: "video:1",
    });
    expect(outcome).toBe("created");
    expect(sent).toEqual(["android-token-0000001"]);
  });

  it("daha önce yazılmış (tekilleştirme çakışan) bildirim ikinci kez gönderilmez", async () => {
    useFcmEnv();
    const { fetcher } = fcmFetch();
    vi.stubGlobal("fetch", fetcher);
    const { service, tables } = notifyService([]);
    const outcome = await notifyInApp(service as never, {
      userId: USER,
      kind: "video_ready",
      title: "Videon hazır",
      body: "B",
      dedupeKey: "video:1",
    });
    expect(outcome).toBe("duplicate");
    expect(fetcher).not.toHaveBeenCalled();
    expect(tables).not.toContain("user_push_tokens");
  });

  it("kimlik bilgisi yoksa bildirim yazımı eskisi gibi; cihaz tablosuna bakılmaz", async () => {
    const { service, tables } = notifyService([{ id: "n1", user_id: USER, dedupe_key: "video:1" }]);
    await notifyInApp(service as never, { userId: USER, kind: "video_ready", title: "T", body: "B", dedupeKey: "video:1" });
    expect(tables).toEqual(["in_app_notifications"]);
  });
});

describe("göç: cihaz anahtarları (PGlite)", () => {
  const db = new PGlite();
  const MIGRATION = "supabase/migrations/20261126120000_user_push_tokens.sql";

  beforeAll(async () => {
    await db.exec(`
      DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
      CREATE TABLE public.profiles (id uuid PRIMARY KEY);
    `);
    await db.query(`INSERT INTO public.profiles (id) VALUES ($1), ($2)`, [USER, "22222222-2222-4222-8222-222222222222"]);
    // İki kez: yalnız ekler, tekrar çalıştırılabilir.
    await db.exec(read(MIGRATION));
    await db.exec(read(MIGRATION));
  });

  afterAll(async () => {
    await db.close();
  });

  it("tarayıcı rolleri erişemez; satır güvenliği açık", async () => {
    const { rows } = await db.query<{ relrowsecurity: boolean }>(
      `SELECT relrowsecurity FROM pg_class WHERE oid = 'public.user_push_tokens'::regclass`,
    );
    expect(rows[0]!.relrowsecurity).toBe(true);
    for (const role of ["anon", "authenticated"]) {
      const { rows: grants } = await db.query<{ ok: boolean }>(
        `SELECT has_table_privilege($1, 'public.user_push_tokens', 'SELECT') OR has_table_privilege($1, 'public.user_push_tokens', 'INSERT') AS ok`,
        [role],
      );
      expect(grants[0]!.ok, role).toBe(false);
    }
  });

  it("anahtar tek hesaba bağlı; yazım yeni hesaba geçirir; yalnız iOS ve Android", async () => {
    await db.query(`INSERT INTO public.user_push_tokens (user_id, token, platform) VALUES ($1, 'cihaz-anahtari-0001', 'ios')`, [USER]);
    await expect(
      db.query(`INSERT INTO public.user_push_tokens (user_id, token, platform) VALUES ($1, 'cihaz-anahtari-0001', 'ios')`, [USER]),
    ).rejects.toThrow();
    await db.query(
      `INSERT INTO public.user_push_tokens (user_id, token, platform) VALUES ($1, 'cihaz-anahtari-0001', 'ios')
       ON CONFLICT (token) DO UPDATE SET user_id = EXCLUDED.user_id`,
      ["22222222-2222-4222-8222-222222222222"],
    );
    const { rows } = await db.query<{ user_id: string }>(`SELECT user_id FROM public.user_push_tokens`);
    expect(rows).toEqual([{ user_id: "22222222-2222-4222-8222-222222222222" }]);
    await expect(
      db.query(`INSERT INTO public.user_push_tokens (user_id, token, platform) VALUES ($1, 'cihaz-anahtari-0002', 'web')`, [USER]),
    ).rejects.toThrow();
    await expect(db.query(`INSERT INTO public.user_push_tokens (user_id, token, platform) VALUES ($1, 'kisa', 'ios')`, [USER])).rejects.toThrow();
  });

  it("profil silinince anahtar gider", async () => {
    await db.query(`DELETE FROM public.profiles WHERE id = $1`, ["22222222-2222-4222-8222-222222222222"]);
    const { rows } = await db.query<{ n: number }>(`SELECT count(*)::int AS n FROM public.user_push_tokens`);
    expect(rows[0]!.n).toBe(0);
  });

  it("göç yalnız ekler ve hesap silme listesinde", () => {
    const sql = read(MIGRATION).replace(/--[^\n]*/g, "");
    // Deyim başında yıkıcı komut yok ("ON DELETE CASCADE" bir yabancı anahtar kuralıdır, deyim değil).
    expect(sql).not.toMatch(/^\s*(DROP|DELETE|UPDATE|TRUNCATE)\b/im);
    expect(sql).not.toMatch(/ALTER TABLE (?!public\.user_push_tokens\b)/i);
    expect(read("src/lib/privacy/account-deletion.ts")).toContain('"user_push_tokens"');
  });
});
