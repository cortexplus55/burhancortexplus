import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRecordingDb } from "./helpers/recording-db";

/*
  İlk dersin temel döngüsü (11 Kasım 2026, ürün sahibinin kararı): ücretsiz hesapta ilk hazırlığın ilk dersinin
  adımları (konu anlatımı, kartlar, doğru/yanlış, konu testi) süreye ve haftalık ders hakkına takılmadan açılır;
  Plus'a özel olanlar kilitli kalır.

  Üç katman:
   1. Saf kural (`firstLessonCycleNode`): hangi adım döngüye girer.
   2. Sunucu kararı (`firstLessonCycleFree`): ilk açılış mı, ilk hazırlık mı; okuma düşerse kural uygulanmaz.
   3. Rota (`/api/learning/exam-prep/node`, gerçek açılış kodu): haftalık ders sayacı DOLU iken 1. konunun adımı
      "derse dahil" sayacıyla ayrılır; "Farklı anlat" ve Çalışma Stüdyosu haftalık haktan düşmeye devam eder; 2. konu
      `free_topic_limit`, Plus adımı `premium_required`.
  SQL'in bu ayırmayı kabul ettiği `free-tier-counts.test.ts`te (göçler PGlite'ta). Model çağrısı yok: motorlar sahte,
  ama gerçek kabuklar gibi krediyi kendilerine verilen sayaçla ayırırlar (`reserveCredits`).
*/

const h = vi.hoisted(() => ({
  afterTasks: [] as (() => unknown)[],
  service: null as unknown,
  preview: null as null | { startedAt: string; remaining: number; periodEndsAt: string },
  engineInputs: [] as { engine: string; input: Record<string, unknown> }[],
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    h.afterTasks.push(task);
  },
}));
vi.mock("@/lib/api/guards", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/api/guards")>()),
  withUser: async () => ({ ok: true, ctx: { userId: USER, service: h.service } }),
}));
vi.mock("@/lib/supabase/server", () => ({
  createServiceClient: () => h.service,
  createClient: async () => h.service,
}));
vi.mock("@/lib/admin/feature-flags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/feature-flags")>()),
  isFeatureEnabled: async () => true,
}));
vi.mock("@/lib/ai/generate", () => ({
  generateJson: async () => ({ ok: false, status: 502, error: "invalid_ai_response" }),
  isPremiumUser: async () => false,
}));

/** Gerçek motor kabukları gibi: önceden yazım değilse krediyi verilen sayaçla ayırır; reddi 402 koduyla döner. */
async function chargeLike(engine: string, input: Record<string, unknown>) {
  h.engineInputs.push({ engine, input });
  if (input.charge === false) return null;
  const { reserveCredits, refusalCode } = await import("@/lib/credits/service");
  const reservation = await reserveCredits(
    h.service as never,
    String(input.userId),
    input.actionCode as never,
    String(input.idempotencyKey),
    1,
    { freeMeter: input.freeMeter as never },
  );
  return reservation.ok ? null : { ok: false as const, status: 402, error: refusalCode(reservation), reasons: [] as string[] };
}

