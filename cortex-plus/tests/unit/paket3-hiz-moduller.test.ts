/**
 * Paket 3 hız (6 Kasım 2026): tek tek modüllerdeki gidiş-dönüş azaltmaları.
 *  - Özellik anahtarı: süreç başına 30 sn önbellek; okuma hatasında son bilinen değer; hiç bilinmiyorsa
 *    kapalı + dakikada bir `feature_flag_unknown`.
 *  - Hazırlık sohbeti: öğretmen analizleri belge başına iki okuma yerine tek `.in()` (150'lik parçalar).
 *  - Hakimiyet Haritası kanıtı: notlama başına tek RPC; fonksiyon yoksa eski satır satır yol.
 *  - Konu hâkimiyeti: konu başına upsert yerine tek dizi upsert.
 *  - Deneme durumu: satır başına sayım yerine tek sorgu. Düzey: düzey başına tek güncelleme, hepsi denenir.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

vi.mock("server-only", () => ({}));

const guard = vi.hoisted(() => ({ service: null as unknown }));
vi.mock("@/lib/api/guards", () => ({
  withUser: async () => ({ ok: true, ctx: { userId: "user-1", service: guard.service } }),
  errorResponse: (status: number, error: string) => Response.json({ error }, { status }),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => undefined,
}));
vi.mock("@/lib/learning/lesson-prefetch", () => ({ requestPrepPrefetch: async () => undefined }));

import {
  FEATURE_FLAG_CACHE_TTL_MS,
  isFeatureEnabled,
  resetFeatureFlagCacheForTests,
} from "@/lib/admin/feature-flags";
import { ANALYSIS_ID_CHUNK, loadAnalysisRows } from "@/lib/learning/prep-chat-grounding";
import { applyOutcomeEvidence, type OutcomeEvidenceRow } from "@/lib/mastery-map/exam-evidence";
import { GET as statusGet } from "@/app/api/learning/exam-prep/mock-exam/status/route";
import { POST as levelPost } from "@/app/api/learning/exam-prep/level/route";

type Call = { table: string; ops: unknown[][] };

/** Zincirlenebilir sahte istemci: her `from` bir çağrı; yanıt tabloya ve işlemlere göre. */
function chainClient(respond: (call: Call) => { data?: unknown; error?: unknown; count?: number | null }) {
  const calls: Call[] = [];
  const rpcs: Array<{ name: string; args: unknown }> = [];
  let rpcResult: { data?: unknown; error?: unknown } = { data: 0, error: null };
  const client = {
    calls,
    rpcs,
    setRpc(result: { data?: unknown; error?: unknown }) {
      rpcResult = result;
    },
    rpc: async (name: string, args: unknown) => {
      rpcs.push({ name, args });
      return { data: rpcResult.data ?? null, error: rpcResult.error ?? null };
    },
    from(table: string) {
      const call: Call = { table, ops: [] };
      calls.push(call);
      const builder: Record<string, unknown> = new Proxy(
        {},
        {
          get(_t, prop: string) {
            if (prop === "then") {
              return (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
                Promise.resolve()
                  .then(() => {
                    const out = respond(call);
                    return { data: out.data ?? null, error: out.error ?? null, count: out.count ?? null };
                  })
                  .then(ok, bad);
            }
            return (...args: unknown[]) => {
              call.ops.push([prop, ...args]);
              return builder;
            };
          },
        },
      );
      return builder;
    },
  };
  return client;
}

const opArgs = (call: Call, op: string) => call.ops.filter(([name]) => name === op).map((entry) => entry.slice(1));

describe("isFeatureEnabled önbelleği", () => {
  beforeEach(() => {
    resetFeatureFlagCacheForTests({ cache: true });
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-06T10:00:00Z"));
  });
  afterEach(() => {
    vi.useRealTimers();
    resetFeatureFlagCacheForTests();
    vi.restoreAllMocks();
  });

  it("30 sn içinde aynı anahtar yeniden okunmaz; süre dolunca okunur", async () => {
    let enabled = true;
    const client = chainClient(() => ({ data: { enabled } }));
    expect(await isFeatureEnabled(client as never, "k")).toBe(true);
    enabled = false;
    expect(await isFeatureEnabled(client as never, "k")).toBe(true);
    expect(client.calls).toHaveLength(1);
    vi.advanceTimersByTime(FEATURE_FLAG_CACHE_TTL_MS + 1);
    expect(await isFeatureEnabled(client as never, "k")).toBe(false);
    expect(client.calls).toHaveLength(2);
  });

  it("pilot kararı her çağrıda: önbellekteki satır kullanıcıya göre değerlendirilir", async () => {
    const client = chainClient(() => ({ data: { enabled: false, metadata: { pilot_user_ids: ["u1"] } } }));
    expect(await isFeatureEnabled(client as never, "p", "u1")).toBe(true);
    expect(await isFeatureEnabled(client as never, "p", "u2")).toBe(false);
    expect(client.calls).toHaveLength(1);
  });

  it("okuma hata verirse son bilinen değer (süresi geçmiş olsa da)", async () => {
    let fail = false;
    const client = chainClient(() => (fail ? { error: { message: "down" } } : { data: { enabled: true } }));
    expect(await isFeatureEnabled(client as never, "k")).toBe(true);
    fail = true;
    vi.advanceTimersByTime(FEATURE_FLAG_CACHE_TTL_MS + 1);
    expect(await isFeatureEnabled(client as never, "k")).toBe(true);
  });

  it("hiç bilinmiyorsa kapalı ve dakikada en çok bir uyarı; satır yoksa (bilinen kapalı) uyarı yok", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const down = chainClient(() => ({ error: { message: "down" } }));
    expect(await isFeatureEnabled(down as never, "u")).toBe(false);
    expect(await isFeatureEnabled(down as never, "u")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith("feature_flag_unknown", { key: "u" });
    vi.advanceTimersByTime(60_001);
    expect(await isFeatureEnabled(down as never, "u")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);

    const missing = chainClient(() => ({ data: null }));
    expect(await isFeatureEnabled(missing as never, "none")).toBe(false);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("testte varsayılan olarak önbellek kapalı (sahte istemciler birbirine taşınmaz)", async () => {
    resetFeatureFlagCacheForTests();
    const on = chainClient(() => ({ data: { enabled: true } }));
    const off = chainClient(() => ({ data: { enabled: false } }));
    expect(await isFeatureEnabled(on as never, "k")).toBe(true);
    expect(await isFeatureEnabled(off as never, "k")).toBe(false);
  });
});

describe("hazırlık sohbeti: öğretmen analizleri tek okumada", () => {
  it("kimlikler 150'lik parçalarla tek .in() sorgusuyla okunur; hata veren parça analizsiz", async () => {
    const ids = Array.from({ length: 320 }, (_, i) => `d${i}`);
    const client = chainClient((call) => {
      const [, chunk] = opArgs(call, "in")[0] as [string, string[]];
      if (chunk.includes("d300")) return { error: { message: "down" } };
      return { data: chunk.map((id) => ({ document_id: id, status: "ready", analysis: { id } })) };
    });
    const rows = await loadAnalysisRows(client as never, [...ids, "d0"]);
    expect(ANALYSIS_ID_CHUNK).toBe(150);
    expect(client.calls).toHaveLength(3);
    for (const call of client.calls) {
      expect(call.table).toBe("document_teacher_analyses");
      expect(opArgs(call, "select")[0]).toEqual(["document_id, status, analysis"]);
      expect((opArgs(call, "in")[0]![1] as string[]).length).toBeLessThanOrEqual(150);
    }
    expect(rows.get("d0")).toEqual({ status: "ready", analysis: { id: "d0" } });
    expect(rows.has("d300")).toBe(false);
    expect(rows.size).toBe(300);
  });

  it("sohbet yolu belge başına okuma yapmaz; sahiplik süzgeci (loadPrepDocumentIds + user_id) yerinde", () => {
    const source = readFileSync("src/lib/learning/prep-chat-grounding.ts", "utf8");
    expect(source).toContain("const analysisRows = await loadAnalysisRows(service, documentIds);");
    expect(source).not.toContain("await loadTeacherAnalysis(service, documentId)");
    expect(source).not.toMatch(/\.from\("document_teacher_analyses"\)\s*\.select\("analysis"\)/);
    expect(source).toContain("const documentIds = await loadPrepDocumentIds(service, prepId);");
    expect(source).toMatch(/\.in\("id", documentIds\)\s*\.eq\("user_id", userId\)/);
  });
});

describe("Hakimiyet Haritası kanıtı: notlama başına tek atomik çağrı", () => {
  const rows: OutcomeEvidenceRow[] = [
    { outcome_id: "o1", unit_id: "u1", program_id: "p1", weight: 1, correct: true },
    { outcome_id: "o2", unit_id: "u1", program_id: "p1", weight: 0.5, correct: false },
  ];

  it("fonksiyon varsa tek RPC, outcome_mastery'ye doğrudan okuma/yazma yok", async () => {
    const client = chainClient(() => ({ data: null }));
    client.setRpc({ data: 2 });
    expect(await applyOutcomeEvidence(client as never, "user-1", rows)).toBe(2);
    expect(client.rpcs).toEqual([{ name: "add_outcome_evidence", args: { p_user_id: "user-1", p_rows: rows } }]);
    expect(client.calls).toHaveLength(0);
  });

  it("fonksiyon yoksa (PGRST202 / 42883) eski satır satır hesap: PRIOR'dan ya da satırdan", async () => {
    for (const code of ["PGRST202", "42883"]) {
      const upserts: unknown[] = [];
      const client = chainClient((call) => {
        if (opArgs(call, "upsert").length) {
          upserts.push(opArgs(call, "upsert")[0]![0]);
          return { data: null };
        }
        const outcome = opArgs(call, "eq").find(([column]) => column === "outcome_id")?.[1];
        return { data: outcome === "o2" ? { alpha: 2, beta: 3, n: 4 } : null };
      });
      client.setRpc({ error: { code, message: "function not found" } });
      expect(await applyOutcomeEvidence(client as never, "user-1", rows)).toBe(2);
      expect(upserts).toEqual([
        expect.objectContaining({ outcome_id: "o1", alpha: 2, beta: 1, n: 1 }),
        expect.objectContaining({ outcome_id: "o2", alpha: 2, beta: 3.5, n: 5 }),
      ]);
    }
  });

  it("bilinmeyen RPC hatasında çift sayım riski alınmaz: satır satır yeniden yazılmaz", async () => {
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const client = chainClient(() => ({ data: null }));
    client.setRpc({ error: { code: "57014", message: "timeout" } });
    expect(await applyOutcomeEvidence(client as never, "user-1", rows)).toBe(0);
    expect(client.calls).toHaveLength(0);
    error.mockRestore();
  });

  it("boş listede çağrı yok", async () => {
    const client = chainClient(() => ({ data: null }));
    expect(await applyOutcomeEvidence(client as never, "user-1", [])).toBe(0);
    expect(client.rpcs).toHaveLength(0);
  });
});

describe("konu hâkimiyeti tek dizi upsert", () => {
  it("konu başına döngüde upsert yok; aynı çakışma hedefiyle tek istek", () => {
    const source = readFileSync("src/lib/learning/learning-tracking-persist.ts", "utf8");
    expect(source).toContain(".upsert(masteryRowsOut.length === 1 ? masteryRowsOut[0]! : masteryRowsOut, {");
    expect(source).toContain('onConflict: "user_id,exam_prep_id,topic_key",');
    expect(source).not.toMatch(/for \(const topic of folded\) \{[\s\S]{0,200}await service\.from\("exam_prep_topic_mastery"\)\.upsert/);
  });
});

const PREP = "22222222-2222-4222-8222-222222222222";

describe("deneme durumu: soru sayısı tek sorguda", () => {
  it("birden çok aday kâğıt tek .in() ile sayılır; yayımlanan bulunur", async () => {
    const client = chainClient((call) => {
      if (call.table === "practice_exams") {
        return {
          data: [
            { id: "e3", blueprint: { cpBuild: { examId: null, building: true } }, created_at: "2026-11-06T10:00:00Z" },
            { id: "e2", blueprint: {}, created_at: "2026-11-06T09:59:00Z" },
            { id: "e1", blueprint: {}, created_at: "2026-11-06T09:58:00Z" },
          ],
        };
      }
      if (call.table === "practice_exam_questions") return { data: [{ exam_id: "e1" }, { exam_id: "e1" }] };
      return { data: null };
    });
    guard.service = client;
    const res = await statusGet(new Request(`http://local/api/learning/exam-prep/mock-exam/status?prepId=${PREP}`));
    const body = await res.json();
    const counts = client.calls.filter((call) => call.table === "practice_exam_questions");
    expect(counts).toHaveLength(1);
    expect(opArgs(counts[0]!, "in")[0]).toEqual(["exam_id", ["e2", "e1"]]);
    expect(body).toMatchObject({ state: "published", examId: "e1" });
  });
});

describe("düzey değişimi: düzey başına tek güncelleme, hepsi denenir", () => {
  function levelClient(failFamiliarity?: string) {
    return chainClient((call) => {
      if (call.table === "exam_preps") return { data: { id: PREP } };
      if (call.table === "exam_prep_topics" && opArgs(call, "update").length) {
        const target = (opArgs(call, "update")[0]![0] as { familiarity: string }).familiarity;
        return target === failFamiliarity ? { error: { message: "down" } } : { data: null };
      }
      if (call.table === "exam_prep_topics") {
        return {
          data: [
            { id: "t1", familiarity: "heard" },
            { id: "t2", familiarity: "new" },
            { id: "t3", familiarity: "basics" },
            { id: "t4", familiarity: "confident" },
          ],
        };
      }
      if (call.table === "exam_prep_nodes") return { data: [{ id: "n1" }] };
      return { data: null };
    });
  }
  const post = () =>
    levelPost(
      new Request("http://local/api/learning/exam-prep/level", {
        method: "POST",
        body: JSON.stringify({ prepId: PREP, direction: "harder" }),
      }),
    );

  it("aynı yeni düzeyli konular tek istekte, hazırlığa bağlı", async () => {
    const client = levelClient();
    guard.service = client;
    const res = await post();
    expect(res.status).toBe(200);
    const updates = client.calls.filter((call) => call.table === "exam_prep_topics" && opArgs(call, "update").length);
    expect(updates).toHaveLength(2);
    const byTarget = Object.fromEntries(
      updates.map((call) => [
        (opArgs(call, "update")[0]![0] as { familiarity: string }).familiarity,
        { in: opArgs(call, "in")[0], eq: opArgs(call, "eq")[0] },
      ]),
    );
    expect(byTarget.basics).toEqual({ in: ["id", ["t1", "t2"]], eq: ["exam_prep_id", PREP] });
    expect(byTarget.confident).toEqual({ in: ["id", ["t3"]], eq: ["exam_prep_id", PREP] });
  });

  it("bir güncelleme düşerse öbürü yine denenir ve başarı bildirilmez", async () => {
    const client = levelClient("basics");
    guard.service = client;
    const res = await post();
    expect(res.status).toBe(500);
    const updates = client.calls.filter((call) => call.table === "exam_prep_topics" && opArgs(call, "update").length);
    expect(updates).toHaveLength(2);
    // Başarısızlıkta hazır içerik silinmez (eskisi gibi erken dönüş).
    expect(client.calls.some((call) => call.table === "exam_prep_prefetch")).toBe(false);
  });
});
