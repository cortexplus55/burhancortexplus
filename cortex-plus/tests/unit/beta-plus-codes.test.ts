import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  BETA_CODE_ALPHABET,
  generateBetaCode,
  generateBetaCodes,
  normalizePromoCode,
  PROMO_CODE_PATTERN,
  redeemFailureMessage,
  redeemSuccessMessage,
} from "@/lib/billing/promo-codes";
import { isTrialPeriod, trialNotice } from "@/lib/payments/subscription";

/**
 * Kapalı beta (19 Ekim 2026, ürün sahibinin kararı): "2 hafta ücretsiz Plus kodu". Her öğrenciye
 * tek kullanımlık kod; 14 gün Plus açılır, bitince hesap ücretsize döner, ücret alınmaz. Kodlar
 * yönetim panelinde üretilir, öğrenci Abonelik sayfasında girer. Göç PGlite'ta gerçekten çalışır:
 * kod, abonelik, cüzdan ve deneme bitince ücretsiz günlük hakka dönüş.
 */
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

describe("beta kodu: üretim ve biçim", () => {
  it("BETA-XXXX-XXXX, karışan harf yok, desene uyuyor", () => {
    const code = generateBetaCode();
    expect(code).toMatch(/^BETA-[2-9A-HJKMNP-Z]{4}-[2-9A-HJKMNP-Z]{4}$/);
    expect(PROMO_CODE_PATTERN.test(code)).toBe(true);
    for (const ambiguous of ["0", "O", "1", "I", "L"]) expect(BETA_CODE_ALPHABET).not.toContain(ambiguous);
  });

  it("partide kodlar birbirinden farklı; alfabe dışı bayt atılır", () => {
    expect(new Set(generateBetaCodes(200)).size).toBe(200);
    // 248 ve üstü (31'in katının üstü) atılmalı; yalnız 255 veren kaynak sonsuz döngüye girmez çünkü 0 da gelir.
    let call = 0;
    const biased = (count: number) => Uint8Array.from({ length: count }, (_, i) => ((call++ + i) % 2 ? 255 : 0));
    expect(generateBetaCode(biased)).toBe("BETA-2222-2222");
  });

  it("öğrencinin yazdığı kod düzelir", () => {
    expect(normalizePromoCode("  beta-7kqm x3pd ")).toBe("BETA-7KQMX3PD");
    expect(normalizePromoCode("beta-ıiii")).toBe("BETA-IIII");
  });

  it("mesajlar: kredi sayısı yok, ücret alınmaz denir, bilinmeyen sebep geçersiz kod", () => {
    const plus = redeemSuccessMessage({ plusDays: 14, plusUntil: "2026-11-02T10:00:00Z", credits: 0 });
    expect(plus).toBe("14 gün Plus açıldı · 2 Kasım tarihine kadar. Bitince ücretsiz hesapla devam edersin; ücret alınmaz.");
    const gift = redeemSuccessMessage({ plusDays: null, plusUntil: null, credits: 120 });
    // Kredi v3 (24 Ekim 2026): ders 30, mesaj 3 kredi.
    expect(gift).toBe("Hediye eklendi: yaklaşık 4 ders ya da 40 mesaj.");
    expect(gift).not.toMatch(/kredi/);
    expect(redeemFailureMessage("trial_used")).toContain("bir kez");
    expect(redeemFailureMessage("whatever")).toBe(redeemFailureMessage("invalid_code"));
  });
});

describe("beta kodu: deneme mi ücretli mi", () => {
  it("trial_until dönem bitişine eşitken deneme; ödeme dönemi uzatınca ücretli", () => {
    const end = "2026-11-02T10:00:00.000Z";
    expect(isTrialPeriod({ trial_until: end, current_period_end: end })).toBe(true);
    expect(isTrialPeriod({ trial_until: end, current_period_end: "2026-12-02T10:00:00.000Z" })).toBe(false);
    expect(isTrialPeriod({ trial_until: null, current_period_end: end })).toBe(false);
  });

  it("bildirimler yenile demez, ücretsize dönüşü söyler", () => {
    expect(trialNotice("reminder", "yarın")).toEqual({
      title: "Plus denemen yarın bitiyor",
      body: expect.stringContaining("ücretsiz hesapla devam edersin"),
    });
    expect(trialNotice("expired").body).toContain("ücret alınmadı");
    expect(trialNotice("expired").body).not.toMatch(/yenile/i);
  });
});

