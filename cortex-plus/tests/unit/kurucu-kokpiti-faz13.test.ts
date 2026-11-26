import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { PGlite } from "@electric-sql/pglite";
import { adminNavItem, canOpenAdminItem } from "@/lib/admin/nav";
import { AUDIT_LABELS } from "@/lib/admin/labels";
import { effectiveUsdTry } from "@/lib/admin/cockpit-math";

/*
  Kurucu Kokpiti (Faz 13, 26 Kasım 2026): göç, yetki ve bağlantılar.
  - Göç yalnız ekler; dört tablo tarayıcıya kapalı, satır güvenliği açık; kısıtlar kodun sınırlarıyla aynı (PGlite).
  - /admin/kokpit yalnız kurucuya (sayfa requireFounderPage, uçlar founderApiGuard); zamanlayıcı uçları CRON_SECRET ister.
  - Ağır yapay zekâ işleri (canlı sesli öğretmen, video üretimi) koruma modunda 503 döner.
  - Dolar kuru tek kaynak: kokpit ayarı > eski bayrak > varsayılan.
*/

const ROOT = process.cwd();
const read = (file: string) =>
  readFileSync(path.join(ROOT, file), "utf8").replace(/\r\n/g, "\n");
const MIGRATION = "supabase/migrations/20261126150000_founder_cockpit.sql";
const TABLES = [
  "founder_cockpit_settings",
  "founder_cloud_expenses",
  "founder_health_snapshots",
  "founder_alert_logs",
];

