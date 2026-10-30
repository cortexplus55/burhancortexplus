import { PGlite } from "@electric-sql/pglite";
import { readFileSync } from "node:fs";
import { readSource } from "./helpers/node-sources";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectBetaMetrics, evaluateBetaCriteria, percentile, recordOpenTiming } from "@/lib/admin/beta-metrics";

/**
 * Kapalı beta çıkış ölçütleri (19 Ekim 2026, plan Faz 5.3): atılan kavram 0, soğuk ders ilk ekran
 * p95 < 20 sn, hazır ders < 3 sn, ödeme başarısı > %95, destek cevabı < 24 saat, Sentry kritik 0.
 * Açılış süresi önce yalnız 3 günlük sunucu günlüğündeydi; destek talebinin cevap anı hiç yoktu.
 */
const read = (path: string) => readSource(path).replace(/\r\n/g, "\n");

type Row = Record<string, unknown>;
function fakeService(tables: Record<string, Row[]>, inserts: Row[] = []): SupabaseClient {
  return {
    from(name: string) {
      const rows = tables[name] ?? [];
      const filters: ((row: Row) => boolean)[] = [];
      let head = false;
      const matching = () => rows.filter((row) => filters.every((filter) => filter(row)));
      const builder: Record<string, unknown> = {
        select: (_cols: string, opts?: { head?: boolean }) => {
          head = Boolean(opts?.head);
          return builder;
        },
        eq: (col: string, value: unknown) => {
          filters.push((row) => row[col] === value);
          return builder;
        },
        gte: (col: string, value: string) => {
          filters.push((row) => String(row[col]) >= value);
          return builder;
        },
        lt: (col: string, value: string) => {
          filters.push((row) => String(row[col]) < value);
          return builder;
        },
        limit: () => builder,
        insert: async (value: Row) => {
          inserts.push({ table: name, ...value });
          return { error: null };
        },
        then: (resolve: (value: { data: Row[] | null; count: number; error: null }) => void) =>
          resolve({ data: head ? null : matching(), count: matching().length, error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const NOW = new Date("2026-10-26T09:00:00Z");
const day = (n: number) => new Date(NOW.getTime() - n * 86_400_000).toISOString();

describe("beta ölçütleri: hesap", () => {
  it("p95 en yakın sıra yöntemiyle", () => {
    expect(percentile(Array.from({ length: 20 }, (_, i) => i + 1), 95)).toBe(19);
    expect(percentile([4200], 95)).toBe(4200);
    expect(percentile([], 95)).toBeNull();
  });

  it("altı ölçüt: geçen, kalan, veri yok, elle", async () => {
    const service = fakeService({
      lesson_generation_failures: [
        { reason: "concept_dropped", created_at: day(2) },
        { reason: "slow_generation", created_at: day(1) },
        { reason: "concept_dropped", created_at: day(20) },
      ],
      open_timings: [
        ...Array.from({ length: 19 }, () => ({ kind: "lesson", path: "cold", ms: 14_000, created_at: day(1) })),
        { kind: "lesson", path: "cold", ms: 26_000, created_at: day(1) },
        { kind: "lesson", path: "ready", ms: 900, created_at: day(1) },
        { kind: "lesson", path: "ready", ms: 2_100, created_at: day(3) },
        { kind: "lesson", path: "adopted", ms: 8_000, created_at: day(3) },
        { kind: "quiz", path: "ready", ms: 9_000, created_at: day(1) },
      ],
      payments: [
        ...Array.from({ length: 19 }, () => ({ status: "paid", created_at: day(2) })),
        { status: "failed", created_at: day(2) },
        { status: "pending", created_at: day(2) },
      ],
      support_requests: [
        { status: "answered", created_at: day(3), answered_at: new Date(new Date(day(3)).getTime() + 5 * 3_600_000).toISOString() },
      ],
    });
    const metrics = await collectBetaMetrics(service, { now: NOW, days: 7 });
    expect(metrics).toMatchObject({
      droppedConcepts: 1,
      coldLesson: { n: 20, p95: 14_000 },
      readyLesson: { n: 2, p95: 2_100 },
      adoptedLesson: { n: 1, p95: 8_000 },
      payments: { paid: 19, failed: 1, rate: 0.95 },
      support: { total: 1, answered: 1, answeredLate: 0, maxHours: 5, openOverdue: 0 },
    });
    const rows = evaluateBetaCriteria(metrics);
    expect(rows.map((row) => [row.id, row.status])).toEqual([
      ["dropped", "fail"],
      ["cold", "pass"],
      ["ready", "pass"],
      ["payments", "fail"], // %95 hedefi "büyük": tam %95 geçmez
      ["support", "pass"],
      ["sentry", "manual"],
    ]);
    expect(rows.find((row) => row.id === "cold")?.value).toBe("14,0 sn · 20 açılış");
  });

  it("veri yoksa 'veri yok'; 24 saati geçen açık talep ölçütü düşürür", async () => {
    const empty = evaluateBetaCriteria(await collectBetaMetrics(fakeService({}), { now: NOW }));
    expect(empty.map((row) => row.status)).toEqual(["pass", "nodata", "nodata", "nodata", "nodata", "manual"]);
    const late = await collectBetaMetrics(
      fakeService({ support_requests: [{ status: "open", created_at: day(2), answered_at: null }] }),
      { now: NOW },
    );
    expect(late.support.openOverdue).toBe(1);
    expect(evaluateBetaCriteria(late).find((row) => row.id === "support")?.status).toBe("fail");
  });

  it("açılış kaydı süreyi sınırlar ve düşerse sessiz kalır", async () => {
    const inserts: Row[] = [];
    await recordOpenTiming(fakeService({}, inserts), { userId: "u", kind: "lesson", path: "cold", ms: 12_345.6 });
    expect(inserts).toEqual([{ table: "open_timings", user_id: "u", kind: "lesson", path: "cold", ms: 12_346 }]);
    const broken = { from: () => ({ insert: async () => Promise.reject(new Error("down")) }) } as unknown as SupabaseClient;
    await expect(recordOpenTiming(broken, { userId: "u", kind: "lesson", path: "ready", ms: 1 })).resolves.toBeUndefined();
  });
});

describe("beta ölçütleri: göç", () => {
  const db = new PGlite();
  beforeAll(async () => {
    await db.exec(`CREATE TABLE public.profiles(id uuid PRIMARY KEY);
      CREATE TABLE public.support_requests(id uuid PRIMARY KEY DEFAULT gen_random_uuid(), user_id uuid, subject text NOT NULL,
        message text NOT NULL, status text NOT NULL DEFAULT 'open', created_at timestamptz NOT NULL DEFAULT now());
      INSERT INTO public.profiles VALUES ('11111111-1111-4111-8111-111111111111');`);
    await db.exec(read("supabase/migrations/20261019180000_beta_exit_metrics.sql"));
  }, 30_000);
  afterAll(() => db.close());

  it("açılış yolu ve süre sınırlı; destek talebinde cevap anı var", async () => {
    const user = "11111111-1111-4111-8111-111111111111";
    await db.query("INSERT INTO open_timings(user_id, kind, path, ms) VALUES ($1, 'lesson', 'cold', 14000)", [user]);
    await expect(db.query("INSERT INTO open_timings(user_id, kind, path, ms) VALUES ($1, 'lesson', 'warm', 1)", [user])).rejects.toThrow();
    await expect(db.query("INSERT INTO open_timings(user_id, kind, path, ms) VALUES ($1, 'lesson', 'cold', -1)", [user])).rejects.toThrow();
    const columns = await db.query<{ column_name: string }>(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'support_requests' AND column_name = 'answered_at'",
    );
    expect(columns.rows).toHaveLength(1);
  });
});

describe("beta ölçütleri: bekçi", () => {
  it("ders açılışının üç yolu ölçülür, yanıt beklemez", () => {
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    // Hazır açılış, beklenen önceden yazımda "devralınan" olur (20 Ekim 2026): servedOpenPath.
    for (const path of ['path: "adopted"', "servedOpenPath(", 'path: "cold"']) expect(route).toContain(path);
    expect(route.match(/after\(\(\) => recordOpenTiming\(/g)).toHaveLength(3);
  });

  it("destek: cevap anı bir kez yazılır; menü ve silme listesi", () => {
    const action = read("src/app/admin/support-actions.ts");
    expect(action).toContain('.is("answered_at", null)');
    expect(action).toContain('action: "support.answered"');
    const nav = read("src/lib/admin/nav.ts");
    expect(nav).toContain('href: "/admin/beta"');
    expect(nav).toContain('href: "/admin/destek"');
    expect(read("src/lib/privacy/account-deletion.ts")).toContain('"open_timings"');
    expect(read("src/app/destek/page.tsx")).toContain('answered: "Cevaplandı · e-postana bak"');
  });
});
