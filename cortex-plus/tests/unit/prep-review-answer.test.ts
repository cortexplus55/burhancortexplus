import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const mocks = vi.hoisted(() => ({ guard: vi.fn(), activity: vi.fn(), source: vi.fn(), generate: vi.fn() }));
vi.mock("@/lib/api/guards", () => ({
  withUser: mocks.guard,
  errorResponse: (status: number, code: string, extras: Record<string, unknown> = {}) =>
    Response.json({ error: code, code, ...extras }, { status }),
}));
vi.mock("@/lib/streak/record-activity", () => ({ recordUserActivity: mocks.activity }));
vi.mock("@/lib/ai/generate", () => ({ generateJson: mocks.generate, isPremiumUser: vi.fn() }));
vi.mock("@/lib/learning/source-context", () => ({
  EMPTY_SOURCE_CONTEXT: { block: "", matches: [], documentName: null },
  loadSourceContext: mocks.source,
  loadMergedTopicContext: mocks.source,
  loadPageSourceAcrossDocuments: mocks.source,
  loadPageSourceContext: mocks.source,
  pagesMarkedInSource: () => [],
  widenSourcePages: async (_s: unknown, _d: unknown, _t: unknown, pages: number[]) => pages,
}));
vi.mock("@/lib/learning/lesson-source-resolver", () => ({
  resolveLessonSource: async () => ({ unavailable: "search_error", trace: { steps: [] } }),
  enrichLessonSource: async (_s: unknown, _u: unknown, ctx: unknown) => ctx,
}));
vi.mock("@/lib/learning/lesson-generation-failures", () => ({ recordLessonGenerationFailure: vi.fn(async () => undefined) }));
vi.mock("@/lib/learning/exam-quiz-generate", () => ({ generateExamQuiz: vi.fn() }));

import {
  answerReviewItem,
  countDueReviewItems,
  loadDueReviewItems,
  recordReviewItems,
} from "@/lib/learning/review-items-store";
import { reviewDraftsFromAttempt, type ReviewDraft, type StoredReviewItem } from "@/lib/learning/review-items";
import { POST as reviewPost } from "@/app/api/learning/exam-prep/review/route";
import { POST as nodePost } from "@/app/api/learning/exam-prep/node/route";

/**
 * Günü gelen tekrar (20 Ekim 2026): kayıt, sayaç, oturum ve cevap. Not sunucuda; aynı gün ikinci
 * tıklama yeniden yazmaz; başka sekme önce yazdıysa kayıtlı sonuç döner. Tamamlamadan sonra yazılır,
 * tamamlamayı hiçbir zaman geri almaz.
 */

type Row = Record<string, unknown>;
type Call = { table: string; op: "update" | "upsert"; values: unknown; filters: [string, unknown][] };

function fakeDb(tables: Record<string, Row[]>, options: { failTable?: string; throwUpsert?: boolean } = {}) {
  const calls: Call[] = [];
  const from = (name: string) => {
    const rows = (tables[name] ??= []);
    const filters: ((row: Row) => boolean)[] = [];
    const log: [string, unknown][] = [];
    let patch: Row | null = null;
    let returning = false;
    let head = false;
    const matching = () => rows.filter((row) => filters.every((filter) => filter(row)));
    const run = () => {
      if (options.failTable === name) return { data: null, count: null, error: { message: "relation does not exist" } };
      if (patch) {
        const hit = matching();
        calls.push({ table: name, op: "update", values: patch, filters: log });
        for (const row of hit) Object.assign(row, patch);
        return { data: returning ? hit.map((row) => ({ id: row.id })) : null, count: null, error: null };
      }
      const data = matching();
      return { data: head ? null : data, count: data.length, error: null };
    };
    const builder: Record<string, unknown> = {
      select: (_cols: string, opts?: { head?: boolean }) => {
        if (patch) returning = true;
        else head = Boolean(opts?.head);
        return builder;
      },
      eq: (col: string, value: unknown) => {
        filters.push((row) => row[col] === value);
        log.push([col, value]);
        return builder;
      },
      in: (col: string, values: unknown[]) => {
        filters.push((row) => values.includes(row[col]));
        return builder;
      },
      lte: (col: string, value: string) => {
        filters.push((row) => String(row[col]) <= value);
        return builder;
      },
      gte: (col: string, value: string) => {
        filters.push((row) => String(row[col]) >= value);
        return builder;
      },
      or: () => builder,
      gt: () => builder,
      is: () => builder,
      order: () => builder,
      limit: () => builder,
      maybeSingle: async () => {
        const result = run();
        return { data: (result.data as Row[] | null)?.[0] ?? null, error: result.error };
      },
      upsert: async (values: Row[]) => {
        if (options.throwUpsert) throw new Error("upsert down");
        calls.push({ table: name, op: "upsert", values, filters: [] });
        for (const value of values) {
          if (!rows.some((row) => row.exam_prep_id === value.exam_prep_id && row.prompt_key === value.prompt_key)) {
            rows.push({ id: `item-${rows.length + 1}`, status: "active", ask_count: 0, correct_count: 0, lapse_count: 0, ...value });
          }
        }
        return { error: null };
      },
      update: (value: Row) => {
        patch = value;
        return builder;
      },
      insert: async () => ({ error: null }),
      then: (resolve: (value: unknown) => void, reject: (error: unknown) => void) =>
        Promise.resolve()
          .then(run)
          .then(resolve, reject),
    };
    return builder;
  };
  return { service: { from } as unknown as SupabaseClient, calls, tables };
}