describe("göç (PGlite)", () => {
  const db = new PGlite();

  beforeAll(async () => {
    await db.exec(`
      DO $$ BEGIN CREATE ROLE anon; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE authenticated; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      DO $$ BEGIN CREATE ROLE service_role; EXCEPTION WHEN duplicate_object THEN NULL; END $$;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
      GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
    `);
    // İki kez: yalnız ekler, tekrar çalıştırılabilir.
    await db.exec(read(MIGRATION));
    await db.exec(read(MIGRATION));
  });

  afterAll(async () => {
    await db.close();
  });

  it("dört tablo, satır güvenliği açık, tarayıcı rolleri erişemez, sunucu erişir", async () => {
    for (const table of TABLES) {
      const { rows } = await db.query<{ relrowsecurity: boolean }>(
        `SELECT relrowsecurity FROM pg_class WHERE oid = $1::regclass`,
        [`public.${table}`],
      );
      expect(rows[0]!.relrowsecurity, table).toBe(true);
      for (const role of ["anon", "authenticated"]) {
        const { rows: grants } = await db.query<{ ok: boolean }>(
          `SELECT has_table_privilege($1, $2, 'SELECT') OR has_table_privilege($1, $2, 'INSERT') OR has_table_privilege($1, $2, 'UPDATE') OR has_table_privilege($1, $2, 'DELETE') AS ok`,
          [role, `public.${table}`],
        );
        expect(grants[0]!.ok, `${role} ${table}`).toBe(false);
      }
      const { rows: server } = await db.query<{ ok: boolean }>(
        `SELECT has_table_privilege('service_role', $1, 'INSERT') AS ok`,
        [`public.${table}`],
      );
      expect(server[0]!.ok, table).toBe(true);
    }
  });

  it("tek ayar satırı varsayılanlarla: şahıs, 50 $ bütçe, koruma kapalı; ikinci satır açılamaz", async () => {
    const { rows } = await db.query<Record<string, unknown>>(
      `SELECT * FROM public.founder_cockpit_settings`,
    );
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      id: "default",
      company_type: "sahis",
      circuit_breaker_enabled: false,
      alert_email: "cortexplus@cortexplus.app",
    });
    expect(Number(rows[0]!.daily_ai_budget_usd)).toBe(50);
    await expect(
      db.query(
        `INSERT INTO public.founder_cockpit_settings (id) VALUES ('ikinci')`,
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        `UPDATE public.founder_cockpit_settings SET company_type = 'anonim'`,
      ),
    ).rejects.toThrow();
    await expect(
      db.query(`UPDATE public.founder_cockpit_settings SET usd_try_rate = 0`),
    ).rejects.toThrow();
  });

  it("fatura kısıtları: ay biçimi, sağlayıcı listesi, eksi tutar yok", async () => {
    await db.query(
      `INSERT INTO public.founder_cloud_expenses (period_month, vendor, amount_usd) VALUES ('2026-11', 'OpenAI', 40)`,
    );
    await expect(
      db.query(
        `INSERT INTO public.founder_cloud_expenses (period_month, vendor, amount_usd) VALUES ('2026-13', 'OpenAI', 1)`,
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        `INSERT INTO public.founder_cloud_expenses (period_month, vendor, amount_usd) VALUES ('2026-11', 'Bilinmeyen', 1)`,
      ),
    ).rejects.toThrow();
    await expect(
      db.query(
        `INSERT INTO public.founder_cloud_expenses (period_month, vendor, amount_usd) VALUES ('2026-11', 'Vercel', -1)`,
      ),
    ).rejects.toThrow();
    const { rows } = await db.query<{
      is_kdv2_applicable: boolean;
      sent_to_accountant: boolean;
    }>(
      `SELECT is_kdv2_applicable, sent_to_accountant FROM public.founder_cloud_expenses`,
    );
    expect(rows[0]).toEqual({
      is_kdv2_applicable: true,
      sent_to_accountant: false,
    });
  });

  it("sağlık ve alarm kayıtlarının durum değerleri sınırlı", async () => {
    await db.query(
      `INSERT INTO public.founder_health_snapshots (overall_status, services_json) VALUES ('degraded', '[]'::jsonb)`,
    );
    await expect(
      db.query(
        `INSERT INTO public.founder_health_snapshots (overall_status) VALUES ('belki')`,
      ),
    ).rejects.toThrow();
    await db.query(
      `INSERT INTO public.founder_alert_logs (alert_key, severity, title, message) VALUES ('health:database', 'critical', 'Veritabanı', 'mesaj')`,
    );
    await expect(
      db.query(
        `INSERT INTO public.founder_alert_logs (alert_key, severity, title, message) VALUES ('x', 'panik', 't', 'm')`,
      ),
    ).rejects.toThrow();
  });

  it("göç yalnız ekler: var olan tabloya dokunmaz, yıkıcı komut yok", () => {
    const sql = read(MIGRATION)
      .split("\n")
      .filter((line) => !line.trim().startsWith("--"))
      .join("\n");
    expect(sql).not.toMatch(/^\s*(DROP|TRUNCATE|DELETE|UPDATE)\b/im);
    const altered = [...sql.matchAll(/ALTER TABLE\s+public\.(\w+)/gi)].map(
      (match) => match[1],
    );
    expect(altered.every((table) => TABLES.includes(table!))).toBe(true);
    expect(read(MIGRATION)).toMatch(
      /values \('20261126150000', 'founder_cockpit'\) on conflict \(version\) do nothing/,
    );
  });
});