vi.mock("@/lib/learning/teacher-lesson-run", () => ({
  runTeacherLesson: async (_service: unknown, input: Record<string, unknown>) =>
    (await chargeLike("lesson", input)) ?? { ok: true, lesson: LESSON, calls: 1, ms: 0, remainingLow: [], fixTriggers: [], dropped: [], draftNote: null },
}));
vi.mock("@/lib/learning/teacher-quiz-run", () => ({
  runTeacherQuiz: async (_service: unknown, input: Record<string, unknown>) =>
    (await chargeLike("quiz", input)) ?? { ok: true, questions: [QUIZ_Q1, QUIZ_Q2], stages: [], softKept: 0 },
}));
vi.mock("@/lib/learning/teacher-podcast-run", () => ({
  runTeacherPodcast: async (_service: unknown, input: Record<string, unknown>) =>
    (await chargeLike("podcast", input)) ?? { ok: false, status: 502, error: "generation_failed", reasons: [] },
}));
vi.mock("@/lib/learning/teacher-engine-run", () => ({
  runWithTeacherModel: async (_service: unknown, input: Record<string, unknown>) =>
    (await chargeLike(String(input.label), input)) ?? {
      ok: true,
      result:
        input.label === "teacher_true_false"
          ? [
              { text: "Kuvvetli asit suda tümüyle iyonlaşır.", correct: true, explanation: "Tümüyle iyonlaşır." },
              { text: "Zayıf baz suda tümüyle iyonlaşır.", correct: false, explanation: "Kısmen iyonlaşır.", correctedStatement: "Zayıf baz suda kısmen iyonlaşır." },
            ]
          : [{ front: "Asit", back: "Suya proton veren madde" }],
    },
}));
vi.mock("@/lib/learning/exam-quiz-generate", () => ({
  generateExamQuiz: async () => ({ ok: true, questions: [QUIZ_Q1, QUIZ_Q2] }),
}));
vi.mock("@/lib/documents/clean-pages", () => ({
  documentRunningHeaders: async () => [],
  ensureCleanPages: async () => [{ page: 1, text: "Asit suya proton verir; baz proton alır.", cleaned: false }],
}));
vi.mock("@/lib/documents/teacher-analysis-run", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/documents/teacher-analysis-run")>()),
  loadPrepDocumentIds: async () => ["doc1"],
  loadTopicTeaching: async () => ({
    brief: "Öğretmen notu.",
    priority: null,
    checklist: [],
    depth: { difficulty: "hard", maxDraftAttempts: 2, quizItems: 5, line: "" },
    examPoints: ["Asit suya proton verir."],
  }),
}));
vi.mock("@/lib/learning/source-context", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/learning/source-context")>();
  const block = { block: "[s.1] Asit suya proton verir.", matches: [], documentName: "Kimya.pdf", formulas: [] };
  return {
    ...real,
    loadSourceContext: async () => block,
    loadPageSourceAcrossDocuments: async () => block,
    loadPageSourceContext: async () => block,
    widenSourcePages: async (_s: unknown, _d: unknown, _t: unknown, pages: number[]) => pages,
  };
});
vi.mock("@/lib/learning/lesson-source-resolver", () => ({
  resolveLessonSource: async () => ({
    context: { block: "[s.1] Asit suya proton verir.", matches: [], documentName: "Kimya.pdf", formulas: [] },
    trace: { steps: [] },
    unavailable: null,
  }),
  enrichLessonSource: async (_s: unknown, _u: unknown, context: unknown) => context,
}));
vi.mock("@/lib/learning/prep-chat-grounding", () => ({
  loadPrepChatGrounding: async () => ({ decision: "unknown", scope: { weighted: [], excluded: [], included: [] }, excerpts: "", passages: [], corpus: "" }),
}));
vi.mock("@/lib/learning/lesson-prefetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/learning/lesson-prefetch")>()),
  verifyPrefetchToken: (token: string | null) => (token === "signed" ? { userId: USER, nodeId: NODE } : null),
}));
vi.mock("@/lib/learning/student-memory", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/learning/student-memory")>()),
  refreshStudentMemory: async () => null,
}));
// Önizleme okuması (`admin_free_preview`) bu testte denetimli: varsayılan kapalı (sıradan ücretsiz öğrenci).
vi.mock("@/lib/billing/free-preview", () => ({
  freePreview: async () => h.preview,
  billingExempt: async () => false,
  previewAllowanceLeft: () => 0,
  previewWallet: () => ({ free_allowance_remaining: 0, period_allowance: 0, period_ends_at: "", period_kind: "daily" }),
}));

import { POST } from "@/app/api/learning/exam-prep/node/route";
import { firstLessonCycleFree } from "@/lib/billing/first-lesson-cycle";
import { firstLessonCycleNode, type FirstTopicRef } from "@/lib/billing/free-topic-rule";
import { FREE_LIMITS } from "@/lib/billing/free-meters";
import { reserveCredits, refusalCode } from "@/lib/credits/service";
import { nodeGateForCode } from "@/components/parity/exam-node/gates";

