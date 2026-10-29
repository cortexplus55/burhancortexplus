import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

/*
  Paket H (29 Ekim 2026) — üç küçük kusur:
  (2) Yazılı deneme yoklaması: ekran durumu üretim POST'una sorup "running" alıyordu; kâğıt yayımlansa da
      öğrenciye düğme kalıyordu. Salt okuyan GET /mock-exam/status + POST'a paralel yoklama + tarayıcı kaydı.
  (3) Kaynaklar çelişiyor: "f(x) = ax + b (a ≠ 0)" ile "f(x) = ax + b, a ≠ 0" aynı tanımdı; eski kural
      "eşittirli iki kısa metin birebir aynı değilse çelişki" diyordu. Matematik normalizasyonu ve parçalar.
  (5) 503: hesap durumu tek RPC hatasında 503 düşüyordu. Bir kez daha dene, yine olmazsa geçir ve işaretle.
*/

const guard = vi.hoisted(() => ({ service: null as unknown }));
vi.mock("@/lib/api/guards", () => ({
  withUser: async () => ({ ok: true, ctx: { userId: "user-1", service: guard.service } }),
  errorResponse: (status: number, error: string) => Response.json({ error }, { status }),
}));

const ssr = vi.hoisted(() => ({
  active: vi.fn<() => Promise<{ data: unknown; error: unknown }>>(),
  profile: { data: null as Record<string, unknown> | null, error: null as { message: string } | null },
  signOut: vi.fn(async () => undefined),
}));
function fakeSupabase() {
  return {
    auth: {
      getUser: async () => ({ data: { user: { id: "u1", email: "a@b.c" } } }),
      signOut: ssr.signOut,
    },
    rpc: vi.fn(async (name: string) =>
      name === "current_account_active" ? ssr.active() : { data: "suspended", error: null },
    ),
    from: () => ({
      select: () => ({ eq: () => ({ maybeSingle: async () => ssr.profile }) }),
    }),
  };
}
vi.mock("@supabase/ssr", () => ({ createServerClient: () => fakeSupabase() }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => fakeSupabase(),
  createServiceClient: () => fakeSupabase(),
}));
vi.mock("next/navigation", () => ({
  redirect: (to: string) => {
    throw new Error(`redirect:${to}`);
  },
}));

import {
  assignContradictions,
  mathNormalize,
  mathSegments,
  relateClaims,
} from "@/lib/learning/source-contradictions";
import {
  clearStoredMockRun,
  mockExamStatusFromRows,
  mockStatusUrl,
  parseMockExamStatus,
  pollMockExamStatus,
  postMockExamWithProgress,
  readStoredMockRun,
  writeStoredMockRun,
  type MockExamStatus,
} from "@/lib/learning/mock-exam/progress";
import { GET as statusGet } from "@/app/api/learning/exam-prep/mock-exam/status/route";
import { updateSession } from "@/lib/supabase/middleware";
import { requireUser } from "@/lib/auth/session";
import { accountActiveOrUnknown } from "@/lib/auth/active-account";

const read = (file: string) => readFileSync(file, "utf8");

/* ------------------------------------------------------------------------------------------------
 * (3) Kaynaklar çelişiyor — beş disiplin
 * ---------------------------------------------------------------------------------------------- */