const USER = "11111111-1111-4111-8111-111111111111";
const PREP = "22222222-2222-4222-8222-222222222222";
const ITEM = "33333333-3333-4333-8333-333333333333";
// 20 Ekim 2026 öğlen, İstanbul.
const NOW = new Date("2026-10-20T09:00:00Z");

const choice: Extract<StoredReviewItem, { mode: "choice" }> = {
  mode: "choice",
  prompt: "Hangisi bir sera gazıdır?",
  options: ["Azot", "Karbondioksit", "Argon"],
  correct: ["Karbondioksit"],
  multi: false,
  explanation: "CO₂ ısıyı tutar.",
};

function draft(reason: "miss" | "exam_point", sourceRef: string, prompt = choice.prompt): ReviewDraft {
  const item = { ...choice, prompt };
  return { sourceKind: "quiz", reason, sourceRef, topicLabel: "Atmosfer", item, promptKey: `${prompt.toLocaleLowerCase("tr")}|karbondioksit` };
}

function itemRow(overrides: Row = {}): Row {
  return {
    id: ITEM,
    user_id: USER,
    exam_prep_id: PREP,
    topic_label: "Atmosfer",
    source_kind: "quiz",
    reason: "miss",
    source_ref: "a:quiz:0",
    prompt_key: "k",
    item: choice,
    interval_step: 0,
    due_on: "2026-10-20",
    status: "active",
    ask_count: 0,
    correct_count: 0,
    lapse_count: 0,
    last_answered_on: null,
    last_result: null,
    first_missed_on: "2026-10-19",
    first_reasked_on: null,
    ...overrides,
  };
}

