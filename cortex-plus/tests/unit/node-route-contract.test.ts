import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { describeValue, makeRecordingDb } from "./helpers/recording-db";

/*
  Yol etkinliği rotasının sözleşmesi (30 Ekim 2026, ürün sahibi: "yamalayarak değil; bir yeri yapıyoruz öbür yer
  bozuluyor"). Rota etkinlik başına modüllere bölünmeden ÖNCE yazıldı ve eski kodda yeşildi: her eylem × tür
  senaryosunda yanıt (durum + gövde), veritabanı çağrıları (sıra, tablo, işlem, sütun, süzgeç, gövde), RPC'ler,
  motor çağrılarının girdileri, `after()` işleri ve günlük satırları anlık görüntüyle sabitlenir. Bölme saf
  taşımaysa görüntü değişmez; değişirse sözleşme değişmiştir.

  Model çağrısı yok: öğretmen motorları ve kaynak yükleyicileri sahte, gerisi gerçek kod.
*/

const h = vi.hoisted(() => ({
  timeline: [] as string[],
  afterTasks: [] as (() => unknown)[],
  service: null as unknown,
  flag: true,
  gate: null as Promise<void> | null,
  releaseGate: null as (() => void) | null,
  engines: {} as Record<string, (input: Record<string, unknown>) => unknown>,
  engine(name: string, fallback: (input: Record<string, unknown>) => unknown) {
    return async (_service: unknown, input: Record<string, unknown>) => {
      h.record(name, [input]);
      return (h.engines[name] ?? fallback)(input);
    };
  },
  record(name: string, args: unknown[]) {
    h.timeline.push(`call ${name} ${JSON.stringify(args, (_k, v) => {
      if (typeof v === "function") return "[fn]";
      if (v && typeof v === "object" && typeof (v as { from?: unknown }).from === "function") return "[service]";
      if (v instanceof Promise) return "[promise]";
      return v;
    })}`);
  },
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (task: () => unknown) => {
    h.timeline.push("after:scheduled");
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
// İlk doz bedava kapısı (31 Ekim 2026, Paket J1 #3) kendi testinde (paket-j1-kayit-ucretsiz.test.ts): bu sözleşme
// rotanın mekaniğini sınar, ücretsiz konu kilidini değil.
vi.mock("@/lib/billing/free-topic-gate", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/billing/free-topic-gate")>()),
  freeTopicGate: async () => null,
}));
vi.mock("@/lib/admin/feature-flags", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/admin/feature-flags")>()),
  isFeatureEnabled: async () => h.flag,
}));
vi.mock("@/lib/ai/generate", () => ({
  generateJson: async (input: Record<string, unknown>) => {
    const { service: _s, parse: _p, ...rest } = input;
    void _s;
    void _p;
    h.record("generateJson", [rest]);
    const engine = h.engines.generateJson;
    return engine ? engine(input) : { ok: false, status: 502, error: "invalid_ai_response" };
  },
  isPremiumUser: async () => false,
}));
vi.mock("@/lib/learning/teacher-lesson-run", () => ({
  runTeacherLesson: h.engine("runTeacherLesson", () => ({ ok: false, status: 502, error: "generation_failed", reasons: [] })),
}));
vi.mock("@/lib/learning/teacher-quiz-run", () => ({
  runTeacherQuiz: h.engine("runTeacherQuiz", () => ({ ok: false, status: 502, error: "generation_failed", reasons: [] })),
}));
vi.mock("@/lib/learning/teacher-podcast-run", () => ({
  runTeacherPodcast: h.engine("runTeacherPodcast", () => ({ ok: false, status: 502, error: "generation_failed", reasons: [] })),
}));
vi.mock("@/lib/learning/teacher-engine-run", () => ({
  runWithTeacherModel: async (_service: unknown, input: Record<string, unknown>) => {
    h.record("runWithTeacherModel", [input]);
    const fn = h.engines[`model:${String(input.label)}`];
    return fn ? fn(input) : { ok: false, status: 502, error: "generation_failed", reasons: [] };
  },
}));
vi.mock("@/lib/learning/exam-quiz-generate", () => ({
  generateExamQuiz: async (input: Record<string, unknown>) => {
    const { service: _s, ...rest } = input;
    void _s;
    h.record("generateExamQuiz", [rest]);
    const count = typeof input.count === "number" ? input.count : 2;
    return {
      ok: true,
      questions: Array.from({ length: count }, (_, i) => (i % 2 ? { ...QUIZ_Q2, text: `${QUIZ_Q2.text} (${i + 1})` } : { ...QUIZ_Q1, text: `${QUIZ_Q1.text} (${i + 1})` })),
    };
  },
}));
vi.mock("@/lib/documents/clean-pages", () => ({
  documentRunningHeaders: async () => [],
  ensureCleanPages: async (_s: unknown, input: Record<string, unknown>) => {
    h.record("ensureCleanPages", [input]);
    return [{ page: 1, text: "Mitozda kromozom sayısı korunur.", cleaned: false }];
  },
}));
vi.mock("@/lib/documents/teacher-analysis-run", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/documents/teacher-analysis-run")>()),
  loadPrepDocumentIds: async () => ["doc1"],
  loadTopicTeaching: async (_s: unknown, docs: unknown, label: unknown, pages: unknown) => {
    h.record("loadTopicTeaching", [docs, label, pages]);
    return {
      brief: "Öğretmen notu: mitozda sayı korunur.",
      priority: null,
      checklist: [],
      depth: { difficulty: "hard", maxDraftAttempts: 2, quizItems: 5, line: "" },
      examPoints: ["Mitozda kromozom sayısı değişmez."],
    };
  },
}));
vi.mock("@/lib/learning/source-context", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/learning/source-context")>();
  const block = { block: "[s.1] Mitozda kromozom sayısı korunur.", matches: [], documentName: "Biyoloji.pdf", formulas: [] };
  return {
    ...real,
    loadSourceContext: async (...args: unknown[]) => (h.record("loadSourceContext", args.slice(1)), block),
    loadPageSourceAcrossDocuments: async (...args: unknown[]) => (h.record("loadPageSourceAcrossDocuments", args.slice(1)), block),
    loadPageSourceContext: async (...args: unknown[]) => (h.record("loadPageSourceContext", args.slice(1)), block),
    widenSourcePages: async (_s: unknown, _d: unknown, _t: unknown, pages: number[]) => pages,
  };
});
vi.mock("@/lib/learning/lesson-source-resolver", () => ({
  resolveLessonSource: async (_s: unknown, input: Record<string, unknown>) => {
    h.record("resolveLessonSource", [input]);
    return {
      context: { block: "[s.1] Mitozda kromozom sayısı korunur.", matches: [], documentName: "Biyoloji.pdf", formulas: [] },
      trace: { steps: [] },
      unavailable: null,
    };
  },
  enrichLessonSource: async (_s: unknown, _u: unknown, context: unknown) => context,
}));
vi.mock("@/lib/learning/prep-chat-grounding", () => ({
  loadPrepChatGrounding: async () => ({
    decision: "unknown",
    scope: { weighted: [], excluded: [], included: [] },
    excerpts: "",
    passages: [],
    corpus: "",
  }),
}));
vi.mock("@/lib/learning/exam-local-session", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/learning/exam-local-session")>()),
  buildLocalSessionPayload: async (_s: unknown, input: Record<string, unknown>) => {
    h.record("buildLocalSessionPayload", [input]);
    const fn = h.engines.local;
    return fn ? fn(input) : { action: "generate", topics: undefined };
  },
}));
vi.mock("@/lib/learning/lesson-prefetch", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/learning/lesson-prefetch")>()),
  verifyPrefetchToken: (token: string | null) => (token === "signed" ? { userId: USER, nodeId: NODE } : null),
}));

