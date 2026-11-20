/**
 * Büyüme hunisi (20 Kasım 2026): kurucu kokpitinde kayıttan satışa kohort hunisi ve penceredeki satışlar.
 * Saf hesap (pencereler, kohort, hazırlık sayımı, 1. konunun dersi, yüzdeler, satış ve veli ayrımı), okuyucu
 * (her kaynak tek başına düşer, sorgular sınırlı, yalnız okur) ve sayfa sözleşmesi. Veri sentetik.
 */
import { readFileSync } from "node:fs";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { cockpitWindows, conversionStats, PARENT_PAYMENT_VIAS, type PaymentRow } from "@/lib/admin/cockpit-math";
import {
  countsAsPrep,
  firstTopicIdsByPrep,
  firstUnitLessonNodeIds,
  funnelWindows,
  growthFunnel,
  saleKind,
  stepRate,
  type FunnelInput,
  type FunnelPlan,
  type GrowthFunnel,
} from "@/lib/admin/funnel-math";
import { loadGrowthFunnel, type LoadedFunnel } from "@/lib/admin/funnel";
import { purchaseKindFor } from "@/lib/email/lifecycle-templates";
import { GrowthFunnelCard } from "@/components/admin/growth-funnel-card";

// 20 Kasım 13:00 Türkiye. Bugün = 19 Kasım 21:00Z'den beri; son 7 gün = 13 Kasım 21:00Z'den beri.
const NOW = new Date("2026-11-20T10:00:00Z");
const WINDOWS = funnelWindows(NOW);

const PLANS: FunnelPlan[] = [
  { id: "p-aylik", slug: "plus-aylik", name: "Plus Aylık", tier: "plus", billingPeriod: "monthly", isPremium: true },
  { id: "p-hafta", slug: "plus-haftalik", name: "Plus Haftalık", tier: "plus", billingPeriod: "weekly", isPremium: true },
  { id: "p-sigma", slug: "sigma-aylik", name: "Sigma Aylık", tier: "sigma", billingPeriod: "monthly", isPremium: true },
  { id: "p-ek", slug: "ek-kredi-50", name: "Ek 50", tier: null, billingPeriod: "one_time", isPremium: false },
];