describe("kayıt", () => {
  it("boş tabloda yanlış yarına, sınav noktası 3 gün sonraya; yalnız yanlış sayılır", async () => {
    const db = fakeDb({});
    const result = await recordReviewItems(db.service, {
      userId: USER,
      prepId: PREP,
      nodeId: "n",
      attemptId: "a",
      topicId: null,
      examDate: null,
      drafts: [draft("miss", "a:quiz:0"), draft("exam_point", "a:lesson_check:1", "Büyüme hangi eğride izlenir?")],
      now: NOW,
    });
    expect(result.scheduled).toBe(1);
    const rows = db.tables.exam_prep_review_items!;
    expect(rows.map((row) => [row.reason, row.interval_step, row.due_on, row.first_missed_on])).toEqual([
      ["miss", 0, "2026-10-21", "2026-10-20"],
      ["exam_point", 1, "2026-10-23", null],
    ]);
  });

  it("aynı tamamlama ikinci kez hiçbir şey yazmaz; başka etkinlikte yeniden yanlış 1. güne döner", async () => {
    const db = fakeDb({
      exam_prep_review_items: [
        { ...itemRow({ prompt_key: draft("miss", "x").promptKey, interval_step: 2, due_on: "2026-10-25", lapse_count: 1, source_ref: "a:quiz:0" }) },
      ],
    });
    const input = { userId: USER, prepId: PREP, nodeId: "n", attemptId: "a", topicId: null, examDate: null, now: NOW };
    expect((await recordReviewItems(db.service, { ...input, drafts: [draft("miss", "a:quiz:0")] })).scheduled).toBe(0);
    expect(db.calls).toEqual([]);
    expect((await recordReviewItems(db.service, { ...input, drafts: [draft("miss", "b:quiz:3")] })).scheduled).toBe(1);
    const row = db.tables.exam_prep_review_items![0]!;
    expect(row).toMatchObject({ interval_step: 0, due_on: "2026-10-21", lapse_count: 2, source_ref: "b:quiz:3", status: "active" });
    // Sınav noktası kayıtlı satıra dokunmaz.
    const before = db.calls.length;
    await recordReviewItems(db.service, { ...input, drafts: [draft("exam_point", "c:lesson_check:0")] });
    expect(db.calls.length).toBe(before);
  });

  it("sınav bugünse yazılmaz", async () => {
    const db = fakeDb({});
    const result = await recordReviewItems(db.service, {
      userId: USER, prepId: PREP, nodeId: "n", attemptId: "a", topicId: null, examDate: "2026-10-20", drafts: [draft("miss", "a:quiz:0")], now: NOW,
    });
    expect(result.scheduled).toBe(0);
    expect(db.tables.exam_prep_review_items ?? []).toHaveLength(0);
  });
});

describe("sayaç ve oturum", () => {
  it("bugün ve öncesi sayılır; sınav geçtiyse 0; tablo yoksa 0 (kart görünmez)", async () => {
    const db = fakeDb({
      exam_prep_review_items: [itemRow(), itemRow({ id: "b", due_on: "2026-10-22" }), itemRow({ id: "c", status: "learned" })],
    });
    expect(await countDueReviewItems(db.service, { userId: USER, prepId: PREP, examDate: null, now: NOW })).toBe(1);
    expect(await countDueReviewItems(db.service, { userId: USER, prepId: PREP, examDate: "2026-10-19", now: NOW })).toBe(0);
    const broken = fakeDb({}, { failTable: "exam_prep_review_items" });
    expect(await countDueReviewItems(broken.service, { userId: USER, prepId: PREP, examDate: null, now: NOW })).toBe(0);
    expect(await loadDueReviewItems(broken.service, { userId: USER, prepId: PREP, examDate: null, now: NOW })).toEqual({ items: [], total: 0 });
  });

  it("oturum mühürlü öğe verir; bozuk satır sessizce düşer", async () => {
    const db = fakeDb({ exam_prep_review_items: [itemRow(), itemRow({ id: "bad", item: { mode: "choice" } })] });
    const session = await loadDueReviewItems(db.service, { userId: USER, prepId: PREP, examDate: null, now: NOW });
    expect(session.total).toBe(1);
    expect(session.items[0]).toMatchObject({ id: ITEM, mode: "choice", sourceLabel: "Test sorusu" });
    expect(JSON.stringify(session.items)).not.toMatch(/"correct"|explanation/);
  });
});

