import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { normalizeEmail } from "@/lib/auth/email-policy";
import { runWithBudget, undatedPrepIsLive } from "@/lib/learning/reminder-facts";

/*
  Lansman zırhı (31 Ekim 2026), gerçek SQL ile:
   1) Aynı posta kutusunun yazım farkları (Gmail noktası, "+etiket"): kayıt öncesi uyarı (`email_alias_taken`) ve davet
      hediyesi yalnız kutunun ilk hesabına (`grant_referral_gift`). Tek kutuyla sınırsız hesap açıp her birine 90 kredi
      toplanıyordu.
   2) Günlük hatırlatmanın sayıları SQL'den (`reminder_*`): satır satır okuma 1.000 satır sınırında sessizce kesiliyordu.
*/

const read = (path: string) => readFileSync(path, "utf8");

const INVITER = "11111111-1111-4111-8111-111111111111";
const FIRST = "22222222-2222-4222-8222-222222222222";
const ALIAS = "33333333-3333-4333-8333-333333333333";
const SELF_ALIAS = "44444444-4444-4444-8444-444444444444";
const OTHER = "55555555-5555-4555-8555-555555555555";

describe("aynı posta kutusu: normalize_email = normalizeEmail", () => {
  const db = new PGlite();

  beforeAll(async () => {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE SCHEMA auth;
      CREATE TABLE auth.users (id uuid PRIMARY KEY, email text, created_at timestamptz NOT NULL DEFAULT now());
      CREATE TABLE public.profiles (id uuid PRIMARY KEY, referred_by uuid);
      CREATE TABLE public.credit_wallets (user_id uuid PRIMARY KEY);
      CREATE TABLE public.credit_ledger (user_id uuid NOT NULL, idempotency_key text NOT NULL, amount integer);
      CREATE FUNCTION public.account_verified(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE FUNCTION public.credit_gift(p_user_id uuid, p_amount integer, p_key text, p_meta jsonb) RETURNS void
        LANGUAGE sql AS $$ INSERT INTO public.credit_ledger(user_id, idempotency_key, amount) VALUES (p_user_id, p_key, p_amount) $$;`);
    await db.exec(read("supabase/migrations/20261031162000_email_alias_guard.sql"));
    const users: [string, string, string][] = [
      [INVITER, "ayse.yilmaz@gmail.com", "2026-10-01T10:00:00Z"],
      [FIRST, "ali.veli@gmail.com", "2026-10-02T10:00:00Z"],
      [ALIAS, "aliveli+2@googlemail.com", "2026-10-03T10:00:00Z"],
      [SELF_ALIAS, "AyseYilmaz+kopya@gmail.com", "2026-10-04T10:00:00Z"],
      [OTHER, "zeynep@okul.edu.tr", "2026-10-05T10:00:00Z"],
    ];
    for (const [id, email, at] of users) {
      await db.query("INSERT INTO auth.users(id, email, created_at) VALUES ($1, $2, $3)", [id, email, at]);
      await db.query("INSERT INTO public.profiles(id, referred_by) VALUES ($1, $2)", [id, id === INVITER ? null : INVITER]);
      await db.query("INSERT INTO public.credit_wallets(user_id) VALUES ($1)", [id]);
    }
  });

  afterAll(async () => {
    await db.close();
  });

  it("SQL ve JS aynı kutuyu bulur", async () => {
    for (const email of ["Ali.Veli+1@gmail.com", "aliveli@googlemail.com", " a.l.i.veli@GMAIL.com ", "ali.veli+x@okul.edu.tr", "zeynep@okul.edu.tr", "bozuk"]) {
      const { rows } = await db.query<{ n: string }>("SELECT public.normalize_email($1) AS n", [email]);
      expect(rows[0]!.n, email).toBe(normalizeEmail(email));
    }
  });

  it("kayıt öncesi: kutunun başka yazımı alınmış sayılır; aynı yazım ve başka kutu değil", async () => {
    const taken = async (email: string) =>
      (await db.query<{ t: boolean }>("SELECT public.email_alias_taken($1) AS t", [email])).rows[0]!.t;
    expect(await taken("a.li.ve.li@gmail.com")).toBe(true);
    expect(await taken("aliveli+3@gmail.com")).toBe(true);
    expect(await taken("ali.veli@gmail.com")).toBe(true); // aynı kutunun üçüncü yazımı da var (ALIAS)
    expect(await taken("zeynep@okul.edu.tr")).toBe(false); // birebir aynı adres Supabase'in işi
    expect(await taken("zeynep+1@okul.edu.tr")).toBe(true);
    expect(await taken("yeni.ogrenci@gmail.com")).toBe(false);
  });

  it("davet hediyesi: kutunun ilk hesabı alır; sonraki yazımı ve davet edenin kendi kutusu almaz", async () => {
    for (const id of [FIRST, ALIAS, SELF_ALIAS, OTHER]) await db.query("SELECT public.grant_referral_gift($1)", [id]);
    const { rows } = await db.query<{ idempotency_key: string }>("SELECT idempotency_key FROM credit_ledger ORDER BY idempotency_key");
    const keys = rows.map((row) => row.idempotency_key);
    expect(keys).toContain(`referral-gift:${FIRST}`);
    expect(keys).toContain(`referral-gift:${OTHER}`);
    expect(keys).not.toContain(`referral-gift:${ALIAS}`);
    expect(keys).not.toContain(`referral-gift:${SELF_ALIAS}`);
    // Davet eden yalnız gerçek iki davet için.
    expect(keys.filter((key) => key.startsWith("referral-gift-inviter:"))).toHaveLength(2);
  });

  it("göç eklemeli; hediye 90 ve davet eden en çok 3 aynen; yetkiler yalnız sunucu rolünde", () => {
    const sql = read("supabase/migrations/20261031162000_email_alias_guard.sql").replace(/^--.*$/gm, "");
    expect(sql).not.toMatch(/\bDROP\b/);
    expect(sql).toContain("v_gift integer := 90;");
    expect(sql).toContain("LIKE 'referral-gift-inviter:%') < 3 THEN");
    for (const fn of ["email_alias_taken(text)", "grant_referral_gift(uuid)"]) {
      expect(sql).toContain(`REVOKE ALL ON FUNCTION public.${fn} FROM PUBLIC, anon, authenticated;`);
      expect(sql).toContain(`GRANT EXECUTE ON FUNCTION public.${fn} TO service_role;`);
    }
    expect(read("src/app/kayit/email-check.ts")).toContain('rpc("email_alias_taken", { p_email: address })');
  });
});

describe("hatırlatma sayıları SQL'de", () => {
  const db = new PGlite();
  const PREP_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
  const PREP_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

  beforeAll(async () => {
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role;
      CREATE TABLE public.exam_prep_nodes (exam_prep_id uuid NOT NULL, status text NOT NULL);
      CREATE TABLE public.exam_prep_node_attempts (user_id uuid NOT NULL, updated_at timestamptz NOT NULL);
      CREATE TABLE public.exam_prep_review_items (exam_prep_id uuid NOT NULL, status text NOT NULL, due_on date NOT NULL);`);
    await db.exec(read("supabase/migrations/20261031163000_reminder_facts.sql"));
    // A: 1.200 düğüm, yalnız sonuncusu bitmemiş (satır satır okuma 1.000'de keserdi). B: hepsi bitmiş.
    await db.query(`INSERT INTO exam_prep_nodes SELECT $1, CASE WHEN g = 1200 THEN 'ready' ELSE 'done' END FROM generate_series(1, 1200) g`, [PREP_A]);
    await db.query(`INSERT INTO exam_prep_nodes SELECT $1, 'done' FROM generate_series(1, 30)`, [PREP_B]);
    await db.query(`INSERT INTO exam_prep_node_attempts SELECT $1, timestamptz '2026-10-01T00:00:00Z' + (g || ' minutes')::interval FROM generate_series(1, 1500) g`, [INVITER]);
    await db.query(`INSERT INTO exam_prep_review_items VALUES ($1, 'active', '2026-10-30'), ($1, 'active', '2026-10-31'), ($1, 'active', '2026-11-02'), ($1, 'learned', '2026-10-01')`, [PREP_B]);
  });

  afterAll(async () => {
    await db.close();
  });

  it("bitmemiş yol, son etkinlik ve günü gelen tekrar hazırlık/öğrenci başına tek satır", async () => {
    const unfinished = await db.query<{ exam_prep_id: string }>("SELECT * FROM public.reminder_unfinished_preps($1)", [[PREP_A, PREP_B]]);
    expect(unfinished.rows.map((row) => row.exam_prep_id)).toEqual([PREP_A]);
    const last = await db.query<{ user_id: string; last_at: Date }>("SELECT * FROM public.reminder_last_activity($1)", [[INVITER, OTHER]]);
    expect(last.rows).toHaveLength(1);
    expect(new Date(last.rows[0]!.last_at).toISOString()).toBe("2026-10-02T01:00:00.000Z");
    const due = await db.query<{ exam_prep_id: string; due: number }>("SELECT * FROM public.reminder_due_reviews($1, '2026-10-31')", [[PREP_A, PREP_B]]);
    expect(due.rows).toEqual([{ exam_prep_id: PREP_B, due: 2 }]);
  });
});