import { POST } from "@/app/api/learning/exam-prep/node/route";

const USER = "00000000-0000-4000-8000-00000000aaaa";
const PREP = "00000000-0000-4000-8000-0000000000a1";
const NODE = "00000000-0000-4000-8000-0000000000b1";
const NEXT = "00000000-0000-4000-8000-0000000000b2";
const TOPIC = "00000000-0000-4000-8000-0000000000c1";
const ATTEMPT = "00000000-0000-4000-8000-0000000000d1";
const GEN = "00000000-0000-4000-8000-0000000000e1";
const REQ = "00000000-0000-4000-8000-0000000000f1";
const NOW = "2026-10-30T09:00:00.000Z";

const QUIZ_Q1 = {
  text: "Mitozda kromozom sayısı nasıl değişir?",
  options: ["Yarıya iner", "Değişmez", "İki katına çıkar", "Dörde katlanır", "Sıfırlanır"],
  correct: ["Değişmez"],
  multi: false,
  explanation: "Mitozda kromozom sayısı korunur.",
};
const QUIZ_Q2 = {
  text: "Mayozun sonunda kaç hücre oluşur?",
  options: ["1", "2", "3", "4", "8"],
  correct: ["4"],
  multi: false,
  explanation: "Mayoz dört hücre verir.",
};

