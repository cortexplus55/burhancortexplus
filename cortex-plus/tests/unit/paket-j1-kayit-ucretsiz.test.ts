import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

/*
  Paket J1 (31 Ekim 2026, ürün sahibinin kararları):
   #1 "Hemen gir, içeride onayla": kayıt sunucuda açılır (doğrulama ekranı yok), doğrulanmamışlık
      `app_metadata.email_unverified` ile taşınır; davet hediyesi yalnız doğrulanınca (SQL account_verified).
   #2 Kayıt sihirbazı 3 adım: sınıf + hedef sınav, anlatım tarzı, hesap.
   #3 İlk doz bedava: ücretsizde ilk hazırlığın 1. konusu tam açık, 25 sayfa; 2. konu ve final adımları Plus ekranı.
*/

const h = vi.hoisted(() => {
  process.env.APP_SECRET = "test-secret-for-j1";
  return {
    created: [] as Record<string, unknown>[],
    updated: [] as { id: string; attrs: Record<string, unknown> }[],
    users: new Map<string, { id: string; email: string; app_metadata: Record<string, unknown>; user_metadata: Record<string, unknown> }>(),
    aliasTaken: false,
    blocked: [] as string[],
    createError: null as null | { message: string; status?: number },
    afterJobs: [] as (() => unknown)[],
    mails: [] as { to: string; url: string }[],
  };
});

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (job: () => unknown) => {
    h.afterJobs.push(job);
  },
}));
vi.mock("@/lib/api/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/guards")>()),
  guestLimit: async () => null,
}));
vi.mock("@/lib/email/mailer", () => ({
  sendVerifyEmail: vi.fn(async (input: { to: string; url: string }) => {
    h.mails.push({ to: input.to, url: input.url });
    return { ok: true };
  }),
}));
vi.mock("@/lib/supabase/server", () => {
  const service = {
    from: (table: string) => {
      const builder = {
        select: () => builder,
        eq: (_col: string, value: unknown) => {
          (builder as { value?: unknown }).value = value;
          return builder;
        },
        limit: async () => ({
          data: table === "blocked_email_domains" && h.blocked.includes(String((builder as { value?: unknown }).value)) ? [{ domain: "x" }] : [],
          error: null,
        }),
      };
      return builder;
    },
    rpc: async (name: string) => (name === "email_alias_taken" ? { data: h.aliasTaken, error: null } : { data: null, error: null }),
    auth: {
      admin: {
        createUser: async (attrs: Record<string, unknown>) => {
          if (h.createError) return { data: { user: null }, error: h.createError };
          h.created.push(attrs);
          const user = {
            id: "11111111-2222-4333-8444-555555555555",
            email: String(attrs.email),
            app_metadata: attrs.app_metadata as Record<string, unknown>,
            user_metadata: attrs.user_metadata as Record<string, unknown>,
          };
          h.users.set(user.id, user);
          return { data: { user }, error: null };
        },
        getUserById: async (id: string) => ({ data: { user: h.users.get(id) ?? null }, error: null }),
        updateUserById: async (id: string, attrs: Record<string, unknown>) => {
          h.updated.push({ id, attrs });
          const user = h.users.get(id);
          if (user && attrs.app_metadata) user.app_metadata = attrs.app_metadata as Record<string, unknown>;
          return { data: { user }, error: null };
        },
      },
    },
  };
  return { createServiceClient: () => service, createClient: async () => service };
});

const read = (path: string) => readFileSync(path, "utf8");

function signupRequest(body: Record<string, unknown>) {
  return new Request("https://cortexplus.app/api/auth/signup", {
    method: "POST",
    headers: { "content-type": "application/json", "x-forwarded-for": "10.1.1.1" },
    body: JSON.stringify(body),
  });
}

const VALID = {
  email: "Ayse.Yilmaz@okul.edu.tr",
  password: "Guvenli2026",
  fullName: "Ayşe Yılmaz",
  gradeLevel: "12. sınıf",
  learningGoal: "YKS hazırlık",
  tutorStyle: "step_by_step",
  consentAcceptedAt: "2026-10-31T10:00:00.000Z",
  referralCode: "ABC123",
};