/** Kohort: a, b bugün; c, d, f bu hafta; e haftadan önce (okuyucu getirse de sayılmaz). */
function baseInput(): FunnelInput {
  return {
    signups: [
      { id: "a", createdAt: "2026-11-20T05:00:00Z" },
      { id: "b", createdAt: "2026-11-19T22:30:00Z" },
      { id: "c", createdAt: "2026-11-16T09:00:00Z" },
      { id: "d", createdAt: "2026-11-15T09:00:00Z" },
      { id: "f", createdAt: "2026-11-14T09:00:00Z" },
      { id: "e", createdAt: "2026-11-10T09:00:00Z" },
    ],
    preps: [
      { id: "pA", userId: "a", examType: "YKS" },
      { id: "pB", userId: "b", examType: "deneme" },
      { id: "pC", userId: "c", examType: "Biyoloji" },
      { id: "pDh", userId: "d", examType: "hedef" },
      { id: "pD", userId: "d", examType: "KPSS" },
      { id: "pE", userId: "e", examType: "LGS" },
    ],
    topics: [
      { id: "tA2", prepId: "pA", documentTopicNodeId: null, sortOrder: 1 },
      { id: "tA1", prepId: "pA", documentTopicNodeId: null, sortOrder: 0 },
      { id: "tC1", prepId: "pC", documentTopicNodeId: "dC1", sortOrder: 0 },
      { id: "tD1", prepId: "pD", documentTopicNodeId: null, sortOrder: 2 },
      { id: "tD0", prepId: "pD", documentTopicNodeId: null, sortOrder: 1 },
      { id: "tE0", prepId: "pE", documentTopicNodeId: null, sortOrder: 0 },
    ],
    lessonNodes: [
      { id: "nA1", prepId: "pA", kind: "lesson", status: "done", title: "Ders", sessionMeta: { topicId: "tA1" } },
      { id: "nA2", prepId: "pA", kind: "lesson", status: "ready", title: "Ders", sessionMeta: { topicId: "tA2" } },
      // Belgeli hazırlık: düğüm belge konusunun kimliğini taşır.
      { id: "nC1", prepId: "pC", kind: "lesson", status: "done", title: "Ders", sessionMeta: { topicId: "dC1" } },
      { id: "nD1", prepId: "pD", kind: "lesson", status: "done", title: "Ders", sessionMeta: { topicId: "tD1" } },
      // Final bloğu (role: mock) 1. konunun kimliğini taşısa da konunun kendi adımı değildir.
      { id: "nD0m", prepId: "pD", kind: "lesson", status: "done", title: "Ders", sessionMeta: { topicId: "tD0", role: "mock" } },
      { id: "nE0", prepId: "pE", kind: "lesson", status: "done", title: "Ders", sessionMeta: { topicId: "tE0" } },
    ],
    attempts: [
      { userId: "a", nodeId: "nA1" },
      { userId: "c", nodeId: "nC1" },
      { userId: "d", nodeId: "nD1" },
      { userId: "d", nodeId: "nD0m" },
      { userId: "e", nodeId: "nE0" },
      // Başkasının kaydı sayılmaz.
      { userId: "f", nodeId: "nA1" },
    ],
    payments: [
      { merchantOid: "m1", userId: "a", beneficiaryUserId: "a", planId: "p-aylik", status: "failed", opened: true, createdAt: "2026-11-20T06:00:00Z" },
      { merchantOid: "m2", userId: "a", beneficiaryUserId: "a", planId: "p-aylik", status: "paid", opened: true, createdAt: "2026-11-20T06:10:00Z" },
      // b 1. üniteyi bitirmeden ödedi: huniye girmez, ayrıca sayılır.
      { merchantOid: "m3", userId: "b", beneficiaryUserId: "b", planId: "p-hafta", status: "paid", opened: true, createdAt: "2026-11-20T01:00:00Z" },
      { merchantOid: "m4", userId: "c", beneficiaryUserId: "c", planId: "p-aylik", status: "failed", opened: true, createdAt: "2026-11-17T08:00:00Z" },
      // Hesapsız veli bağlantısı: satır öğrencinin adına (ödeyen = hakkın sahibi); yalnız denetim kaydı tanır.
      { merchantOid: "m-link", userId: "g", beneficiaryUserId: "g", planId: "p-aylik", status: "paid", opened: true, createdAt: "2026-11-18T08:00:00Z" },
      // Veli hesabıyla: ödeyen ≠ hakkın sahibi.
      { merchantOid: "m6", userId: "veli", beneficiaryUserId: "k", planId: "p-sigma", status: "paid", opened: true, createdAt: "2026-11-16T08:00:00Z" },
      { merchantOid: "m7", userId: "z", beneficiaryUserId: null, planId: "p-ek", status: "paid", opened: true, createdAt: "2026-11-19T22:00:00Z" },
      { merchantOid: "m8", userId: "y", beneficiaryUserId: "y", planId: "p-aylik", status: "paid", opened: true, createdAt: "2026-11-12T08:00:00Z" },
    ],
    plans: PLANS,
    parentOids: new Set(["m-link"]),
  };
}

function stage(funnel: GrowthFunnel, key: string) {
  const found = funnel.stages.find((row) => row.key === key);
  if (!found) throw new Error(`adım yok: ${key}`);
  return found;
}

describe("pencereler", () => {
  it("bugün ve son 7 gün kokpitin Türkiye günü pencereleriyle aynı", () => {
    const cockpit = cockpitWindows(NOW);
    expect(WINDOWS).toEqual({ today: cockpit.today, week: cockpit.week });
    expect(WINDOWS.today).toBe("2026-11-19T21:00:00.000Z");
    expect(WINDOWS.week).toBe("2026-11-13T21:00:00.000Z");
    // Türkiye gece yarısından hemen sonra yeni gün başlar.
    expect(funnelWindows(new Date("2026-11-19T21:30:00Z")).today).toBe("2026-11-19T21:00:00.000Z");
    expect(funnelWindows(new Date("2026-11-19T20:30:00Z")).today).toBe("2026-11-18T21:00:00.000Z");
  });
});