const mcq = (prompt: string) => ({
  type: "check",
  check: {
    type: "mcq",
    prompt,
    options: ["Profaz", "Metafaz", "Anafaz", "Telofaz", "İnterfaz"],
    answerIndex: 1,
    explanation: "Kromozomlar metafazda ortada dizilir.",
    optionWhy: ["Erken evre.", "Doğru.", "Ayrılma.", "Son evre.", "Bölünme dışı."],
    review: { prompt: "Dizilme hangi evrede?" },
  },
});
const LESSON = {
  format: 3,
  title: "Hücre Bölünmesi",
  overview: "Mitoz eş hücre verir.",
  screens: [
    { heading: "Mitoz", concept: "Mitoz", blocks: [{ type: "text", text: "Mitoz eş hücre verir." }, mcq("Kromozomlar hangi evrede dizilir?")] },
    { heading: "Mayoz", concept: "Mayoz", blocks: [{ type: "text", text: "Mayoz dört hücre verir." }, mcq("Mayozda dizilme?")] },
  ],
  summary: ["Mitoz eş hücre verir.", "Mayoz dört hücre verir."],
};
const PARTIAL_LESSON = { ...LESSON, screens: [LESSON.screens[0]], summary: undefined };

type Kind = "lesson" | "quiz" | "true_false" | "flashcards" | "spaced" | "podcast" | "oral" | "qa" | "focused" | "final_check" | "readiness" | "gaps" | "written_exam";

function seed(kind: Kind, extra: Partial<Record<string, Record<string, unknown>[]>> = {}, options: { premium?: boolean; status?: string } = {}) {
  const meta = { topicId: "dtn1", topicTitle: "Hücre Bölünmesi", sourcePages: [1, 2] };
  return {
    exam_preps: [
      {
        id: PREP,
        user_id: USER,
        title: "YKS Biyoloji",
        exam_type: "yks",
        active_topic_id: null,
        target_score: 80,
        learning_preferences: { style: "examples" },
        hard_topics_self: [],
        document_id: "doc1",
        source_document_ids: ["doc1"],
      },
    ],
    exam_prep_topics: [
      { id: TOPIC, exam_prep_id: PREP, label: "Hücre Bölünmesi", measured_level: null, document_topic_node_id: "dtn1", source_refs: [{ documentId: "doc1", pages: [1, 2] }], sort_order: 1 },
    ],
    document_topic_nodes: [{ id: "dtn1", document_id: "doc1" }],
    documents: [{ id: "doc1", user_id: USER, source_boundary_mode: "documents_only" }],
    exam_prep_nodes: [
      { id: NODE, exam_prep_id: PREP, kind, title: "Adım", status: options.status ?? "ready", sort_order: 1, day_index: 1, session_meta: meta },
      { id: NEXT, exam_prep_id: PREP, kind: "quiz", title: "Konu testi", status: "locked", sort_order: 2, day_index: 1, session_meta: meta },
    ],
    credit_wallets: [{ user_id: USER, balance: 500 }],
    credit_rules: [{ action_code: "QUIZ_GENERATE", credit_cost: 10, active: true }],
    subscriptions: options.premium
      ? [
          {
            user_id: USER,
            status: "active",
            current_period_end: "2099-01-01T00:00:00.000Z",
            cancel_at_period_end: false,
            plans: { is_premium: true, tier: "plus", name: "Plus", slug: "plus-aylik", monthly_allowance: 7200 },
          },
        ]
      : [],
    ...extra,
  } as Record<string, Record<string, unknown>[]>;
}

function attemptRow(payload: Record<string, unknown>, overrides: Record<string, unknown> = {}) {
  return {
    id: ATTEMPT,
    node_id: NODE,
    user_id: USER,
    exam_prep_id: PREP,
    status: "active",
    payload,
    answers: {},
    answer_meta: null,
    score: null,
    total: 2,
    generation_id: GEN,
    client_request_id: REQ,
    complete_request_id: null,
    content_version: 1,
    updated_at: NOW,
    created_at: NOW,
    difficulty: "orta",
    voice_mode: false,
    started_at: NOW,
    expires_at: null,
    ...overrides,
  };
}