describe("yetki", () => {
  it("menüde yalnız kurucuya açık Kurucu Kokpiti", () => {
    const item = adminNavItem("/admin/kokpit")!;
    expect(item.label).toBe("Kurucu Kokpiti");
    expect(canOpenAdminItem(item, "founder")).toBe(true);
    expect(canOpenAdminItem(item, "admin")).toBe(false);
  });

  it("sayfa kurucu kapısında; bütün kokpit uçları kurucu denetiminde", () => {
    expect(read("src/app/admin/kokpit/page.tsx")).toMatch(
      /await requireFounderPage\(\)/,
    );
    const dir = path.join(ROOT, "src/app/api/admin/kokpit");
    const routes = readdirSync(dir).map(
      (name) => `src/app/api/admin/kokpit/${name}/route.ts`,
    );
    expect(routes.length).toBeGreaterThanOrEqual(6);
    for (const route of routes) {
      const source = read(route);
      const handlers = [
        ...source.matchAll(/export async function (GET|POST|PATCH|DELETE)\b/g),
      ];
      expect(handlers.length, route).toBeGreaterThan(0);
      expect(
        source.match(/await founderApiGuard\(\)/g)?.length ?? 0,
        route,
      ).toBe(handlers.length);
    }
    expect(read("src/lib/founder-cockpit/api-guard.ts")).toMatch(
      /checkFounderActor/,
    );
  });

  it("zamanlayıcı uçları CRON_SECRET olmadan 401", async () => {
    process.env.CRON_SECRET = "deneme-anahtari-0123456789";
    const health = await import("@/app/api/cron/founder-health-check/route");
    const tax = await import("@/app/api/cron/founder-tax-reminders/route");
    for (const handler of [health.GET, health.POST, tax.GET]) {
      expect(
        (await handler(new Request("https://cortexplus.app/api/cron/x")))
          .status,
      ).toBe(401);
      expect(
        (
          await handler(
            new Request("https://cortexplus.app/api/cron/x", {
              headers: { authorization: "Bearer yanlis" },
            }),
          )
        ).status,
      ).toBe(401);
    }
    delete process.env.CRON_SECRET;
  });

  it("işlem kayıtlarının Türkçe adı var", () => {
    for (const action of [
      "founder_cockpit.settings.saved",
      "founder_cockpit.expense.added",
      "founder_cockpit.expense.updated",
      "founder_cockpit.expense.deleted",
      "founder_cockpit.breaker.reset",
      "founder_cockpit.alert.test",
      "founder_cockpit.check.run",
      "founder_cockpit.export",
    ]) {
      expect(AUDIT_LABELS[action], action).toBeTruthy();
    }
  });
});

describe("koruma modu ağır işlerde", () => {
  it("canlı sesli öğretmen ve video üretimi koruma modunu sorar ve 503 döner", () => {
    for (const route of [
      "src/app/api/tutor/realtime-session/route.ts",
      "src/app/api/learning/exam-prep/video/route.ts",
    ]) {
      const source = read(route);
      expect(source, route).toMatch(/heavyAiProtectionActive\(service\)/);
      expect(source, route).toMatch(/503/);
      expect(source, route).toMatch(/HEAVY_AI_BLOCK_CODE/);
    }
    expect(read("src/components/parity/video-lesson.tsx")).toMatch(
      /ai_budget_protection/,
    );
  });
});

describe("dolar kuru tek kaynak", () => {
  it("kokpit ayarı önce, sonra eski bayrak, sonra varsayılan", () => {
    expect(effectiveUsdTry({ rate: 40 }, 51.5)).toEqual({
      rate: 51.5,
      source: "settings",
    });
    expect(effectiveUsdTry({ rate: 40 }, null)).toMatchObject({
      rate: 40,
      source: "flag",
    });
    expect(effectiveUsdTry(null, null).source).toBe("default");
  });

  it("Ana Kokpit ve Birim Ekonomisi kokpit ayarını okur", () => {
    expect(read("src/lib/admin/cockpit.ts")).toMatch(
      /loadUsdTryRate\(service\)/,
    );
    expect(read("src/lib/admin/finance.ts")).toMatch(
      /loadUsdTryRate\(service\)/,
    );
  });
});

describe("zamanlayıcı", () => {
  it("vercel.json: sağlık 15 dakikada bir; vergi hatırlatması ayrı cron değil, günlük turda", () => {
    const config = JSON.parse(read("vercel.json")) as {
      crons: { path: string; schedule: string }[];
    };
    expect(config.crons).toContainEqual({
      path: "/api/cron/founder-health-check",
      schedule: "*/15 * * * *",
    });
    expect(config.crons.some((item) => item.path === "/api/cron/founder-tax-reminders")).toBe(false);
    expect(read("src/app/api/cron/subscription-renewal/route.ts")).toContain("runFounderTaxReminders(service, now)");
    // Elle ya da dış izlemeden çalıştırmak için uç duruyor (CRON_SECRET).
    expect(
      existsSync(
        path.join(ROOT, "src/app/api/cron/founder-tax-reminders/route.ts"),
      ),
    ).toBe(true);
  });
});
