import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PAID_PLANS } from "@/lib/entitlements/config";

/*
  Sınav Haftası (ve aylık Plus) cüzdan dönemi boşluğu — bilinen-sunucu-sapmalari.md #2.

  Ödemede abonelik `ödeme anı + period_days`, cüzdan `UTC gün başı + 7 / 30 gün` biter
  (20260923180000_paytr_subscription_tier_only.sql). Cüzdan aboneliğin bitişinden en çok 24 saat önce biter; bu
  aradaki saatlerde abonelik hâlâ etkin olduğu için credit_reserve 7 / 30 günlük YENİ bir hak yazar
  (20261024123000_free_daily_zero.sql) ve dönemi aboneliğin bitişinin ötesine taşır. Abonelik bitince öğrenci ücretsiz
  hesaba döner, ama cüzdandaki bu hak dönem sonuna kadar sayaçsız işlerde (ör. belge sayfası) harcanabilir.

  Testler DOĞRU davranışı ister:
  1. Ödemede cüzdan dönemi abonelikle aynı anda biter.
  2. Aboneliğin son 24 saatinde (gün başına yuvarlamanın bıraktığı kuyruk) yeni dönem hakkı yazılmaz.
  3. Yenilenen cüzdan dönemi aboneliğin bitişini geçmez; abonelik bitince kalan hak harcanmaz.
  4. Olağan yenileme bozulmaz.

  PGlite'ta `now()` gerçek saattir; "zamanı ileri almak" için abonelik ve cüzdan tarihleri aynı miktarda geri çekilir.
*/

const file = (path: string) => readFileSync(path, "utf8");
const migration = (name: string) => file(`supabase/migrations/${name}.sql`);

const DAY = 86_400_000;
const PLAN = {
  week: { id: "bbbbbbbb-0000-4000-8000-000000000001", slug: PAID_PLANS.week.slug, allowance: PAID_PLANS.week.allowance, period: "weekly", days: 7 },
  plus: { id: "bbbbbbbb-0000-4000-8000-000000000002", slug: PAID_PLANS.plus.slug, allowance: PAID_PLANS.plus.allowance, period: "monthly", days: 30 },
} as const;

const db = new PGlite();
let seq = 0;
const newUser = () => `00000000-0000-4000-8000-${String(++seq).padStart(12, "0")}`;

type Wallet = { free_allowance_remaining: number; period_allowance: number; period_ends_at: string; period_kind: string };
const wallet = async (user: string) =>
  (await db.query<Wallet>("SELECT free_allowance_remaining, period_allowance, period_ends_at::text, period_kind FROM credit_wallets WHERE user_id = $1", [user])).rows[0]!;
const subEnd = async (user: string) =>
  new Date((await db.query<{ e: string }>("SELECT current_period_end::text AS e FROM subscriptions WHERE user_id = $1", [user])).rows[0]!.e);
const dbNow = async () => new Date((await db.query<{ n: string }>("SELECT now()::text AS n")).rows[0]!.n);

async function reserve(user: string, code: string, meter: string | null = null) {
  try {
    await db.query("SELECT credit_reserve_metered($1, $2, $3, 1, $4)", [user, code, `${code}-${user}-${++seq}`, meter]);
    return { ok: true as const };
  } catch (error) {
    return { ok: false as const, error: String((error as Error).message) };
  }
}

/** PayTR geri çağrısının yaptığı gibi: bekleyen ödeme satırı → finalize_paytr_payment. */
async function pay(plan: keyof typeof PLAN): Promise<string> {
  const user = newUser();
  const oid = `CPTEST${seq}`;
  await db.query("INSERT INTO profiles(id) VALUES ($1)", [user]);
  await db.query("INSERT INTO payments(user_id, plan_id, merchant_oid, status) VALUES ($1, $2, $3, 'pending')", [user, PLAN[plan].id, oid]);
  await db.query("SELECT finalize_paytr_payment($1, $2, 'success', '{}'::jsonb)", [oid, `hash-${oid}`]);
  return user;
}

/** Zamanı `ms` kadar ileri alır: bu kullanıcının abonelik ve cüzdan tarihleri aynı miktarda geri çekilir. */
async function advance(user: string, ms: number) {
  const shift = `${Math.round(ms / 1000)} seconds`;
  await db.query("UPDATE subscriptions SET current_period_end = current_period_end - $2::interval WHERE user_id = $1", [user, shift]);
  await db.query("UPDATE credit_wallets SET period_ends_at = period_ends_at - $2::interval WHERE user_id = $1", [user, shift]);
}

