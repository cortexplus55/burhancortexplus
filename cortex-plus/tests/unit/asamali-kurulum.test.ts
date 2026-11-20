/**
 * Faz 2 (madde 7.4): hazırlık kurulumu aşamalı — ilk ekran (yol haritası + 1. ünite) istek içinde, kalan iş yanıttan
 * sonra; kalan iş kayıtta durur, yarıda kesilirse hazırlık sayfası kaldığı yerden sürdürür.
 */
import { readFileSync } from "fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  firstUnitCutoff,
  mergeTopicWrites,
  parseSetupFinish,
  setupFinishIsStale,
  splitSetupWrites,
  SETUP_FINISH_STALE_MS,
  withContradictions,
  type PrepSetupFinish,
  type SetupNodeWrite,
} from "@/lib/learning/prep-setup-split";

const judged = vi.hoisted(() => ({ calls: 0 }));
vi.mock("@/lib/learning/prep-contradiction-read", () => ({
  readContradictionDocuments: vi.fn(async () => []),
  contradictionsByTopicTitleResolved: vi.fn(async () => {
    judged.calls += 1;
    return new Map([["Konu B", [{ concept: "kavram", claims: [] }]]]);
  }),
}));
vi.mock("@/lib/admin/feature-flags", () => ({ isFeatureEnabled: vi.fn(async () => false), ADAPTIVE_LEARNING_FLAG: "x" }));

import { applySetupWrites, resumeStalePrepSetup, runPrepSetupFinish } from "@/lib/learning/prep-setup-finish";

const node = (sort_order: number, topicId?: string): SetupNodeWrite => ({ sort_order, meta: topicId ? { topicId } : {} });

describe("ilk ekran bölmesi", () => {
  it("1. ünite: konusuz giriş adımları + ilk konunun kesintisiz koşusu", () => {
    const nodes = [node(0), node(1, "a"), node(2), node(3, "a"), node(4, "b"), node(5, "a")];
    expect(firstUnitCutoff(nodes)).toBe(3);
    const split = splitSetupWrites(nodes, [{ id: "a" }, { id: "b" }]);
    expect(split.now.nodes.map((n) => n.sort_order)).toEqual([0, 1, 2, 3]);
    expect(split.later.nodes.map((n) => n.sort_order)).toEqual([4, 5]);
    expect(split.now.topics).toEqual([{ id: "a" }]);
    expect(split.later.topics).toEqual([{ id: "b" }]);
  });

  it("konulu düğüm yoksa bütün düğümler ve ilk konu ilk ekranda", () => {
    const split = splitSetupWrites([node(0), node(1)], [{ id: "x" }, { id: "y" }]);
    expect(split.now.nodes).toHaveLength(2);
    expect(split.later.nodes).toHaveLength(0);
    expect(split.now.topics).toEqual([{ id: "x" }]);
  });

  it("kayıt doğrulaması ve bayatlık", () => {
    expect(parseSetupFinish(null)).toBeNull();
    expect(parseSetupFinish({ v: 2 })).toBeNull();
    const parsed = parseSetupFinish({ v: 1, startedAt: "2026-01-01T00:00:00.000Z", nodes: [node(1), { bad: true }], topics: [{ id: "t" }, 4] });
    expect(parsed).toEqual({ v: 1, startedAt: "2026-01-01T00:00:00.000Z", nodes: [node(1)], topics: [{ id: "t" }], contradictions: null, masterPlan: false });
    const start = Date.parse("2026-01-01T00:00:00.000Z");
    expect(setupFinishIsStale({ startedAt: "2026-01-01T00:00:00.000Z" }, start + SETUP_FINISH_STALE_MS - 1)).toBe(false);
    expect(setupFinishIsStale({ startedAt: "2026-01-01T00:00:00.000Z" }, start + SETUP_FINISH_STALE_MS)).toBe(true);
  });

  it("çelişki yazımı her konuya (yoksa boş); aynı konunun yazımları birleşir", () => {
    const writes = withContradictions([{ id: "a", label: "A" }, { id: "b", label: "B" }], new Map([["B", [{ concept: "c", claims: [] }]]]));
    expect(writes).toEqual([{ id: "a", contradictions: [] }, { id: "b", contradictions: [{ concept: "c", claims: [] }] }]);
    expect(mergeTopicWrites([{ id: "a", familiarity: "new" }], writes)).toEqual([
      { id: "a", familiarity: "new", contradictions: [] },
      { id: "b", contradictions: [{ concept: "c", claims: [] }] },
    ]);
  });
});

type Call = { table: string; op: string; payload?: unknown; filters: string[] };

