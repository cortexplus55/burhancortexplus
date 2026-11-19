import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ACTION_CODES, ADDON_PACKS, CREDIT_PRICE_TABLE, PLAN_ALLOWANCES } from "@/lib/credits/price-table";
import { FREE_LIMITS } from "@/lib/billing/free-meters";

/*
  Faz 4 göçleri (20261119120000 kredi ekonomisi, 20261119120100 kavrama politikası ve "Farklı anlat" önbelleği):
  yalnız ekleme / güncelleme, iki kez çalışınca aynı sonuç, kod ile aynı sayılar ve cüzdanlara dokunmama (grandfathering).
  Kurulum canlıdaki yayın sırasıyla (ucretsiz-tek-ders.test.ts ile aynı zincir).
*/

const file = (path: string) => readFileSync(path, "utf8");
const migration = (name: string) => file(`supabase/migrations/${name}.sql`);
const ECONOMY = "20261119120000_faz4_credit_economy";
const POLICY = "20261119120100_faz4_mastery_policy_and_reexplain_cache";

const db = new PGlite();
const FREE = "11111111-1111-4111-8111-111111111111";
const PLUS = "22222222-2222-4222-8222-222222222222";
const PLAN_IDS = {
  "plus-haftalik": "aaaaaaaa-0000-4000-8000-000000000001",
  "plus-aylik": "aaaaaaaa-0000-4000-8000-000000000002",
  "plus-yillik": "aaaaaaaa-0000-4000-8000-000000000003",
  "sigma-aylik": "aaaaaaaa-0000-4000-8000-000000000004",
  "sigma-yillik": "aaaaaaaa-0000-4000-8000-000000000005",
  "ek-kredi-50": "aaaaaaaa-0000-4000-8000-000000000006",
  "ek-kredi-150": "aaaaaaaa-0000-4000-8000-000000000007",
  "ek-kredi-400": "aaaaaaaa-0000-4000-8000-000000000008",
} as const;

const walletsDigest = async () =>
  (
    await db.query<{ d: string }>(
      "SELECT md5(string_agg(row_to_json(w)::text, '|' ORDER BY user_id)) AS d FROM credit_wallets w",
    )
  ).rows[0]?.d;
const rules = async () =>
  Object.fromEntries(
    (await db.query<{ action_code: string; credit_cost: number }>("SELECT action_code, credit_cost FROM credit_rules WHERE active")).rows.map(
      (row) => [row.action_code, row.credit_cost],
    ),
  );
const plans = async () =>
  Object.fromEntries(
    (await db.query<{ slug: string; monthly_allowance: number | null; credit_amount: number }>("SELECT slug, monthly_allowance, credit_amount FROM plans")).rows.map(
      (row) => [row.slug, row],
    ),
  );
const reserve = (user: string, code: string, key: string, meter: string | null) =>
  db.query<{ id: string }>("SELECT credit_reserve_metered($1, $2, $3, 1, $4) AS id", [user, code, key, meter]);