describe("hatırlatma kuralları", () => {
  const now = new Date("2026-10-31T16:00:00Z");

  it("tarihsiz hazırlık yalnız son 21 günde kurulmuş ya da çalışılmışsa; tarihli her zaman", () => {
    expect(undatedPrepIsLive({ exam_date: "2026-12-01", created_at: "2025-01-01T00:00:00Z" }, undefined, now)).toBe(true);
    expect(undatedPrepIsLive({ exam_date: null, created_at: "2026-10-20T00:00:00Z" }, undefined, now)).toBe(true);
    expect(undatedPrepIsLive({ exam_date: null, created_at: "2026-08-01T00:00:00Z" }, "2026-10-29T00:00:00Z", now)).toBe(true);
    expect(undatedPrepIsLive({ exam_date: null, created_at: "2026-08-01T00:00:00Z" }, "2026-09-01T00:00:00Z", now)).toBe(false);
  });

  it("e-posta kuyruğu sınırlı eşzamanlılıkla, süre dolunca yenisini başlatmaz", async () => {
    let clock = 0;
    let running = 0;
    let peak = 0;
    const result = await runWithBudget(
      Array.from({ length: 40 }, (_, index) => index),
      async () => {
        running += 1;
        peak = Math.max(peak, running);
        await new Promise((resolve) => setTimeout(resolve, 1));
        clock += 10;
        running -= 1;
        return true;
      },
      { concurrency: 4, deadline: 200, now: () => clock },
    );
    expect(peak).toBeLessThanOrEqual(4);
    expect(result.done + result.skipped).toBe(40);
    expect(result.skipped).toBeGreaterThan(0);
  });

  it("cron tarihsiz hazırlığı seçer, sayfa sayfa okur; e-posta süreli", () => {
    const facts = read("src/lib/learning/reminder-facts.ts");
    expect(facts).toContain(".or(`exam_date.gte.${today},exam_date.is.null`)");
    expect(facts).toContain(".range(from, from + REMINDER_PAGE - 1)");
    const cron = read("src/app/api/cron/study-reminders/route.ts");
    expect(cron).toContain("for await (const preps of reminderPrepPages(service, today))");
    expect(cron).toContain("if (!undatedPrepIsLive(prep, last, now)) continue;");
    expect(cron).toContain("deadline: startedAt + MAIL_BUDGET_MS");
    expect(cron).not.toContain(".limit(2000)");
  });
});
