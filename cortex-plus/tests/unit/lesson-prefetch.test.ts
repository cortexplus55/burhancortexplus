import { readFileSync } from "fs";
import path from "path";
import { beforeAll, describe, expect, it, vi } from "vitest";

/**
 * Sıradaki dersin önceden hazırlanması (3 Ekim 2026). Ürün sahibinin şartı:
 * kredi yalnız öğrenci dersi açınca düşer. Arka plan isteği öğrencinin
 * çerezini taşımaz — imzalı başlıkla gelir.
 */

const read = (rel: string) => readFileSync(path.join(process.cwd(), rel), "utf8");
const route = read("src/app/api/learning/exam-prep/node/route.ts");
const runner = read("src/lib/learning/teacher-lesson-run.ts");
const prefetchLib = read("src/lib/learning/lesson-prefetch.ts");

let lib: typeof import("@/lib/learning/lesson-prefetch");

beforeAll(async () => {
  vi.stubEnv("APP_SECRET", "test-secret-for-prefetch");
  vi.resetModules();
  lib = await import("@/lib/learning/lesson-prefetch");
});

describe("önceden yazım imzası", () => {
  const user = "11111111-1111-4111-8111-111111111111";
  const node = "22222222-2222-4222-8222-222222222222";

  it("sunucunun imzası doğrulanır ve kimliği taşır", () => {
    const token = lib.prefetchToken(user, node);
    expect(lib.verifyPrefetchToken(token)).toEqual({ userId: user, nodeId: node });
  });

  it("değiştirilmiş imza, başka düğüm ya da süresi geçmiş imza reddedilir", () => {
    const token = lib.prefetchToken(user, node)!;
    const [u, , exp, mac] = token.split(".");
    expect(lib.verifyPrefetchToken(`${u}.33333333-3333-4333-8333-333333333333.${exp}.${mac}`)).toBeNull();
    const flipped = token.slice(0, -1) + (token.endsWith("0") ? "1" : "0");
    expect(lib.verifyPrefetchToken(flipped)).toBeNull();
    const old = lib.prefetchToken(user, node, Date.now() - 10 * 60_000);
    expect(lib.verifyPrefetchToken(old)).toBeNull();
    expect(lib.verifyPrefetchToken(null)).toBeNull();
    expect(lib.verifyPrefetchToken("a.b.c")).toBeNull();
  });

  it("aşinalık kuşağı: yeni/duymuştum, temel, iyi/güvenli", () => {
    expect(lib.familiarityBand("new")).toBe(lib.familiarityBand("heard"));
    expect(lib.familiarityBand("good")).toBe(lib.familiarityBand("confident"));
    expect(lib.familiarityBand("basics")).not.toBe(lib.familiarityBand("new"));
    expect(lib.familiarityBand("basics")).not.toBe(lib.familiarityBand("good"));
  });
});

