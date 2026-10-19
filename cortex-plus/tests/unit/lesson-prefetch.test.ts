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

  it("öğrenci açtıysa hazır ders saklanmaz (ısınmada yalnız süren kayıt sayılır)", () => {
    expect(prefetchLib).toMatch(
      /storePrefetchedLesson[\s\S]*if \(options\.warm \? await nodeHasOpenAttempt\(service, nodeId\) : await nodeHasAttempts\(service, nodeId\)\)/,
    );
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
      for (const name of ["select", "eq", "gt", "neq", "order", "update", "insert", "delete", "in", "or"]) chain[name] = () => chain;
      chain.limit = () => Object.assign(Promise.resolve({ data: tables[table] }), chain);
      chain.maybeSingle = () => Promise.resolve({ data: tables[table] });
      return chain;
    },
  } as never;
}

describe("ısınma yazımı: düğüm açılınca başlar (19 Ekim 2026)", () => {
  const session = read("src/components/parity/exam-node-session.tsx");

  it("istemci ruh hali / aşinalık ekranında bir kez 'warm' ister; sunucu yalnız ders düğümünde yazımı başlatır", () => {
    expect(session).toMatch(/action: "warm"/);
    expect(session).toMatch(/stage !== "familiarity" && stage !== "mood"/);
    expect(route).toMatch(/if \(action === "warm"\) \{/);
    expect(route).toMatch(/requestNodePrefetch\([\s\S]*?\{ warm: true \},\s*\)/);
    // Isınma yazımı hızlı işlemde: öğrenci kartlarda bekliyor.
    expect(route).toMatch(/fast: input\.charge !== false \|\| input\.warm === true/);
    // Bitmiş düğüm de ısıtılır; yalnız süren kayıt durdurur. Hazır ders saklanırken de aynı kural.
    expect(route).toMatch(/node\.status === "done" && !warm/);
    expect(route).toMatch(/warm \? await nodeHasOpenAttempt\(service, nodeId\) : await nodeHasAttempts\(service, nodeId\)/);
    expect(prefetchLib).toMatch(/options\.warm \? await nodeHasOpenAttempt\(service, nodeId\) : await nodeHasAttempts\(service, nodeId\)/);
  });

  it("bitmiş kaydı olan düğüm: ısınma iç isteği warm bayrağıyla gider, sıradan önceden yazım gitmez", async () => {
    const calls: { url: string; body: Record<string, unknown> }[] = [];
    const realFetch = globalThis.fetch;
    globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
      calls.push({ url: String(url), body: JSON.parse(String(init?.body ?? "{}")) as Record<string, unknown> });
      return new Response(JSON.stringify({ ok: true }), { status: 200 });
    }) as typeof fetch;
    try {
      // exam_prep_node_attempts: bir bitmiş kayıt var; duruma göre süzülünce (süren kayıt?) boş. exam_prep_prefetch: yok.
      const service = {
        from(table: string) {
          const chain: Record<string, unknown> = {};
          let filteredByStatus = false;
          for (const name of ["select", "eq", "gt", "neq", "order", "update", "insert", "delete", "or"]) chain[name] = () => chain;
          chain.in = () => {
            filteredByStatus = true;
            return chain;
          };
          chain.limit = () => Promise.resolve({ data: table === "exam_prep_node_attempts" ? (filteredByStatus ? [] : [{ id: "a-done" }]) : undefined });
          chain.maybeSingle = () => Promise.resolve({ data: undefined });
          return chain;
        },
      } as never;
      const node = { id: "22222222-2222-4222-8222-222222222222", kind: "lesson", status: "done", session_meta: {} };
      const input = { origin: "https://cortexplus.app", userId: "11111111-1111-4111-8111-111111111111", prepId: "p", node };
      await lib.requestNodePrefetch(service, input);
      expect(calls).toHaveLength(0);
      await lib.requestNodePrefetch(service, input, { warm: true });
      expect(calls).toHaveLength(1);
      expect(calls[0]!.body).toMatchObject({ prefetch: true, warm: true, action: "start", nodeId: node.id });
    } finally {
      globalThis.fetch = realFetch;
    }
  });
});

