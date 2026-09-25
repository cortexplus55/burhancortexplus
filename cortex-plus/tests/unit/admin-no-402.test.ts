import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  entitlementsFromSubscriptionRow,
  requireFeature,
} from "@/lib/billing/entitlements";
import { claimPhotoPages } from "@/lib/documents/photo-quota";

/*
  Kurucu hiçbir rotada 402 almaz — tek dosyada kanıt.

  Sunucuda 402 üreten her satır aşağıda sınıflanıyor. Sınıfı bilinmeyen yeni
  bir 402 eklenirse test düşer: onu yazan kişi yöneticinin ne göreceğine
  karar vermek zorunda kalır.

    insufficient_credits  →  credit_reserve'den gelir; yöneticide hiç atılmaz
                             (aşağıda her eylem kodu için gerçek PostgreSQL'de)
    premium_required      →  requireFeature; oturum açmış her hesapta açık
    fotoğraf kotası       →  claimPhotoPages; yöneticide sayılmaz
*/

const ROOT = process.cwd();

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

type Producer = { file: string; line: number; kind: "credits" | "premium" | "photo" | "unknown" };

function serverProducers(): Producer[] {
  const files = [...walk(path.join(ROOT, "src/app/api")), ...walk(path.join(ROOT, "src/lib"))];
  const found: Producer[] = [];
  for (const file of files) {
    const lines = readFileSync(file, "utf8").split("\n");
    lines.forEach((text, index) => {
      const code = text.trim();
      if (!/\b402\b/.test(code)) return;
      if (code.startsWith("//") || code.startsWith("*") || code.startsWith("/*")) return;
      const window = lines.slice(Math.max(0, index - 8), index + 1).join("\n");
      const kind = /insufficient_credits/.test(window)
        ? "credits"
        : /premium_required/.test(window)
          ? "premium"
          : /photo_quota|PHOTO_QUOTA_CODE/.test(window)
            ? "photo"
            : "unknown";
      found.push({ file: path.relative(ROOT, file).replaceAll("\\", "/"), line: index + 1, kind });
    });
  }
  return found;
}

function actionCodes(): string[] {
  const env = readFileSync(path.join(ROOT, "src/lib/env.ts"), "utf8");
  const block = env.slice(env.indexOf("export type ActionCode"), env.indexOf(";", env.indexOf("export type ActionCode")));
  return [...block.matchAll(/"([A-Z_]+)"/g)].map((m) => m[1]);
}