describe("kaynak çelişkisi · matematik normalizasyonu", () => {
  it("koşul ayracı, Unicode işleç, ondalık virgül, LaTeX ve üst simge aynı biçime iner", () => {
    expect(mathNormalize("f(x) = ax + b (a ≠ 0)")).toBe(mathNormalize("f(x) = ax + b, a ≠ 0"));
    expect(mathNormalize("f(x) = ax + b (a ≠ 0)")).toBe("f(x)=ax+b,a!=0");
    expect(mathNormalize("\\frac{m}{V} \\cdot 2")).toBe("m/v*2");
    expect(mathNormalize("x² − 9,8")).toBe("x^2-9.8");
    expect(mathNormalize("F = m·a")).toBe("f=ma");
    expect(mathNormalize("$a \\leq b$")).toBe("a<=b");
  });

  it("parçalar yalnız eşitlik/eşitsizlik taşıyan kısımlardır; bağlaç parçayı böler", () => {
    expect(mathSegments("f(x) = ax + b (a ≠ 0) biçimindeki fonksiyondur; grafiği bir doğrudur.")).toEqual([
      "f(x)=ax+b",
      "a!=0",
    ]);
    expect(mathSegments("f(x) = ax + b, a ≠ 0 biçimindeki fonksiyondur.")).toEqual(["f(x)=ax+b", "a!=0"]);
    expect(mathSegments("x = 2 ve y = 3 olsun.")).toEqual(["x=2", "y=3"]);
    expect(mathSegments("Na 135–145 mmol/L")).toEqual([]);
    expect(mathSegments("1 kPa = 1000 Pa")).toEqual(["1kpa=1000"]);
  });
});

describe("kaynak çelişkisi · disiplinler", () => {
  const left = "f(x) = ax + b (a ≠ 0) biçimindeki fonksiyondur; grafiği bir doğrudur.";
  const right = "f(x) = ax + b, a ≠ 0 biçimindeki fonksiyondur; grafiği bir doğrudur.";

  it("matematik (canlı B6): PPTX ve PDF'in aynı tanımı çelişki değil, aday da değil", () => {
    expect(relateClaims(left, right)).toBe("same");
    const assignment = assignContradictions(
      [{ title: "Doğrusal fonksiyon", sources: [] }],
      [
        { documentId: "pptx", fileName: "fonksiyonlar.pptx", definitions: [{ term: "doğrusal fonksiyon", definition: left, pageNumbers: [3] }], formulas: [] },
        { documentId: "pdf", fileName: "fonksiyonlar.pdf", definitions: [{ term: "doğrusal fonksiyon", definition: right, pageNumbers: [1] }], formulas: [] },
      ],
    );
    expect(assignment.byTitle.size).toBe(0);
    expect(assignment.candidates).toHaveLength(0);
    expect(assignment.unassigned).toHaveLength(0);
  });

  it("matematik: koşul notu yalnız bir tarafta → tamamlayıcı, çelişki değil; aynı büyüklükte yapı farkı çelişki", () => {
    expect(relateClaims("f(x) = ax + b biçimindeki fonksiyondur.", "f(x) = ax + b (a ≠ 0) biçimindeki fonksiyondur.")).toBe("same");
    expect(relateClaims("F = m·a", "F = ma")).toBe("same");
    expect(relateClaims("d = m/V", "d = m/V * 2")).toBe("conflict");
    expect(relateClaims("a ≠ 0 koşuluyla", "a = 0 koşuluyla")).toBe("conflict");
  });

  it("fizik: aynı büyüklük için farklı sayı çelişkidir", () => {
    expect(relateClaims("1 kPa = 1000 Pa", "1 kPa = 100 Pa")).toBe("conflict");
    expect(relateClaims("Basınç birimi: 1 kPa = 1000 Pa'dır.", "1 kPa = 1000 Pa")).toBe("same");
  });

  it("tıp: birim eklenmiş aynı aralık aynı iddiadır", () => {
    expect(relateClaims("Na 135–145", "Na 135–145 mmol/L")).toBe("same");
    expect(relateClaims("Serum sodyum: 135–145", "Serum sodyum normal aralığı 135–145 mmol/L'dir.")).toBe("same");
    const assignment = assignContradictions(
      [{ title: "Elektrolitler", sources: [] }],
      [
        { documentId: "a", fileName: "lab.pdf", definitions: [{ term: "sodyum", definition: "Na 135–145", pageNumbers: [1] }], formulas: [] },
        { documentId: "b", fileName: "not.docx", definitions: [{ term: "sodyum", definition: "Na 135–145 mmol/L", pageNumbers: [1] }], formulas: [] },
      ],
    );
    expect(assignment.byTitle.size).toBe(0);
    expect(assignment.candidates).toHaveLength(0);
  });

  it("tarih: aynı olay için farklı yıl çelişkidir", () => {
    expect(relateClaims("Tanzimat Fermanı 1839'da ilan edildi.", "Tanzimat Fermanı 1856'da ilan edildi.")).toBe("conflict");
    expect(relateClaims("Tanzimat Fermanı 1839'da ilan edildi.", "Tanzimat Fermanı 1839 yılında ilan edildi.")).toBe("same");
  });

  it("hukuk: genel kural + özel vaka notu çelişki değil, aday da değil", () => {
    const rule = "İdari işleme karşı dava açma süresi 60 gündür.";
    const noted = "İdari işleme karşı dava açma süresi 60 gündür; vergi davalarında bu süre 30 gündür.";
    expect(relateClaims(rule, noted)).toBe("same");
    const assignment = assignContradictions(
      [{ title: "Dava açma süresi", sources: [] }],
      [
        { documentId: "a", fileName: "idare.pdf", definitions: [{ term: "dava açma süresi", definition: rule, pageNumbers: [1] }], formulas: [] },
        { documentId: "b", fileName: "ozet.docx", definitions: [{ term: "dava açma süresi", definition: noted, pageNumbers: [1] }], formulas: [] },
      ],
    );
    expect(assignment.byTitle.size).toBe(0);
    expect(assignment.candidates).toHaveLength(0);
    // Aynı kural için başka sayı yine aynı sayılmaz.
    expect(relateClaims("Dava açma süresi 60 gündür.", "Dava açma süresi 30 gündür.")).not.toBe("same");
  });
});