describe("önceden hazırlama: geniş kapsam", () => {
  it("hep bir adım önde: yolda sıradaki hazırlanabilir etkinlik, türü ne olursa olsun", async () => {
    // Zayıf nokta öğrencinin kayıtlarından anında kurulur: atlanır; sıradaki test hazırlanır.
    const rows = [
      { id: "n-gaps", kind: "gaps", status: "ready", session_meta: {} },
      { id: "n-quiz", kind: "quiz", status: "ready", session_meta: {} },
      { id: "n-lesson", kind: "lesson", status: "ready", session_meta: {} },
    ];
    expect((await lib.nextPrefetchNode(fakeService({ exam_prep_nodes: rows }), { prepId: "p", afterSortOrder: 1 }))?.id).toBe("n-quiz");
    const none = [{ id: "n-final", kind: "final_check", status: "ready", session_meta: {} }];
    expect(await lib.nextPrefetchNode(fakeService({ exam_prep_nodes: none }), { prepId: "p", afterSortOrder: 1 })).toBeNull();
    for (const kind of ["lesson", "quiz", "true_false", "flashcards", "podcast", "oral"]) expect(lib.PREFETCH_KINDS.has(kind)).toBe(true);
    for (const kind of ["gaps", "focused", "final_check", "spaced", "readiness", "written_exam", "qa"]) expect(lib.PREFETCH_KINDS.has(kind)).toBe(false);
  });

  it("hazır içerik öğrencinin seçimine uyuyorsa verilir: zorluk, podcast süresi, sözlü ayarları", () => {
    const base = { topicLabel: "Akut Gastroenterit" };
    expect(lib.prefetchVariant("lesson", { ...base, difficulty: "kolay" })).toBe(lib.prefetchVariant("lesson", { ...base, difficulty: "ileri" }));
    expect(lib.prefetchVariant("quiz", { ...base, difficulty: "kolay" })).not.toBe(lib.prefetchVariant("quiz", { ...base, difficulty: "orta" }));
    expect(lib.prefetchVariant("podcast", base)).toBe(lib.prefetchVariant("podcast", { ...base, podcastLength: lib.PREFETCH_DEFAULTS.podcastLength }));
    const oralDefault = lib.prefetchVariant("oral", { ...base, oralQuestionCount: 3, oralScope: "topic", mood: "calm", difficulty: "orta" });
    expect(lib.prefetchVariant("oral", { topicLabel: "akut gastroenterit" })).toBe(oralDefault);
    expect(lib.prefetchVariant("oral", { ...base, oralQuestionCount: 5 })).not.toBe(oralDefault);
    expect(lib.prefetchVariant("oral", { ...base, mood: "stressed", difficulty: "ileri" })).not.toBe(oralDefault);
  });

  it("hazırlık sayfası açılınca ve hazırlık kurulunca 'Sıradaki' yazılır; her açılış sıradakini tetikler", () => {
    const page = read("src/app/deneme-sinavlari/[prepId]/page.tsx");
    expect(page).toContain("after(() => requestPrepPrefetch(service,");
    const create = read("src/app/api/learning/exam-prep/create/route.ts");
    // Öğretmen analizi önce (en çok TEACHER_ANALYSIS_WAIT_MS), sonra ilk önceden yazım (18 Ekim 2026).
    expect(create).toContain("ensureTeacherAnalyses(service, { userId, documentIds })");
    expect(create).toContain("await requestPrepPrefetch(service, { origin, userId, prepId: result.prepId });");
    expect(route).toContain("requestNextPrefetch(service, { origin: options.origin, userId, prepId, sortOrder: node.sort_order as number })");
    expect(route).toContain("if (!prefetch && action === \"start\") {");
    expect(route).toContain("await waitForPrefetchReady(service, { userId, nodeId, maxMs: 30_000 });");
    expect(route).toContain("storePrefetchedLesson(service, nodeId, { ...payload, prefetchVariant: variant }, { warm })");
  });

  it("önceden yazım her motorda kredisiz; kullanım ayrı kodla, açılmayan podcast önbelleğe girmez", () => {
    for (const file of ["src/lib/learning/teacher-engine-run.ts", "src/lib/learning/teacher-quiz-run.ts", "src/lib/learning/teacher-podcast-run.ts"]) {
      const text = read(file);
      expect(text, file).toContain('free ? \"CONTENT_PREFETCH\" :');
      expect(text, file).toContain("({ ok: true, reservationId: null } as const)");
    }
    expect(route).toContain("if (input.prepId && input.userId && input.charge !== false) {");
    expect(route.match(/charge: input.charge,/g)?.length).toBeGreaterThanOrEqual(6);
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
    expect(route).toContain("peekBuildingPrefetch(service, { userId, nodeId, familiarity, waitMs: 20_000 })");
    expect(route).toContain("payload: { ...building.payload, adoptedPrefetch: true }");
    expect(route).toContain('outcome: "commit"');
    expect(route).toContain('outcome: "refund"');
    expect(route).toContain("publishPrefetchPartial(service, nodeId, partial)");
    // Önceden yazımda bekleyen öğrenci yok: hızlı işlem yalnız açılışta — ve ısınma yazımında (öğrenci kartlarda).
    expect(route).toContain("fast: input.charge !== false || input.warm === true,");
  });
});

describe("önceden yazımın düzeyi düğüm sayfasıyla aynı", () => {
  // 18 Ekim 2026 canlı: konu kimliği olmayan düğümde önceden yazım "temel" düzeyle yazdı; öğrencinin
  // kurulumdaki "duymuştum"u tutmadı, ders açılışta bir kez daha yazıldı.
  it("düğümün konusu yoksa hazırlığın etkin konusu okunur", async () => {
    const service = fakeService({ exam_preps: { active_topic_id: "t1" }, exam_prep_topics: { familiarity: "heard" } });
    expect(await lib.nodeFamiliarity(service, "p", {})).toBe("heard");
    expect(await lib.nodeFamiliarity(fakeService({ exam_prep_topics: { familiarity: "good" } }), "p", { topicId: "t2" })).toBe("good");
    expect(await lib.nodeFamiliarity(fakeService({ exam_preps: { active_topic_id: null } }), "p", {})).toBe("basics");
  });
});