describe("kohort hunisi", () => {
  const funnel = growthFunnel(baseInput(), WINDOWS);
  it("kayıt penceresine göre kohort; haftadan eski hesap sayılmaz", () => {
    expect(stage(funnel, "signup").counts).toEqual({ today: 2, week: 5 });
    expect(stage(funnel, "signup").rate).toEqual({ today: null, week: null });
  });
  it("Stüdyo'nun deneme kaydı ve Hedef puan kaydı hazırlık sayılmaz", () => {
    expect(countsAsPrep("deneme")).toBe(false);
    expect(countsAsPrep("hedef")).toBe(false);
    expect(countsAsPrep("YKS")).toBe(true);
    // a (bugün), c ve d (hafta); b'nin yalnız deneme kaydı var, f'nin hiç yok.
    expect(stage(funnel, "prep").counts).toEqual({ today: 1, week: 3 });
    expect(stage(funnel, "prep").rate).toEqual({ today: 50, week: 60 });
  });
  it("1. ünite = hazırlığın ilk konusunun (sort_order) konu anlatımı bitmiş; belge konusunun kimliği tanınır", () => {
    const first = firstTopicIdsByPrep(baseInput().topics!);
    expect([...first.get("pA")!]).toEqual(["tA1"]);
    expect([...first.get("pC")!].sort()).toEqual(["dC1", "tC1"]);
    expect([...first.get("pD")!]).toEqual(["tD0"]);
    const lessons = firstUnitLessonNodeIds(baseInput().lessonNodes!, first);
    // 2. konunun dersi (nA2, nD1) ve final bloğu (nD0m) girmez.
    expect([...lessons.keys()].sort()).toEqual(["nA1", "nC1", "nE0"]);
    // d yalnız 2. konuyu ve final bloğunu bitirdi; f'nin a'nın düğümündeki kaydı sayılmaz.
    expect(stage(funnel, "firstUnit").counts).toEqual({ today: 1, week: 2 });
    expect(stage(funnel, "firstUnit").rate).toEqual({ today: 100, week: 67 });
  });
  it("ödeme adımları önceki adımı geçenlerden; kişi hakkın sahibi; adımı atlayan ayrıca sayılır", () => {
    expect(stage(funnel, "checkout").counts).toEqual({ today: 1, week: 2 });
    expect(stage(funnel, "checkout").rate).toEqual({ today: 100, week: 100 });
    expect(stage(funnel, "sale").counts).toEqual({ today: 1, week: 1 });
    expect(stage(funnel, "sale").rate).toEqual({ today: 100, week: 50 });
    expect(funnel.skippedPayers).toEqual({ today: 1, week: 1 });
  });
  it("huni hiçbir adımda genişlemez", () => {
    for (const key of ["today", "week"] as const) {
      const values = funnel.stages.map((row) => row.counts[key] ?? 0);
      for (let index = 1; index < values.length; index += 1) expect(values[index]).toBeLessThanOrEqual(values[index - 1]);
    }
  });
  it("payda sıfırsa yüzde yok", () => {
    expect(stepRate(0, 0)).toBeNull();
    expect(stepRate(3, null)).toBeNull();
    expect(stepRate(null, 4)).toBeNull();
    expect(stepRate(1, 3)).toBe(33);
    const empty = growthFunnel({ ...baseInput(), signups: [{ id: "f", createdAt: "2026-11-14T09:00:00Z" }] }, WINDOWS);
    expect(stage(empty, "signup").counts).toEqual({ today: 0, week: 1 });
    expect(stage(empty, "prep").rate).toEqual({ today: null, week: 0 });
    expect(stage(empty, "firstUnit").rate).toEqual({ today: null, week: null });
    expect(stage(empty, "sale").rate).toEqual({ today: null, week: null });
  });
});