/* ------------------------------------------------------------------------------------------------
 * (2) Yazılı deneme yoklaması
 * ---------------------------------------------------------------------------------------------- */

const cpBuild = (patch: Record<string, unknown>) => ({
  preset: "standard",
  cpBuild: { v: 3, prepKey: "u:p:s", building: true, failed: false, examId: null, leaseUntil: 0, topicsAttempted: [], topicTotal: 0, ...patch },
});

describe("deneme durumu · satırlardan karar", () => {
  const now = 1_000_000;

  it("kayıt yoksa running; yayımlanan kâğıt her şeyin önündedir", () => {
    expect(mockExamStatusFromRows([], { now })).toEqual({ state: "running" });
    const rows = [
      { id: "new", blueprint: cpBuild({ failed: true, failError: "stale" }) },
      { id: "old", blueprint: cpBuild({ building: false, examId: "old" }) },
    ];
    expect(mockExamStatusFromRows(rows, { now, resumeId: "new" })).toEqual({ state: "published", examId: "old", resumeId: "old" });
  });

  it("arka plan işinin kâğıdı cpBuild taşımaz: soru satırları varsa yayımlanmıştır", () => {
    expect(mockExamStatusFromRows([{ id: "d1", blueprint: { preset: "short" }, questionCount: 10 }], { now })).toEqual({
      state: "published",
      examId: "d1",
    });
    expect(mockExamStatusFromRows([{ id: "d1", blueprint: { preset: "short" }, questionCount: 0 }], { now })).toEqual({ state: "running" });
  });

  it("süren kâğıt kira ve konu sayısıyla; düşen kâğıt koduyla; bırakılan kâğıt sayılmaz", () => {
    const running = cpBuild({ leaseUntil: now + 5_000, topicsAttempted: ["a", "b", "b"], topicTotal: 5 });
    expect(mockExamStatusFromRows([{ id: "r1", blueprint: running }], { now })).toEqual({
      state: "running",
      resumeId: "r1",
      leaseAlive: true,
      topicsReady: 2,
      topicTotal: 5,
    });
    expect(mockExamStatusFromRows([{ id: "r1", blueprint: cpBuild({ leaseUntil: now - 1 }) }], { now })).toMatchObject({ leaseAlive: false });
    expect(mockExamStatusFromRows([{ id: "f1", blueprint: cpBuild({ failed: true, failError: "budget_exceeded" }) }], { now })).toEqual({
      state: "failed",
      resumeId: "f1",
      code: "budget_exceeded",
    });
    const rows = [
      { id: "abandoned", blueprint: cpBuild({ building: false, failed: true, failError: "abandoned" }) },
      { id: "live", blueprint: cpBuild({ leaseUntil: now + 1 }) },
    ];
    expect(mockExamStatusFromRows(rows, { now })).toMatchObject({ state: "running", resumeId: "live" });
  });

  it("cevap ayrıştırma bozuk gövdeyi unknown sayar", () => {
    expect(parseMockExamStatus(null)).toEqual({ state: "unknown" });
    expect(parseMockExamStatus({ state: "published" })).toEqual({ state: "unknown" });
    expect(parseMockExamStatus({ state: "published", examId: "e" })).toMatchObject({ state: "published", examId: "e" });
    expect(parseMockExamStatus({ state: "failed", resumeId: "r", code: "stale" })).toEqual({ state: "failed", resumeId: "r", jobId: undefined, code: "stale" });
    expect(mockStatusUrl({ prepId: "p", since: "2026-10-29T10:00:00.000Z", resumeId: "r" })).toBe(
      "/api/learning/exam-prep/mock-exam/status?prepId=p&since=2026-10-29T10%3A00%3A00.000Z&resumeId=r",
    );
  });
});

