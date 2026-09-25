import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

const db = new PGlite();
const user = "11111111-1111-4111-8111-111111111111";
const admin = "33333333-3333-4333-8333-333333333333";
beforeAll(async () => {
  const initial = readFileSync("supabase/migrations/20250825120000_init.sql", "utf8");
  const tables = initial.slice(initial.indexOf("CREATE TABLE public.credit_wallets"), initial.indexOf("CREATE TABLE public.payments"))
    .replace(/ REFERENCES public.profiles\(id\) ON DELETE CASCADE/g, "");
  await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; ${tables}
    ALTER TABLE credit_wallets ADD COLUMN period_ends_at timestamptz DEFAULT now() + interval '1 day',
      ADD COLUMN period_allowance integer DEFAULT 6, ADD COLUMN period_kind text DEFAULT 'daily';
    CREATE TABLE plans(id uuid, monthly_allowance integer, billing_period text, is_premium boolean);
    CREATE TABLE subscriptions(user_id uuid, plan_id uuid, status text, current_period_end timestamptz);
    CREATE TABLE user_roles(user_id uuid NOT NULL, role text NOT NULL, revoked_at timestamptz);
    CREATE FUNCTION account_verified(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
    CREATE FUNCTION referral_multiplier(uuid) RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
    CREATE FUNCTION unverified_allowance() RETURNS integer LANGUAGE sql AS $$ SELECT 2 $$;
    INSERT INTO credit_rules(action_code, credit_cost) VALUES ('TEST',5), ('FREE_TEST',0);
  `);
  await db.exec(readFileSync("supabase/migrations/20260923120001_uat_credit_atomicity.sql", "utf8"));
  await db.exec(readFileSync("supabase/migrations/20260925180000_admin_credit_bypass.sql", "utf8"));
}, 30_000);
beforeEach(async () => {
  await db.exec(`TRUNCATE credit_wallets, credit_reservations, credit_ledger, user_roles;
    INSERT INTO credit_wallets(user_id,balance,free_allowance_remaining) VALUES ('${user}',3,3);`);
});
afterAll(() => db.close());
async function reserve(key = "op") {
  const result = await db.query<{ id: string }>("SELECT credit_reserve($1,'TEST',$2) AS id", [user, key]);
  return result.rows[0].id;
}
async function wallet() { return (await db.query<{ balance: number; free_allowance_remaining: number; reserved: number }>("SELECT balance,free_allowance_remaining,reserved FROM credit_wallets WHERE user_id=$1", [user])).rows[0]; }

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
  it("does not debit an admin and keeps a zero ledger row", async () => {
    await db.exec(`INSERT INTO user_roles(user_id, role) VALUES ('${admin}', 'admin');
      INSERT INTO credit_wallets(user_id, balance, free_allowance_remaining) VALUES ('${admin}', 0, 0);`);
    const id = (await db.query<{ id: string }>("SELECT credit_reserve($1,'TEST','admin-op') AS id", [admin])).rows[0].id;
    const adminWallet = async () => (await db.query<{ balance: number; free_allowance_remaining: number; reserved: number }>("SELECT balance, free_allowance_remaining, reserved FROM credit_wallets WHERE user_id=$1", [admin])).rows[0];
    expect(await adminWallet()).toEqual({ balance: 0, free_allowance_remaining: 0, reserved: 0 });
    const { rows } = await db.query<{ delta: number; entry_type: string; metadata: { admin_bypass?: boolean; nominal_cost?: number } }>("SELECT delta, entry_type, metadata FROM credit_ledger WHERE user_id=$1", [admin]);
    expect(rows).toHaveLength(1);
    expect(rows[0].delta).toBe(0);
    expect(rows[0].entry_type).toBe("reserve");
    expect(rows[0].metadata.admin_bypass).toBe(true);
    expect(rows[0].metadata.nominal_cost).toBe(5);
    await db.query("SELECT credit_commit($1)", [id]);
    await db.query("SELECT credit_refund($1)", [id]);
    expect(await adminWallet()).toEqual({ balance: 0, free_allowance_remaining: 0, reserved: 0 });
  });
  it("debits a non-admin the same way", async () => {
    await reserve();
    expect(await wallet()).toEqual({ balance: 1, free_allowance_remaining: 0, reserved: 5 });
    const { rows } = await db.query<{ metadata: { admin_bypass?: boolean } }>("SELECT metadata FROM credit_ledger WHERE entry_type='reserve'");
    expect(rows[0].metadata.admin_bypass).toBeUndefined();
  });
  it("blocks a non-admin with an empty wallet", async () => {
    await db.exec("UPDATE credit_wallets SET balance=0, free_allowance_remaining=0");
    await expect(reserve("empty")).rejects.toThrow("insufficient_credits");
    expect(await wallet()).toEqual({ balance: 0, free_allowance_remaining: 0, reserved: 0 });
  });
  it("debits a revoked admin like a normal user", async () => {
    await db.exec(`INSERT INTO user_roles(user_id, role, revoked_at) VALUES ('${admin}', 'admin', now());
      INSERT INTO credit_wallets(user_id, balance, free_allowance_remaining) VALUES ('${admin}', 3, 3);`);
    await db.query("SELECT credit_reserve($1,'TEST','revoked-op')", [admin]);
    const row = (await db.query<{ balance: number; free_allowance_remaining: number; reserved: number }>("SELECT balance, free_allowance_remaining, reserved FROM credit_wallets WHERE user_id=$1", [admin])).rows[0];
    expect(row).toEqual({ balance: 1, free_allowance_remaining: 0, reserved: 5 });
  });
  it("grant adjustment increases balance and writes a grant row", async () => {
    await db.query("SELECT credit_adjust_balance($1, 10, 'grant-key', 'grant', 'admin:actor')", [user]);
    expect((await wallet()).balance).toBe(13);
    const { rows } = await db.query<{ delta: number; entry_type: string }>("SELECT delta, entry_type FROM credit_ledger WHERE idempotency_key='grant-key'");
    expect(rows[0]).toEqual({ delta: 10, entry_type: "grant" });
  });
  it("untrusted API roles cannot execute wallet mutations", async () => {
    const { rows } = await db.query<{ allowed: boolean }>("SELECT has_function_privilege('authenticated','credit_reserve(uuid,text,text,integer)','EXECUTE') AS allowed");
    expect(rows[0].allowed).toBe(false);
  });
});

type WalletRow = { balance: number; free_allowance_remaining: number; reserved: number };
type LedgerMeta = { admin_bypass?: boolean; nominal_cost?: number; action_code?: string; attempt?: number };

async function makeAdmin(balance: number, free: number, extra = "") {
  await db.exec(`INSERT INTO user_roles(user_id, role) VALUES ('${admin}', 'admin');
    INSERT INTO credit_wallets(user_id, balance, free_allowance_remaining${extra ? ", period_ends_at" : ""})
    VALUES ('${admin}', ${balance}, ${free}${extra ? `, ${extra}` : ""});`);
}
async function adminWallet(): Promise<WalletRow> {
  return (await db.query<WalletRow>("SELECT balance, free_allowance_remaining, reserved FROM credit_wallets WHERE user_id=$1", [admin])).rows[0];
}
async function adminReserve(key: string, action = "TEST", quantity = 1) {
  return (await db.query<{ id: string }>("SELECT credit_reserve($1,$2,$3,$4) AS id", [admin, action, key, quantity])).rows[0].id;
}

describe("kurucu muafiyeti — gerçek PostgreSQL fonksiyonları", () => {
  it("dönemlik ücretsiz hak tüketilmez", async () => {
    await makeAdmin(0, 6);
    await adminReserve("free-allowance");
    expect(await adminWallet()).toEqual({ balance: 0, free_allowance_remaining: 6, reserved: 0 });
  });

  it("süresi dolmuş dönem yöneticide yeniden kurulmaz, hak aynı kalır", async () => {
    await makeAdmin(2, 1, "now() - interval '1 day'");
    await adminReserve("expired-period");
    expect(await adminWallet()).toEqual({ balance: 2, free_allowance_remaining: 1, reserved: 0 });
  });

  it("defter satırı işlem kodunu ve miktarla çarpılmış nominal bedeli taşır", async () => {
    await makeAdmin(0, 0);
    await adminReserve("audio-op", "TEST", 3);
    const { rows } = await db.query<{ delta: number; action_code: string; metadata: LedgerMeta }>(
      "SELECT delta, action_code, metadata FROM credit_ledger WHERE user_id=$1", [admin]);
    expect(rows).toHaveLength(1);
    expect(rows[0].delta).toBe(0);
    expect(rows[0].action_code).toBe("TEST");
    expect(rows[0].metadata).toMatchObject({ admin_bypass: true, nominal_cost: 15, action_code: "TEST", attempt: 1 });
  });

  it("iade cüzdana dokunmaz, deftere satır eklemez; aynı anahtarla yeniden deneme açılır", async () => {
    await makeAdmin(0, 0);
    const first = await adminReserve("retry-op");
    await db.query("SELECT credit_refund($1)", [first]);
    expect(await adminWallet()).toEqual({ balance: 0, free_allowance_remaining: 0, reserved: 0 });
    const refunds = await db.query("SELECT 1 FROM credit_ledger WHERE user_id=$1 AND entry_type='refund'", [admin]);
    expect(refunds.rows).toHaveLength(0);

    const second = await adminReserve("retry-op");
    expect(second).not.toBe(first);
    const claim = await db.query<{ result: { state: string; amount: number } }>(
      "SELECT credit_claim_operation($1,$2) AS result", [second, user]);
    expect(claim.rows[0].result).toEqual({ state: "claimed", amount: 0 });
    const { rows } = await db.query<{ metadata: LedgerMeta }>(
      "SELECT metadata FROM credit_ledger WHERE user_id=$1 AND entry_type='reserve' ORDER BY (metadata->>'attempt')::int", [admin]);
    expect(rows.map((r) => r.metadata.attempt)).toEqual([1, 2]);
  });

  it("onay sıfır tutarlı rezervasyonu hatasız kapatır", async () => {
    await makeAdmin(0, 0);
    const id = await adminReserve("commit-op");
    await db.query("SELECT credit_commit($1)", [id]);
    const { rows } = await db.query<{ status: string }>("SELECT status FROM credit_reservations WHERE id=$1", [id]);
    expect(rows[0].status).toBe("committed");
    expect(await adminWallet()).toEqual({ balance: 0, free_allowance_remaining: 0, reserved: 0 });
  });

  it("yönetici olmayanda sıfır tutar yalnızca kural gerçekten ücretsizse oluşur", async () => {
    await db.query("SELECT credit_reserve($1,'FREE_TEST','free-op')", [user]);
    await db.query("SELECT credit_reserve($1,'TEST','paid-op')", [user]);
    const { rows } = await db.query<{ action_code: string; amount: number }>(
      "SELECT action_code, amount FROM credit_reservations WHERE user_id=$1 ORDER BY action_code", [user]);
    expect(rows).toEqual([
      { action_code: "FREE_TEST", amount: 0 },
      { action_code: "TEST", amount: 5 },
    ]);
  });

  it("is_admin yalnızca authenticated ve service_role tarafından çağrılabilir", async () => {
    const check = async (role: string) => (await db.query<{ allowed: boolean }>(
      `SELECT has_function_privilege('${role}','is_admin(uuid)','EXECUTE') AS allowed`)).rows[0].allowed;
    expect(await check("authenticated")).toBe(true);
    expect(await check("service_role")).toBe(true);
    expect(await check("anon")).toBe(false);
  });

  it("migration ikinci kez çalıştırıldığında hata vermez ve davranış aynı kalır", async () => {
    await db.exec(readFileSync("supabase/migrations/20260925180000_admin_credit_bypass.sql", "utf8"));
    await makeAdmin(0, 0);
    await adminReserve("after-rerun");
    expect(await adminWallet()).toEqual({ balance: 0, free_allowance_remaining: 0, reserved: 0 });
    await expect(reserve("rerun-user")).resolves.toBeTruthy();
    expect(await wallet()).toEqual({ balance: 1, free_allowance_remaining: 0, reserved: 5 });
  });
});

describe("credit_adjust_balance — yönetim panelinden kredi ayarı", () => {
  const ledger = async (key: string) => (await db.query<{ delta: number; entry_type: string }>(
    "SELECT delta, entry_type FROM credit_ledger WHERE idempotency_key=$1", [key])).rows;

  it("+5 bakiyeyi artırır ve grant satırı yazar", async () => {
    await db.query("SELECT credit_adjust_balance($1, 5, 'plus-five', 'grant', 'admin:actor')", [user]);
    expect((await wallet()).balance).toBe(8);
    expect(await ledger("plus-five")).toEqual([{ delta: 5, entry_type: "grant" }]);
  });

  it("-3 bakiyeyi düşürür ve adjustment satırı yazar", async () => {
    await db.query("SELECT credit_adjust_balance($1, -3, 'minus-three', 'adjustment', 'admin:actor')", [user]);
    expect((await wallet()).balance).toBe(0);
    expect(await ledger("minus-three")).toEqual([{ delta: -3, entry_type: "adjustment" }]);
  });

  it("bakiye sıfırın altına inmez; cüzdan ve defter değişmez", async () => {
    await expect(
      db.query("SELECT credit_adjust_balance($1, -4, 'too-much', 'adjustment', 'admin:actor')", [user]),
    ).rejects.toThrow("insufficient_balance");
    expect((await wallet()).balance).toBe(3);
    expect(await ledger("too-much")).toEqual([]);
  });
});
