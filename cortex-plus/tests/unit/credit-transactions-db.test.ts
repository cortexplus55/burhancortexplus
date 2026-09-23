import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const db = new PGlite();
const user = "11111111-1111-4111-8111-111111111111";
beforeAll(async () => {
  const initial = readFileSync("supabase/migrations/20250825120000_init.sql", "utf8");
  const tables = initial.slice(initial.indexOf("CREATE TABLE public.credit_wallets"), initial.indexOf("CREATE TABLE public.payments"))
    .replace(/ REFERENCES public.profiles\(id\) ON DELETE CASCADE/g, "");
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; ${tables}
    ALTER TABLE credit_wallets ADD COLUMN period_ends_at timestamptz DEFAULT now() + interval '1 day',
      ADD COLUMN period_allowance integer DEFAULT 6, ADD COLUMN period_kind text DEFAULT 'daily';
    CREATE TABLE plans(id uuid, monthly_allowance integer, billing_period text, is_premium boolean);
    CREATE TABLE subscriptions(user_id uuid, plan_id uuid, status text, current_period_end timestamptz);
    CREATE FUNCTION account_verified(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION referral_multiplier(uuid) RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
    CREATE FUNCTION unverified_allowance() RETURNS integer LANGUAGE sql AS $$ SELECT 2 $$;
    INSERT INTO credit_rules(action_code, credit_cost) VALUES ('TEST',5);
  `);
  await db.exec(readFileSync("supabase/migrations/20260923120001_uat_credit_atomicity.sql", "utf8"));
}, 30_000);
beforeEach(async () => {
  await db.exec(`TRUNCATE credit_wallets, credit_reservations, credit_ledger;
    INSERT INTO credit_wallets(user_id,balance,free_allowance_remaining) VALUES ('${user}',3,3);`);
});
afterAll(() => db.close());
async function reserve(key = "op") {
  const result = await db.query<{ id: string }>("SELECT credit_reserve($1,'TEST',$2) AS id", [user, key]);
  return result.rows[0].id;
}
async function wallet() { return (await db.query<{ balance: number; free_allowance_remaining: number; reserved: number }>("SELECT balance,free_allowance_remaining,reserved FROM credit_wallets")).rows[0]; }

describe("actual PostgreSQL credit functions", () => {
  it("only one provider execution wins a shared reservation", async () => {
    const id = await reserve();
    const first = await db.query<{ result: { state: string; amount: number } }>("SELECT credit_claim_operation($1,$2) AS result", [id, user]);
    const second = await db.query<{ result: { state: string } }>("SELECT credit_claim_operation($1,$2) AS result", [id, "22222222-2222-4222-8222-222222222222"]);
    expect(first.rows[0].result).toEqual({ state: "claimed", amount: 5 });
    expect(second.rows[0].result.state).toBe("busy");
  });
  it("a refunded operation retries with a new debit and an auditable attempt", async () => {
    const id = await reserve();
    await db.query("SELECT credit_refund($1)", [id]);
    const retryId = await reserve();
    expect(retryId).not.toBe(id);
    // A delayed replay from the failed attempt cannot refund its replacement.
    await db.query("SELECT credit_refund($1)", [id]);
    expect(await wallet()).toEqual({ balance: 1, free_allowance_remaining: 0, reserved: 5 });
    const { rows } = await db.query<{ attempt: number }>("SELECT attempt FROM credit_reservations WHERE status='pending'");
    expect(rows[0].attempt).toBe(2);
    const ledger = await db.query("SELECT * FROM credit_ledger WHERE entry_type='reserve'");
    expect(ledger.rows).toHaveLength(2);
  });
  it("uses combined allowance and purchased credits", async () => {
    await reserve();
    expect(await wallet()).toEqual({ balance: 1, free_allowance_remaining: 0, reserved: 5 });
  });
  it("replayed requests debit only once", async () => {
    const ids = await Promise.all([reserve(), reserve(), reserve()]);
    expect(new Set(ids).size).toBe(1);
    expect(await wallet()).toEqual({ balance: 1, free_allowance_remaining: 0, reserved: 5 });
  });
  it("a second operation cannot overspend", async () => {
    await reserve();
    await expect(reserve("other")).rejects.toThrow("insufficient_credits");
    expect(await wallet()).toEqual({ balance: 1, free_allowance_remaining: 0, reserved: 5 });
  });
  it("pending reservations do not subtract the same paid balance twice", async () => {
    await db.exec("UPDATE credit_wallets SET balance=10, free_allowance_remaining=0");
    await reserve("first"); await reserve("second");
    expect(await wallet()).toEqual({ balance: 0, free_allowance_remaining: 0, reserved: 10 });
  });
  it("refund restores both buckets exactly once", async () => {
    const id = await reserve();
    await db.query("SELECT credit_refund($1)", [id]);
    await db.query("SELECT credit_refund($1)", [id]);
    expect(await wallet()).toEqual({ balance: 3, free_allowance_remaining: 3, reserved: 0 });
  });
  it("old allowance is not refunded into a new period", async () => {
    const id = await reserve();
    await db.exec("UPDATE credit_wallets SET free_allowance_remaining=6, period_ends_at=now()+interval '2 days'");
    await db.query("SELECT credit_refund($1)", [id]);
    expect(await wallet()).toEqual({ balance: 3, free_allowance_remaining: 6, reserved: 0 });
  });
  it("commit is idempotent and a later refund cannot add money", async () => {
    const id = await reserve();
    await db.query("SELECT credit_commit($1)", [id]);
    await db.query("SELECT credit_commit($1)", [id]);
    await db.query("SELECT credit_refund($1)", [id]);
    expect(await wallet()).toEqual({ balance: 1, free_allowance_remaining: 0, reserved: 0 });
  });
  it("admin replay makes a single adjustment", async () => {
    await db.query("SELECT credit_adjust_balance($1,4,'admin-op')", [user]);
    await db.query("SELECT credit_adjust_balance($1,4,'admin-op')", [user]);
    expect((await wallet()).balance).toBe(7);
  });
  it("records real balance before and after with bucket metadata", async () => {
    await reserve();
    const { rows } = await db.query<{ balance_before: number; balance_after: number; metadata: { free_spent: number } }>("SELECT * FROM credit_ledger WHERE entry_type='reserve'");
    expect(rows[0].balance_before).toBe(3);
    expect(rows[0].balance_after).toBe(1);
    expect(rows[0].metadata.free_spent).toBe(3);
  });
  it("untrusted API roles cannot execute wallet mutations", async () => {
    const { rows } = await db.query<{ allowed: boolean }>("SELECT has_function_privilege('authenticated','credit_reserve(uuid,text,text,integer)','EXECUTE') AS allowed");
    expect(rows[0].allowed).toBe(false);
  });
});