let walletsBefore: string | undefined;
let walletsAfter: string | undefined;

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
      sort_order integer DEFAULT 0, updated_at timestamptz);
    CREATE TABLE subscriptions(user_id uuid, plan_id uuid, status text, current_period_end timestamptz);
    CREATE TABLE payments(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, beneficiary_user_id uuid, plan_id uuid);
    CREATE TABLE user_roles(user_id uuid NOT NULL, role text NOT NULL, revoked_at timestamptz);
    CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
    CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
    CREATE FUNCTION account_verified(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION referral_multiplier(uuid) RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
    CREATE FUNCTION unverified_allowance() RETURNS integer LANGUAGE sql AS $$ SELECT 2 $$;
    -- 20261119120100'ün dokunduğu tablolar (canlıdaki sütunların göçün okuduğu alt kümesi).
    CREATE TABLE exam_preps(id uuid PRIMARY KEY, user_id uuid);
    CREATE TABLE exam_prep_nodes(id uuid PRIMARY KEY, exam_prep_id uuid);
    CREATE TABLE exam_prep_topic_mastery(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, exam_prep_id uuid,
      topic_key text, measured_level text, confidence integer);`);
  for (const name of [
    "20260923120001_uat_credit_atomicity",
    "20260925180000_admin_credit_bypass",
    "20261003120000_free_tier_one_lesson",
    "20261008100000_admin_free_preview",
  ]) {
    await db.exec(migration(name));
  }
  await db.exec(`INSERT INTO credit_rules(action_code, credit_cost) VALUES
      ('AI_CHAT_STANDARD', 1), ('AI_CHAT_ADVANCED', 1), ('STUDY_PLAN_GENERATE', 2), ('QUIZ_GENERATE', 2),
      ('FLASHCARD_GENERATE', 1), ('DOCUMENT_PAGE_PROCESS', 2), ('IMAGE_SOLUTION', 5), ('PRACTICE_EXAM_GENERATE', 2);`);
  for (const [slug, id] of Object.entries(PLAN_IDS)) {
    const addon = slug.startsWith("ek-kredi");
    await db.query(
      "INSERT INTO plans(id, slug, name, monthly_allowance, credit_amount, billing_period, is_premium) VALUES ($1, $2, $2, $3, $4, $5, $6)",
      [id, slug, addon ? null : 1000, addon ? 1000 : 0, slug.includes("haftalik") ? "weekly" : "monthly", !addon],
    );
  }
  await db.exec(migration("20261008120000_credit_system_v2"));
  await db.exec(migration("20261024121000_free_tier_counts"));
  await db.exec(`${migration("20261024120000_credit_prices_v3")}\n${migration("20261024123000_free_daily_zero")}`);
  await db.exec(migration("20261027193000_sketch_video_credits"));
  await db.exec(migration("20261111180000_free_lesson_trial"));
  // Faz 4 öncesi cüzdanlar: ücretsiz hesap ve eski Plus havuzu (7.200) — göç bunlara dokunmamalı.
  await db.exec(`INSERT INTO profiles(id) VALUES ('${FREE}'), ('${PLUS}');
    INSERT INTO credit_wallets(user_id, balance, free_allowance_remaining, period_allowance, period_kind, period_ends_at)
      VALUES ('${FREE}', 0, 0, 0, 'daily', now() + interval '1 day'),
             ('${PLUS}', 40, 5000, 7200, 'monthly', now() + interval '10 days');
    INSERT INTO auth.users(id) VALUES ('${FREE}'), ('${PLUS}');
    INSERT INTO exam_prep_topic_mastery(user_id, exam_prep_id, topic_key, measured_level, confidence)
      VALUES ('${PLUS}', gen_random_uuid(), 'k', 'weak', 10);`);
  walletsBefore = await walletsDigest();
  // Canlıdaki gibi: iki göç sırayla; ikinci kez de çalışır (idempotent).
  for (let run = 0; run < 2; run++) {
    await db.exec(migration(ECONOMY));
    await db.exec(migration(POLICY));
  }
  walletsAfter = await walletsDigest();
}, 90_000);
afterAll(() => db.close());

describe("20261119120000 kredi ekonomisi", () => {
  it("credit_rules fiyat tablosuyla birebir (bu zincirde kurulu her eylem kodu)", async () => {
    const live = await rules();
    // Zincirde olmayan eski kodlar (başka göçlerin tohumu) burada yok; olanların hepsi kodla aynı.
    for (const code of ACTION_CODES) if (code in live) expect(live[code], code).toBe(CREDIT_PRICE_TABLE[code].credits);
    // Bölüm 1'in sayıları.
    expect(live).toMatchObject({
      AI_CHAT_STANDARD: 1,
      TRUE_FALSE_GENERATE: 3,
      ORAL_EXAM_GENERATE: 3,
      STEP_REEXPLAIN: 4,
      FLASHCARD_GENERATE: 8,
      QUIZ_GENERATE: 14,
      PODCAST_GENERATE: 16,
      PRACTICE_EXAM_GENERATE: 17,
      PRACTICE_EXAM_GRADE: 0,
      STUDY_PLAN_GENERATE: 22,
      SKETCH_VIDEO_GENERATE: 22,
      DOCUMENT_SCAN_PAGE: 5,
    });
  });

  it("plan havuzları ve ek paketler koddaki sayılar; abonelik satırının credit_amount'u 0 kalır", async () => {
    const rows = await plans();
    expect(rows["plus-haftalik"]?.monthly_allowance).toBe(PLAN_ALLOWANCES.plusWeekly);
    expect(rows["plus-aylik"]?.monthly_allowance).toBe(PLAN_ALLOWANCES.plusMonthly);
    expect(rows["plus-yillik"]?.monthly_allowance).toBe(PLAN_ALLOWANCES.plusYearly);
    expect(rows["sigma-aylik"]?.monthly_allowance).toBe(PLAN_ALLOWANCES.sigmaMonthly);
    expect(rows["sigma-yillik"]?.monthly_allowance).toBe(PLAN_ALLOWANCES.sigmaYearly);
    for (const pack of ADDON_PACKS) expect(rows[pack.slug]?.credit_amount, pack.slug).toBe(pack.credits);
    for (const slug of ["plus-haftalik", "plus-aylik", "sigma-aylik"]) expect(rows[slug]?.credit_amount, slug).toBe(0);
  });

  it("ücretsiz sayaçlar: Farklı anlat toplam 10 (dönemsiz), fotoğraf ayda 7 (aylık anahtar), sohbet günde 3", async () => {
    const limit = async (meter: string) => (await db.query<{ n: number }>("SELECT free_meter_limit($1) AS n", [meter])).rows[0]?.n;
    for (const meter of ["lesson", "chat", "photo", "included", "reexplain"] as const) {
      expect(await limit(meter), meter).toBe(FREE_LIMITS[meter]);
    }
    const key = async (meter: string) =>
      (await db.query<{ k: string }>("SELECT free_period_key($1, '2026-11-19T10:00:00Z'::timestamptz) AS k", [meter])).rows[0]?.k;
    expect(await key("reexplain")).toBe("trial");
    expect(await key("photo")).toBe("2026-11");
    expect(await key("chat")).toBe("2026-11-19");
  });

  it("ücretsiz 'Farklı anlat' sunucuda 10'da durur: 11. ayırma free_limit:reexplain", async () => {
    for (let i = 1; i <= FREE_LIMITS.reexplain; i++) {
      await expect(reserve(FREE, "STEP_REEXPLAIN", `rx-${i}`, "reexplain"), `#${i}`).resolves.toBeTruthy();
    }
    await expect(reserve(FREE, "STEP_REEXPLAIN", "rx-11", "reexplain")).rejects.toThrow("free_limit:reexplain");
    const used = await db.query<{ used: number; period_key: string }>(
      "SELECT used, period_key FROM free_usage WHERE user_id = $1 AND meter = 'reexplain'",
      [FREE],
    );
    expect(used.rows).toEqual([{ used: FREE_LIMITS.reexplain, period_key: "trial" }]);
  });

  it("grandfathering: göç cüzdanlara dokunmaz (eldeki hak ve bakiye aynen)", async () => {
    // Bu dosyadaki ayırmalar ücretsiz hesabın sayacına yazar (cüzdan değil); Plus cüzdanı satır satır aynı.
    const plus = await db.query("SELECT balance, free_allowance_remaining, period_allowance, period_kind FROM credit_wallets WHERE user_id = $1", [PLUS]);
    expect(plus.rows[0]).toEqual({ balance: 40, free_allowance_remaining: 5000, period_allowance: 7200, period_kind: "monthly" });
    // İki göç iki kez çalıştıktan sonra bütün cüzdan satırlarının md5'i aynı.
    expect(walletsBefore).toBeTruthy();
    expect(walletsAfter).toBe(walletsBefore);
    expect(migration(ECONOMY)).not.toMatch(/UPDATE\s+public\.credit_wallets/i);
  });

  it("yalnız ekleme: DROP / DELETE / TRUNCATE yok", () => {
    for (const name of [ECONOMY, POLICY]) {
      const body = migration(name).split("\n").filter((line) => !line.trimStart().startsWith("--")).join("\n");
      expect(body, name).not.toMatch(/\bDROP\s+(TABLE|COLUMN|FUNCTION|POLICY)\b|\bDELETE\s+FROM\b|\bTRUNCATE\b|ALTER\s+COLUMN/i);
    }
  });
});