const USER = "00000000-0000-4000-8000-00000000aaaa";
const PREP = "00000000-0000-4000-8000-0000000000a1";
const NODE = "00000000-0000-4000-8000-0000000000b1";
const OTHER = "00000000-0000-4000-8000-0000000000b2";
const TOPIC1 = "00000000-0000-4000-8000-0000000000c1";
const TOPIC2 = "00000000-0000-4000-8000-0000000000c2";
const REQ = "00000000-0000-4000-8000-0000000000f1";
const PREP_CREATED = "2026-11-01T09:00:00.000Z";
const NOW = "2026-11-10T09:00:00.000Z";

const QUIZ_Q1 = {
  text: "Suya proton veren madde hangisidir?",
  options: ["Asit", "Baz", "Tuz", "Su", "Oksit"],
  correct: ["Asit"],
  multi: false,
  explanation: "Asit suya proton verir.",
};
const QUIZ_Q2 = {
  text: "Protonu alan madde hangisidir?",
  options: ["Asit", "Baz", "Tuz", "Su", "Oksit"],
  correct: ["Baz"],
  multi: false,
  explanation: "Baz proton alır.",
};
const check = {
  type: "check",
  check: {
    type: "mcq",
    prompt: "Proton veren hangisidir?",
    options: ["Asit", "Baz", "Tuz", "Su", "Oksit"],
    answerIndex: 0,
    explanation: "Asit proton verir.",
    optionWhy: ["Doğru.", "Alır.", "Nötr.", "Çözücü.", "Bileşik."],
  },
};
const LESSON = {
  format: 3,
  title: "Asitler ve Bazlar",
  overview: "Asit proton verir.",
  screens: [{ heading: "Asit", concept: "Asit", blocks: [{ type: "text", text: "Asit suya proton verir." }, check] }],
  summary: ["Asit proton verir."],
};

type Row = Record<string, unknown>;
type Kind = "lesson" | "quiz" | "true_false" | "podcast" | "oral" | "written_exam";

/** Ücretsiz öğrenci, iki konulu belgeli hazırlık; açılan adım `topic` konusunda ve `kind` türünde. */
function seed(kind: Kind, options: { topic?: 1 | 2; extra?: Record<string, Row[]> } = {}) {
  const meta =
    (options.topic ?? 1) === 1
      ? { topicId: "dtn1", topicTitle: "Asitler ve Bazlar", sourcePages: [1] }
      : { topicId: "dtn2", topicTitle: "Kimyasal Denge", sourcePages: [2] };
  return {
    exam_preps: [
      {
        id: PREP,
        user_id: USER,
        title: "Kimya",
        exam_type: "universite",
        active_topic_id: null,
        target_score: 70,
        learning_preferences: {},
        hard_topics_self: [],
        document_id: "doc1",
        source_document_ids: ["doc1"],
        created_at: PREP_CREATED,
      },
    ],
    exam_prep_topics: [
      { id: TOPIC1, exam_prep_id: PREP, label: "Asitler ve Bazlar", measured_level: null, document_topic_node_id: "dtn1", source_refs: [{ documentId: "doc1", pages: [1] }], sort_order: 1 },
      { id: TOPIC2, exam_prep_id: PREP, label: "Kimyasal Denge", measured_level: null, document_topic_node_id: "dtn2", source_refs: [{ documentId: "doc1", pages: [2] }], sort_order: 2 },
    ],
    document_topic_nodes: [
      { id: "dtn1", document_id: "doc1" },
      { id: "dtn2", document_id: "doc1" },
    ],
    documents: [{ id: "doc1", user_id: USER, source_boundary_mode: "documents_only" }],
    exam_prep_nodes: [
      { id: NODE, exam_prep_id: PREP, kind, title: "Adım", status: "ready", sort_order: 1, day_index: 1, session_meta: meta },
      { id: OTHER, exam_prep_id: PREP, kind: "quiz", title: "Konu testi", status: "locked", sort_order: 2, day_index: 1, session_meta: meta },
    ],
    credit_wallets: [{ user_id: USER, balance: 0 }],
    credit_rules: [
      { action_code: "STUDY_PLAN_GENERATE", credit_cost: 30, active: true },
      { action_code: "QUIZ_GENERATE", credit_cost: 10, active: true },
    ],
    subscriptions: [],
    credit_reservations: [],
    ...(options.extra ?? {}),
  } as Record<string, Row[]>;
}