function rpc(name: string): { data?: unknown; error?: unknown } | undefined {
  if (name === "credit_reserve_metered" || name === "credit_reserve") return { data: "reservation-1" };
  if (name === "credit_claim_operation") return { data: { state: "claimed", amount: 10 } };
  if (name === "complete_exam_prep_node") return { data: { score: 1, total: 2, nextId: NEXT } };
  if (name === "save_exam_prep_node_answers") return { data: { contentVersion: 2, generationId: GEN } };
  if (name === "award_stars") return { data: 10 };
  return undefined;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g;
function tidy(line: string): string {
  // Bu testin kimlikleri sabit; kütüphanelerin kendi rastgele kimlikleri (node:crypto) gizlenir.
  return line.replace(UUID, (id) => (id.startsWith("00000000-0000-4000-8000-") ? id : "<uuid>"));
}

async function run(
  tables: Record<string, Record<string, unknown>[]>,
  body: Record<string, unknown>,
  options: { headers?: Record<string, string>; beforeAfter?: () => void } = {},
) {
  const db = makeRecordingDb(tables, { timeline: h.timeline, rpc });
  h.service = db.client;
  const response = await POST(
    new Request("https://cortexplus.test/api/learning/exam-prep/node", {
      method: "POST",
      headers: { "content-type": "application/json", ...(options.headers ?? {}) },
      body: JSON.stringify(body),
    }),
  );
  const json = await response.json().catch(() => null);
  h.timeline.push(`response ${response.status} ${describeValue(json)}`);
  options.beforeAfter?.();
  h.releaseGate?.();
  for (let round = 0; round < 40 && h.afterTasks.length; round += 1) {
    const task = h.afterTasks.shift()!;
    h.timeline.push("after:run");
    try {
      await task();
    } catch (error) {
      h.timeline.push(`after:threw ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  return { status: response.status, json, timeline: h.timeline.map(tidy), tables: db.tables };
}

let uuidSeq = 0;
beforeEach(() => {
  h.timeline.length = 0;
  h.afterTasks.length = 0;
  h.flag = true;
  h.engines = {};
  h.gate = null;
  h.releaseGate = null;
  uuidSeq = 0;
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(NOW));
  vi.spyOn(globalThis.crypto, "randomUUID").mockImplementation(
    () => `00000000-0000-4000-8000-${String(900000000000 + ++uuidSeq)}` as `${string}-${string}-${string}-${string}-${string}`,
  );
  for (const level of ["info", "warn", "error"] as const) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      h.timeline.push(`log.${level} ${describeValue(args)}`);
    });
  }
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: unknown, init?: RequestInit) => {
      h.timeline.push(`fetch ${String(url)} ${String(init?.body ?? "")}`);
      return Response.json({ ok: true, accepted: true }, { status: 202 });
    }),
  );
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function gated() {
  h.gate = new Promise<void>((resolve) => {
    h.releaseGate = resolve;
  });
}

describe("yol etkinliği rotası: eylem sözleşmesi", () => {
  it("geçersiz gövde 400", async () => {
    expect(await run(seed("quiz"), { prepId: "x", nodeId: NODE })).toMatchSnapshot();
  });

  it("choose: kilitli düğüm açılır", async () => {
    expect(await run(seed("quiz", {}, { status: "locked" }), { prepId: PREP, nodeId: NODE, action: "choose" })).toMatchSnapshot();
  });

  it("warm: ders düğümünde ısınma arkada başlar; öbür türde başlamaz", async () => {
    expect(await run(seed("lesson"), { prepId: PREP, nodeId: NODE, action: "warm", familiarity: "basics" })).toMatchSnapshot();
    h.timeline.length = 0;
    expect(await run(seed("quiz"), { prepId: PREP, nodeId: NODE, action: "warm" })).toMatchSnapshot();
  });

  it("review: yazılı denemenin kayıtlı incelemesi", async () => {
    const stored = { type: "quiz", questions: [QUIZ_Q1], writtenReview: { score: 1, total: 1, items: [] } };
    const tables = seed("written_exam", {
      exam_prep_node_attempts: [attemptRow(stored, { status: "completed", answers: { "0": ["Değişmez"] }, score: 1, total: 1 })],
    });
    expect(await run(tables, { prepId: PREP, nodeId: NODE, action: "review" })).toMatchSnapshot();
  });

  it("grade-check: ana soru ve tekrar varyantı", async () => {
    const tables = seed("lesson", { exam_prep_node_attempts: [attemptRow({ type: "lesson", lesson: LESSON })] });
    const base = { prepId: PREP, nodeId: NODE, action: "grade-check", attemptId: ATTEMPT, sectionIndex: 0 };
    expect(await run(tables, { ...base, checkAnswer: { pick: 0 } })).toMatchSnapshot();
    h.timeline.length = 0;
    expect(await run(tables, { ...base, variant: "retry", checkAnswer: { pick: 1 } })).toMatchSnapshot();
  });

  it("progress: süren ders ve bayatlamış test", async () => {
    const building = seed("lesson", {
      exam_prep_node_attempts: [attemptRow({ type: "lesson", lesson: PARTIAL_LESSON, building: true, builtAt: NOW })],
    });
    expect(await run(building, { prepId: PREP, nodeId: NODE, action: "progress", attemptId: ATTEMPT, lessonFormat: 3 })).toMatchSnapshot();
    h.timeline.length = 0;
    const stale = seed("quiz", {
      exam_prep_node_attempts: [
        attemptRow({ type: "quiz", questions: [QUIZ_Q1], promised: 5, building: true, builtAt: "2026-10-30T08:00:00.000Z" }),
      ],
    });
    expect(await run(stale, { prepId: PREP, nodeId: NODE, action: "progress", attemptId: ATTEMPT })).toMatchSnapshot();
    h.timeline.length = 0;
    const staleLesson = seed("lesson", {
      exam_prep_node_attempts: [
        attemptRow({ type: "lesson", lesson: PARTIAL_LESSON, building: true, builtAt: "2026-10-30T08:00:00.000Z" }),
      ],
    });
    expect(await run(staleLesson, { prepId: PREP, nodeId: NODE, action: "progress", attemptId: ATTEMPT, lessonFormat: 3 })).toMatchSnapshot();
  });

  it("resume: açık kayıt, bitmiş kaydın yoklaması, notlanan kayıt", async () => {
    const active = seed("quiz", { exam_prep_node_attempts: [attemptRow({ type: "quiz", questions: [QUIZ_Q1, QUIZ_Q2] })] });
    expect(await run(active, { prepId: PREP, nodeId: NODE, action: "resume", lessonFormat: 3 })).toMatchSnapshot();
    h.timeline.length = 0;
    const done = seed("quiz", {
      exam_prep_node_attempts: [
        attemptRow(
          { type: "quiz", questions: [QUIZ_Q1, QUIZ_Q2], completeResult: { nextHref: `/deneme-sinavlari/${PREP}/dugum/${NEXT}`, stars: 10, topicGain: null, pathChange: null, reviewScheduled: 1, levelHint: null } },
          { status: "completed", score: 1, total: 2 },
        ),
      ],
    });
    expect(await run(done, { prepId: PREP, nodeId: NODE, action: "resume", attemptId: ATTEMPT })).toMatchSnapshot();
    h.timeline.length = 0;
    const grading = seed("oral", {
      exam_prep_node_attempts: [attemptRow({ type: "oral", questions: [] }, { complete_request_id: REQ })],
    });
    expect(await run(grading, { prepId: PREP, nodeId: NODE, action: "resume" })).toMatchSnapshot();
    h.timeline.length = 0;
    expect(await run(seed("quiz"), { prepId: PREP, nodeId: NODE, action: "resume", attemptId: ATTEMPT })).toMatchSnapshot();
  });

  it("save: cevap kaydı ve eksik alan", async () => {
    const tables = seed("quiz", { exam_prep_node_attempts: [attemptRow({ type: "quiz", questions: [QUIZ_Q1] })] });
    expect(
      await run(tables, { prepId: PREP, nodeId: NODE, action: "save", attemptId: ATTEMPT, generationId: GEN, contentVersion: 1, answers: { "0": ["Değişmez"] }, cursorIndex: 1 }),
    ).toMatchSnapshot();
    h.timeline.length = 0;
    expect(await run(tables, { prepId: PREP, nodeId: NODE, action: "save", attemptId: ATTEMPT })).toMatchSnapshot();
  });

  it("complete: test notlanır, yol, yanılgı, tekrar, yıldız aynı sırayla", async () => {
    const tables = seed("quiz", { exam_prep_node_attempts: [attemptRow({ type: "quiz", questions: [QUIZ_Q1, QUIZ_Q2] })] });
    expect(
      await run(tables, {
        prepId: PREP,
        nodeId: NODE,
        action: "complete",
        attemptId: ATTEMPT,
        generationId: GEN,
        completeRequestId: "00000000-0000-4000-8000-0000000000f2",
        answers: { "0": ["Değişmez"], "1": ["2"] },
      }),
    ).toMatchSnapshot();
  });

  it("complete: bitmiş kayıt saklı sonucu döndürür; eski üretim reddedilir", async () => {
    const tables = seed("quiz", {
      exam_prep_node_attempts: [attemptRow({ type: "quiz", questions: [QUIZ_Q1] }, { status: "completed", score: 1, total: 1 })],
    });
    expect(await run(tables, { prepId: PREP, nodeId: NODE, action: "complete", attemptId: ATTEMPT, answers: {} })).toMatchSnapshot();
    h.timeline.length = 0;
    expect(
      await run(tables, { prepId: PREP, nodeId: NODE, action: "complete", attemptId: ATTEMPT, generationId: "00000000-0000-4000-8000-0000000000e9" }),
    ).toMatchSnapshot();
  });

  it("complete: sözlü yanıttan sonra notlanır (gradingAsync)", async () => {
    const oral = {
      type: "oral",
      testedTopic: "Hücre Bölünmesi",
      questions: [{ prompt: "Mitozun evrelerini anlat.", expectedPoints: ["Profaz", "Metafaz"], rubricCriteria: [], modelAnswer: "Profaz, metafaz, anafaz, telofaz." }],
    };
    h.engines.generateJson = () => ({
      ok: true,
      data: { items: [{ index: 0, points: [{ point: "Profaz", status: "covered", quote: "profaz" }, { point: "Metafaz", status: "missing", quote: "" }], firstAnswerIssue: null }] },
    });
    const tables = seed("oral", { exam_prep_node_attempts: [attemptRow(oral)] });
    expect(
      await run(tables, {
        prepId: PREP,
        nodeId: NODE,
        action: "complete",
        attemptId: ATTEMPT,
        generationId: GEN,
        completeRequestId: "00000000-0000-4000-8000-0000000000f3",
        gradingAsync: true,
        answers: { "0": "Önce profaz gelir, kromozomlar belirginleşir." },
      }),
    ).toMatchSnapshot();
  });
});

describe("yol etkinliği rotası: start × tür", () => {
  it("konu testi soğuk yazılır, ilk sorular akışla açılır", async () => {
    h.engines.runTeacherQuiz = async (input) => {
      (input.onPlayable as ((q: unknown[]) => void) | undefined)?.([QUIZ_Q1]);
      return { ok: true, questions: [QUIZ_Q1, QUIZ_Q2], stages: [], softKept: 0 };
    };
    expect(await run(seed("quiz"), { prepId: PREP, nodeId: NODE, action: "start", clientRequestId: REQ, lessonFormat: 3 })).toMatchSnapshot();
  });

  it("ders akışla açılır, kalanı yanıttan sonra kapanır", async () => {
    gated();
    h.engines.runTeacherLesson = async (input) => {
      await (input.onPublish as (p: unknown) => Promise<void>)({ lesson: PARTIAL_LESSON, done: false, upcoming: ["Mayoz"], plannedScreens: 2 });
      await h.gate;
      return { ok: true, lesson: LESSON, calls: 3, ms: 0, remainingLow: [], fixTriggers: [], dropped: [], draftNote: null, teachingScores: [4, 5] };
    };
    expect(
      await run(seed("lesson"), { prepId: PREP, nodeId: NODE, action: "start", clientRequestId: REQ, lessonFormat: 3, lessonStream: true, familiarity: "basics", mood: "ready" }),
    ).toMatchSnapshot();
  });

  it("ders akışsız (eski sekme) ve düşen kavram kaydı", async () => {
    h.engines.runTeacherLesson = async () => ({
      ok: true,
      lesson: LESSON,
      calls: 4,
      ms: 0,
      remainingLow: [],
      fixTriggers: [[{ where: "Mitoz", problem: "eksik" }]],
      dropped: ["Mayoz"],
      draftNote: "okunamadı",
    });
    expect(await run(seed("lesson"), { prepId: PREP, nodeId: NODE, action: "start", clientRequestId: REQ })).toMatchSnapshot();
  });

  it("ders üretimi düşer: kayıt başarısız, kredi iadesi bildirilir", async () => {
    h.engines.runTeacherLesson = async () => ({ ok: false, status: 503, error: "generation_failed", reasons: ["kavram geçmedi"] });
    expect(await run(seed("lesson"), { prepId: PREP, nodeId: NODE, action: "start", clientRequestId: REQ, lessonStream: true, lessonFormat: 3 })).toMatchSnapshot();
  });

  it("dersi tekrarla ve tekrar incele: kayıtlı gövde yeni denemede", async () => {
    const tables = seed("lesson", {
      exam_prep_node_attempts: [attemptRow({ type: "lesson", lesson: LESSON }, { status: "completed", client_request_id: "00000000-0000-4000-8000-0000000000f9" })],
    });
    expect(await run(tables, { prepId: PREP, nodeId: NODE, action: "start", replay: true, lessonFormat: 3 })).toMatchSnapshot();
    h.timeline.length = 0;
    const quiz = seed("quiz", {
      exam_prep_node_attempts: [attemptRow({ type: "quiz", questions: [QUIZ_Q1] }, { status: "completed", client_request_id: "00000000-0000-4000-8000-0000000000f9" })],
    });
    expect(await run(quiz, { prepId: PREP, nodeId: NODE, action: "start", review: true })).toMatchSnapshot();
    h.timeline.length = 0;
    expect(await run(seed("quiz"), { prepId: PREP, nodeId: NODE, action: "start", review: true })).toMatchSnapshot();
  });

  it("aynı istek kimliği: hazır kayıt yeniden döner, açık kayıt sürdürülür", async () => {
    const tables = seed("quiz", { exam_prep_node_attempts: [attemptRow({ type: "quiz", questions: [QUIZ_Q1] })] });
    expect(await run(tables, { prepId: PREP, nodeId: NODE, action: "start", clientRequestId: REQ })).toMatchSnapshot();
    h.timeline.length = 0;
    expect(await run(tables, { prepId: PREP, nodeId: NODE, action: "start" })).toMatchSnapshot();
  });

  it("önceden yazılmış test hazırsa beklemeden açılır", async () => {
    const tables = seed("quiz", {
      exam_prep_prefetch: [
        { node_id: NODE, user_id: USER, exam_prep_id: PREP, topic_id: TOPIC, familiarity: "basics", status: "ready", payload: { type: "quiz", questions: [QUIZ_Q1, QUIZ_Q2] }, updated_at: NOW },
      ],
    });
    expect(await run(tables, { prepId: PREP, nodeId: NODE, action: "start", clientRequestId: REQ, familiarity: "basics" })).toMatchSnapshot();
  });

  it("yazımı süren önceden yazılmış ders devralınır", async () => {
    const tables = seed("lesson", {
      exam_prep_prefetch: [
        {
          node_id: NODE,
          user_id: USER,
          exam_prep_id: PREP,
          topic_id: TOPIC,
          familiarity: "basics",
          status: "creating",
          payload: { type: "lesson", lesson: PARTIAL_LESSON, building: true, builtAt: NOW },
          updated_at: NOW,
        },
      ],
    });
    expect(
      await run(tables, { prepId: PREP, nodeId: NODE, action: "start", clientRequestId: REQ, lessonStream: true, lessonFormat: 3, familiarity: "basics" }),
    ).toMatchSnapshot();
  });

  it("önceden yazım isteği (imzalı iç istek) ve imzasız istek", async () => {
    h.engines.runTeacherQuiz = async () => ({ ok: true, questions: [QUIZ_Q1, QUIZ_Q2], stages: [], softKept: 1, salvaged: ["kalıp"] });
    expect(
      await run(seed("quiz"), { prepId: PREP, nodeId: NODE, action: "start", prefetch: true }, { headers: { "x-cp-lesson-prefetch": "signed" } }),
    ).toMatchSnapshot();
    h.timeline.length = 0;
    expect(
      await run(seed("quiz"), { prepId: PREP, nodeId: NODE, action: "start", prefetch: true }, { headers: { "x-cp-lesson-prefetch": "bad" } }),
    ).toMatchSnapshot();
  });

  it("kartlar, doğru/yanlış, sözlü öğretmen motorlarından", async () => {
    h.engines["model:teacher_cards"] = () => ({ ok: true, result: [{ front: "Mitoz", back: "Eş hücre bölünmesi" }] });
    h.engines["model:teacher_true_false"] = () => ({
      ok: true,
      result: [
        { text: "Mitozda kromozom sayısı yarıya iner.", correct: false, explanation: "Korunur.", correctedStatement: "Mitozda kromozom sayısı korunur." },
        { text: "Mayoz dört hücre verir.", correct: true, explanation: "Dört hücre." },
      ],
    });
    h.engines["model:teacher_oral"] = () => ({
      ok: true,
      result: [{ prompt: "Mitozun evrelerini anlat.", expectedPoints: ["Profaz"], rubricCriteria: [], modelAnswer: "Profaz." }],
    });
    expect(await run(seed("flashcards", {}, { premium: true }), { prepId: PREP, nodeId: NODE, action: "start", clientRequestId: REQ })).toMatchSnapshot();
    h.timeline.length = 0;
    expect(await run(seed("true_false", {}, { premium: true }), { prepId: PREP, nodeId: NODE, action: "start", clientRequestId: REQ })).toMatchSnapshot();
    h.timeline.length = 0;
    expect(
      await run(seed("oral", {}, { premium: true }), {
        prepId: PREP,
        nodeId: NODE,
        action: "start",
        clientRequestId: REQ,
        oralQuestionCount: 3,
        oralScope: "topic",
        oralTopicIds: [TOPIC],
        mood: "calm",
      }),
    ).toMatchSnapshot();
  });

  it("podcast: Plus'ta yazılır, kontrol yayımdan sonra; ücretsizde 402", async () => {
    h.engines.runTeacherPodcast = async () => ({
      ok: true,
      episode: { title: "Hücre Bölünmesi", chapters: [{ title: "Mitoz", lines: [{ speaker: "Ada", text: "Mitoz eş hücre verir." }] }] },
      check: [],
      calls: 2,
      ms: 0,
      checkLater: async () => [QUIZ_Q1],
    });
    expect(
      await run(seed("podcast", {}, { premium: true }), { prepId: PREP, nodeId: NODE, action: "start", clientRequestId: REQ, podcastLength: "diyalog" }),
    ).toMatchSnapshot();
    h.timeline.length = 0;
    expect(await run(seed("podcast"), { prepId: PREP, nodeId: NODE, action: "start", clientRequestId: REQ })).toMatchSnapshot();
  });

  it("odaklı pratik ve hazır olma yerel oturumdan; kilitli boşluk kaydı açmaz", async () => {
    h.engines.local = (input) =>
      input.kind === "readiness"
        ? { action: "serve", payload: { type: "readiness", screen: { verdict: "ready" } } }
        : input.kind === "gaps"
          ? { action: "serve", payload: { type: "practice_empty", locked: true, message: "Kilitli" } }
          : { action: "serve", payload: { type: "quiz", questions: [QUIZ_Q1] }, topics: ["Hücre Bölünmesi"] };
    expect(await run(seed("focused"), { prepId: PREP, nodeId: NODE, action: "start", clientRequestId: REQ })).toMatchSnapshot();
    h.timeline.length = 0;
    expect(await run(seed("readiness"), { prepId: PREP, nodeId: NODE, action: "start", clientRequestId: REQ })).toMatchSnapshot();
    h.timeline.length = 0;
    expect(await run(seed("gaps"), { prepId: PREP, nodeId: NODE, action: "start", clientRequestId: REQ })).toMatchSnapshot();
  });

  it("son kontrol konu başına doldurulur; yazılı deneme ve soru-cevap eski motordan", async () => {
    h.engines.local = () => ({ action: "generate", topics: ["Hücre Bölünmesi"], fill: { seed: [QUIZ_Q1], perTopic: 1, previousStems: [] } });
    expect(await run(seed("final_check", {}, { premium: true }), { prepId: PREP, nodeId: NODE, action: "start", clientRequestId: REQ })).toMatchSnapshot();
    h.timeline.length = 0;
    expect(await run(seed("written_exam", {}, { premium: true }), { prepId: PREP, nodeId: NODE, action: "start", clientRequestId: REQ })).toMatchSnapshot();
    h.timeline.length = 0;
    expect(await run(seed("qa", {}, { premium: true }), { prepId: PREP, nodeId: NODE, action: "start", clientRequestId: REQ })).toMatchSnapshot();
  });

  it("özellik kapalı (v1): soru-cevap düz kayıtla açılır", async () => {
    h.flag = false;
    expect(await run(seed("qa", {}, { premium: true }), { prepId: PREP, nodeId: NODE, action: "start" })).toMatchSnapshot();
  });
});
