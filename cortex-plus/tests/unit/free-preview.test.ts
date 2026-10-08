import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { getUserEntitlements } = await import("@/lib/billing/entitlements");
const { previewAllowanceLeft, previewWallet } = await import("@/lib/billing/free-preview");

/**
 * Yönetici "ücretsiz gibi gör" önizlemesi (8 Ekim 2026). Kurucu hesabı
 * yönetici olduğu için ücretsiz katman (#249) canlıda denenemiyordu.
 * Önizleme açıkken yönetici ücretsiz hesap gibi sınırlanır; cüzdanı ve
 * eski belge/hazırlıkları bu sınıra karışmaz.
 */
const read = (path: string) => readFileSync(path, "utf8");

function client(rows: Record<string, unknown>) {
  return {
    from(table: string) {
      const chain = {
        select: () => chain,
        eq: () => chain,
        or: () => chain,
        maybeSingle: async () => ({ data: rows[table] ?? null, error: null }),
      };
      return chain;
    },
  };
}

const plus = {
  status: "active",
  current_period_end: null,
  cancel_at_period_end: false,
  plans: { is_premium: true, tier: "plus", name: "Plus", slug: "plus-monthly", monthly_allowance: 400 },
};

describe("ücretsiz önizleme", () => {
  it("plan çözücü önizlemede ücretsiz döner; abonelik görünmez", async () => {
    const paid = await getUserEntitlements(client({ subscriptions: plus }) as never, "u1");
    expect(paid.plan).toBe("plus");
    const previewing = await getUserEntitlements(
      client({ subscriptions: plus, admin_free_preview: { user_id: "u1" } }) as never,
      "u1",
    );
    expect(previewing.plan).toBe("free");
    expect(previewing.isPremium).toBe(false);
    expect(previewing.showsUpgradeChrome).toBe(true);
  });

  it("günlük hak: gün geçince yeniden 2, değilse kalan", () => {
    const preview = { startedAt: "2026-10-08T10:00:00Z", remaining: 0, periodEndsAt: "2026-10-09T00:00:00Z" };
    expect(previewAllowanceLeft(preview, Date.parse("2026-10-08T12:00:00Z"))).toBe(0);
    expect(previewAllowanceLeft(preview, Date.parse("2026-10-09T00:00:01Z"))).toBe(2);
    expect(previewWallet(preview)).toMatchObject({ period_allowance: 2, period_kind: "daily" });
  });

  it("SQL: yönetici kolu önizlemede ayrı hakkı düşer; iade aynı günün hakkını geri verir", () => {
    const sql = read("supabase/migrations/20261008100000_admin_free_preview.sql");
    expect(sql).toMatch(/SELECT \* INTO v_preview FROM public\.admin_free_preview WHERE user_id = p_user_id FOR UPDATE;/);
    expect(sql).toMatch(/IF v_preview\.remaining < v_cost THEN RAISE EXCEPTION 'insufficient_credits'; END IF;/);
    expect(sql).toMatch(/v_preview\.remaining := 2;/);
    expect(sql).toMatch(/CASE WHEN v_preview_on THEN v_cost ELSE 0 END/);
    expect(sql).toMatch(/SET remaining = remaining \+ r\.free_spent/);
    // Ücretsiz katmanın hakkı değişirse önizleme de değişmeli.
    expect(read("supabase/migrations/20261003120000_free_tier_one_lesson.sql")).toContain("v_allowance := 2;");
    // Kişi yalnız kendi satırını okur; yazma sunucuda.
    expect(sql).toMatch(/USING \(user_id = auth\.uid\(\)\)/);
  });

  it("belge ve hazırlık sınırı önizleme başladıktan sonrakini sayar", () => {
    for (const path of ["src/lib/documents/free-pages.ts", "src/lib/billing/free-prep-limit.ts"]) {
      const source = read(path);
      expect(source).toMatch(/if \(await billingExempt\(service, userId\)/);
      expect(source).toMatch(/query = query\.gte\("created_at", preview\.startedAt\)/);
    }
  });

  it("yönetici muafiyetleri önizlemede kapanıyor; arayüz ücretsiz kromu gösteriyor", () => {
    expect(read("src/lib/documents/pdf-ingestion.ts")).toMatch(/founder = await billingExempt\(service, userId\)/);
    expect(read("src/lib/documents/photo-quota.ts").match(/billingExempt\(service, userId\)/g)?.length).toBe(2);
    expect(read("src/lib/documents/document-limits.ts")).toMatch(/if \(preview\) unlimited = false;/);
    expect(read("src/lib/learning/lesson-prefetch.ts")).toMatch(/previewAllowanceLeft\(preview, now\) >= cost/);
    for (const route of ["src/app/api/ai/chat/route.ts", "src/app/api/ai/solve-image/route.ts"]) {
      expect(read(route)).toMatch(/isAdmin && \(await billingExempt\(service, userId\)\)/);
    }
    const account = read("src/lib/student/account-context.ts");
    expect(account).toMatch(/isAdmin: false,\s*freePreview: true,/);
    expect(read("src/components/parity/sor-shell.tsx")).toMatch(/account\?\.freePreview && chrome !== "session"/);
  });
});

describe("SQL: önizleme hakkı gerçekten düşüyor ve iade ediliyor", () => {
  const db = new PGlite();
  const admin = "77777777-7777-4777-8777-777777777777";

  beforeAll(async () => {
    const initial = read("supabase/migrations/20250825120000_init.sql");
    const tables = initial
      .slice(initial.indexOf("CREATE TABLE public.credit_wallets"), initial.indexOf("CREATE TABLE public.payments"))
      .replace(/ REFERENCES public.profiles\(id\) ON DELETE CASCADE/g, "");
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; ${tables}
      ALTER TABLE credit_wallets ADD COLUMN period_ends_at timestamptz DEFAULT now() + interval '1 day',
        ADD COLUMN period_allowance integer DEFAULT 2, ADD COLUMN period_kind text DEFAULT 'daily';
      CREATE TABLE plans(id uuid, monthly_allowance integer, billing_period text, is_premium boolean);
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
    await db.exec(`INSERT INTO credit_rules(action_code, credit_cost) VALUES ('LESSON', 2);
      INSERT INTO auth.users(id) VALUES ('${admin}');
      INSERT INTO user_roles(user_id, role) VALUES ('${admin}', 'admin');
      INSERT INTO credit_wallets(user_id, balance, free_allowance_remaining) VALUES ('${admin}', 50, 0);
      INSERT INTO admin_free_preview(user_id) VALUES ('${admin}');`);
  }, 30_000);
  afterAll(() => db.close());

  const remaining = async () =>
    (await db.query<{ remaining: number }>("SELECT remaining FROM admin_free_preview WHERE user_id=$1", [admin])).rows[0]
      ?.remaining;
  const reserve = (key: string) =>
    db.query<{ id: string }>("SELECT credit_reserve($1, 'LESSON', $2) AS id", [admin, key]);

  it("bir ders hakkı düşer, ikincisi kapıya takılır; cüzdan aynı kalır", async () => {
    const first = (await reserve("p1")).rows[0].id;
    expect(await remaining()).toBe(0);
    await expect(reserve("p2")).rejects.toThrow("insufficient_credits");
    const wallet = (await db.query<{ balance: number; reserved: number }>(
      "SELECT balance, reserved FROM credit_wallets WHERE user_id=$1", [admin])).rows[0];
    expect(wallet).toEqual({ balance: 50, reserved: 0 });

    // Üretim düşerse hak geri gelir (ücretsiz öğrencide olduğu gibi).
    await db.query("SELECT credit_refund($1)", [first]);
    expect(await remaining()).toBe(2);
    await expect(reserve("p3")).resolves.toBeTruthy();
    expect(await remaining()).toBe(0);
  });

  it("gün geçince hak yeniden 2", async () => {
    await db.exec(`UPDATE admin_free_preview SET remaining = 0, period_ends_at = now() - interval '1 minute'`);
    await expect(reserve("p4")).resolves.toBeTruthy();
    expect(await remaining()).toBe(0);
    const ends = (await db.query<{ later: boolean }>(
      "SELECT period_ends_at > now() AS later FROM admin_free_preview WHERE user_id=$1", [admin])).rows[0];
    expect(ends.later).toBe(true);
  });

  it("önizleme kapanınca yönetici yine sınırsız", async () => {
    await db.exec(`DELETE FROM admin_free_preview`);
    await expect(reserve("p5")).resolves.toBeTruthy();
    await expect(reserve("p6")).resolves.toBeTruthy();
  });
});