describe("deneme durumu · yoklayıcı", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("unknown sessizce geçilir, running bildirilir, published ile biter", async () => {
    const answers: unknown[] = [{ state: "unknown" }, { state: "running", resumeId: "r1", leaseAlive: true }, { state: "published", examId: "e1" }];
    let calls = 0;
    const seen: MockExamStatus[] = [];
    const urls: string[] = [];
    const watch = pollMockExamStatus(
      { prepId: "p", since: "2026-10-29T10:00:00.000Z" },
      (state) => seen.push(state),
      {
        intervalMs: 1,
        fetchImpl: async (url) => {
          urls.push(url);
          calls += 1;
          if (calls === 2) throw new Error("network");
          return new Response(JSON.stringify(answers.shift()), { status: 200 });
        },
      },
    );
    expect(await watch.done).toEqual({ examId: "e1" });
    expect(seen.map((state) => state.state)).toEqual(["running", "published"]);
    expect(urls[0]).toContain("/api/learning/exam-prep/mock-exam/status?prepId=p&since=");
  });

  it("durdurulunca null ile biter ve bir daha sormaz", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ state: "running" }), { status: 200 }));
    const watch = pollMockExamStatus({ prepId: "p", since: "2026-10-29T10:00:00.000Z" }, () => undefined, { intervalMs: 5, fetchImpl });
    watch.stop();
    expect(await watch.done).toBeNull();
    await new Promise((resolve) => setTimeout(resolve, 15));
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("POST döngüsü running'de takılıyken yoklama published derse POST kesilir, sonuç examId ile döner", async () => {
    const stream = (lines: unknown[]) =>
      new Response(`${lines.map((line) => JSON.stringify(line)).join("\n")}\n`, {
        status: 200,
        headers: { "Content-Type": "application/x-ndjson" },
      });
    const resumeId = "11111111-1111-4111-8111-111111111111";
    const posts = vi.fn(async () =>
      stream([
        { type: "progress", done: 2, total: 5, label: null, resumeId },
        { type: "done", status: 200, data: { ok: true, resumeId, running: true } },
      ]),
    );
    vi.stubGlobal("fetch", posts);
    let statusCalls = 0;
    const resumes: string[] = [];
    const statusUrls: string[] = [];
    const out = await postMockExamWithProgress("/api/x", () => ({ prepId: "p" }), () => undefined, {
      pollMs: 5,
      status: {
        ids: { prepId: "p", since: "2026-10-29T10:00:00.000Z" },
        intervalMs: 5,
        onResume: (id) => resumes.push(id),
        fetchImpl: async (url) => {
          statusUrls.push(url);
          statusCalls += 1;
          const body = statusCalls < 3 ? { state: "running", resumeId, leaseAlive: true } : { state: "published", examId: "e-pub" };
          return new Response(JSON.stringify(body), { status: 200 });
        },
      },
    });
    expect(out.status).toBe(200);
    expect(out.data).toEqual({ ok: true, examId: "e-pub", resumeId });
    expect(resumes).toEqual([resumeId]);
    // Yoklama kâğıdın kimliğini öğrenince onunla sorar.
    expect(statusUrls.at(-1)).toContain(`resumeId=${resumeId}`);
    expect(posts.mock.calls.length).toBeLessThan(40);
    // Döngü bitince yoklama durur.
    const before = statusCalls;
    await new Promise((resolve) => setTimeout(resolve, 20));
    expect(statusCalls).toBe(before);
  });

  it("yoklama verilmezse POST sözleşmesi eskisi gibi: examId gelince döner", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ ok: true, examId: "e1" }), { status: 200 })));
    const out = await postMockExamWithProgress("/api/x", () => ({}), () => undefined);
    expect(out).toEqual({ status: 200, data: { ok: true, examId: "e1" } });
  });
});