function fakeService(options: { rpcError?: { code: string; message: string } | null; setupFinish?: unknown; claimRows?: number }) {
  const calls: Call[] = [];
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const from = (table: string) => {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const result = () => {
      if (table === "exam_preps" && call.op === "select") return { data: { setup_finish: options.setupFinish ?? null }, error: null };
      if (table === "exam_preps" && call.op === "update" && call.filters.some((f) => f.startsWith("setup_finish->>")))
        return { data: Array.from({ length: options.claimRows ?? 1 }, () => ({ id: "p" })), error: null };
      if (table === "exam_prep_topics" && call.op === "select")
        return { data: [{ id: "a", label: "Konu A" }, { id: "b", label: "Konu B" }], error: null };
      if (table === "exam_prep_nodes" && call.op === "select") return { data: [{ id: "n1", sort_order: 1 }, { id: "n2", sort_order: 2 }], error: null };
      return { data: null, error: null };
    };
    const chain: Record<string, unknown> = {
      select: () => chain,
      update: (payload: unknown) => {
        call.op = "update";
        call.payload = payload;
        return chain;
      },
      eq: (column: string, value: unknown) => {
        call.filters.push(`${column}=${String(value)}`);
        return chain;
      },
      order: () => chain,
      maybeSingle: async () => result(),
      then: (resolve: (value: unknown) => unknown, reject: (error: unknown) => unknown) => Promise.resolve(result()).then(resolve, reject),
    };
    return chain;
  };
  const service = {
    from,
    rpc: async (fn: string, args: Record<string, unknown>) => {
      rpcCalls.push({ fn, args });
      return { data: 1, error: options.rpcError ?? null };
    },
  };
  return { service: service as never, calls, rpcCalls };
}

const finish = (startedAt: string): PrepSetupFinish => ({
  v: 1,
  startedAt,
  nodes: [node(2, "b")],
  topics: [{ id: "b", familiarity: "heard" }],
  contradictions: { documentIds: ["d"], topics: [{ title: "Konu B", sources: [] }] },
  masterPlan: false,
});

describe("arka plan yarısı", () => {
  beforeEach(() => {
    judged.calls = 0;
  });

  it("tek RPC ile yazar; göç yoksa satır satır yazıma düşer", async () => {
    const ok = fakeService({});
    expect(await applySetupWrites(ok.service, { prepId: "p", userId: "u", nodes: [node(1, "a")], topics: [{ id: "a" }] })).toBe(true);
    expect(ok.rpcCalls.map((c) => c.fn)).toEqual(["apply_exam_prep_setup"]);
    expect(ok.calls).toHaveLength(0);

    const legacy = fakeService({ rpcError: { code: "PGRST202", message: "Could not find the function" } });
    expect(
      await applySetupWrites(legacy.service, { prepId: "p", userId: "u", nodes: [node(1, "a")], topics: [{ id: "a", familiarity: "new", source_refs: [] }] }),
    ).toBe(true);
    const updates = legacy.calls.filter((c) => c.op === "update").map((c) => `${c.table}:${JSON.stringify(c.payload)}`);
    expect(updates).toEqual([
      'exam_prep_nodes:{"session_meta":{"topicId":"a"}}',
      'exam_prep_topics:{"familiarity":"new"}',
      'exam_prep_topics:{"source_refs":[]}',
    ]);
  });

  it("çelişki yargısı → kalan yazım → kayıt temizlenir", async () => {
    const fake = fakeService({});
    expect(await runPrepSetupFinish(fake.service, { prepId: "p", userId: "u", finish: finish(new Date().toISOString()), persisted: true })).toBe(true);
    expect(judged.calls).toBe(1);
    const topics = fake.rpcCalls[0]!.args.p_topics as unknown[];
    expect(topics).toEqual([
      { id: "b", familiarity: "heard", contradictions: [{ concept: "kavram", claims: [] }] },
      { id: "a", contradictions: [] },
    ]);
    expect(fake.rpcCalls[0]!.args.p_nodes).toEqual([node(2, "b")]);
    const last = fake.calls.at(-1)!;
    expect(last).toMatchObject({ table: "exam_preps", op: "update", payload: { setup_finish: null } });
  });

  it("kurtarma: taze iş beklenir, bayat iş sahiplenilip biter, sahiplenemeyen dokunmaz", async () => {
    const now = Date.parse("2026-11-19T10:00:00.000Z");
    const fresh = fakeService({ setupFinish: finish(new Date(now - 1_000).toISOString()) });
    expect(await resumeStalePrepSetup(fresh.service, { prepId: "p", userId: "u", now })).toBe("busy");
    expect(fresh.rpcCalls).toHaveLength(0);

    const staleAt = new Date(now - SETUP_FINISH_STALE_MS - 1).toISOString();
    const stale = fakeService({ setupFinish: finish(staleAt) });
    expect(await resumeStalePrepSetup(stale.service, { prepId: "p", userId: "u", now })).toBe("resumed");
    expect(stale.calls.find((c) => c.op === "update")!.filters).toContain(`setup_finish->>startedAt=${staleAt}`);
    expect(stale.rpcCalls).toHaveLength(1);

    const lost = fakeService({ setupFinish: finish(staleAt), claimRows: 0 });
    expect(await resumeStalePrepSetup(lost.service, { prepId: "p", userId: "u", now })).toBe("busy");
    expect(lost.rpcCalls).toHaveLength(0);

    const none = fakeService({ setupFinish: null });
    expect(await resumeStalePrepSetup(none.service, { prepId: "p", userId: "u", now })).toBe("none");
  });

  it("kurulum rotası ilk ekranı yazıp kalan işi after() ile bırakır; sayfa kurtarmayı çağırır", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/create/route.ts", "utf8");
    expect(route).toContain("await applySetupWrites(service, { prepId: result.prepId, userId, ...setupSplit.now });");
    expect(route).toContain("runPrepSetupFinish(service, { prepId: result.prepId, userId, finish: setupFinish, persisted: true })");
    expect(route).not.toContain("judgeEquivalence");
    expect(route).not.toContain("contradictionsByTopicTitleResolved(");
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/page.tsx", "utf8");
    expect(page).toContain("after(() => resumeStalePrepSetup(service, { prepId, userId: user.id })");
  });
});