describe("beta kodu: göç canlı gibi çalışıyor", () => {
  const db = new PGlite();
  const student = "11111111-1111-4111-8111-111111111111";
  const other = "22222222-2222-4222-8222-222222222222";
  const paid = "33333333-3333-4333-8333-333333333333";
  const plusPlan = "aaaaaaaa-0000-4000-8000-000000000001";

  beforeAll(async () => {
    const initial = read("supabase/migrations/20250825120000_init.sql");
    const credit = initial
      .slice(initial.indexOf("CREATE TABLE public.credit_wallets"), initial.indexOf("CREATE TABLE public.payments"))
      .replace(/ REFERENCES public.profiles\(id\) ON DELETE CASCADE/g, "");
    const promo = initial
      .slice(initial.indexOf("CREATE TABLE public.promo_codes"), initial.indexOf("-- M3 AI & chat"))
      .replace(/ REFERENCES public.profiles\(id\) ON DELETE CASCADE/g, "");
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; ${credit} ${promo}
      ALTER TABLE credit_wallets ADD COLUMN period_ends_at timestamptz DEFAULT now() + interval '1 day',
        ADD COLUMN period_allowance integer DEFAULT 2, ADD COLUMN period_kind text DEFAULT 'daily';
      CREATE TABLE plans(id uuid PRIMARY KEY, slug text, name text, credit_amount integer DEFAULT 0,
        monthly_allowance integer, billing_period text, is_premium boolean, updated_at timestamptz);
      CREATE TABLE subscriptions(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, plan_id uuid,
        status text NOT NULL DEFAULT 'inactive', current_period_start timestamptz, current_period_end timestamptz,
        billing_period text, cancel_at_period_end boolean NOT NULL DEFAULT false, auto_renew boolean NOT NULL DEFAULT false,
        renewal_reminder_sent_at timestamptz, expired_notified_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now());
      CREATE UNIQUE INDEX subscriptions_one_active_per_user ON subscriptions(user_id) WHERE status = 'active';
      CREATE TABLE notifications(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid NOT NULL, title text NOT NULL,
        body text, read_at timestamptz, created_at timestamptz NOT NULL DEFAULT now());
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
    await db.exec(`INSERT INTO credit_rules(action_code, credit_cost) VALUES ('AI_CHAT_STANDARD', 1), ('STUDY_PLAN_GENERATE', 2);
      INSERT INTO plans(id, slug, name, monthly_allowance, billing_period, is_premium) VALUES
        ('${plusPlan}', 'plus-aylik', 'Plus', 400, 'monthly', true);`);
    await db.exec(read("supabase/migrations/20261008120000_credit_system_v2.sql"));
    await db.exec(read("supabase/migrations/20261019160000_beta_plus_codes.sql"));
    await db.exec(`INSERT INTO promo_codes(code, credit_amount, max_redemptions, plus_days, batch) VALUES
        ('BETA-AAAA-AAAA', 0, 1, 14, 'beta-1'), ('BETA-BBBB-BBBB', 0, 1, 14, 'beta-1'), ('BETA-CCCC-CCCC', 0, 1, 14, 'beta-1');
      INSERT INTO promo_codes(code, credit_amount, max_redemptions) VALUES ('HEDIYE-120', 120, NULL);
      INSERT INTO promo_codes(code, credit_amount, active) VALUES ('KAPALI', 50, false);
      INSERT INTO credit_wallets(user_id, balance, free_allowance_remaining) VALUES ('${student}', 0, 6), ('${other}', 0, 6), ('${paid}', 0, 0);
      INSERT INTO subscriptions(user_id, plan_id, status, current_period_start, current_period_end, billing_period)
        VALUES ('${paid}', '${plusPlan}', 'active', now(), now() + interval '20 days', 'monthly');`);
  }, 30_000);
  afterAll(() => db.close());

  const redeem = async (user: string, code: string) =>
    (await db.query<{ r: Record<string, unknown> }>("SELECT redeem_promo_code($1, $2) AS r", [user, code])).rows[0]!.r;
  const wallet = async (user: string) =>
    (await db.query<{ balance: number; free_allowance_remaining: number; period_allowance: number; period_kind: string; days: number }>(
      `SELECT balance, free_allowance_remaining, period_allowance, period_kind,
              round(extract(epoch FROM period_ends_at - now()) / 86400)::int AS days
         FROM credit_wallets WHERE user_id = $1`, [user])).rows[0];

  it("kod 14 gün Plus açar: abonelik denemedir, hak 14 güne orantılı, cüzdan dönemi aynı gün biter", async () => {
    const result = await redeem(student, "  beta-aaaa-aaaa ");
    expect(result).toMatchObject({ ok: true, plusDays: 14, credits: 0 });
    const sub = (await db.query<{ status: string; days: number; trial: boolean; slug: string }>(
      `SELECT s.status, round(extract(epoch FROM s.current_period_end - now()) / 86400)::int AS days,
              s.trial_until = s.current_period_end AS trial, p.slug
         FROM subscriptions s JOIN plans p ON p.id = s.plan_id WHERE s.user_id = $1`, [student])).rows;
    expect(sub).toEqual([{ status: "active", days: 14, trial: true, slug: "plus-aylik" }]);
    // 7.200 × 14 / 30 = 3.360
    expect(await wallet(student)).toMatchObject({ free_allowance_remaining: 3360, period_allowance: 3360, period_kind: "monthly", days: 14 });
    const notes = await db.query<{ title: string }>("SELECT title FROM notifications WHERE user_id = $1", [student]);
    expect(notes.rows).toEqual([{ title: "Plus denemen açıldı" }]);
    const count = await db.query<{ redemption_count: number }>("SELECT redemption_count FROM promo_codes WHERE code = 'BETA-AAAA-AAAA'");
    expect(count.rows[0]!.redemption_count).toBe(1);
  });

  it("kod tek kişilik; bir hesap denemeyi bir kez alır; ücretli Plus ezilmez", async () => {
    expect(await redeem(student, "BETA-AAAA-AAAA")).toMatchObject({ ok: false, reason: "already_redeemed" });
    expect(await redeem(other, "BETA-AAAA-AAAA")).toMatchObject({ ok: false, reason: "used_up" });
    expect(await redeem(student, "BETA-BBBB-BBBB")).toMatchObject({ ok: false, reason: "trial_used" });
    expect(await redeem(paid, "BETA-CCCC-CCCC")).toMatchObject({ ok: false, reason: "already_premium" });
    const paidSub = await db.query<{ trial_until: string | null }>("SELECT trial_until FROM subscriptions WHERE user_id = $1", [paid]);
    expect(paidSub.rows).toEqual([{ trial_until: null }]);
    expect(await redeem(other, "YOK-BOYLE")).toMatchObject({ ok: false, reason: "invalid_code" });
    expect(await redeem(other, "KAPALI")).toMatchObject({ ok: false, reason: "invalid_code" });
  });

  it("deneme bitince hesap ücretsiz günlük hakka döner", async () => {
    await db.exec(`UPDATE subscriptions SET current_period_end = now() - interval '1 minute', trial_until = now() - interval '1 minute'
                    WHERE user_id = '${student}';
                   UPDATE credit_wallets SET period_ends_at = now() - interval '1 minute' WHERE user_id = '${student}';`);
    await db.query("SELECT credit_reserve($1, 'AI_CHAT_STANDARD', 'after-trial', 1)", [student]);
    expect(await wallet(student)).toMatchObject({ period_allowance: 6, period_kind: "daily", free_allowance_remaining: 3 });
  });

  it("kampanya kodu hediye kredi verir ve deftere yazar; deneme hakkını yemez", async () => {
    expect(await redeem(other, "hediye-120")).toMatchObject({ ok: true, plusDays: null, credits: 120 });
    expect((await wallet(other))!.balance).toBe(120);
    const ledger = await db.query<{ delta: number; entry_type: string }>(
      "SELECT delta, entry_type FROM credit_ledger WHERE user_id = $1 AND action_code = 'PROMO_CODE'", [other]);
    expect(ledger.rows).toEqual([{ delta: 120, entry_type: "grant" }]);
    expect(await redeem(other, "BETA-CCCC-CCCC")).toMatchObject({ ok: true, plusDays: 14 });
  });

  it("ortak kod (20 Ekim 2026): ilk N kişi, herkes bir kez; deneme hakkı olmayan yer kapmaz", async () => {
    const [a, b, c] = [
      "44444444-4444-4444-8444-444444444444",
      "55555555-5555-4555-8555-555555555555",
      "66666666-6666-4666-8666-666666666666",
    ];
    await db.exec(`INSERT INTO promo_codes(code, credit_amount, max_redemptions, plus_days, batch) VALUES ('CORTEXBETA', 0, 2, 14, 'ortak-1');
      INSERT INTO credit_wallets(user_id, balance, free_allowance_remaining) VALUES ('${a}', 0, 6), ('${b}', 0, 6), ('${c}', 0, 6);`);
    expect(await redeem(a, " cortexbeta ")).toMatchObject({ ok: true, plusDays: 14 });
    expect(await redeem(a, "CORTEXBETA")).toMatchObject({ ok: false, reason: "already_redeemed" });
    // Denemesini başka koddan almış öğrenci reddedilir ve kontenjandan yer yemez.
    expect(await redeem(student, "CORTEXBETA")).toMatchObject({ ok: false, reason: "trial_used" });
    expect(await redeem(paid, "CORTEXBETA")).toMatchObject({ ok: false, reason: "already_premium" });
    expect(await redeem(b, "CORTEXBETA")).toMatchObject({ ok: true, plusDays: 14 });
    expect(await redeem(c, "CORTEXBETA")).toMatchObject({ ok: false, reason: "used_up" });
    const count = await db.query<{ redemption_count: number }>("SELECT redemption_count FROM promo_codes WHERE code = 'CORTEXBETA'");
    expect(count.rows[0]!.redemption_count).toBe(2);
    // Mesaj ortak koda da uyar: "her kod tek kişilik" 3. kişiye yanlış olurdu.
    expect(redeemFailureMessage("used_up")).toBe("Bu kodun kullanım hakkı doldu.");
  });

  it("fonksiyonu yalnız sunucu çağırır", async () => {
    const grants = await db.query<{ grantee: string }>(
      `SELECT grantee FROM information_schema.role_routine_grants
        WHERE routine_name = 'redeem_promo_code' AND privilege_type = 'EXECUTE' ORDER BY grantee`);
    const names = grants.rows.map((row) => row.grantee);
    expect(names).toContain("service_role");
    expect(names).not.toContain("anon");
    expect(names).not.toContain("authenticated");
  });
});

describe("beta kodu: bekçi", () => {
  it("öğrenci kodu Abonelik sayfasında girer; bağlantı kutuyu doldurur, giriş/kayıt kodu taşır", () => {
    expect(read("src/app/pay/page.tsx")).toContain("<PromoRedeem initialCode={initialCode} />");
    const route = read("src/app/api/promo/redeem/route.ts");
    expect(route).toContain('scope: "promo-redeem", limit: 5, dailyLimit: 20');
    expect(route).toContain('service.rpc("redeem_promo_code"');
    expect(read("src/lib/supabase/middleware.ts")).toContain('url.searchParams.set("next", `${path}${request.nextUrl.search}`)');
    expect(read("src/app/giris/giris-inner.tsx")).toContain("`/kayit?next=${encodeURIComponent(next)}`");
  });

  it("hatırlatma ve abonelik kartı denemeyi ayırır", () => {
    const cron = read("src/app/api/cron/subscription-renewal/route.ts");
    expect(cron).toContain("trial_until");
    expect(cron).toContain('trialNotice("expired")');
    expect(cron).toContain('trialNotice("reminder", whenText)');
    expect(read("src/app/odemeler/page.tsx")).toContain("trial: isTrialPeriod(sub)");
  });
});
