import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADDON_PACKS, CREDIT_PRICE_TABLE, PLAN_ALLOWANCES, allowanceInWork } from "@/lib/credits/price-table";
import { allowanceWorkLine } from "@/lib/billing/tier-presentation";

/**
 * Kredi sistemi v2 (8 Ekim 2026, ürün sahibinin kararı). 1 kredi = $0,001
 * ölçülen model maliyeti; Plus ayda 7.200 (Astra Plus ≈ 2.000 mesaj, bizde
 * 2.400), Sigma 60.000, ücretsiz günde 6. Göç gerçekten çalıştırılıyor.
 * Gerekçe: docs/delivery/KREDI-SISTEMI.md.
 */
const read = (path: string) => readFileSync(path, "utf8");

describe("kredi sistemi v2: sayılar", () => {
  it("Plus Astra'dan fazla: ayda 2.400 mesaj, 1.200 ders", () => {
    expect(allowanceInWork(PLAN_ALLOWANCES.plusMonthly)).toEqual({ messages: 2400, lessons: 1200 });
    expect(allowanceInWork(PLAN_ALLOWANCES.sigmaMonthly)).toEqual({ messages: 20000, lessons: 10000 });
    expect(allowanceInWork(PLAN_ALLOWANCES.free)).toEqual({ messages: 2, lessons: 1 });
    expect(allowanceWorkLine(PLAN_ALLOWANCES.plusMonthly)).toBe("Ayda yaklaşık 2.400 mesaj ya da 1.200 ders");
    expect(allowanceWorkLine(PLAN_ALLOWANCES.plusWeekly, "hafta")).toBe("Haftada yaklaşık 900 mesaj ya da 450 ders");
  });

  it("yoğun öğrencide aylık Plus %50'nin üstünde kalıyor; ek paketler tam kullanımda %50", () => {
    const net = (priceTry: number) => priceTry / 1.2 - priceTry * 0.0295; // KDV %20, PayTR %2,95
    const tryPerCredit = 0.001 * 52;
    const heavyMonth = 30 * (3 * 6 + 2 * 4 + 30 * 3 + 12); // günde 3 ders, 2 test, 30 mesaj, 1 podcast
    expect(1 - (heavyMonth * tryPerCredit) / net(599)).toBeGreaterThan(0.5);
    for (const pack of ADDON_PACKS) {
      expect(1 - (pack.credits * tryPerCredit) / net(pack.priceTry)).toBeGreaterThanOrEqual(0.49);
    }
  });

  it("göç ve fiyat tablosu aynı sayıları söylüyor", () => {
    const sql = read("supabase/migrations/20261008120000_credit_system_v2.sql");
    expect(sql).toContain(`('plus-aylik', ${PLAN_ALLOWANCES.plusMonthly})`);
    expect(sql).toContain(`('plus-haftalik', ${PLAN_ALLOWANCES.plusWeekly})`);
    expect(sql).toContain(`('sigma-aylik', ${PLAN_ALLOWANCES.sigmaMonthly})`);
    expect(sql).toContain(`('PODCAST_GENERATE', ${CREDIT_PRICE_TABLE.PODCAST_GENERATE.credits},`);
    expect(sql).toContain(`('DOCUMENT_SCAN_PAGE', ${CREDIT_PRICE_TABLE.DOCUMENT_SCAN_PAGE.credits},`);
    for (const pack of ADDON_PACKS) expect(sql).toContain(`('${pack.slug}', ${pack.credits},`);
  });

  it("her iş kendi koduyla fiyatlanıyor", () => {
    const node = read("src/app/api/learning/exam-prep/node/route.ts");
    expect(node).toMatch(/if \(kind === "podcast"\) return "PODCAST_GENERATE" as const;/);
    expect(node).toMatch(/if \(kind === "oral"\) return "ORAL_EXAM_GENERATE" as const;/);
    expect(read("src/app/api/learning/podcast/generate/route.ts")).toContain('actionCode: "PODCAST_GENERATE"');
    expect(read("src/app/api/learning/oral/generate/route.ts")).toContain('actionCode: "ORAL_EXAM_GENERATE"');
    expect(read("src/app/api/learning/exam-prep/voice/route.ts")).toContain('"VOICE_TURN"');
  });
});