/** SQL `credit_reserve_metered`in ücretsiz kolu: sayaç doluysa `free_limit:<sayaç>`, Plus işi `plus_required`. */
function makeMeters(used: { lesson: number; included: number }) {
  const calls: { action: string; meter: string | null; key: string }[] = [];
  let seq = 0;
  const rpc = (tables: Record<string, Row[]>) => (name: string, args: Record<string, unknown>) => {
    if (name === "credit_reserve_metered") {
      const meter = (args.p_meter as string | null) ?? null;
      const action = String(args.p_action_code);
      calls.push({ action, meter, key: String(args.p_idempotency_key) });
      if (["PODCAST_GENERATE", "ORAL_EXAM_GENERATE", "PRACTICE_EXAM_GENERATE", "VIDEO_GENERATE", "SKETCH_VIDEO_GENERATE"].includes(action)) {
        return { error: { message: "plus_required" } };
      }
      if (meter === "lesson" || meter === "included") {
        if (used[meter] >= FREE_LIMITS[meter]) return { error: { message: `free_limit:${meter}` } };
        used[meter] += 1;
      }
      const id = `reservation-${++seq}`;
      (tables.credit_reservations ??= []).push({ id, user_id: USER, action_code: action, free_meter: meter, status: "pending", idempotency_key: args.p_idempotency_key, created_at: NOW });
      return { data: id };
    }
    if (name === "credit_claim_operation") return { data: { state: "claimed", amount: 0 } };
    return undefined;
  };
  return { used, calls, rpc };
}

async function start(tables: Record<string, Row[]>, meters: ReturnType<typeof makeMeters>, body: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  const db = makeRecordingDb(tables, { timeline: [], rpc: meters.rpc(tables) });
  h.service = db.client;
  const response = await POST(
    new Request("https://cortexplus.test/api/learning/exam-prep/node", {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify({ prepId: PREP, nodeId: NODE, action: "start", clientRequestId: REQ, ...body }),
    }),
  );
  const json = (await response.json().catch(() => null)) as Record<string, unknown> | null;
  for (let round = 0; round < 40 && h.afterTasks.length; round += 1) {
    await Promise.resolve(h.afterTasks.shift()!()).catch(() => undefined);
  }
  return { status: response.status, json, tables: db.tables };
}