describe("cevap", () => {
  it("günü gelmemiş öğe not_due, yazmaz", async () => {
    const db = fakeDb({ exam_prep_review_items: [itemRow({ due_on: "2026-10-22" })] });
    const outcome = await answerReviewItem(db.service, { userId: USER, prepId: PREP, itemId: ITEM, answer: { pick: "Azot" }, examDate: null, now: NOW });
    expect(outcome).toEqual({ error: "not_due" });
    expect(db.calls).toEqual([]);
  });

  it("doğru: basamak çıkar, yeni tarih, ask_count bekçisi, ilk tekrar bir kez yazılır", async () => {
    const db = fakeDb({ exam_prep_review_items: [itemRow()] });
    const outcome = await answerReviewItem(db.service, { userId: USER, prepId: PREP, itemId: ITEM, answer: { pick: "Karbondioksit" }, examDate: null, now: NOW });
    expect(outcome).toMatchObject({ correct: true, step: 1, dueOn: "2026-10-23", status: "active", line: "Doğru · 3 gün sonra yeniden", correctAnswers: ["Karbondioksit"], remaining: 0 });
    const update = db.calls.find((call) => call.op === "update")!;
    expect(update.filters).toContainEqual(["ask_count", 0]);
    expect(update.values).toMatchObject({ interval_step: 1, due_on: "2026-10-23", ask_count: 1, correct_count: 1, first_reasked_on: "2026-10-20", first_reask_correct: true });

    // Aynı gün ikinci tıklama: kayıtlı sonuç, yeni yazım yok.
    const again = await answerReviewItem(db.service, { userId: USER, prepId: PREP, itemId: ITEM, answer: { pick: "Azot" }, examDate: null, now: NOW });
    expect(again).toMatchObject({ correct: true, step: 1, status: "active" });
    expect(db.calls.filter((call) => call.op === "update")).toHaveLength(1);
  });

  it("yanlış yarına; ilk tekrar zaten yazılmışsa ölçü değişmez; 14. günde doğru öğrenildi", async () => {
    const db = fakeDb({ exam_prep_review_items: [itemRow({ interval_step: 2, ask_count: 3, correct_count: 2, first_reasked_on: "2026-10-01", last_answered_on: "2026-10-13" })] });
    const wrong = await answerReviewItem(db.service, { userId: USER, prepId: PREP, itemId: ITEM, answer: { pick: "Azot" }, examDate: null, now: NOW });
    expect(wrong).toMatchObject({ correct: false, step: 0, dueOn: "2026-10-21", line: "Yanlış · yarın yeniden sorulacak" });
    expect(db.calls[0]!.values).not.toHaveProperty("first_reasked_on");

    const top = fakeDb({ exam_prep_review_items: [itemRow({ interval_step: 3, ask_count: 3, correct_count: 3 })] });
    const learned = await answerReviewItem(top.service, { userId: USER, prepId: PREP, itemId: ITEM, answer: { pick: "Karbondioksit" }, examDate: null, now: NOW });
    expect(learned).toMatchObject({ correct: true, status: "learned", dueOn: null, line: "Doğru · bu soru öğrenildi" });
  });
});

describe("cevap ucu", () => {
  beforeEach(() => {
    mocks.activity.mockReset();
    mocks.activity.mockResolvedValue({ currentStreak: 1 });
  });

  const post = (body: unknown) =>
    reviewPost(new Request("https://example.test/api/learning/exam-prep/review", { method: "POST", body: JSON.stringify(body) }));

  function withDb(items: Row[], prepOwner = USER) {
    const db = fakeDb({
      feature_flags: [{ key: "spaced_review", enabled: true }],
      exam_preps: [{ id: PREP, user_id: prepOwner, exam_date: null }],
      exam_prep_review_items: items,
    });
    mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: USER, service: db.service } });
    return db;
  }

  it("bozuk istek 400; başkasının hazırlığı 404; günü gelmemiş 409", async () => {
    withDb([itemRow()]);
    expect((await post({ prepId: PREP, itemId: "x" })).status).toBe(400);
    expect((await post({ prepId: PREP, itemId: ITEM })).status).toBe(400);
    withDb([itemRow()], "44444444-4444-4444-8444-444444444444");
    expect((await post({ prepId: PREP, itemId: ITEM, pick: "Azot" })).status).toBe(404);
    withDb([itemRow({ due_on: "2099-01-01" })]);
    expect((await post({ prepId: PREP, itemId: ITEM, pick: "Azot" })).status).toBe(409);
    expect(mocks.activity).not.toHaveBeenCalled();
  });

  it("200: doğru cevap ve satır döner, seri bir kez", async () => {
    withDb([itemRow({ due_on: "2000-01-01" })]);
    const response = await post({ prepId: PREP, itemId: ITEM, pick: "Azot" });
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, correct: false, correctAnswers: ["Karbondioksit"], line: "Yanlış · yarın yeniden sorulacak" });
    expect(mocks.activity).toHaveBeenCalledTimes(1);
  });

  it("anahtar kapalıysa 404", async () => {
    const db = fakeDb({ feature_flags: [{ key: "spaced_review", enabled: false }], exam_preps: [{ id: PREP, user_id: USER }], exam_prep_review_items: [itemRow()] });
    mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: USER, service: db.service } });
    expect((await post({ prepId: PREP, itemId: ITEM, pick: "Azot" })).status).toBe(404);
  });
});