/**
 * Gün başına yuvarlamanın bıraktığı durumu doğrudan kurar: abonelik `tail` sonra biter, cüzdan dönemi bitmiş.
 * Bugün ödenmiş ve henüz bitmemiş her Sınav Haftası paketi son gününde bu durumdadır (tail = ödeme saati, UTC).
 */
async function tailState(plan: keyof typeof PLAN, tailMs: number, remaining = 0): Promise<string> {
  const user = newUser();
  const row = PLAN[plan];
  await db.query("INSERT INTO profiles(id) VALUES ($1)", [user]);
  await db.query(
    `INSERT INTO subscriptions(user_id, plan_id, status, current_period_start, current_period_end, billing_period)
     VALUES ($1, $2, 'active', now() - $3::interval, now() + $4::interval, $5)`,
    [user, row.id, `${row.days} days`, `${Math.round(tailMs / 1000)} seconds`, row.period],
  );
  await db.query(
    `INSERT INTO credit_wallets(user_id, balance, reserved, free_allowance_remaining, period_allowance, period_ends_at, period_kind)
     VALUES ($1, 0, 0, $2, $3, now() - interval '1 hour', $4)`,
    [user, remaining, row.allowance, row.period],
  );
  return user;
}

beforeAll(async () => {
  const initial = file("supabase/migrations/20250825120000_init.sql");
  const base = initial
    .slice(initial.indexOf("CREATE TABLE public.credit_wallets"), initial.indexOf("CREATE TABLE public.payments"))
    .replace(/ REFERENCES public.profiles\(id\) ON DELETE CASCADE/g, "");
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; ${base}
    CREATE TABLE profiles(id uuid PRIMARY KEY, referred_by uuid, created_at timestamptz DEFAULT now());
    ALTER TABLE credit_wallets ADD COLUMN period_ends_at timestamptz DEFAULT now() + interval '1 day',
      ADD COLUMN period_allowance integer DEFAULT 6, ADD COLUMN period_kind text DEFAULT 'daily';
    CREATE TABLE plans(id uuid PRIMARY KEY, slug text, name text, credit_amount integer DEFAULT 0,
      monthly_allowance integer, billing_period text, is_premium boolean, active boolean DEFAULT true,
      tier text, period_days integer, updated_at timestamptz);
    CREATE TABLE subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, plan_id uuid, status text,
      current_period_start timestamptz, current_period_end timestamptz, billing_period text,
      cancel_at_period_end boolean DEFAULT false, renewal_reminder_sent_at timestamptz,
      expired_notified_at timestamptz, updated_at timestamptz DEFAULT now());
    CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, beneficiary_user_id uuid,
      plan_id uuid, merchant_oid text UNIQUE, status text, updated_at timestamptz DEFAULT now());
    CREATE TABLE payment_webhook_events(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), merchant_oid text,
      payload_hash text UNIQUE, status text, raw_payload jsonb, processed_at timestamptz);
    CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, title text, body text);
    CREATE TABLE parent_payment_requests(student_id uuid, status text, resolved_at timestamptz);
    CREATE TABLE user_roles(user_id uuid NOT NULL, role text NOT NULL, revoked_at timestamptz);
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION account_verified(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION referral_multiplier(uuid) RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
    CREATE FUNCTION unverified_allowance() RETURNS integer LANGUAGE sql AS $$ SELECT 2 $$;`);
  for (const name of ["20260923120001_uat_credit_atomicity", "20260925180000_admin_credit_bypass", "20261003120000_free_tier_one_lesson", "20261008100000_admin_free_preview"]) {
    await db.exec(migration(name));
  }
  await db.exec(`INSERT INTO credit_rules(action_code, credit_cost) VALUES
      ('AI_CHAT_STANDARD', 1), ('AI_CHAT_ADVANCED', 1), ('STUDY_PLAN_GENERATE', 2), ('QUIZ_GENERATE', 2),
      ('FLASHCARD_GENERATE', 1), ('DOCUMENT_PAGE_PROCESS', 2), ('IMAGE_SOLUTION', 5), ('PRACTICE_EXAM_GENERATE', 2);`);
  for (const row of Object.values(PLAN)) {
    await db.query(
      "INSERT INTO plans(id, slug, name, monthly_allowance, billing_period, is_premium, tier, period_days) VALUES ($1, $2, 'Plus', $3, $4, true, 'plus', $5)",
      [row.id, row.slug, row.allowance, row.period, row.days],
    );
  }
  await db.exec(migration("20261008120000_credit_system_v2"));
  await db.exec(migration("20261024121000_free_tier_counts"));
  await db.exec(`${migration("20261024120000_credit_prices_v3")}\n${migration("20261024123000_free_daily_zero")}`);
  await db.exec(migration("20261111180000_free_lesson_trial"));
  await db.exec(migration("20260923180000_paytr_subscription_tier_only"));
  await db.exec(migration("20261115120000_sinav_haftasi_cuzdan_donemi"));
}, 90_000);
afterAll(() => db.close());

describe("ödeme: cüzdan dönemi abonelikle aynı anda biter", () => {
  for (const plan of ["week", "plus"] as const) {
    it(`${plan === "week" ? "Sınav Haftası" : "Plus aylık"}: cüzdanın dönem sonu = aboneliğin bitişi, hak ${PLAN[plan].allowance}`, async () => {
      const user = await pay(plan);
      const w = await wallet(user);
      expect(w.free_allowance_remaining).toBe(PLAN[plan].allowance);
      expect(w.period_kind).toBe(PLAN[plan].period);
      // Bugün: date_trunc('day', now()) + N gün → abonelikten "ödeme saati (UTC)" kadar erken biter.
      expect(Math.abs(new Date(w.period_ends_at).getTime() - (await subEnd(user)).getTime())).toBeLessThan(1000);
    });
  }
});

describe("aboneliğin son saatleri: yeni dönem hakkı yazılmaz", () => {
  it("Sınav Haftası: hak bitmiş, cüzdan dönemi dolmuş, abonelik 6 saat sonra bitiyor → yeni 2.700 yok", async () => {
    const user = await tailState("week", 6 * 3_600_000);
    const result = await reserve(user, "STUDY_PLAN_GENERATE", "lesson");
    // Bugün: credit_reserve dönemi yeniler, ayırma geçer ve cüzdana 7 günlük yeni hak yazılır.
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("insufficient_credits") });
    expect((await wallet(user)).free_allowance_remaining).toBe(0);
  });

  it("Plus aylık: aynı kuyrukta yeni 7.200 yok", async () => {
    const user = await tailState("plus", 6 * 3_600_000);
    const result = await reserve(user, "STUDY_PLAN_GENERATE", "lesson");
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("insufficient_credits") });
    expect((await wallet(user)).free_allowance_remaining).toBe(0);
  });

  it("kuyrukta kalan hak harcanmaya devam eder (yenileme yok ama eldeki hak geçerli)", async () => {
    const user = await tailState("week", 6 * 3_600_000, 300);
    expect((await reserve(user, "STUDY_PLAN_GENERATE", "lesson")).ok).toBe(true);
    const w = await wallet(user);
    expect(w.free_allowance_remaining).toBe(300 - 30);
    expect(Math.abs(new Date(w.period_ends_at).getTime() - (await subEnd(user)).getTime())).toBeLessThan(1000);
  });

  it("uçtan uca: ödeme → hak biter → son saatlerde yeni hak yazılmaz", async () => {
    const user = await pay("week");
    await db.query("UPDATE credit_wallets SET free_allowance_remaining = 0 WHERE user_id = $1", [user]);
    const end = (await subEnd(user)).getTime();
    const walletEnd = new Date((await wallet(user)).period_ends_at).getTime();
    // Cüzdanın dönem sonu ile aboneliğin bitişinin tam ortasına ileri al (boşluk varsa onun içi).
    await advance(user, (walletEnd + end) / 2 - (await dbNow()).getTime());
    const result = await reserve(user, "STUDY_PLAN_GENERATE", "lesson");
    // Boşluk yoksa bu an aboneliğin bitişidir: ücretsiz hesap (ders sayacı); boşluk varsa kuyruk kuralı. İkisinde de
    // ayırma geçmez ve cüzdana yeni hak yazılmaz.
    expect(result.ok).toBe(false);
    expect((await wallet(user)).free_allowance_remaining).toBe(0);
  });
});

describe("yenilenen dönem aboneliği geçmez; abonelik bitince kalan hak harcanmaz", () => {
  it("Sınav Haftası (uzatılmış, 3 gün kalmış): yenileme olur ama dönem aboneliğin bitişinde biter", async () => {
    const user = await tailState("week", 3 * DAY);
    expect((await reserve(user, "STUDY_PLAN_GENERATE", "lesson")).ok).toBe(true);
    const w = await wallet(user);
    expect(w.free_allowance_remaining).toBe(PLAN.week.allowance - 30);
    // Bugün: date_trunc('day', now()) + 7 gün → abonelikten ~4 gün sonra.
    expect(new Date(w.period_ends_at).getTime()).toBeLessThanOrEqual((await subEnd(user)).getTime() + 1000);
  });

  it("abonelik bitince cüzdanda kalan hak sayaçsız işte (belge sayfası) harcanmaz", async () => {
    const user = await tailState("week", 3 * DAY);
    expect((await reserve(user, "STUDY_PLAN_GENERATE", "lesson")).ok).toBe(true);
    // Abonelik bitsin (3 gün + 1 saat ileri).
    await advance(user, 3 * DAY + 3_600_000);
    const after = await reserve(user, "DOCUMENT_PAGE_PROCESS", null);
    // Bugün: cüzdan dönemi 4 gün daha sürüyor, ~2.670 kalan hak ücretsiz hesapta harcanabiliyor.
    expect(after).toMatchObject({ ok: false, error: expect.stringContaining("insufficient_credits") });
  });
});

describe("olağan davranış bozulmaz", () => {
  it("Plus yıllık gibi uzun abonelik: cüzdan dönemi dolunca tam 30 günlük hak yazılır", async () => {
    const user = newUser();
    await db.query("INSERT INTO profiles(id) VALUES ($1)", [user]);
    await db.query(
      "INSERT INTO subscriptions(user_id, plan_id, status, current_period_start, current_period_end) VALUES ($1, $2, 'active', now() - interval '60 days', now() + interval '200 days')",
      [user, PLAN.plus.id],
    );
    await db.query(
      "INSERT INTO credit_wallets(user_id, balance, reserved, free_allowance_remaining, period_allowance, period_ends_at, period_kind) VALUES ($1, 0, 0, 0, 7200, now() - interval '1 hour', 'monthly')",
      [user],
    );
    expect((await reserve(user, "STUDY_PLAN_GENERATE", "lesson")).ok).toBe(true);
    const w = await wallet(user);
    expect(w.free_allowance_remaining).toBe(PLAN.plus.allowance - 30);
    const days = (new Date(w.period_ends_at).getTime() - (await dbNow()).getTime()) / DAY;
    expect(days).toBeGreaterThan(29);
    expect(days).toBeLessThanOrEqual(30);
  });

  it("dönem içindeki harcama cüzdan dönemine dokunmaz", async () => {
    const user = await pay("week");
    const before = await wallet(user);
    expect((await reserve(user, "STUDY_PLAN_GENERATE", "lesson")).ok).toBe(true);
    const after = await wallet(user);
    expect(after.period_ends_at).toBe(before.period_ends_at);
    expect(after.free_allowance_remaining).toBe(PLAN.week.allowance - 30);
  });

  it("abonelik bitmiş, cüzdan dönemi dolmuş: ücretsiz hesap gibi (hak 0)", async () => {
    const user = await tailState("week", 3 * DAY);
    await advance(user, 4 * DAY);
    const result = await reserve(user, "DOCUMENT_PAGE_PROCESS", null);
    expect(result).toMatchObject({ ok: false, error: expect.stringContaining("insufficient_credits") });
  });
});

describe("arayüzün hak hesabı (quotaView) sunucuyla aynı kuralı izler", () => {
  const now = new Date("2026-11-17T05:00:00Z");
  const expiredWallet = { free_allowance_remaining: 120, period_allowance: 2700, period_ends_at: "2026-11-17T00:00:00Z", period_kind: "weekly" };

  it("aboneliğin son 24 saatinde yenileme beklenmez; sıfırlanma = paket bitişi", async () => {
    const { quotaView } = await import("@/lib/credits/period");
    const q = quotaView(expiredWallet, true, now, 2700, "2026-11-17T10:00:00Z");
    expect(q).toMatchObject({ pendingRefill: false, remaining: 120, allowance: 2700 });
    expect(q.resetsAt.toISOString()).toBe("2026-11-17T10:00:00.000Z");
  });

  it("aboneliğe günler varken yenileme beklenir ama sıfırlanma paket bitişini geçmez", async () => {
    const { quotaView } = await import("@/lib/credits/period");
    const q = quotaView(expiredWallet, true, now, 2700, "2026-11-20T10:00:00Z");
    expect(q).toMatchObject({ pendingRefill: true, remaining: 2700 });
    expect(q.resetsAt.toISOString()).toBe("2026-11-20T10:00:00.000Z");
  });

  it("abonelik bitişi verilmezse bugünkü davranış", async () => {
    const { quotaView } = await import("@/lib/credits/period");
    const q = quotaView(expiredWallet, true, now, 2700);
    expect(q).toMatchObject({ pendingRefill: true, remaining: 2700 });
    expect(q.resetsAt.toISOString()).toBe("2026-11-24T00:00:00.000Z");
  });
});