describe("20261119120100 kavrama politikası ve Farklı anlat önbelleği", () => {
  it("policy sütunu eklenir, eski satır NULL kalır", async () => {
    const rows = await db.query<{ measured_level: string; policy: unknown }>("SELECT measured_level, policy FROM exam_prep_topic_mastery");
    expect(rows.rows).toEqual([{ measured_level: "weak", policy: null }]);
  });

  it("önbellek tablosu: adım ve sıra başına tek satır, RLS açık, öğrenci yalnız okur", async () => {
    const prep = "bbbbbbbb-0000-4000-8000-000000000001";
    const node = "cccccccc-0000-4000-8000-000000000001";
    await db.exec(`INSERT INTO exam_preps(id, user_id) VALUES ('${prep}', '${PLUS}');
      INSERT INTO exam_prep_nodes(id, exam_prep_id) VALUES ('${node}', '${prep}');`);
    const insert = (variant: number) =>
      db.query("INSERT INTO exam_prep_step_reexplains(user_id, exam_prep_id, node_id, step_key, variant, reply) VALUES ($1, $2, $3, 's1', $4, 'x')", [
        PLUS,
        prep,
        node,
        variant,
      ]);
    await insert(0);
    await insert(1);
    await expect(insert(1)).rejects.toThrow(/duplicate|unique/i);
    await expect(insert(10)).rejects.toThrow(/check/i);
    const rls = await db.query<{ relrowsecurity: boolean }>("SELECT relrowsecurity FROM pg_class WHERE relname = 'exam_prep_step_reexplains'");
    expect(rls.rows[0]?.relrowsecurity).toBe(true);
    const policies = await db.query<{ policyname: string; cmd: string }>(
      "SELECT policyname, cmd FROM pg_policies WHERE tablename = 'exam_prep_step_reexplains'",
    );
    expect(policies.rows).toEqual([{ policyname: "step_reexplains_own_read", cmd: "SELECT" }]);
    const grants = await db.query<{ privilege_type: string }>(
      "SELECT privilege_type FROM information_schema.role_table_grants WHERE table_name = 'exam_prep_step_reexplains' AND grantee = 'authenticated'",
    );
    expect(grants.rows.map((row) => row.privilege_type)).toEqual(["SELECT"]);
  });
});