beforeEach(() => {
  h.afterTasks.length = 0;
  h.engineInputs.length = 0;
  h.preview = null;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  for (const level of ["info", "warn", "error"] as const) vi.spyOn(console, level).mockImplementation(() => undefined);
  vi.stubGlobal("fetch", vi.fn(async () => Response.json({ ok: true, accepted: true }, { status: 202 })));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("kural: hangi adım ilk dersin döngüsünde", () => {
  const first: FirstTopicRef = { label: "Osmanlı'da Islahatlar", ids: new Set(["t1", "doc-t1"]) };
  const own = { topicId: "doc-t1", topicTitle: "Osmanlı'da Islahatlar" };
  const node = (kind: string, sessionMeta: unknown, requestedTopicLabel: string | null = null) =>
    firstLessonCycleNode(first, { kind, sessionMeta, topicLabel: "Osmanlı'da Islahatlar", requestedTopicLabel });

  it("1. konunun kendi adımları girer: konu anlatımı, konu testi, doğru/yanlış, kartlarla tekrar, soru-cevap turu", () => {
    for (const kind of ["lesson", "quiz", "true_false", "spaced", "qa"]) expect(node(kind, own), kind).toBe(true);
    // Belgesiz hazırlıkta düğüm konu satırının kimliğini taşır.
    expect(node("lesson", { topicId: "t1" })).toBe(true);
    // O konunun uyarlamalı odaklı pratiği de konunun kendi adımıdır.
    expect(node("focused", { ...own, adaptive: "low" })).toBe(true);
  });

  it("başka konu, Plus adımı, hazırlık geneli ve bütün konuları kapsayan adım girmez", () => {
    expect(node("lesson", { topicId: "t2", topicTitle: "Tanzimat" })).toBe(false);
    expect(node("lesson", null)).toBe(false);
    for (const kind of ["podcast", "oral", "written_exam"]) expect(node(kind, own), kind).toBe(false);
    // Final bloğu 1. konunun kimliğini devralır ama konuya ait değildir.
    for (const kind of ["gaps", "focused", "flashcards", "final_check", "readiness"]) expect(node(kind, own), kind).toBe(false);
    expect(node("quiz", { ...own, role: "mock" })).toBe(false);
  });

  it("adım üzerinden başka konu istenirse (?konu=) o konunun sayılır; aynı konunun adı sorun değil", () => {
    expect(node("quiz", own, "Tanzimat Fermanı")).toBe(false);
    expect(node("lesson", own, "Cumhuriyet'in İlanı")).toBe(false);
    expect(node("quiz", own, "OSMANLI'DA ISLAHATLAR")).toBe(true);
    expect(node("quiz", own, "  osmanlı'da ıslahatlar ")).toBe(true);
  });
});

describe("sunucu kararı: ilk açılış ve ilk hazırlık", () => {
  const input = {
    userId: USER,
    prepId: PREP,
    nodeId: NODE,
    kind: "lesson",
    sessionMeta: { topicId: "dtn1", topicTitle: "Asitler ve Bazlar" },
    topicLabel: "Asitler ve Bazlar",
    requestedTopicLabel: null,
  };
  const decide = (tables: Record<string, Row[]>, patch: Partial<typeof input> = {}) =>
    firstLessonCycleFree(makeRecordingDb(tables, { timeline: [] }).client, { ...input, ...patch });
  const reservation = (row: Row) => ({ user_id: USER, action_code: "QUIZ_GENERATE", free_meter: "included", status: "committed", idempotency_key: "exam_node_slot_x", ...row });

  it("ilk hazırlıkta 1. konunun hiç açılmamış adımı: evet", async () => {
    expect(await decide(seed("lesson"))).toBe(true);
    expect(await decide(seed("quiz"), { kind: "quiz" })).toBe(true);
  });

  it("öğrenciye verilmiş kaydı olan adım yeniden yazdırılıyorsa hayır; düşen ya da süren kayıt sayılmaz", async () => {
    const attempt = (status: string, payload: unknown) => ({ id: "a1", node_id: NODE, user_id: USER, exam_prep_id: PREP, status, payload });
    expect(await decide(seed("lesson", { extra: { exam_prep_node_attempts: [attempt("completed", { type: "lesson" })] } }))).toBe(false);
    expect(await decide(seed("lesson", { extra: { exam_prep_node_attempts: [attempt("active", { type: "lesson" })] } }))).toBe(false);
    expect(await decide(seed("lesson", { extra: { exam_prep_node_attempts: [attempt("failed", null), attempt("creating", null)] } }))).toBe(true);
  });

  it("2. konu ve Plus adımı: hayır", async () => {
    expect(await decide(seed("lesson", { topic: 2 }), { sessionMeta: { topicId: "dtn2", topicTitle: "Kimyasal Denge" } })).toBe(false);
    expect(await decide(seed("podcast"), { kind: "podcast" })).toBe(false);
  });

  it("silinip yeniden kurulan hazırlık 'ilk' değildir: önceki hazırlıkta ücretsiz yol adımı açılmış", async () => {
    const earlier = "2026-10-20T09:00:00.000Z";
    expect(await decide(seed("lesson", { extra: { credit_reservations: [reservation({ created_at: earlier })] } }))).toBe(false);
    // Bu hazırlık kurulduktan sonraki ayırmalar bu hazırlığındır.
    expect(await decide(seed("lesson", { extra: { credit_reservations: [reservation({ created_at: "2026-11-05T09:00:00.000Z" })] } }))).toBe(true);
    // İade edilmiş, haftalık haktan düşmüş ya da yol adımı olmayan (koç, tanışma) ayırma kanıt değildir.
    expect(await decide(seed("lesson", { extra: { credit_reservations: [reservation({ created_at: earlier, status: "refunded" })] } }))).toBe(true);
    expect(await decide(seed("lesson", { extra: { credit_reservations: [reservation({ created_at: earlier, free_meter: "lesson" })] } }))).toBe(true);
    expect(await decide(seed("lesson", { extra: { credit_reservations: [reservation({ created_at: earlier, idempotency_key: "coach_1" })] } }))).toBe(true);
  });

  it("'ücretsiz gibi gör' önizlemesinde yalnız önizleme başladıktan sonraki ayırmalar sayılır", async () => {
    const tables = () => seed("lesson", { extra: { credit_reservations: [reservation({ created_at: "2026-10-20T09:00:00.000Z" })] } });
    h.preview = { startedAt: "2026-10-25T00:00:00.000Z", remaining: 0, periodEndsAt: "2026-11-11T00:00:00.000Z" };
    expect(await decide(tables())).toBe(true);
    h.preview = { startedAt: "2026-10-15T00:00:00.000Z", remaining: 0, periodEndsAt: "2026-11-11T00:00:00.000Z" };
    expect(await decide(tables())).toBe(false);
  });

  it("okuma düşerse kural uygulanmaz (adım bugünkü gibi haftalık haktan düşer)", async () => {
    const broken = {
      from: () => {
        throw new Error("db down");
      },
    };
    expect(await firstLessonCycleFree(broken as never, input)).toBe(false);
    // Hazırlık satırı okunamıyorsa (başkasının hazırlığı, tarih yok) da hayır.
    const noDate = seed("lesson");
    delete noDate.exam_preps![0]!.created_at;
    expect(await decide(noDate)).toBe(false);
  });
});

// 11 Kasım 2026 akşamı (ürün sahibinin kararı): haftalık ders hakkı kalktı (`FREE_LIMITS.lesson` 0), ücretsiz hesap =
// tek ders. İlk dersin döngüsü aynen açılır; ders sayacına düşen her iş kod kapısında (`free-lesson-gate.ts`) durur.
describe("rota: ders sayacında hak yokken ilk dersin adımları açılır", () => {
  it("konu anlatımı, konu testi ve doğru/yanlış 'derse dahil' sayacıyla ayrılır; ders sayacına dokunulmaz", async () => {
    for (const [kind, action] of [
      ["lesson", "STUDY_PLAN_GENERATE"],
      ["quiz", "QUIZ_GENERATE"],
      ["true_false", "QUIZ_GENERATE"],
    ] as const) {
      const meters = makeMeters({ lesson: FREE_LIMITS.lesson, included: 0 });
      const result = await start(seed(kind), meters);
      expect(result.status, kind).toBe(200);
      expect(result.json?.payload, kind).toBeTruthy();
      expect(meters.calls, kind).toEqual([expect.objectContaining({ action, meter: "included" })]);
      expect(meters.used, kind).toEqual({ lesson: FREE_LIMITS.lesson, included: 1 });
      expect(h.engineInputs.at(-1)?.input.freeMeter, kind).toBe("included");
      h.engineInputs.length = 0;
    }
  });

  it("'Farklı anlat' yeni derstir: ücretsiz hesapta free_lesson_limit (ayırma ve model çağrısı yok); cüzdan bakiyesi yetiyorsa onunla", async () => {
    const tables = () =>
      seed("lesson", {
        extra: {
          exam_prep_node_attempts: [
            { id: "00000000-0000-4000-8000-0000000000d1", node_id: NODE, user_id: USER, exam_prep_id: PREP, topic_id: TOPIC1, status: "completed", payload: { type: "lesson", lesson: LESSON }, client_request_id: "00000000-0000-4000-8000-0000000000f9", updated_at: PREP_CREATED },
          ],
        },
      });
    const full = makeMeters({ lesson: FREE_LIMITS.lesson, included: 0 });
    const refused = await start(tables(), full, { rewrite: true });
    expect(refused.status).toBe(402);
    expect(refused.json?.code).toBe("free_lesson_limit");
    // Kod kapısı ayırmadan ve üretimden ÖNCE reddeder: SQL çağrılmaz, motor çalışmaz.
    expect(full.calls).toEqual([]);
    expect(h.engineInputs).toEqual([]);
    expect(full.used.included).toBe(0);
    // Kayıtlı dersi yeniden açmak ("Dersi tekrarla") ücretsiz kalır: kapıdan önce döner.
    const replayed = await start(tables(), makeMeters({ lesson: FREE_LIMITS.lesson, included: 0 }), { replay: true });
    expect(replayed.status).toBe(200);
    expect(h.engineInputs).toEqual([]);
    // Cüzdan bakiyesi (davet hediyesi: 3 ders) yetiyorsa yazılır; ayırma sayaçsızdır (bakiyeden), ders sayacı artmaz.
    const gifted = tables();
    gifted.credit_wallets = [{ user_id: USER, balance: 90 }];
    const open = makeMeters({ lesson: 0, included: 0 });
    const written = await start(gifted, open, { rewrite: true });
    expect(written.status).toBe(200);
    expect(open.calls).toEqual([expect.objectContaining({ action: "STUDY_PLAN_GENERATE", meter: null })]);
    expect(open.used).toEqual({ lesson: 0, included: 0 });
  });

  it("verilmiş dersi düz istekle yeniden yazdırmak da ders sayacında: free_lesson_limit (yalnız adımın ilk içeriği kapsamda)", async () => {
    const tables = seed("lesson", {
      extra: {
        exam_prep_node_attempts: [
          { id: "00000000-0000-4000-8000-0000000000d1", node_id: NODE, user_id: USER, exam_prep_id: PREP, topic_id: TOPIC1, status: "completed", payload: { type: "lesson", lesson: LESSON }, client_request_id: "00000000-0000-4000-8000-0000000000f9", updated_at: PREP_CREATED },
        ],
      },
    });
    const meters = makeMeters({ lesson: FREE_LIMITS.lesson, included: 0 });
    const result = await start(tables, meters);
    expect(result.status).toBe(402);
    expect(result.json?.code).toBe("free_lesson_limit");
    expect(meters.calls).toEqual([]);
    expect(h.engineInputs).toEqual([]);
    expect(meters.used.included).toBe(0);
  });

  it("silinip yeniden kurulan hazırlıkta ders açılmaz (ilk hazırlık değil): free_lesson_limit", async () => {
    const tables = seed("lesson", {
      extra: {
        credit_reservations: [
          { id: "old", user_id: USER, action_code: "STUDY_PLAN_GENERATE", free_meter: "included", status: "committed", idempotency_key: "exam_node_slot_old", created_at: "2026-10-20T09:00:00.000Z" },
        ],
      },
    });
    const meters = makeMeters({ lesson: FREE_LIMITS.lesson, included: 0 });
    const result = await start(tables, meters);
    expect(result.status).toBe(402);
    expect(result.json?.code).toBe("free_lesson_limit");
    expect(meters.calls).toEqual([]);
    expect(h.engineInputs).toEqual([]);
  });

  it("derse dahil adımların günlük sınırı dolunca kapı günlük sınırı söyler", async () => {
    const meters = makeMeters({ lesson: FREE_LIMITS.lesson, included: FREE_LIMITS.included });
    const result = await start(seed("lesson"), meters);
    expect(result.status).toBe(402);
    expect(result.json?.code).toBe("free_included_limit");
    const gate = nodeGateForCode(result.json?.code, { message: "Bu haftaki 3 ücretsiz ders hakkın bitti.", beyondFreeDaily: false, meter: "lesson" }, false);
    expect(gate.meter).toBe("included");
    expect(gate.message).not.toMatch(/hafta|ders hakkı/i);
  });

  it("önceden yazım: ilk dersin adımı yazılır; günlük sınır doluysa ve ilk dersin dışındaki adımda yazılmaz", async () => {
    const open = makeMeters({ lesson: FREE_LIMITS.lesson, included: 0 });
    const tablesOpen = seed("quiz", { extra: { free_usage: [{ user_id: USER, meter: "lesson", period_key: "2026-W46", used: FREE_LIMITS.lesson }] } });
    const written = await start(tablesOpen, open, { prefetch: true, clientRequestId: undefined }, { "x-cp-lesson-prefetch": "signed" });
    expect(written.status).toBe(202);
    expect(h.engineInputs.map((entry) => entry.input.charge)).toEqual([false]);
    // Önceden yazım kredisizdir: hiçbir sayaç oynamaz.
    expect(open.calls).toEqual([]);
    h.engineInputs.length = 0;

    const full = makeMeters({ lesson: 0, included: FREE_LIMITS.included });
    const tablesFull = seed("quiz", { extra: { free_usage: [{ user_id: USER, meter: "included", period_key: "2026-11-10", used: FREE_LIMITS.included }] } });
    await start(tablesFull, full, { prefetch: true, clientRequestId: undefined }, { "x-cp-lesson-prefetch": "signed" });
    expect(h.engineInputs).toEqual([]);

    // İlk hazırlık olmayan (silinip yeniden kurulan) hazırlıkta adım ders sayacındadır: ücretsiz hesap açamayacağı
    // için önceden de yazılmaz.
    const later = seed("quiz", {
      extra: {
        credit_reservations: [
          { id: "old", user_id: USER, action_code: "STUDY_PLAN_GENERATE", free_meter: "included", status: "committed", idempotency_key: "exam_node_slot_old", created_at: "2026-10-20T09:00:00.000Z" },
        ],
      },
    });
    await start(later, makeMeters({ lesson: 0, included: 0 }), { prefetch: true, clientRequestId: undefined }, { "x-cp-lesson-prefetch": "signed" });
    expect(h.engineInputs).toEqual([]);
  });
});

describe("rota: Plus'a özel olanlar ve ileri konular kilitli kalır", () => {
  it("2. konunun dersi free_topic_limit; hiçbir sayaç oynamaz, motor çağrılmaz", async () => {
    const meters = makeMeters({ lesson: 0, included: 0 });
    const result = await start(seed("lesson", { topic: 2 }), meters);
    expect(result.status).toBe(402);
    expect(result.json?.code).toBe("free_topic_limit");
    expect(result.json?.firstTopic).toMatchObject({ title: "Asitler ve Bazlar" });
    expect(meters.calls).toEqual([]);
    expect(h.engineInputs).toEqual([]);
  });

  it("1. konunun podcast, sözlü ve yazılı deneme adımı premium_required (döngü kuralı bunları açmaz)", async () => {
    for (const kind of ["podcast", "oral", "written_exam"] as const) {
      const meters = makeMeters({ lesson: 0, included: 0 });
      const result = await start(seed(kind), meters);
      expect(result.status, kind).toBe(402);
      expect(result.json?.code, kind).toBe("premium_required");
      expect(meters.calls, kind).toEqual([]);
      expect(h.engineInputs, kind).toEqual([]);
    }
  });
});

describe("Çalışma Stüdyosu üretimi ücretsiz hesapta Plus'a yönlenir", () => {
  it("sayaç verilmeden ayrılan test, kart ve ders işi ders sayacındadır: ücretsiz hesapta free_lesson_limit, SQL çağrılmadan", async () => {
    const tables = seed("lesson");
    const meters = makeMeters({ lesson: 0, included: 0 });
    const service = makeRecordingDb(tables, { timeline: [], rpc: meters.rpc(tables) }).client;
    for (const action of ["QUIZ_GENERATE", "FLASHCARD_GENERATE", "STUDY_PLAN_GENERATE"] as const) {
      const refused = await reserveCredits(service, USER, action, `studio-${action}`);
      expect(refused.ok, action).toBe(false);
      expect(refusalCode(refused as { reason: string }), action).toBe("free_lesson_limit");
    }
    expect(meters.calls).toEqual([]);
    expect(meters.used).toEqual({ lesson: 0, included: 0 });
  });
});