describe("deneme durumu · tarayıcı kaydı", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    vi.stubGlobal("window", {
      sessionStorage: {
        getItem: (key: string) => store.get(key) ?? null,
        setItem: (key: string, value: string) => void store.set(key, value),
        removeItem: (key: string) => void store.delete(key),
      },
    });
  });
  afterEach(() => vi.unstubAllGlobals());

  it("yazılan kayıt okunur, 15 dakikadan eski ya da bozuk kayıt yok sayılır, silme çalışır", () => {
    const startedAt = new Date().toISOString();
    writeStoredMockRun("prep-1", { startedAt, resumeId: "r1", answerMode: "paper", body: { preset: "short" } });
    expect(readStoredMockRun("prep-1")).toEqual({ startedAt, resumeId: "r1", jobId: null, answerMode: "paper", body: { preset: "short" } });
    expect(readStoredMockRun("prep-2")).toBeNull();
    store.set("cp:mock-exam:prep-3", JSON.stringify({ startedAt: new Date(Date.now() - 16 * 60 * 1000).toISOString() }));
    expect(readStoredMockRun("prep-3")).toBeNull();
    store.set("cp:mock-exam:prep-4", "{bozuk");
    expect(readStoredMockRun("prep-4")).toBeNull();
    clearStoredMockRun("prep-1");
    expect(readStoredMockRun("prep-1")).toBeNull();
  });

  it("depo yoksa (sunucu) sessizce null", () => {
    vi.unstubAllGlobals();
    expect(readStoredMockRun("prep-1")).toBeNull();
    expect(() => writeStoredMockRun("prep-1", { startedAt: new Date().toISOString() })).not.toThrow();
  });
});

type FakeTables = {
  practiceExams?: Array<{ id: string; blueprint: unknown; created_at?: string }>;
  counts?: Record<string, number>;
  jobs?: Record<string, Record<string, unknown>>;
  failPracticeExams?: boolean;
};