function chargedRoutes(): { file: string; codes: string[] }[] {
  return walk(path.join(ROOT, "src/app/api"))
    .map((file) => {
      const source = readFileSync(file, "utf8");
      const codes = [
        ...source.matchAll(/generateJson\(\{[\s\S]{0,400}?actionCode:\s*"([A-Z_]+)"/g),
        ...source.matchAll(/reserveCredits\([^)]*?"([A-Z_]+)"/g),
      ].map((m) => m[1]);
      return { file: path.relative(ROOT, file).replaceAll("\\", "/"), codes: [...new Set(codes)] };
    })
    .filter((route) => route.codes.length > 0);
}

describe("sunucudaki her 402 sınıflanmış", () => {
  const producers = serverProducers();

  it("sınıfı bilinmeyen 402 yok", () => {
    expect(producers.length).toBeGreaterThan(0);
    expect(producers.filter((p) => p.kind === "unknown")).toEqual([]);
  });

  it("üç sınıfın üçü de gerçekten var — sınıflayıcı boşa çalışmıyor", () => {
    const kinds = new Set(producers.map((p) => p.kind));
    expect(kinds).toEqual(new Set(["credits", "premium", "photo"]));
  });
});

describe("premium_required oturum açmış hesaba hiç dönmez", () => {
  const gated = ["podcast", "speech", "oral_transcribe"] as const;

  it("aboneliği olmayan hesapta (abonesiz yönetici dahil) bu özellikler açık", () => {
    const free = entitlementsFromSubscriptionRow(null);
    for (const feature of gated) expect(requireFeature(free, feature)).toBe(true);
  });

  it("süresi dolmuş abonelikte de açık", () => {
    const expired = entitlementsFromSubscriptionRow({
      status: "active",
      current_period_end: "2020-01-01T00:00:00Z",
      plans: { is_premium: true, tier: "plus" },
    });
    for (const feature of gated) expect(requireFeature(expired, feature)).toBe(true);
  });
});

describe("fotoğraf kotası yöneticide 402'ye dönüşmez", () => {
  it("dolu kotada bile yönetici geçer, sayaç çağrılmaz", async () => {
    const calls: string[] = [];
    const client = {
      rpc: async (fn: string) => {
        calls.push(fn);
        return fn === "is_admin" ? { data: true, error: null } : { data: false, error: null };
      },
    } as unknown as SupabaseClient;
    expect(await claimPhotoPages(client, "admin", 50, "free")).toBe(true);
    expect(calls).toEqual(["is_admin"]);
  });
});

describe("kredi harcayan her eylem yöneticide 402 üretmez", () => {
  const db = new PGlite();
  const admin = "77777777-7777-4777-8777-777777777777";
  const student = "88888888-8888-4888-8888-888888888888";
  const codes = actionCodes();

  beforeAll(async () => {
    const initial = readFileSync("supabase/migrations/20250825120000_init.sql", "utf8");
    const tables = initial
      .slice(initial.indexOf("CREATE TABLE public.credit_wallets"), initial.indexOf("CREATE TABLE public.payments"))
      .replace(/ REFERENCES public.profiles\(id\) ON DELETE CASCADE/g, "");
    await db.exec(`CREATE ROLE anon; CREATE ROLE authenticated; CREATE ROLE service_role; ${tables}
      ALTER TABLE credit_wallets ADD COLUMN period_ends_at timestamptz DEFAULT now() + interval '1 day',
        ADD COLUMN period_allowance integer DEFAULT 6, ADD COLUMN period_kind text DEFAULT 'daily';
      CREATE TABLE plans(id uuid, monthly_allowance integer, billing_period text, is_premium boolean);
      CREATE TABLE subscriptions(user_id uuid, plan_id uuid, status text, current_period_end timestamptz);
      CREATE TABLE user_roles(user_id uuid NOT NULL, role text NOT NULL, revoked_at timestamptz);
      CREATE FUNCTION account_verified(uuid) RETURNS boolean LANGUAGE sql AS $$ SELECT true $$;
      CREATE FUNCTION referral_multiplier(uuid) RETURNS integer LANGUAGE sql AS $$ SELECT 1 $$;
      CREATE FUNCTION unverified_allowance() RETURNS integer LANGUAGE sql AS $$ SELECT 2 $$;`);
    await db.exec(readFileSync("supabase/migrations/20260923120001_uat_credit_atomicity.sql", "utf8"));
    await db.exec(readFileSync("supabase/migrations/20260925180000_admin_credit_bypass.sql", "utf8"));
    for (const code of codes) {
      await db.query("INSERT INTO credit_rules(action_code, credit_cost) VALUES ($1, 7)", [code]);
    }
    await db.exec(`INSERT INTO user_roles(user_id, role) VALUES ('${admin}', 'admin');
      INSERT INTO credit_wallets(user_id, balance, free_allowance_remaining)
      VALUES ('${admin}', 0, 0), ('${student}', 0, 0);`);
  }, 30_000);
  afterAll(() => db.close());

  it("ücretlendirilen rotaların eylem kodlarının hepsi ActionCode içinde", () => {
    const routes = chargedRoutes();
    expect(routes.length).toBeGreaterThan(5);
    const known = new Set([...codes, "TTS_SYNTHESIZE", "STT_TRANSCRIBE"]);
    const stray = routes.flatMap((r) => r.codes.filter((c) => !known.has(c)).map((c) => `${r.file}: ${c}`));
    expect(stray).toEqual([]);
  });

  it("boş cüzdanlı yönetici her eylem kodunu ayırabilir; bakiye aynı kalır", async () => {
    expect(codes.length).toBeGreaterThanOrEqual(10);
    for (const code of codes) {
      await expect(
        db.query("SELECT credit_reserve($1, $2, $3, 2)", [admin, code, `admin-${code}`]),
      ).resolves.toBeTruthy();
    }
    const wallet = (await db.query<{ balance: number; free_allowance_remaining: number; reserved: number }>(
      "SELECT balance, free_allowance_remaining, reserved FROM credit_wallets WHERE user_id=$1", [admin])).rows[0];
    expect(wallet).toEqual({ balance: 0, free_allowance_remaining: 0, reserved: 0 });
    const ledger = await db.query<{ delta: number; metadata: { admin_bypass: boolean; nominal_cost: number } }>(
      "SELECT delta, metadata FROM credit_ledger WHERE user_id=$1", [admin]);
    expect(ledger.rows).toHaveLength(codes.length);
    for (const row of ledger.rows) {
      expect(row.delta).toBe(0);
      expect(row.metadata).toMatchObject({ admin_bypass: true, nominal_cost: 14 });
    }
  });

  it("aynı boş cüzdanlı öğrenci her eylemde insufficient_credits alır — kapı hâlâ kapalı", async () => {
    for (const code of codes) {
      await expect(
        db.query("SELECT credit_reserve($1, $2, $3)", [student, code, `student-${code}`]),
      ).rejects.toThrow("insufficient_credits");
    }
  });
});