describe("penceredeki satışlar", () => {
  const funnel = growthFunnel(baseInput(), WINDOWS);
  it("ödemeyi başlatan kişi ve başarılı satış kohorttan bağımsız; pencere dışı ödeme sayılmaz", () => {
    expect(funnel.sales.starters).toEqual({ today: 3, week: 6 });
    expect(funnel.sales.paid).toEqual({ today: 3, week: 5 });
  });
  it("paket türüne göre: dört paket hep yazılır", () => {
    expect(funnel.sales.byKind.map((row) => [row.label, row.counts.today, row.counts.week])).toEqual([
      ["Plus (aylık)", 1, 2],
      ["Sınav Haftası (haftalık Plus)", 1, 1],
      ["Sigma", 0, 1],
      ["Ek paket", 1, 1],
    ]);
  });
  it("veli ödemesi: bağlantı denetim kaydından, veli hesabı ödeyen ≠ hakkın sahibinden", () => {
    expect(funnel.sales.parent).toEqual({ today: 0, week: 2 });
    const noAudit = growthFunnel({ ...baseInput(), parentOids: null }, WINDOWS);
    expect(noAudit.sales.parent).toEqual({ today: null, week: null });
    expect(noAudit.sales.paid).toEqual({ today: 3, week: 5 });
  });
  it("paket türü e-postanın türüyle aynı karar", () => {
    const fixtures: FunnelPlan[] = [
      ...PLANS,
      { id: "p-yil", slug: "plus-yillik", name: "Plus Yıllık", tier: "plus", billingPeriod: "yearly", isPremium: true },
      { id: "p-sy", slug: "sigma-yillik", name: "Sigma Yıllık", tier: null, billingPeriod: "yearly", isPremium: true },
      { id: "p-free", slug: "ucretsiz", name: "Ücretsiz", tier: null, billingPeriod: "monthly", isPremium: false },
      { id: "p-ekp", slug: "ek-kredi-400", name: "Ek 400", tier: null, billingPeriod: null, isPremium: false },
    ];
    for (const plan of fixtures) {
      const mail = purchaseKindFor({ slug: plan.slug, tier: plan.tier, billing_period: plan.billingPeriod, is_premium: plan.isPremium, name: plan.name });
      expect(saleKind(plan)).toBe(mail ?? "unknown");
    }
    expect(saleKind(null)).toBe("unknown");
  });
});

describe("kaynak düşerse", () => {
  it("kayıtlar okunamazsa huni boş, satışlar durur", () => {
    const funnel = growthFunnel({ ...baseInput(), signups: null }, WINDOWS);
    for (const row of funnel.stages) expect(row.counts).toEqual({ today: null, week: null });
    expect(funnel.skippedPayers).toEqual({ today: null, week: null });
    expect(funnel.sales.paid).toEqual({ today: 3, week: 5 });
  });
  it("hazırlıklar okunamazsa 2. adımdan sonrası boş", () => {
    const funnel = growthFunnel({ ...baseInput(), preps: null }, WINDOWS);
    expect(stage(funnel, "signup").counts).toEqual({ today: 2, week: 5 });
    expect(stage(funnel, "prep").counts).toEqual({ today: null, week: null });
    expect(stage(funnel, "sale").counts).toEqual({ today: null, week: null });
  });
  it("ders kaydı okunamazsa 3. adımdan sonrası boş, hazırlık sayısı durur", () => {
    for (const missing of ["topics", "lessonNodes", "attempts"] as const) {
      const funnel = growthFunnel({ ...baseInput(), [missing]: null }, WINDOWS);
      expect(stage(funnel, "prep").counts).toEqual({ today: 1, week: 3 });
      expect(stage(funnel, "firstUnit").counts).toEqual({ today: null, week: null });
      expect(stage(funnel, "checkout").counts).toEqual({ today: null, week: null });
      expect(funnel.skippedPayers).toEqual({ today: null, week: null });
      expect(funnel.sales.starters).toEqual({ today: 3, week: 6 });
    }
  });
  it("ödemeler okunamazsa ödeme adımları ve satışlar boş; paketler okunamazsa yalnız tür ayrımı", () => {
    const noPayments = growthFunnel({ ...baseInput(), payments: null }, WINDOWS);
    expect(stage(noPayments, "firstUnit").counts).toEqual({ today: 1, week: 2 });
    expect(stage(noPayments, "checkout").counts).toEqual({ today: null, week: null });
    expect(noPayments.sales.paid).toEqual({ today: null, week: null });
    const noPlans = growthFunnel({ ...baseInput(), plans: null }, WINDOWS);
    expect(noPlans.sales.paid).toEqual({ today: 3, week: 5 });
    expect(noPlans.sales.byKind.every((row) => row.counts.today === null && row.counts.week === null)).toBe(true);
  });
});