function fakeService(tables: FakeTables) {
  const calls: Array<{ table: string; op: string; args: unknown[] }> = [];
  const service = {
    calls,
    from(table: string) {
      const state: { id?: string; examId?: string } = {};
      const builder: Record<string, unknown> = {};
      const chain = (op: string) => (...args: unknown[]) => {
        calls.push({ table, op, args });
        if (op === "eq" && args[0] === "id") state.id = String(args[1]);
        if (op === "eq" && args[0] === "exam_id") state.examId = String(args[1]);
        return builder;
      };
      for (const op of ["select", "eq", "gte", "order", "limit", "is", "in"]) builder[op] = chain(op);
      builder.maybeSingle = async () => ({ data: table === "generation_jobs" ? (tables.jobs?.[state.id ?? ""] ?? null) : null, error: null });
      builder.then = (resolve: (value: unknown) => void) => {
        if (table === "practice_exams") {
          resolve({ data: tables.failPracticeExams ? null : (tables.practiceExams ?? []), error: tables.failPracticeExams ? { message: "down" } : null });
          return;
        }
        if (table === "practice_exam_questions") {
          resolve({ count: tables.counts?.[state.examId ?? ""] ?? 0, error: null });
          return;
        }
        resolve({ data: null, error: null });
      };
      return builder;
    },
  };
  return service;
}

const PREP = "22222222-2222-4222-8222-222222222222";
const JOB = "33333333-3333-4333-8333-333333333333";
const RESUME = "44444444-4444-4444-8444-444444444444";
const statusRequest = (query: string) => new Request(`http://local/api/learning/exam-prep/mock-exam/status?${query}`);

describe("deneme durumu · GET ucu", () => {
  it("geçersiz sorgu 400; kullanıcı ve hazırlık eşitliği sorguda", async () => {
    guard.service = fakeService({});
    expect((await statusGet(statusRequest("prepId=abc"))).status).toBe(400);
    const service = fakeService({});
    guard.service = service;
    const res = await statusGet(statusRequest(`prepId=${PREP}&since=2026-10-29T10:00:00.000Z`));
    expect(await res.json()).toEqual({ state: "running" });
    const eqs = service.calls.filter((call) => call.table === "practice_exams" && call.op === "eq").map((call) => call.args);
    expect(eqs).toEqual([
      ["user_id", "user-1"],
      ["exam_prep_id", PREP],
    ]);
    expect(service.calls.some((call) => call.table === "practice_exams" && call.op === "gte" && call.args[0] === "created_at")).toBe(true);
  });

  it("tablo-suz yol: yayımlanan kâğıt, süren kâğıt, düşen kâğıt", async () => {
    const now = Date.now();
    guard.service = fakeService({ practiceExams: [{ id: RESUME, blueprint: cpBuild({ building: false, examId: RESUME }) }] });
    expect(await (await statusGet(statusRequest(`prepId=${PREP}&resumeId=${RESUME}`))).json()).toEqual({
      state: "published",
      examId: RESUME,
      resumeId: RESUME,
    });
    guard.service = fakeService({ practiceExams: [{ id: RESUME, blueprint: cpBuild({ leaseUntil: now + 60_000, topicsAttempted: ["x"], topicTotal: 4 }) }] });
    expect(await (await statusGet(statusRequest(`prepId=${PREP}&resumeId=${RESUME}`))).json()).toEqual({
      state: "running",
      resumeId: RESUME,
      leaseAlive: true,
      topicsReady: 1,
      topicTotal: 4,
    });
    guard.service = fakeService({ practiceExams: [{ id: RESUME, blueprint: cpBuild({ failed: true, failError: "budget_exceeded" }) }] });
    expect(await (await statusGet(statusRequest(`prepId=${PREP}&resumeId=${RESUME}`))).json()).toEqual({
      state: "failed",
      resumeId: RESUME,
      code: "budget_exceeded",
    });
  });

  it("arka plan işi: iş satırı kullanıcıya aitse durumu, değilse yok sayılır; kâğıt satırı soru sayısıyla yayımlı", async () => {
    guard.service = fakeService({ jobs: { [JOB]: { id: JOB, user_id: "user-1", kind: "mock_exam", state: "done", result_ref: "exam-9", progress: {} } } });
    expect(await (await statusGet(statusRequest(`prepId=${PREP}&jobId=${JOB}`))).json()).toEqual({ state: "published", examId: "exam-9", jobId: JOB });
    guard.service = fakeService({
      jobs: { [JOB]: { id: JOB, user_id: "user-1", kind: "mock_exam", state: "running", result_ref: null, lease_until: new Date(Date.now() + 10_000).toISOString(), progress: { ready: 3, promised: 20 } } },
    });
    expect(await (await statusGet(statusRequest(`prepId=${PREP}&jobId=${JOB}`))).json()).toEqual({
      state: "running",
      jobId: JOB,
      leaseAlive: true,
      ready: 3,
      promised: 20,
    });
    guard.service = fakeService({ jobs: { [JOB]: { id: JOB, user_id: "someone-else", kind: "mock_exam", state: "failed", result_ref: null, progress: {} } } });
    expect(await (await statusGet(statusRequest(`prepId=${PREP}&jobId=${JOB}`))).json()).toEqual({ state: "running" });
    const service = fakeService({ practiceExams: [{ id: "durable-1", blueprint: { preset: "short", slots: [] } }], counts: { "durable-1": 12 } });
    guard.service = service;
    expect(await (await statusGet(statusRequest(`prepId=${PREP}`))).json()).toEqual({ state: "published", examId: "durable-1" });
    expect(service.calls.some((call) => call.table === "practice_exam_questions")).toBe(true);
  });

  it("okuma hatası 500 değil unknown: yoklayıcı sürer", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    guard.service = fakeService({ failPracticeExams: true });
    const res = await statusGet(statusRequest(`prepId=${PREP}`));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ state: "unknown" });
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(warn).toHaveBeenCalledWith("mock_exam_status_unavailable", expect.objectContaining({ prepId: PREP }));
    warn.mockRestore();
  });
});