describe("kredi sistemi v2: göç canlı gibi çalışıyor", () => {
  const db = new PGlite();
  const free = "11111111-1111-4111-8111-111111111111";
  const plus = "22222222-2222-4222-8222-222222222222";
  const weekly = "33333333-3333-4333-8333-333333333333";

  beforeAll(async () => {
    const initial = read("supabase/migrations/20250825120000_init.sql");
    const tables = initial
      .slice(initial.indexOf("CREATE TABLE public.credit_wallets"), initial.indexOf("CREATE TABLE public.payments"))
      .replace(/ REFERENCES public.profiles\(id\) ON DELETE CASCADE/g, "");
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; ${tables}
      ALTER TABLE credit_wallets ADD COLUMN period_ends_at timestamptz DEFAULT now() + interval '1 day',
        ADD COLUMN period_allowance integer DEFAULT 2, ADD COLUMN period_kind text DEFAULT 'daily';
      CREATE TABLE plans(id uuid PRIMARY KEY, slug text, name text, credit_amount integer DEFAULT 0,
        monthly_allowance integer, billing_period text, is_premium boolean, updated_at timestamptz);
      CREATE TABLE subscriptions(user_id uuid, plan_id uuid, status text, current_period_end timestamptz);
      CREATE TABLE user_roles(user_id uuid NOT NULL, role text NOT NULL, revoked_at timestamptz);
      CREATE SCHEMA auth; CREATE TABLE auth.users(id uuid PRIMARY KEY);
      CREATE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql AS $$ SELECT NULL::uuid $$;
      CREATE FUNCTION account_verified(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE FUNCTION referral_multiplier(uuid) RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
      CREATE FUNCTION unverified_allowance() RETURNS integer LANGUAGE sql AS $$ SELECT 2 $$;`);
    for (const file of [
      "20260923120001_uat_credit_atomicity",
      "20260925180000_admin_credit_bypass",
      "20261003120000_free_tier_one_lesson",
      "20261008100000_admin_free_preview",
    ]) {
      await db.exec(read(`supabase/migrations/${file}.sql`));
    }
    // Göçten önceki canlı hâl: eski bedeller, eski haklar, eski bakiyeler.
    await db.exec(`INSERT INTO credit_rules(action_code, credit_cost) VALUES
        ('AI_CHAT_STANDARD', 1), ('STUDY_PLAN_GENERATE', 2), ('QUIZ_GENERATE', 2), ('DOCUMENT_PAGE_PROCESS', 2);
      INSERT INTO plans(id, slug, name, monthly_allowance, billing_period, is_premium) VALUES
        ('aaaaaaaa-0000-4000-8000-000000000001', 'plus-aylik', 'Plus', 400, 'monthly', true),
        ('aaaaaaaa-0000-4000-8000-000000000002', 'plus-haftalik', 'Plus', 150, 'weekly', true),
        ('aaaaaaaa-0000-4000-8000-000000000003', 'ek-kredi-50', 'Ek Kredi 50', NULL, 'one_time', false);
      UPDATE plans SET credit_amount = 50 WHERE slug = 'ek-kredi-50';
      INSERT INTO credit_wallets(user_id, balance, free_allowance_remaining) VALUES
        ('${free}', 4, 2), ('${plus}', 0, 0), ('${weekly}', 0, 0);
      INSERT INTO subscriptions(user_id, plan_id, status) VALUES
        ('${plus}', 'aaaaaaaa-0000-4000-8000-000000000001', 'active'),
        ('${weekly}', 'aaaaaaaa-0000-4000-8000-000000000002', 'active');`);
    await db.exec(read("supabase/migrations/20261008120000_credit_system_v2.sql"));
  }, 30_000);
  afterAll(() => db.close());

  const reserve = (user: string, code: string, key: string, quantity = 1) =>
    db.query("SELECT credit_reserve($1, $2, $3, $4) AS id", [user, code, key, quantity]);
  const wallet = async (user: string) =>
    (await db.query<{ balance: number; free_allowance_remaining: number; period_allowance: number; period_kind: string; days: number }>(
      `SELECT balance, free_allowance_remaining, period_allowance, period_kind,
              ceil(extract(epoch FROM period_ends_at - now()) / 86400)::int AS days
         FROM credit_wallets WHERE user_id = $1`, [user])).rows[0];

  it("eski bakiye sıfırlandı ve deftere yazıldı; bedeller ve haklar yeni", async () => {
    const ledger = await db.query<{ delta: number }>(
      "SELECT delta FROM credit_ledger WHERE user_id = $1 AND idempotency_key LIKE 'credit-system-v2-reset:%'", [free]);
    expect(ledger.rows).toEqual([{ delta: -4 }]);
    const rules = await db.query<{ action_code: string; credit_cost: number }>(
      "SELECT action_code, credit_cost FROM credit_rules WHERE action_code IN ('AI_CHAT_STANDARD','STUDY_PLAN_GENERATE','PODCAST_GENERATE') ORDER BY 1");
    expect(rules.rows).toEqual([
      { action_code: "AI_CHAT_STANDARD", credit_cost: 3 },
      { action_code: "PODCAST_GENERATE", credit_cost: 12 },
      { action_code: "STUDY_PLAN_GENERATE", credit_cost: 6 },
    ]);
    const pack = await db.query<{ credit_amount: number; name: string }>("SELECT credit_amount, name FROM plans WHERE slug = 'ek-kredi-50'");
    expect(pack.rows[0]).toEqual({ credit_amount: 1000, name: "Ek paket S" });
  });

  it("ücretsiz: günde iki mesaj ya da bir ders", async () => {
    await reserve(free, "AI_CHAT_STANDARD", "f1");
    await reserve(free, "AI_CHAT_STANDARD", "f2");
    await expect(reserve(free, "AI_CHAT_STANDARD", "f3")).rejects.toThrow("insufficient_credits");
    expect(await wallet(free)).toMatchObject({ balance: 0, free_allowance_remaining: 0, period_allowance: 6, period_kind: "daily" });
  });

  it("aylık Plus 7.200; 100 sayfalık belge 200 kredi", async () => {
    await reserve(plus, "DOCUMENT_PAGE_PROCESS", "p1", 100);
    expect(await wallet(plus)).toMatchObject({ free_allowance_remaining: 7000, period_allowance: 7200, period_kind: "monthly", days: 30 });
  });

  it("haftalık Plus 2.700, yedi günlük dönem", async () => {
    await reserve(weekly, "STUDY_PLAN_GENERATE", "w1");
    expect(await wallet(weekly)).toMatchObject({ free_allowance_remaining: 2694, period_allowance: 2700, period_kind: "weekly", days: 7 });
  });
});