describe("node rotası: tamamlamadan sonra", () => {
  const prepId = "00000000-0000-4000-8000-000000000001";
  const nodeId = "00000000-0000-4000-8000-000000000002";
  const attemptId = "00000000-0000-4000-8000-000000000003";

  function nodeService(options: { throwUpsert?: boolean } = {}) {
    const upserts: Row[][] = [];
    const rpc = vi.fn().mockResolvedValue({ data: { score: 0, total: 1, nextId: null }, error: null });
    const from = vi.fn((table: string) => {
      let key = "";
      const result =
        table === "exam_preps"
          ? { data: { id: "prep", title: "Test" } }
          : table === "exam_prep_nodes"
            ? { data: { id: "node", status: "ready", kind: "true_false" } }
            : table === "exam_prep_node_attempts"
              ? {
                  data: {
                    id: attemptId,
                    status: "active",
                    payload: { type: "true_false", items: [{ text: "Su 50 °C'de kaynar.", correct: false, explanation: "100 °C." }] },
                  },
                }
              : { data: null };
      const builder: Record<string, unknown> = {
        select: () => builder,
        eq: (col: string, value: unknown) => {
          if (col === "key") key = String(value);
          return builder;
        },
        in: () => builder,
        or: () => builder,
        order: () => builder,
        limit: () => builder,
        maybeSingle: async () => (table === "feature_flags" ? { data: key === "spaced_review" ? { enabled: true } : null } : result),
        upsert: async (rows: Row[]) => {
          if (options.throwUpsert) throw new Error("table missing");
          upserts.push(rows);
          return { error: null };
        },
        update: vi.fn(),
        then: (resolve: (value: unknown) => void) => resolve({ data: [], error: null }),
      };
      return builder;
    });
    return { service: { from, rpc }, upserts, rpc };
  }

  const complete = () =>
    nodePost(
      new Request("https://example.test", {
        method: "POST",
        body: JSON.stringify({ prepId, nodeId, attemptId, action: "complete", answers: { "0": true } }),
      }),
    );

  it("anahtar açıkken doğru/yanlış yanlışı yarına yazılır; sonuçta sayısı döner; tamamlama RPC'si değişmez", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-20T21:30:00Z")); // İstanbul'da 21 Ekim 00:30
    try {
      const { service, upserts, rpc } = nodeService();
      mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "user", service } });
      const response = await complete();
      expect(response.status).toBe(200);
      expect((await response.json()).reviewScheduled).toBe(1);
      expect(upserts).toHaveLength(1);
      expect(upserts[0]![0]).toMatchObject({
        source_ref: `${attemptId}:true_false:0`,
        due_on: "2026-10-22",
        interval_step: 0,
        reason: "miss",
        item: { options: ["Doğru", "Yanlış"], correct: ["Yanlış"], trueFalse: true },
      });
      expect(rpc.mock.calls.map(([name]) => name)).toEqual(["complete_exam_prep_node", "award_stars"]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("tablo yoksa da tamamlama 200 döner", async () => {
    const { service } = nodeService({ throwUpsert: true });
    mocks.guard.mockResolvedValue({ ok: true, ctx: { userId: "user", service } });
    const response = await complete();
    expect(response.status).toBe(200);
    expect((await response.json()).reviewScheduled).toBe(0);
  });
});

describe("taslak → kayıt uçtan uca", () => {
  it("kart 'Hayır' hatırlama öğesi olarak yarına yazılır", async () => {
    const db = fakeDb({});
    const drafts = reviewDraftsFromAttempt({
      attemptId: "a",
      kind: "spaced",
      payload: { type: "cards", cards: [{ front: "Mitoz kaç hücre verir?", back: "İki özdeş hücre." }] },
      answers: { 0: false },
      topicLabel: "Hücre",
    });
    const result = await recordReviewItems(db.service, { userId: USER, prepId: PREP, nodeId: "n", attemptId: "a", topicId: null, examDate: null, drafts, now: NOW });
    expect(result.scheduled).toBe(1);
    expect(db.tables.exam_prep_review_items![0]).toMatchObject({ source_kind: "card", due_on: "2026-10-21", item: { mode: "recall" } });
  });
});