describe("deneme durumu · kablolama", () => {
  it("uç salt okur; kurulum yoklar, kimlikleri tarayıcıya yazar, 'tamamlanamadı' demez", () => {
    const route = read("src/app/api/learning/exam-prep/mock-exam/status/route.ts");
    expect(route).toContain('scope: "exam-mock-status"');
    expect(route).toContain("limit: 90");
    expect(route).toContain("export async function GET");
    for (const forbidden of ["reserveCredits", "runFallbackMockExam", "pumpMockExamJob", "pumpFallbackChunk", "openai", "export async function POST"]) {
      expect(route).not.toContain(forbidden);
    }
    const setup = read("src/components/parity/mock-exam-setup.tsx");
    expect(setup).toContain("pollMockExamStatus");
    expect(setup).toContain("readStoredMockRun");
    expect(setup).toContain("writeStoredMockRun");
    expect(setup).toContain("{ status: statusWatch() }");
    expect(setup).toContain("if (waited.failed) setRetryJobId");
    expect(setup).toContain("Yeniden dene");
    expect(setup).not.toContain("setInterval");
    expect(setup).not.toMatch(/tamamlanamad/i);
    expect(setup).not.toMatch(/üretilemedi|oluşturulamadı/i);
    // Kira/bütçe sistemi yeniden yazılmadı.
    expect(read("src/lib/learning/mock-exam/fallback-chunk.ts")).toContain("export const FALLBACK_LEASE_MS = 330_000;");
  });
});

/* ------------------------------------------------------------------------------------------------
 * (5) 503 — hesap durumu okunamayınca geçir
 * ---------------------------------------------------------------------------------------------- */