describe("kredi yalnız açılınca düşer", () => {
  it("önceden yazımda ders motoru kredi ayırmaz, kullanımı ayrı kodla yazar", () => {
    expect(route).toMatch(/charge: !prefetch/);
    expect(runner).toMatch(/if \(charge\) \{\s*const reservation = await reserveCredits/);
    expect(runner).toMatch(/charge \? input\.actionCode : "LESSON_PREFETCH"/);
  });

  it("açılışta önce kredi ayrılır, sonra hazır ders alınır, kayıt açılınca kesinleşir", () => {
    const start = route.indexOf("peekPrefetchedLesson(service");
    const reserve = route.indexOf("_prefetched`", start);
    const take = route.indexOf("takePrefetchedLesson(service", start);
    const commit = route.indexOf("commitCredits(service, reservation.reservationId)", take);
    expect(start).toBeGreaterThan(0);
    expect(reserve).toBeGreaterThan(start);
    expect(take).toBeGreaterThan(reserve);
    expect(commit).toBeGreaterThan(take);
  });

  it("önceden yazım öğrenci kaydı açmaz ve konu dersini yazmaz", () => {
    expect(route).toMatch(/if \(teachingV2 && !prefetch\) \{\s*if \(!clientRequestId\)/);
    expect(route).toMatch(/input\.charge !== false\) \{\s*await saveTopicLesson/);
  });

  it("öğrenci açtıysa hazır ders saklanmaz", () => {
    expect(prefetchLib).toMatch(/storePrefetchedLesson[\s\S]*if \(await nodeHasAttempts\(service, nodeId\)\)/);
  });
});

describe("arka plan isteği", () => {
  it("çerez taşımaz, imzalı başlıkla gider ve beklenmez", () => {
    const call = prefetchLib.slice(prefetchLib.indexOf("await fetch("));
    expect(call).toMatch(/\[PREFETCH_HEADER\]: token/);
    expect(call.slice(0, 600)).not.toMatch(/cookie/i);
    expect(call).toMatch(/AbortSignal\.timeout/);
  });

  it("iç istek hemen kabul edilir, ders yanıttan sonra yazılır", () => {
    expect(route).toMatch(/verifyPrefetchToken\(prefetchHeader\)[\s\S]{0,200}errorResponse\(401/);
    expect(route).toMatch(/after\(async \(\) => \{\s*const result = await handleNodeRequest/);
    expect(route).toMatch(/status: 202/);
  });

  it("öğrenci isteği önceden yazım bayrağını taşıyamaz", () => {
    expect(route).toMatch(/if \(!prefetch && parsed\.data\.prefetch\) return errorResponse\(400/);
  });
});

/*
  Önceden hazırlama genişledi (18 Ekim 2026, ürün sahibinin kararı): hazırlık kurulunca ilk
  ders yazılmaya başlar; sıradaki ders konu değişse de hazırlanır; öğrenci yazımı süren dersi
  açarsa ders ikinci kez yazılmaz, devralınır.
*/
function fakeService(tables: Record<string, unknown>) {
  return {
    from(table: string) {
      const chain: Record<string, unknown> = {};
      for (const name of ["select", "eq", "gt", "neq", "order", "update", "insert", "delete", "in"]) chain[name] = () => chain;
      chain.limit = () => Object.assign(Promise.resolve({ data: tables[table] }), chain);
      chain.maybeSingle = () => Promise.resolve({ data: tables[table] });
      return chain;
    },
  } as never;
}

describe("önceden hazırlama: geniş kapsam", () => {
  it("aynı konuda ders kalmadıysa sıradaki konunun ilk dersi hazırlanır", async () => {
    const rows = [
      { id: "n-other", status: "ready", session_meta: { topicId: "t2" } },
      { id: "n-later", status: "ready", session_meta: { topicId: "t3" } },
    ];
    expect(await lib.nextLessonNode(fakeService({ exam_prep_nodes: rows }), { prepId: "p", sortOrder: 1, topicId: "t1" })).toBe("n-other");
    const same = [rows[0], { id: "n-same", status: "ready", session_meta: { topicId: "t1" } }];
    expect(await lib.nextLessonNode(fakeService({ exam_prep_nodes: same }), { prepId: "p", sortOrder: 1, topicId: "t1" })).toBe("n-same");
  });

  it("yazımı süren hazır ders: kuşak tutarsa ve yazım ilerliyorsa devralınır", async () => {
    const now = Date.parse("2026-10-18T10:00:00Z");
    const row = (over: Record<string, unknown>) => ({
      exam_prep_prefetch: { familiarity: "basics", status: "creating", payload: { type: "lesson", building: true }, updated_at: "2026-10-18T09:59:50Z", ...over },
    });
    const peek = (tables: Record<string, unknown>, familiarity: "basics" | "new" = "basics") =>
      lib.peekBuildingPrefetch(fakeService(tables), { userId: "u", nodeId: "n", familiarity }, () => now);
    expect(await peek(row({}))).toMatchObject({ status: "building" });
    expect(await peek(row({ status: "ready" }))).toEqual({ status: "ready" });
    expect(await peek(row({}), "new")).toBeNull();
    expect(await peek(row({ updated_at: "2026-10-18T09:40:00Z" }))).toBeNull();
    expect(await peek(row({ payload: null }))).toBeNull();
    expect(await peek({})).toBeNull();
  });

  it("hazırlık kurulunca ilk ders yazılır; devralınan dersin kredisi yazım bitince kesinleşir, düşerse iade", () => {
    const create = read("src/app/api/learning/exam-prep/create/route.ts");
    expect(create).toContain("after(() => requestFirstLessonPrefetch(service, { origin, userId, prepId: result.prepId }))");
    expect(route).toContain("peekBuildingPrefetch(service, { userId, nodeId, familiarity, waitMs: 20_000 })");
    expect(route).toContain("payload: { ...building.payload, adoptedPrefetch: true }");
    expect(route).toContain('outcome: "commit"');
    expect(route).toContain('outcome: "refund"');
    expect(route).toContain("publishPrefetchPartial(service, nodeId, partial)");
    // Önceden yazımda bekleyen öğrenci yok: hızlı işlem yalnız açılışta.
    expect(route).toContain("fast: input.isPremium && input.charge !== false,");
  });
});
