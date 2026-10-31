import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest, type NextResponse } from "next/server";

/*
  Hesap paylaşımı koruması (31 Ekim 2026, ürün sahibinin kararı): bir hesap aynı anda en çok 2 cihazda açık kalır.
  Üçüncü cihaz girince yeni cihaz açık kalır, en uzun süredir görünmeyen cihazın oturumu kapanır; yönetici muaf.
  (1) Göç PGlite'ta gerçekten çalışır: sayım, düşürme, auth.sessions silme, {revoked: true}, muafiyet, bitmiş
      oturum, auth.sessions görünmezse ikinci yol, yetkiler.
  (2) Ara katman: imzalı çerezle 5 dakikada bir sorar; her hatada geçirir; yalnız uygulama sayfalarında sorar;
      düşen cihaz girişe "başka cihaz" notuyla gider.
*/

const ssr = vi.hoisted(() => ({
  user: null as { id: string } | null,
  accessToken: null as string | null,
  getSessionThrows: false,
  signOut: vi.fn(async () => ({ error: null })),
}));
function fakeSupabase() {
  return {
    auth: {
      getUser: async () => ({ data: { user: ssr.user } }),
      getSession: async () => {
        if (ssr.getSessionThrows) throw new Error("storage");
        return { data: { session: ssr.accessToken ? { access_token: ssr.accessToken } : null }, error: null };
      },
      signOut: ssr.signOut,
    },
    rpc: async (name: string) => (name === "current_account_active" ? { data: true, error: null } : { data: null, error: null }),
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { primary_role: "student", onboarding_completed_at: "2026-10-01T00:00:00Z", deleted_at: null },
            error: null,
          }),
        }),
      }),
    }),
  };
}
vi.mock("@supabase/ssr", () => ({ createServerClient: () => fakeSupabase() }));

const svc = vi.hoisted(() => ({
  touch: vi.fn(async (_args: Record<string, unknown>): Promise<{ data: unknown; error: unknown }> => ({
    data: { revoked: false, dropped: 0 },
    error: null,
  })),
  lookup: vi.fn(async (_sessionId: string): Promise<{ data: unknown; error: unknown }> => ({ data: null, error: null })),
}));
vi.mock("@supabase/supabase-js", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@supabase/supabase-js")>()),
  createClient: () => ({
    rpc: (_name: string, args: Record<string, unknown>) => ({ abortSignal: () => svc.touch(args) }),
    from: () => ({
      select: () => ({
        eq: (_column: string, id: string) => ({ abortSignal: () => ({ maybeSingle: () => svc.lookup(id) }) }),
      }),
    }),
  }),
}));

import { updateSession } from "@/lib/supabase/middleware";
import {
  DEVICE_CHECK_INTERVAL_MS,
  DEVICE_COOKIE,
  readDeviceCookie,
  sessionIdFromAccessToken,
  signDeviceCookie,
} from "@/lib/auth/device-sessions";
import { DEVICE_LIMIT, OTHER_DEVICE_NOTE, OTHER_DEVICE_PARAM } from "@/lib/auth/device-limit";

const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const MIGRATION = "supabase/migrations/20261031170000_device_sessions.sql";

const STUDENT = "11111111-1111-4111-8111-111111111111";
const PAIR = "22222222-2222-4222-8222-222222222222";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const GONE = "44444444-4444-4444-8444-444444444444";
const BLIND = "55555555-5555-4555-8555-555555555555";
const OLD = "66666666-6666-4666-8666-666666666666";
const session = (user: string, n: number) => `${user.slice(0, 8)}-0000-4000-8000-00000000000${n}`;

/* ------------------------------------------------------------------------------------------------
 * (1) Göç
 * ---------------------------------------------------------------------------------------------- */