describe("hesap durumu · ara katman ve sayfa kapısı", () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    ssr.active.mockReset();
    ssr.signOut.mockClear();
    ssr.profile = { data: { primary_role: "student", onboarding_completed_at: "2026-10-01T00:00:00Z", deleted_at: null }, error: null };
    warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it("yardımcı: ilk hata sonrası bir kez daha; iki hata null, false kesin", async () => {
    const client = fakeSupabase();
    ssr.active.mockResolvedValue({ data: null, error: { code: "08006" } });
    expect(await accountActiveOrUnknown(client as never, { retryMs: 1 })).toBeNull();
    expect(ssr.active).toHaveBeenCalledTimes(2);
    ssr.active.mockReset();
    ssr.active.mockResolvedValueOnce({ data: null, error: { code: "08006" } }).mockResolvedValueOnce({ data: true, error: null });
    expect(await accountActiveOrUnknown(client as never, { retryMs: 1 })).toBe(true);
    ssr.active.mockReset();
    ssr.active.mockResolvedValue({ data: false, error: null });
    expect(await accountActiveOrUnknown(client as never, { retryMs: 1 })).toBe(false);
    expect(ssr.active).toHaveBeenCalledTimes(1);
  });

  it("iki hata → geçer ve başlık yazar; false → engeller", async () => {
    ssr.active.mockResolvedValue({ data: null, error: { code: "08006" } });
    const passed = await updateSession(new NextRequest("http://localhost/ogretmen?_rsc=abc"));
    expect(passed.status).toBe(200);
    expect(passed.headers.get("x-account-check")).toBe("skipped");
    expect(ssr.active).toHaveBeenCalledTimes(2);
    expect(warn).toHaveBeenCalledWith("account_status_unavailable", expect.objectContaining({ path: "/ogretmen", rsc: true }));

    ssr.active.mockReset();
    ssr.active.mockResolvedValue({ data: false, error: null });
    const blocked = await updateSession(new NextRequest("http://localhost/ogretmen"));
    expect(blocked.status).toBe(307);
    expect(blocked.headers.get("location")).toBe("http://localhost/giris?durum=askida");
    expect(blocked.headers.get("x-account-check")).toBeNull();
    expect(ssr.signOut).toHaveBeenCalled();
  });

  it("ilk hata, ikinci okuma geçerli → başlık yok; profil okunamazsa kuruluma göndermez, geçirir", async () => {
    ssr.active.mockResolvedValueOnce({ data: null, error: { code: "08006" } }).mockResolvedValueOnce({ data: true, error: null });
    const ok = await updateSession(new NextRequest("http://localhost/ogretmen"));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("x-account-check")).toBeNull();

    ssr.active.mockReset();
    ssr.active.mockResolvedValue({ data: null, error: { code: "08006" } });
    ssr.profile = { data: null, error: { message: "down" } };
    const skipped = await updateSession(new NextRequest("http://localhost/ogretmen"));
    expect(skipped.status).toBe(200);
    expect(skipped.headers.get("x-account-check")).toBe("skipped");
    expect(warn).toHaveBeenCalledWith("profile_unavailable", { path: "/ogretmen" });
  });

  it("requireUser: iki hata → kullanıcı döner ve günlükler; false → girişe", async () => {
    ssr.active.mockResolvedValue({ data: null, error: { code: "08006" } });
    const session = await requireUser();
    expect(session.user.id).toBe("u1");
    expect(warn).toHaveBeenCalledWith("account_status_unavailable", { where: "requireUser" });
    ssr.active.mockReset();
    ssr.active.mockResolvedValue({ data: false, error: null });
    await expect(requireUser()).rejects.toThrow("redirect:/giris");
  });

  it("kablolama: 503 metni kalktı, askı yönlendirmesi duruyor", () => {
    const mw = read("src/lib/supabase/middleware.ts");
    expect(mw).not.toContain("status: 503");
    expect(mw).toContain('"x-account-check"');
    expect(mw).toContain('supabase.rpc("current_account_status")');
    expect(mw).toContain('"?durum=askida"');
    const session = read("src/lib/auth/session.ts");
    expect(session).toContain("accountActiveOrUnknown");
    expect(session).toContain('if (active === false) redirect("/giris")');
  });
});