beforeEach(() => {
  h.created.length = 0;
  h.updated.length = 0;
  h.afterJobs.length = 0;
  h.mails.length = 0;
  h.users.clear();
  h.aliasTaken = false;
  h.blocked = [];
  h.createError = null;
});

describe("#1 hemen gir, içeride onayla", () => {
  it("imzalı bağlantı: kullanıcı ve e-postaya bağlı, 7 gün, kurcalanınca geçersiz", async () => {
    const { verifyEmailToken, readEmailToken, tokenMatchesEmail, VERIFY_TTL_MS } = await import("@/lib/auth/email-verification");
    const now = Date.UTC(2026, 9, 31);
    const token = verifyEmailToken("11111111-2222-4333-8444-555555555555", "Ayse@Okul.edu.tr", now)!;
    expect(token).not.toContain("ayse");
    const parsed = readEmailToken(token, now + 1000)!;
    expect(parsed.userId).toBe("11111111-2222-4333-8444-555555555555");
    expect(tokenMatchesEmail(parsed, "ayse@okul.edu.tr")).toBe(true);
    expect(tokenMatchesEmail(parsed, "baska@okul.edu.tr")).toBe(false);
    expect(readEmailToken(token, now + VERIFY_TTL_MS + 1)).toBeNull();
    expect(readEmailToken(`${token.slice(0, -2)}00`, now)).toBeNull();
    expect(readEmailToken("bozuk", now)).toBeNull();
  });

  it("kayıt ucu hesabı doğrulama beklemeden açar; bayrak sunucuda; doğrulama e-postası arkadan", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    const response = await POST(signupRequest(VALID));
    expect(response.status).toBe(200);
    expect(h.created).toHaveLength(1);
    const attrs = h.created[0]!;
    expect(attrs).toMatchObject({ email: "ayse.yilmaz@okul.edu.tr", email_confirm: true, app_metadata: { email_unverified: true } });
    expect(attrs.user_metadata).toMatchObject({ full_name: "Ayşe Yılmaz", grade_level: "12. sınıf", learning_goal: "YKS hazırlık", referral_code: "ABC123" });
    expect(h.mails).toHaveLength(0);
    await Promise.all(h.afterJobs.map((job) => job()));
    expect(h.mails).toHaveLength(1);
    expect(h.mails[0]!.url).toContain("/api/auth/eposta-dogrula?t=");
  });

  it("kapı sunucuda: zayıf şifre, tek kullanımlık adres, aynı Gmail kutusu, kayıtlı adres; düşen uç eski yola", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    expect((await POST(signupRequest({ ...VALID, password: "kisa" }))).status).toBe(400);
    expect((await POST(signupRequest({ ...VALID, email: "a@mailinator.com" }))).status).toBe(400);
    h.blocked = ["yeni-gecici.io"];
    expect((await POST(signupRequest({ ...VALID, email: "a@yeni-gecici.io" }))).status).toBe(400);
    h.aliasTaken = true;
    expect((await POST(signupRequest({ ...VALID, email: "ali.veli+2@gmail.com" }))).status).toBe(409);
    h.aliasTaken = false;
    h.createError = { message: "A user with this email address has already been registered", status: 422 };
    expect((await POST(signupRequest(VALID))).status).toBe(409);
    h.createError = { message: "Database error", status: 500 };
    const down = await POST(signupRequest(VALID));
    expect(down.status).toBe(503);
    expect(await down.json()).toMatchObject({ fallback: true });
  });

  it("doğrulama bağlantısı bayrağı kaldırır (öbür alanlar kalır); bozuk bağlantı 'geçersiz'", async () => {
    const { POST } = await import("@/app/api/auth/signup/route");
    await POST(signupRequest(VALID));
    await Promise.all(h.afterJobs.map((job) => job()));
    const url = new URL(h.mails[0]!.url);
    const user = [...h.users.values()][0]!;
    user.app_metadata = { ...user.app_metadata, provider: "email", providers: ["email"] };
    const { GET } = await import("@/app/api/auth/eposta-dogrula/route");
    const ok = await GET(new Request(`https://cortexplus.app/api/auth/eposta-dogrula${url.search}`));
    expect(ok.headers.get("location")).toBe("https://cortexplus.app/dashboard?eposta=dogrulandi");
    expect(user.app_metadata).toEqual({ email_unverified: false, provider: "email", providers: ["email"] });
    const bad = await GET(new Request("https://cortexplus.app/api/auth/eposta-dogrula?t=bozuk"));
    expect(bad.headers.get("location")).toBe("https://cortexplus.app/dashboard?eposta=gecersiz");
  });

  it("sihirbaz önce sunucu kaydı + şifreyle giriş; düşerse eski yol; şerit kabukta; Google ile girilince şifre değişir", () => {
    const wizard = read("src/app/kayit/signup-wizard.tsx");
    expect(wizard).toContain('await fetch("/api/auth/signup"');
    expect(wizard).toContain("await createClient().auth.signInWithPassword({ email, password })");
    expect(wizard.indexOf('fetch("/api/auth/signup"')).toBeLessThan(wizard.indexOf("supabase.auth.signUp("));
    expect(wizard).toContain("if (response.status >= 500 || body.fallback)");
    expect(read("src/components/parity/sor-shell.tsx")).toContain('{chrome === "session" ? null : <EmailVerifyBanner />}');
    const banner = read("src/components/auth/email-verify-banner.tsx");
    expect(banner).toContain("📩 Hesabını güvenceye almak için e-postanı doğrula.");
    // Kabukta Suspense istemesin: adres window'dan okunur (yalnız açıklamada anılır).
    expect(banner).not.toMatch(/import \{[^}]*useSearchParams/);
    const callback = read("src/app/auth/callback/route.ts");
    expect(callback).toContain('providers.includes("google")');
    expect(callback).toContain("password: randomBytes(24).toString(\"base64url\")");
  });
});