describe("cihaz sınırı · göç canlı gibi çalışıyor", () => {
  const db = new PGlite();

  const touch = async (user: string, sid: string) =>
    (
      await db.query<{ r: Record<string, unknown> }>("SELECT public.touch_device_session($1, $2, $3) AS r", [
        user,
        sid,
        "Mozilla/5.0 (Test)",
      ])
    ).rows[0]!.r;
  const signIn = (user: string, sid: string) =>
    db.query("INSERT INTO auth.sessions(id, user_id) VALUES ($1, $2)", [sid, user]);
  /** Cihazın son görülmesini geçmişe çeker: sıra açık olsun, saat çözünürlüğüne bağlı kalmasın. */
  const age = (sid: string, minutes: number) =>
    db.query(
      `UPDATE public.user_device_sessions SET last_seen_at = now() - make_interval(mins => $2),
              created_at = now() - make_interval(mins => $2) WHERE session_id = $1`,
      [sid, minutes],
    );
  const authSessions = async (user: string) =>
    (await db.query<{ id: string }>("SELECT id FROM auth.sessions WHERE user_id = $1 ORDER BY id", [user])).rows.map(
      (row) => row.id,
    );
  const devices = async (user: string) =>
    (
      await db.query<{ session_id: string; revoked: boolean }>(
        `SELECT session_id, revoked_at IS NOT NULL AS revoked FROM public.user_device_sessions
          WHERE user_id = $1 ORDER BY session_id`,
        [user],
      )
    ).rows;

  beforeAll(async () => {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE TABLE auth.sessions(id uuid PRIMARY KEY, user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE);
      CREATE TABLE public.user_roles(user_id uuid NOT NULL, role text NOT NULL, revoked_at timestamptz);
      CREATE FUNCTION public.is_admin(uid uuid) RETURNS boolean LANGUAGE sql STABLE AS $$
        SELECT EXISTS (SELECT 1 FROM public.user_roles WHERE user_id = uid AND role = 'admin' AND revoked_at IS NULL)
      $$;`);
    for (const user of [STUDENT, PAIR, ADMIN, GONE, BLIND, OLD]) {
      await db.query("INSERT INTO auth.users(id) VALUES ($1)", [user]);
    }
    await db.query("INSERT INTO public.user_roles(user_id, role) VALUES ($1, 'admin')", [ADMIN]);
    await db.exec(read(MIGRATION));
  }, 30_000);
  afterAll(() => db.close());

  it("üçüncü cihaz: en uzun süredir görünmeyen düşer, Supabase oturumu silinir; yeni ve son görülen kalır", async () => {
    const [a, b, c] = [session(STUDENT, 1), session(STUDENT, 2), session(STUDENT, 3)];
    await signIn(STUDENT, a);
    expect(await touch(STUDENT, a)).toEqual({ revoked: false, dropped: 0 });
    await age(a, 120);
    await signIn(STUDENT, b);
    expect(await touch(STUDENT, b)).toEqual({ revoked: false, dropped: 0 });
    await age(b, 60);

    await signIn(STUDENT, c);
    expect(await touch(STUDENT, c)).toEqual({ revoked: false, dropped: 1 });
    expect(await devices(STUDENT)).toEqual([
      { session_id: a, revoked: true },
      { session_id: b, revoked: false },
      { session_id: c, revoked: false },
    ]);
    // Yenileme jetonu oturumla ölür: düşen cihaz bir sonraki getUser'da "kullanıcı yok" alır.
    expect(await authSessions(STUDENT)).toEqual([b, c]);
  });

  it("düşen oturum bir sonraki soruda {revoked: true} alır; kalan cihazlar dokunulmaz", async () => {
    const [a, b, c] = [session(STUDENT, 1), session(STUDENT, 2), session(STUDENT, 3)];
    expect(await touch(STUDENT, a)).toEqual({ revoked: true });
    expect(await touch(STUDENT, b)).toEqual({ revoked: false, dropped: 0 });
    expect(await touch(STUDENT, c)).toEqual({ revoked: false, dropped: 0 });
    expect(await authSessions(STUDENT)).toEqual([b, c]);
  });

  it("aynı anda iki cihaz (bilgisayar + telefon) ne kadar sorulursa sorulsun düşmez", async () => {
    const [pc, phone] = [session(PAIR, 1), session(PAIR, 2)];
    await signIn(PAIR, pc);
    await signIn(PAIR, phone);
    for (let round = 0; round < 3; round += 1) {
      expect(await touch(PAIR, pc)).toEqual({ revoked: false, dropped: 0 });
      expect(await touch(PAIR, phone)).toEqual({ revoked: false, dropped: 0 });
    }
    expect((await devices(PAIR)).every((row) => !row.revoked)).toBe(true);
    expect(await authSessions(PAIR)).toEqual([pc, phone]);
  });

  it("yönetici (kurucu) muaf: üç cihaz da açık kalır", async () => {
    const ids = [1, 2, 3, 4].map((n) => session(ADMIN, n));
    for (const [index, sid] of ids.entries()) {
      await signIn(ADMIN, sid);
      expect(await touch(ADMIN, sid)).toEqual({ revoked: false, exempt: true });
      await age(sid, 100 - index * 10);
    }
    expect((await devices(ADMIN)).every((row) => !row.revoked)).toBe(true);
    expect(await authSessions(ADMIN)).toEqual(ids);
  });

  it("çıkış yapılmış oturum cihaz sayılmaz: aynı bilgisayarda çıkıp yeniden giren öğrencinin telefonu kalır", async () => {
    const [oldPc, phone, newPc] = [session(GONE, 1), session(GONE, 2), session(GONE, 3)];
    await signIn(GONE, phone);
    await touch(GONE, phone);
    await age(phone, 90);
    await signIn(GONE, oldPc);
    await touch(GONE, oldPc);
    // Çıkış (scope: local) Supabase oturumunu siler; bizim satır "görülmüş" kalır.
    await db.query("DELETE FROM auth.sessions WHERE id = $1", [oldPc]);
    await signIn(GONE, newPc);
    expect(await touch(GONE, newPc)).toEqual({ revoked: false, dropped: 0 });
    expect(await devices(GONE)).toEqual([
      { session_id: phone, revoked: false },
      { session_id: newPc, revoked: false },
    ]);
    expect(await authSessions(GONE)).toEqual([phone, newPc]);
  });

  it("auth.sessions bu oturumu göstermiyorsa (satır güvenliği vb.) yalnız kendi kayıtlarımızla sayılır; ikinci yol çalışır", async () => {
    const [x, y, z] = [session(BLIND, 1), session(BLIND, 2), session(BLIND, 3)];
    await signIn(BLIND, x);
    await touch(BLIND, x);
    await age(x, 120);
    await signIn(BLIND, y);
    await touch(BLIND, y);
    await age(y, 60);
    // z'nin Supabase satırı "görünmüyor": tabloya güvenilmez, ölü oturum temizliği ve silme yapılmaz.
    expect(await touch(BLIND, z)).toEqual({ revoked: false, dropped: 1 });
    expect(await authSessions(BLIND)).toEqual([x, y]);
    // Düşen cihaz bir sonraki soruda çıkış yapar (ara katman signOut local).
    expect(await touch(BLIND, x)).toEqual({ revoked: true });
  });

  it("30 gündür görünmeyen cihaz sayılmaz ve silinir; düşürülen satır 30 gün sonra temizlenir", async () => {
    const [stale, oldRevoked, current] = [session(OLD, 1), session(OLD, 2), session(OLD, 3)];
    await signIn(OLD, stale);
    await touch(OLD, stale);
    await age(stale, 31 * 24 * 60);
    await db.query(
      `INSERT INTO public.user_device_sessions(session_id, user_id, last_seen_at, revoked_at)
       VALUES ($1, $2, now() - interval '40 days', now() - interval '31 days')`,
      [oldRevoked, OLD],
    );
    await signIn(OLD, current);
    expect(await touch(OLD, current)).toEqual({ revoked: false, dropped: 0 });
    expect(await devices(OLD)).toEqual([{ session_id: current, revoked: false }]);
  });

  it("başka hesabın oturum kimliği: dokunulmaz, kimse düşmez", async () => {
    const b = session(STUDENT, 2);
    expect(await touch(PAIR, b)).toEqual({ revoked: false, skipped: true });
    expect(await devices(STUDENT)).toContainEqual({ session_id: b, revoked: false });
  });

  it("yalnız service_role çağırır; tablo satır güvenlikli, politikasız; hesap silinince satırlar gider", async () => {
    const can = async (role: string) =>
      (
        await db.query<{ allowed: boolean }>(
          `SELECT has_function_privilege('${role}', 'public.touch_device_session(uuid,uuid,text)', 'EXECUTE') AS allowed`,
        )
      ).rows[0]!.allowed;
    expect(await can("anon")).toBe(false);
    expect(await can("authenticated")).toBe(false);
    expect(await can("service_role")).toBe(true);
    const table = await db.query<{ rls: boolean }>(
      "SELECT relrowsecurity AS rls FROM pg_class WHERE relname = 'user_device_sessions'",
    );
    expect(table.rows[0]!.rls).toBe(true);
    expect((await db.query("SELECT 1 FROM pg_policies WHERE tablename = 'user_device_sessions'")).rows).toHaveLength(0);
    const readable = await db.query<{ allowed: boolean }>(
      "SELECT has_table_privilege('authenticated', 'public.user_device_sessions', 'SELECT') AS allowed",
    );
    expect(readable.rows[0]!.allowed).toBe(false);

    await db.query("DELETE FROM auth.users WHERE id = $1", [PAIR]);
    expect(await devices(PAIR)).toEqual([]);
  });

  it("göç ikinci kez çalışır; yıkıcı komut yok; kullanıcı başına kilit; sınır sayısı metinle aynı", async () => {
    await db.exec(read(MIGRATION));
    const sql = read(MIGRATION);
    const body = sql
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(body).not.toMatch(/\bDROP\b/);
    expect(body).toContain("pg_advisory_xact_lock(hashtext('user_device_sessions:' || p_user_id::text))");
    expect(body).toContain("SECURITY DEFINER");
    expect(body).toContain("SET search_path = public, pg_temp");
    expect(body).toContain("REVOKE ALL ON FUNCTION public.touch_device_session(uuid, uuid, text) FROM PUBLIC, anon, authenticated;");
    expect(body).toContain("GRANT EXECUTE ON FUNCTION public.touch_device_session(uuid, uuid, text) TO service_role;");
    expect(body.match(/v_keep CONSTANT integer := (\d+)/)?.[1]).toBe(String(DEVICE_LIMIT));
  });
});

/* ------------------------------------------------------------------------------------------------
 * (2) Ara katman
 * ---------------------------------------------------------------------------------------------- */

const SECRET = "test-app-secret";
const USER = "77777777-7777-4777-8777-777777777777";
const SID = "88888888-8888-4888-8888-888888888888";
const OTHER_SID = "99999999-9999-4999-8999-999999999999";
const jwt = (claims: Record<string, unknown>) =>
  `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.imza`;

function request(path: string, init: { cookie?: string; headers?: Record<string, string> } = {}) {
  return new NextRequest(`https://cortexplus.app${path}`, {
    headers: {
      "user-agent": "Mozilla/5.0 (Test)",
      ...(init.cookie ? { cookie: `${DEVICE_COOKIE}=${init.cookie}` } : {}),
      ...init.headers,
    },
  });
}

describe("cihaz sınırı · yardımcılar", () => {
  it("oturum kimliği erişim jetonunun session_id iddiasından; bozuk jeton ya da kimlik yoksa null", () => {
    expect(sessionIdFromAccessToken(jwt({ sub: USER, session_id: SID }))).toBe(SID);
    expect(sessionIdFromAccessToken(jwt({ sub: USER, session_id: SID.toUpperCase() }))).toBe(SID);
    expect(sessionIdFromAccessToken(jwt({ sub: USER }))).toBeNull();
    expect(sessionIdFromAccessToken(jwt({ session_id: "'; drop table" }))).toBeNull();
    expect(sessionIdFromAccessToken("bozuk")).toBeNull();
    expect(sessionIdFromAccessToken("a.@@@.b")).toBeNull();
    expect(sessionIdFromAccessToken(null)).toBeNull();
  });

  it("çerez imzalı: oturum, zaman ya da imza değişirse yok sayılır; başka sırla okunmaz", async () => {
    const value = await signDeviceCookie(SID, 1_000, SECRET);
    expect(await readDeviceCookie(value, SECRET)).toEqual({ sessionId: SID, checkedAt: 1_000 });
    const [, , signature] = value.split(".");
    expect(await readDeviceCookie(`${OTHER_SID}.1000.${signature}`, SECRET)).toBeNull();
    expect(await readDeviceCookie(`${SID}.9999999999999.${signature}`, SECRET)).toBeNull();
    expect(await readDeviceCookie(`${SID}.1000.${"0".repeat(64)}`, SECRET)).toBeNull();
    expect(await readDeviceCookie(value, "baska-sir")).toBeNull();
    expect(await readDeviceCookie(`${value}.fazla`, SECRET)).toBeNull();
    expect(await readDeviceCookie("", SECRET)).toBeNull();
  });

  it("giriş notu: ürün sahibinin onayladığı metin, sınır sayısı tek kaynaktan", () => {
    expect(OTHER_DEVICE_PARAM).toBe("baska-cihaz");
    expect(OTHER_DEVICE_NOTE).toBe(
      "Hesabın başka bir cihazda açıldığı için bu cihazdaki oturum kapandı. Bir hesap aynı anda en çok 2 cihazda açık kalır.",
    );
  });
});

describe("cihaz sınırı · ara katman", () => {
  const savedEnv = { ...process.env };
  let warn: ReturnType<typeof vi.spyOn>;

  beforeAll(() => {
    process.env.NEXT_PUBLIC_SUPABASE_URL = "https://ornek.supabase.co";
    process.env.SUPABASE_SECRET_KEY = "test-service-key";
    process.env.APP_SECRET = SECRET;
  });
  afterAll(() => {
    for (const key of ["NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_SECRET_KEY", "APP_SECRET"]) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
  });
  beforeEach(() => {
    ssr.user = { id: USER };
    ssr.accessToken = jwt({ sub: USER, session_id: SID });
    ssr.getSessionThrows = false;
    ssr.signOut.mockClear();
    svc.touch.mockReset();
    svc.touch.mockResolvedValue({ data: { revoked: false, dropped: 0 }, error: null });
    svc.lookup.mockReset();
    svc.lookup.mockResolvedValue({ data: null, error: null });
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  const deviceCookie = (response: NextResponse) => response.cookies.get(DEVICE_COOKIE);

  it("ilk uygulama sayfası sorar ve imzalı, httpOnly çerez yazar; ikinci istek sormaz", async () => {
    const first = await updateSession(request("/ogretmen"));
    expect(first.status).toBe(200);
    expect(svc.touch).toHaveBeenCalledTimes(1);
    expect(svc.touch).toHaveBeenCalledWith({ p_user_id: USER, p_session_id: SID, p_user_agent: "Mozilla/5.0 (Test)" });
    const cookie = deviceCookie(first)!;
    expect(cookie.httpOnly).toBe(true);
    expect(cookie.value.startsWith(`${SID}.`)).toBe(true);
    expect(await readDeviceCookie(cookie.value, SECRET)).toMatchObject({ sessionId: SID });

    const second = await updateSession(request("/deneme-sinavlari", { cookie: cookie.value }));
    expect(second.status).toBe(200);
    expect(svc.touch).toHaveBeenCalledTimes(1);
    expect(deviceCookie(second)).toBeUndefined();
  });

  it("çerez 5 dakikadan eskiyse, başka oturumunsa ya da imzası tutmuyorsa yeniden sorar", async () => {
    const stale = await signDeviceCookie(SID, Date.now() - DEVICE_CHECK_INTERVAL_MS - 1_000, SECRET);
    await updateSession(request("/ogretmen", { cookie: stale }));
    expect(svc.touch).toHaveBeenCalledTimes(1);

    const otherSession = await signDeviceCookie(OTHER_SID, Date.now(), SECRET);
    await updateSession(request("/ogretmen", { cookie: otherSession }));
    expect(svc.touch).toHaveBeenCalledTimes(2);

    // Elle yazılmış "uzak gelecekte soruldu" çerezi: imza tutmaz, sorulur.
    await updateSession(request("/ogretmen", { cookie: `${SID}.9999999999999.${"a".repeat(64)}` }));
    expect(svc.touch).toHaveBeenCalledTimes(3);

    const fresh = await signDeviceCookie(SID, Date.now() - 60_000, SECRET);
    await updateSession(request("/ogretmen", { cookie: fresh }));
    expect(svc.touch).toHaveBeenCalledTimes(3);
  });

  it("düşürülmüş oturum: bu cihazda çıkış, girişe notla ve kaldığı yerle; çerez silinir", async () => {
    svc.touch.mockResolvedValue({ data: { revoked: true }, error: null });
    const response = await updateSession(request("/deneme-sinavlari/abc?sekme=yol"));
    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.pathname).toBe("/giris");
    expect(location.searchParams.get("oturum")).toBe("baska-cihaz");
    expect(location.searchParams.get("next")).toBe("/deneme-sinavlari/abc?sekme=yol");
    expect(ssr.signOut).toHaveBeenCalledWith({ scope: "local" });
    expect(deviceCookie(response)?.value).toBe("");
    expect(response.headers.get("set-cookie")).toMatch(/cp_device=;.*Max-Age=0/i);
  });

  it("her hatada geçirir: RPC yok (göç uygulanmadı), RPC atar, oturum okunamaz, anahtar yok", async () => {
    svc.touch.mockResolvedValue({ data: null, error: { code: "PGRST202", message: "Could not find the function" } });
    const missing = await updateSession(request("/ogretmen"));
    expect(missing.status).toBe(200);
    expect(warn).toHaveBeenCalledWith("device_session_unavailable", { code: "PGRST202" });
    // Hata sürerken her istek beklemesin: çerez yine yazılır, 5 dakika sonra yeniden denenir.
    expect(deviceCookie(missing)?.value.startsWith(`${SID}.`)).toBe(true);

    svc.touch.mockRejectedValue(new Error("network"));
    expect((await updateSession(request("/ogretmen"))).status).toBe(200);

    svc.touch.mockReset();
    ssr.getSessionThrows = true;
    const noSession = await updateSession(request("/ogretmen"));
    expect(noSession.status).toBe(200);
    expect(svc.touch).not.toHaveBeenCalled();

    ssr.getSessionThrows = false;
    ssr.accessToken = jwt({ sub: USER });
    expect((await updateSession(request("/ogretmen"))).status).toBe(200);
    expect(svc.touch).not.toHaveBeenCalled();

    ssr.accessToken = jwt({ sub: USER, session_id: SID });
    delete process.env.APP_SECRET;
    delete process.env.SUPABASE_SECRET_KEY;
    try {
      expect((await updateSession(request("/ogretmen"))).status).toBe(200);
      expect(svc.touch).not.toHaveBeenCalled();
    } finally {
      process.env.APP_SECRET = SECRET;
      process.env.SUPABASE_SECRET_KEY = "test-service-key";
    }
    expect(ssr.signOut).not.toHaveBeenCalled();
  });

  it("yalnız uygulama sayfaları: API, cron, auth dönüşü, pazarlama, ana sayfa ve önceden getirme sorulmaz", async () => {
    for (const path of ["/api/learning/exam-prep/node", "/api/cron/subscription-renewal", "/auth/callback", "/fiyatlandirma", "/kvkk"]) {
      await updateSession(request(path));
    }
    const home = await updateSession(request("/"));
    expect(home.status).toBe(307);
    await updateSession(request("/ogretmen", { headers: { "next-router-prefetch": "1" } }));
    await updateSession(request("/ogretmen", { headers: { purpose: "prefetch" } }));
    expect(svc.touch).not.toHaveBeenCalled();
    expect(svc.lookup).not.toHaveBeenCalled();
  });

  it("oturumsuz: çerezdeki oturum cihaz sınırıyla düştüyse girişe notla; değilse düz giriş ve çerez silinir", async () => {
    ssr.user = null;
    ssr.accessToken = null;
    const cookie = await signDeviceCookie(SID, Date.now() - 60_000, SECRET);

    svc.lookup.mockResolvedValue({ data: { revoked_at: "2026-10-31T10:00:00Z" }, error: null });
    const kicked = await updateSession(request("/sohbetler", { cookie }));
    expect(svc.lookup).toHaveBeenCalledWith(SID);
    const location = new URL(kicked.headers.get("location")!);
    expect(location.pathname).toBe("/giris");
    expect(location.searchParams.get("oturum")).toBe("baska-cihaz");
    expect(location.searchParams.get("next")).toBe("/sohbetler");
    expect(deviceCookie(kicked)?.value).toBe("");

    // Ana sayfadan açan (telefonda ana ekran simgesi "/") da notu görür; kaldığı yer yok.
    const fromHome = await updateSession(request("/", { cookie }));
    const homeLocation = new URL(fromHome.headers.get("location")!);
    expect(homeLocation.searchParams.get("oturum")).toBe("baska-cihaz");
    expect(homeLocation.searchParams.has("next")).toBe(false);

    svc.lookup.mockResolvedValue({ data: { revoked_at: null }, error: null });
    const loggedOut = await updateSession(request("/sohbetler", { cookie }));
    expect(new URL(loggedOut.headers.get("location")!).searchParams.has("oturum")).toBe(false);
    expect(deviceCookie(loggedOut)?.value).toBe("");

    svc.lookup.mockResolvedValue({ data: null, error: { code: "08006" } });
    const down = await updateSession(request("/sohbetler", { cookie }));
    expect(down.status).toBe(307);
    expect(new URL(down.headers.get("location")!).searchParams.has("oturum")).toBe(false);
    expect(deviceCookie(down)?.value).toBe("");

    // İmzası tutmayan çerez veritabanına hiç sorulmaz.
    svc.lookup.mockClear();
    await updateSession(request("/sohbetler", { cookie: `${SID}.1.${"b".repeat(64)}` }));
    expect(svc.lookup).not.toHaveBeenCalled();
  });

  it("oturumsuz: çerez yoksa, pazarlama sayfasındaysa ya da önceden getirmeyse sorulmaz (not asıl gezinmeye kalır)", async () => {
    ssr.user = null;
    ssr.accessToken = null;
    const cookie = await signDeviceCookie(SID, Date.now(), SECRET);
    await updateSession(request("/sohbetler"));
    await updateSession(request("/fiyatlandirma", { cookie }));
    const prefetch = await updateSession(request("/sohbetler", { cookie, headers: { "next-router-prefetch": "1" } }));
    expect(deviceCookie(prefetch)).toBeUndefined();
    expect(svc.lookup).not.toHaveBeenCalled();
  });
});

/* ------------------------------------------------------------------------------------------------
 * Kablolama
 * ---------------------------------------------------------------------------------------------- */

describe("cihaz sınırı · kablolama", () => {
  it("giriş sayfası notu gösterir; çıkış çerezi siler ve yalnız bu cihazdan çıkar; hesap silme satırları siler", () => {
    const giris = read("src/app/giris/giris-inner.tsx");
    expect(giris).toContain('params.get("oturum") === OTHER_DEVICE_PARAM');
    expect(giris).toContain("{OTHER_DEVICE_NOTE}");
    const signout = read("src/app/api/auth/signout/route.ts");
    expect(signout).toContain('signOut({ scope: "local" })');
    expect(signout).toContain("set(DEVICE_COOKIE, \"\", { path: \"/\", maxAge: 0 })");
    const deletion = read("src/lib/privacy/account-deletion.ts");
    expect(deletion).toContain('"user_device_sessions",');
    expect(deletion).toMatch(/OPTIONAL_PURGE_TABLES = new Set\(\[[^\]]*"user_device_sessions"/);
  });

  it("ara katman: oturumlu soru hesap durumundan sonra ve yalnız korumalı yolda; kenar ortamında node:crypto yok", () => {
    const mw = read("src/lib/supabase/middleware.ts");
    expect(mw).toMatch(/if \(active === false\)[\s\S]*if \(isProtected\) \{\s*const gate = await checkSignedInDevice/);
    expect(mw).toContain("if (!user && (isProtected || path === \"/\"))");
    const helper = read("src/lib/auth/device-sessions.ts");
    expect(helper).not.toMatch(/from "(node:)?crypto"/);
    expect(helper).toContain("crypto.subtle");
    expect(helper).toContain("abortSignal(timeoutSignal(DEVICE_CHECK_TIMEOUT_MS))");
  });
});