/* ───────────── Okuyucu: sahte sunucu istemcisi ───────────── */

type Call = [string, unknown[]];
type Result = { data: unknown; error: { message: string } | null } | Error;
type Handler = (calls: Call[]) => Result;

function arg(calls: Call[], method: string, column?: string): unknown[] | undefined {
  return calls.find(([name, args]) => name === method && (column === undefined || args[0] === column))?.[1];
}
function inList(calls: Call[], column: string): string[] {
  return (arg(calls, "in", column)?.[1] as string[] | undefined) ?? [];
}

function fakeService(handlers: Record<string, Handler>) {
  const log: { table: string; calls: Call[] }[] = [];
  const client = {
    from(table: string) {
      const entry = { table, calls: [] as Call[] };
      log.push(entry);
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_target, prop) {
            if (prop === "then") {
              const result = (handlers[table] ?? (() => ({ data: [], error: null })))(entry.calls);
              return (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
                result instanceof Error ? reject(result) : resolve(result);
            }
            return (...args: unknown[]) => {
              entry.calls.push([String(prop), args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  };
  return { client: client as never, log };
}

function liveHandlers(input: FunnelInput = baseInput()): Record<string, Handler> {
  const ok = (data: unknown): Result => ({ data, error: null });
  return {
    profiles: () => ok(input.signups!.map((row) => ({ id: row.id, created_at: row.createdAt }))),
    exam_preps: (calls) => {
      const users = new Set(inList(calls, "user_id"));
      return ok(input.preps!.filter((row) => users.has(row.userId)).map((row) => ({ id: row.id, user_id: row.userId, exam_type: row.examType })));
    },
    exam_prep_topics: (calls) => {
      const preps = new Set(inList(calls, "exam_prep_id"));
      return ok(
        input.topics!.filter((row) => preps.has(row.prepId)).map((row) => ({
          id: row.id,
          exam_prep_id: row.prepId,
          document_topic_node_id: row.documentTopicNodeId,
          sort_order: row.sortOrder,
        })),
      );
    },
    exam_prep_nodes: (calls) => {
      const preps = new Set(inList(calls, "exam_prep_id"));
      return ok(
        input.lessonNodes!.filter((row) => preps.has(row.prepId)).map((row) => ({
          id: row.id,
          exam_prep_id: row.prepId,
          kind: row.kind,
          status: row.status,
          title: row.title,
          session_meta: row.sessionMeta,
        })),
      );
    },
    exam_prep_node_attempts: (calls) => {
      const nodes = new Set(inList(calls, "node_id"));
      return ok(input.attempts!.filter((row) => nodes.has(row.nodeId)).map((row) => ({ user_id: row.userId, node_id: row.nodeId })));
    },
    payments: () =>
      ok(
        input.payments!.map((row) => ({
          merchant_oid: row.merchantOid,
          user_id: row.userId,
          beneficiary_user_id: row.beneficiaryUserId,
          plan_id: row.planId,
          status: row.status,
          created_at: row.createdAt,
        })),
      ),
    audit_logs: () => ok([...input.parentOids!].map((oid) => ({ entity_id: oid, via: "parent_link" }))),
    plans: () =>
      ok(PLANS.map((plan) => ({ id: plan.id, slug: plan.slug, name: plan.name, tier: plan.tier, billing_period: plan.billingPeriod, is_premium: plan.isPremium }))),
  };
}

describe("okuyucu", () => {
  it("sahte veritabanıyla saf hesabın aynısını verir; sorgular sınırlı ve yalnız gereken alanlar okunur", async () => {
    const { client, log } = fakeService(liveHandlers());
    const loaded = await loadGrowthFunnel(client, NOW);
    expect(loaded.failed).toEqual([]);
    expect(loaded.truncated).toEqual([]);
    const pure = growthFunnel(baseInput(), WINDOWS);
    expect(loaded.stages).toEqual(pure.stages);
    expect(loaded.sales).toEqual(pure.sales);
    expect(loaded.skippedPayers).toEqual(pure.skippedPayers);

    const query = (table: string) => log.filter((entry) => entry.table === table);
    expect(arg(query("profiles")[0].calls, "gte")).toEqual(["created_at", WINDOWS.week]);
    expect(arg(query("profiles")[0].calls, "limit")).toBeDefined();
    // Ödeme oturumunun kendisi okunmaz; yalnız varlığı süzülür.
    const paymentCalls = query("payments")[0].calls;
    expect(String(arg(paymentCalls, "select")?.[0])).not.toContain("paytr_token");
    expect(String(arg(paymentCalls, "or")?.[0])).toContain("paytr_token.not.is.null");
    expect(arg(paymentCalls, "gte")).toEqual(["created_at", WINDOWS.week]);
    // Denetim kaydında yalnız sipariş numarası ve veli yolu (IP, onay metni okunmaz).
    const auditCalls = query("audit_logs")[0].calls;
    expect(arg(auditCalls, "select")?.[0]).toBe("entity_id, via:metadata->>via");
    expect(arg(auditCalls, "eq")).toEqual(["action", "payment.token.created"]);
    expect(arg(auditCalls, "in")).toEqual(["metadata->>via", PARENT_PAYMENT_VIAS]);
    // Tamamlanmış kayıt yalnız 1. konunun ders düğümleri için.
    const attemptCalls = query("exam_prep_node_attempts")[0].calls;
    expect(inList(attemptCalls, "node_id").sort()).toEqual(["nA1", "nC1", "nE0"]);
    expect(arg(attemptCalls, "eq")).toEqual(["status", "completed"]);
    expect(arg(query("exam_prep_nodes")[0].calls, "eq")).toEqual(["kind", "lesson"]);
    for (const entry of log) if (entry.table !== "plans") expect(arg(entry.calls, "limit"), entry.table).toBeDefined();
    // Yazma yok.
    for (const entry of log) for (const [method] of entry.calls) expect(["insert", "update", "upsert", "delete", "rpc"]).not.toContain(method);
  });

  it("kimlik listeleri 150'şerlik dilimle gider", async () => {
    const signups = Array.from({ length: 320 }, (_, index) => ({ id: `u${index}`, createdAt: "2026-11-18T08:00:00Z" }));
    const { client, log } = fakeService(liveHandlers({ ...baseInput(), signups }));
    await loadGrowthFunnel(client, NOW);
    const prepQueries = log.filter((entry) => entry.table === "exam_preps");
    expect(prepQueries.map((entry) => inList(entry.calls, "user_id").length)).toEqual([150, 150, 20]);
  });

  const SOURCES: { table: string; label: string; check: (loaded: LoadedFunnel) => void }[] = [
    {
      table: "profiles",
      label: "yeni kayıtlar",
      check: (loaded) => {
        expect(stage(loaded, "signup").counts).toEqual({ today: null, week: null });
        expect(loaded.sales.paid).toEqual({ today: 3, week: 5 });
      },
    },
    {
      table: "exam_preps",
      label: "hazırlıklar",
      check: (loaded) => {
        expect(stage(loaded, "signup").counts).toEqual({ today: 2, week: 5 });
        expect(stage(loaded, "prep").counts).toEqual({ today: null, week: null });
      },
    },
    {
      table: "exam_prep_topics",
      label: "konu sırası",
      check: (loaded) => {
        expect(stage(loaded, "prep").counts).toEqual({ today: 1, week: 3 });
        expect(stage(loaded, "firstUnit").counts).toEqual({ today: null, week: null });
      },
    },
    {
      table: "exam_prep_nodes",
      label: "ders adımları",
      check: (loaded) => expect(stage(loaded, "firstUnit").counts).toEqual({ today: null, week: null }),
    },
    {
      table: "exam_prep_node_attempts",
      label: "ders kayıtları",
      check: (loaded) => {
        expect(stage(loaded, "firstUnit").counts).toEqual({ today: null, week: null });
        expect(loaded.sales.starters).toEqual({ today: 3, week: 6 });
      },
    },
    {
      table: "payments",
      label: "ödemeler",
      check: (loaded) => {
        expect(stage(loaded, "firstUnit").counts).toEqual({ today: 1, week: 2 });
        expect(stage(loaded, "checkout").counts).toEqual({ today: null, week: null });
        expect(loaded.sales.paid).toEqual({ today: null, week: null });
      },
    },
    {
      table: "audit_logs",
      label: "veli ödemesi kaydı",
      check: (loaded) => {
        expect(loaded.sales.parent).toEqual({ today: null, week: null });
        expect(loaded.sales.paid).toEqual({ today: 3, week: 5 });
      },
    },
    {
      table: "plans",
      label: "paketler",
      check: (loaded) => {
        expect(loaded.sales.byKind.every((row) => row.counts.week === null)).toBe(true);
        expect(stage(loaded, "sale").counts).toEqual({ today: 1, week: 1 });
      },
    },
  ];

  for (const source of SOURCES) {
    for (const mode of ["hata", "istisna"] as const) {
      it(`${source.table} tek başına düşerse (${mode}) yalnız ona dayanan sayı boş, sayfa düşmez`, async () => {
        const handlers = liveHandlers();
        handlers[source.table] = () => (mode === "hata" ? { data: null, error: { message: "bağlantı koptu" } } : new Error("ağ hatası"));
        const { client } = fakeService(handlers);
        const loaded = await loadGrowthFunnel(client, NOW);
        expect(loaded.failed).toEqual([source.label]);
        source.check(loaded);
      });
    }
  }

  it("satır sınırına takılan kaynak söylenir", async () => {
    const signups = Array.from({ length: 2000 }, (_, index) => ({ id: `s${index}`, createdAt: "2026-11-18T08:00:00Z" }));
    const { client } = fakeService(liveHandlers({ ...baseInput(), signups }));
    const loaded = await loadGrowthFunnel(client, NOW);
    expect(loaded.truncated).toContain("yeni kayıtlar");
  });
});

describe("kokpitin veli ödemesi satırı", () => {
  it("hesapsız veli bağlantısını denetim kaydından tanır (satır öğrencinin adına)", () => {
    const windows = cockpitWindows(NOW);
    const row = (over: Partial<PaymentRow>): PaymentRow => ({
      user_id: "s",
      beneficiary_user_id: "s",
      plan_id: null,
      amount_try: 100,
      status: "paid",
      created_at: "2026-11-18T08:00:00Z",
      ...over,
    });
    const payments = [row({ merchant_oid: "link" }), row({ user_id: "veli", beneficiary_user_id: "k", merchant_oid: "acc" }), row({ merchant_oid: "self" })];
    expect(conversionStats(payments, [], new Set(), windows).parentLink.week).toBe(1);
    expect(conversionStats(payments, [], new Set(), windows, new Set(["link"])).parentLink.week).toBe(2);
  });
});

describe("ekran ve sayfa sözleşmesi", () => {
  it("kart sayıları, yüzdeleri, okunamayanı ve tanımları yazar", () => {
    const loaded: LoadedFunnel = { ...growthFunnel({ ...baseInput(), plans: null }, WINDOWS), failed: ["paketler"], truncated: [] };
    const html = renderToStaticMarkup(createElement(GrowthFunnelCard, { funnel: loaded }));
    expect(html).toContain("Günlük ve 7 günlük büyüme hunisi");
    expect(html).toContain("%60 önceki adımdan");
    expect(html).toContain("okunamadı");
    expect(html).toContain("Şu kaynaklar okunamadı");
    expect(html).toContain("Adımlar nasıl sayılıyor?");
    expect(html).toContain("Ödemeyi başlatan (PayTR ekranı açıldı)");
    expect(html).toContain("1. üniteyi bitirmeden ödeyen");
  });
  it("kokpit sayfası huniyi korumalı sayfada yükler; okuyucu yalnız okur", () => {
    const page = readFileSync("src/app/admin/page.tsx", "utf8");
    expect(page).toContain("await requireAdminPage()");
    expect(page).toContain("loadGrowthFunnel(service)");
    expect(page).toContain("<GrowthFunnelCard funnel={funnel} />");
    const loader = readFileSync("src/lib/admin/funnel.ts", "utf8");
    expect(loader.startsWith('import "server-only"')).toBe(true);
    expect(loader).not.toMatch(/\.(insert|update|upsert|delete|rpc)\(/);
    const card = readFileSync("src/components/admin/growth-funnel-card.tsx", "utf8");
    expect(card).not.toContain('"use client"');
  });
});