describe("#1 SQL: doğrulanmamış hesap davet hediyesi almaz", () => {
  const db = new PGlite();
  const FLAGGED = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const VERIFIED = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
  const OLD = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

  beforeAll(async () => {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, email_confirmed_at timestamptz, raw_app_meta_data jsonb);
      CREATE TABLE public.profiles (id uuid PRIMARY KEY, created_at timestamptz NOT NULL);
      CREATE TABLE public.blocked_email_domains (domain text PRIMARY KEY);
      CREATE FUNCTION public.account_grandfathered(p_user_id uuid) RETURNS boolean LANGUAGE sql AS $$
        SELECT COALESCE((SELECT created_at < timestamptz '2026-09-05 00:00:00+00' FROM public.profiles WHERE id = p_user_id), false) $$;`);
    await db.query(
      `INSERT INTO auth.users VALUES ($1, 'a@okul.edu.tr', now(), '{"email_unverified": true}'),
         ($2, 'b@okul.edu.tr', now(), '{"email_unverified": false, "provider": "email"}'),
         ($3, 'c@okul.edu.tr', NULL, '{}')`,
      [FLAGGED, VERIFIED, OLD],
    );
    await db.query(`INSERT INTO public.profiles VALUES ($1, '2026-10-31'), ($2, '2026-10-31'), ($3, '2026-09-01')`, [FLAGGED, VERIFIED, OLD]);
    await db.exec(read("supabase/migrations/20261031180000_instant_signup_verified.sql"));
  });

  afterAll(async () => {
    await db.close();
  });

  it("bayraklı hesap doğrulanmamış, bayrağı kalkmış hesap doğrulanmış, eski hesap aynen", async () => {
    const verified = async (id: string) => (await db.query<{ v: boolean }>("SELECT public.account_verified($1) AS v", [id])).rows[0]!.v;
    expect(await verified(FLAGGED)).toBe(false);
    expect(await verified(VERIFIED)).toBe(true);
    expect(await verified(OLD)).toBe(true);
    const sql = read("supabase/migrations/20261031180000_instant_signup_verified.sql").replace(/^--.*$/gm, "");
    expect(sql).not.toMatch(/\bDROP\b/);
  });
});

describe("#2 kayıt sihirbazı 3 adım", () => {
  it("sınıf + hedef sınav, anlatım tarzı, hesap; avatar ve odak ders adımı yok, varsayılan avatar", async () => {
    const { STUDENT_SIGNUP_STEPS, AVATAR_OPTIONS } = await import("@/lib/parity/signup");
    expect([...STUDENT_SIGNUP_STEPS]).toEqual(["level", "tutor-style", "account"]);
    const wizard = read("src/app/kayit/signup-wizard.tsx");
    expect(wizard).not.toContain('step === "avatar"');
    expect(wizard).not.toContain('step === "subject"');
    expect(wizard).toContain("disabled={!draft.gradeLevel || !draft.learningGoal}");
    expect(wizard).toContain("avatarEmoji: draft.avatarEmoji ?? AVATAR_OPTIONS[0]");
    expect(AVATAR_OPTIONS.length).toBeGreaterThan(0);
  });
});

describe("#3 ilk doz bedava", () => {
  type Row = Record<string, unknown>;
  function fakeService(input: { premium?: boolean; topics: Row[]; nodes: Row[]; attempts?: Row[] }) {
    return {
      rpc: async () => ({ data: false, error: null }),
      from: (table: string) => {
        const filters: ((row: Row) => boolean)[] = [];
        let head = false;
        const rows = () => {
          const source =
            table === "exam_prep_topics" ? input.topics :
            table === "exam_prep_nodes" ? input.nodes :
            table === "exam_prep_node_attempts" ? (input.attempts ?? []) :
            table === "subscriptions" && input.premium ? [{ status: "active", current_period_end: null, plans: { is_premium: true, tier: "plus", name: "Plus", slug: "plus-aylik", monthly_allowance: 7200 } }] :
            [];
          return source.filter((row) => filters.every((f) => f(row)));
        };
        const builder: Record<string, unknown> = {
          select: (_c: string, opts?: { head?: boolean }) => {
            head = Boolean(opts?.head);
            return builder;
          },
          eq: (col: string, value: unknown) => {
            filters.push((row) => row[col] === undefined || row[col] === value);
            return builder;
          },
          in: (col: string, values: unknown[]) => {
            filters.push((row) => values.includes(row[col]));
            return builder;
          },
          or: () => builder,
          order: () => builder,
          limit: () => builder,
          maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
          then: (resolve: (value: unknown) => void) => {
            const hit = rows();
            resolve({ data: head ? null : hit, count: hit.length, error: null });
          },
        };
        return builder;
      },
    };
  }
  const topics = [
    { id: "t1", label: "Hücre Bölünmesi", document_topic_node_id: "dtn1", exam_prep_id: "p" },
    { id: "t2", label: "Kalıtım", document_topic_node_id: "dtn2", exam_prep_id: "p" },
  ];
  const nodes = [
    { id: "n1", kind: "lesson", status: "done", session_meta: { topicId: "dtn1" }, exam_prep_id: "p" },
    { id: "n2", kind: "quiz", status: "done", session_meta: { topicId: "dtn1" }, exam_prep_id: "p" },
    { id: "n3", kind: "lesson", status: "ready", session_meta: { topicId: "dtn2" }, exam_prep_id: "p" },
    { id: "n4", kind: "final_check", status: "locked", session_meta: { topicId: "dtn1" }, exam_prep_id: "p" },
  ];
  const attempts = [{ node_id: "n2", user_id: "u", status: "completed", score: 4, total: 5 }];
  const base = { userId: "u", prepId: "p", requestedTopicLabel: null };

  it("1. konu açık; 2. konu ve final adımı kilitli, kazanımlarla; Plus ve açılmış adım muaf", async () => {
    const { freeTopicGate } = await import("@/lib/billing/free-topic-gate");
    const free = fakeService({ topics, nodes, attempts }) as never;
    expect(await freeTopicGate(free, { ...base, nodeId: "n1", nodeTopicId: "dtn1", prepWide: false })).toBeNull();
    const locked = await freeTopicGate(free, { ...base, nodeId: "n3", nodeTopicId: "dtn2", prepWide: false });
    expect(locked).toEqual({ title: "Hücre Bölünmesi", done: 2, total: 3, lessonsDone: 1, bestScore: 80, completed: false });
    // Final adımı 1. konuyu devralmış olsa da hazırlık genelidir: kilitli; öğrenci 1. konuyu seçtiyse açık.
    expect(await freeTopicGate(free, { ...base, nodeId: "n4", nodeTopicId: "dtn1", prepWide: true })).not.toBeNull();
    expect(await freeTopicGate(free, { ...base, nodeId: "n4", nodeTopicId: "dtn1", prepWide: true, requestedTopicLabel: "hücre bölünmesi" })).toBeNull();
    // Kararın yayınından önce açılmış adım açılmaya devam eder.
    const opened = fakeService({ topics, nodes, attempts: [{ node_id: "n3", user_id: "u", status: "active" }] }) as never;
    expect(await freeTopicGate(opened, { ...base, nodeId: "n3", nodeTopicId: "dtn2", prepWide: false })).toBeNull();
    const plus = fakeService({ premium: true, topics, nodes }) as never;
    expect(await freeTopicGate(plus, { ...base, nodeId: "n3", nodeTopicId: "dtn2", prepWide: false })).toBeNull();
  });

  it("ekran: bitiren 'Başarıyla Tamamladın', bitirmeyen 1. konunun açık olduğunu görür; geri sayım yok", async () => {
    const { firstTopicGate, nodeGateForCode } = await import("@/components/parity/exam-node/gates");
    const done = firstTopicGate({ title: "Hücre Bölünmesi", done: 4, total: 4, lessonsDone: 1, bestScore: 80, completed: true });
    expect(done.headline).toBe("🚀 1. Konuyu Başarıyla Tamamladın!");
    expect(done.message).toContain("Kalan konuları ve 20 soruluk sınav provasını açmak için Plus'a geç");
    expect(done.wins).toEqual(["🧠 1 ders bitirdin", "✅ 4/4 adım tamamlandı", "📈 En iyi sonucun %80"]);
    expect(done.beyondFreeDaily).toBe(true);
    const half = firstTopicGate({ title: "Hücre Bölünmesi", done: 1, total: 4, lessonsDone: 1, bestScore: null, completed: false });
    expect(half.headline).toBe("🔒 Kalan konular Plus'ta");
    expect(half.message).toContain("önce «Hücre Bölünmesi» konusunu bitir");
    const base = { message: "x", beyondFreeDaily: false };
    expect(nodeGateForCode("free_topic_limit", base, false, { firstTopic: { completed: true } }).headline).toContain("Tamamladın");
    expect(nodeGateForCode("free_topic_limit", base, true)).toBe(base);
  });

  it("sunucu açılışın başında kapıyı sorar; önceden yazım kilitli konuya harcanmaz; 25 sayfa, parçalar bir kez", () => {
    const start = read("src/lib/learning/node/start.ts");
    expect(start.indexOf("freeTopicGate(service")).toBeLessThan(start.indexOf("requestNextPrefetch(service"));
    expect(start).toContain('if (prefetch) return NextResponse.json({ ok: true, skipped: "free_topic" });');
    expect(start).toContain("code: FREE_TOPIC_LIMIT_CODE, firstTopic: firstTopicLock");
    expect(read("src/lib/documents/free-pages.ts")).toContain('.is("part_of", null)');
    expect(read("src/components/paywall/upgrade-sheet.tsx")).toContain('<ul className="ug-wins" aria-label="Kazanımların">');
  });
});
