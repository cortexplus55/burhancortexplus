import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { fakeSupabase, has, type FakeCall } from "./helpers/query-recorder";
import { recordLearningTrackingAfterComplete } from "@/lib/learning/learning-tracking-persist";
import { countOpenMisconceptions, withOpenMisconceptions } from "@/lib/learning/misconception-store";
import { recordChatMisconception } from "@/lib/learning/prep-chat-grounding";
import { GAPS_NOTHING_OPEN_COPY, gapsNothingOpenPayload, isPathTurn } from "@/lib/learning/exam-local-session";

/*
  Yanılgı çözümü (20 Ekim 2026): çözülen yanılgı sayımdan, listelerden, tekrar kartlarından düşer;
  `resolved_at` sütunu yoksa (göç uygulanmadan yayın) hiçbir okuma "0 açık yanılgı" sanmaz.
*/

const missingColumn = { code: "42703", message: "column exam_prep_misconceptions.resolved_at does not exist" };
const read = (path: string) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

const quizPayload = {
  type: "quiz",
  questions: [{ text: "Sınırlayıcı bileşen nedir?", options: ["A", "B"], correct: ["A"], multi: false }],
};

function trackingHandler(options: { columnMissing?: boolean; openRows?: unknown[]; evidenceRows?: unknown[]; allCount?: number }) {
  return (call: FakeCall) => {
    const onlyOpen = has(call, "is", "resolved_at", null);
    if (call.table === "exam_prep_node_attempts" && call.op === "select") return { count: 1 };
    if (call.table === "exam_prep_topics") return { data: [{ label: "Stokiyometri" }, { label: "Gazlar" }] };
    if (call.table === "exam_prep_misconceptions" && call.op === "select") {
      if (options.columnMissing && onlyOpen) return { error: missingColumn };
      const head = (call.options as { head?: boolean } | undefined)?.head;
      if (head) return { count: onlyOpen ? 0 : (options.allCount ?? 0) };
      return { data: options.openRows ?? [] };
    }
    if (call.table === "exam_prep_answer_evidence" && call.op === "select") return { data: options.evidenceRows ?? [] };
    if (call.table === "exam_prep_nodes") return { data: [] };
    if (call.table === "exam_prep_topic_mastery" && call.op === "select") return { data: [] };
    return {};
  };
}

const completeInput = {
  userId: "u1",
  prepId: "p1",
  nodeId: "n1",
  attemptId: "a3",
  kind: "quiz" as const,
  payload: quizPayload,
  answers: { "0": "A" },
  topicLabel: "Stokiyometri",
  sessionObjective: null,
  targetScore: 70,
};

describe("tamamlamadan sonra yanılgı çözümü", () => {
  it("iki ayrı günde doğru cevaplanan konunun yanılgısına resolved_at yazılır, açık sayısı düşer", async () => {
    const fake = fakeSupabase(
      trackingHandler({
        openRows: [{ id: "m1", topic_label: "Stokiyometri", attempt_id: "a0", created_at: "2026-10-10T09:00:00.000Z" }],
        evidenceRows: [
          { topic_key: "stokiyometri", attempt_id: "a1", created_at: "2026-10-11T09:00:00.000Z" },
          { topic_key: "stokiyometri", attempt_id: "a3", created_at: "2026-10-13T09:00:00.000Z" },
        ],
        allCount: 1,
      }),
    );
    await recordLearningTrackingAfterComplete(fake.service as never, completeInput);
    const resolved = fake.calls.find((call) => call.table === "exam_prep_misconceptions" && call.op === "update");
    expect(resolved).toBeTruthy();
    expect(resolved!.payload).toMatchObject({ resolved_at: expect.any(String) });
    expect(has(resolved!, "in", "id", ["m1"])).toBe(true);
    expect(has(resolved!, "is", "resolved_at", null)).toBe(true);
    // Kanıt yalnız doğru ve yardımsız cevaplardan okunur.
    const evidenceRead = fake.calls.find((call) => call.table === "exam_prep_answer_evidence" && call.op === "select")!;
    expect(has(evidenceRead, "eq", "correct", true)).toBe(true);
    expect(has(evidenceRead, "eq", "hint_assisted", false)).toBe(true);
    const prep = fake.calls.find((call) => call.table === "exam_preps" && call.op === "update")!;
    expect((prep.payload as { learning_tracking: { openMisconceptions: number } }).learning_tracking.openMisconceptions).toBe(0);
  });

  it("sütun yoksa hiçbir şey çözülmez ve bütün satırlar açık sayılır", async () => {
    const fake = fakeSupabase(trackingHandler({ columnMissing: true, allCount: 3 }));
    await recordLearningTrackingAfterComplete(fake.service as never, completeInput);
    expect(fake.calls.some((call) => call.table === "exam_prep_misconceptions" && call.op === "update")).toBe(false);
    const prep = fake.calls.find((call) => call.table === "exam_preps" && call.op === "update")!;
    expect((prep.payload as { learning_tracking: { openMisconceptions: number } }).learning_tracking.openMisconceptions).toBe(3);
  });

  it("yanlış cevaplı bitiş çözüm aramaz", async () => {
    const fake = fakeSupabase(trackingHandler({ allCount: 1 }));
    await recordLearningTrackingAfterComplete(fake.service as never, { ...completeInput, answers: { "0": "B" } });
    expect(fake.calls.some((call) => call.table === "exam_prep_answer_evidence" && call.op === "select")).toBe(false);
  });
});

describe("açık yanılgı okumaları", () => {
  it("süzgeç düşerse süzgeçsiz sorgu: sayım asla yanlışlıkla 0 olmaz", async () => {
    const fake = fakeSupabase((call) =>
      has(call, "is", "resolved_at", null) ? { error: missingColumn } : { count: 4 },
    );
    expect(await countOpenMisconceptions(fake.service as never, { prepId: "p1" })).toBe(4);
    const ok = fakeSupabase((call) => (has(call, "is", "resolved_at", null) ? { count: 1 } : { count: 4 }));
    expect(await countOpenMisconceptions(ok.service as never, { prepId: "p1", userId: "u1" })).toBe(1);
    expect(has(ok.calls[0], "eq", "user_id", "u1")).toBe(true);
  });

  it("süzgeç kurulamazsa (eski sahte istemci) da eski sorgu", async () => {
    const result = await withOpenMisconceptions(async (onlyOpen) => {
      if (onlyOpen) throw new Error("is is not a function");
      return { data: [1, 2], error: null };
    });
    expect(result.data).toEqual([1, 2]);
  });

  it("sohbet: çözülmüş aynı iddia yeniden yazımı engellemez", async () => {
    const fake = fakeSupabase((call) => {
      if (call.table === "exam_prep_misconceptions" && call.op === "select") {
        // Açık satır yok; çözülmüş satır süzgeçsiz sorguda görünürdü.
        return { data: has(call, "is", "resolved_at", null) ? [] : [{ id: "old" }] };
      }
      return {};
    });
    await recordChatMisconception(fake.service as never, {
      userId: "u1",
      prepId: "p1",
      question: "Sınırlayıcı bileşen hangisi?",
      grade: {
        verdict: "yanlis",
        verdictLine: "Yanlış",
        rightParts: [],
        wrongParts: ["Fazla olan sınırlayıcıdır"],
        conclusion: "Az olan sınırlayıcıdır",
        wrongType: "chat_claim",
        topicLabel: "Stokiyometri",
      },
    });
    expect(fake.calls.some((call) => call.table === "exam_prep_misconceptions" && call.op === "insert")).toBe(true);
  });

  it("çözülen yanılgı listelerden, tekrar kartlarından ve tekrar yazım denetiminden düşer", () => {
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    const cards = route.slice(route.indexOf("async function loadLessonReviewCards"), route.indexOf("async function unseenLessonReviews"));
    expect(cards).toContain('query.is("resolved_at", null)');
    const unseen = route.slice(route.indexOf("async function unseenLessonReviews"), route.indexOf("function withLessonReviewCards"));
    expect(unseen).toContain('query.is("resolved_at", null)');
    for (const file of [
      "src/app/deneme-sinavlari/[prepId]/tekrarlar/page.tsx",
      "src/lib/learning/exam-chat-context.ts",
      "src/lib/learning/exam-local-session.ts",
      "src/app/deneme-sinavlari/[prepId]/page.tsx",
    ]) {
      expect(read(file)).toContain('query.is("resolved_at", null)');
    }
    for (const file of ["src/app/deneme-sinavlari/[prepId]/page.tsx", "src/app/deneme-sinavlari/[prepId]/degerlendirme/page.tsx"]) {
      expect(read(file)).toContain("countOpenMisconceptions(supabase, { prepId })");
    }
  });
});

describe("Bilgi boşlukları yolu durdurmaz", () => {
  it("sırası gelen adım: önünde bitmemiş adım yoksa sırası", async () => {
    const free = fakeSupabase(() => ({ count: 0 }));
    expect(await isPathTurn(free.service as never, "p1", { status: "ready", sort_order: 12 })).toBe(true);
    expect(has(free.calls[0], "neq", "status", "done")).toBe(true);
    expect(has(free.calls[0], "lt", "sort_order", 12)).toBe(true);
    const ahead = fakeSupabase(() => ({ count: 2 }));
    expect(await isPathTurn(ahead.service as never, "p1", { status: "ready", sort_order: 12 })).toBe(false);
    expect(await isPathTurn(free.service as never, "p1", { status: "done", sort_order: 12 })).toBe(false);
    const broken = fakeSupabase(() => ({ error: { message: "x" } }));
    expect(await isPathTurn(broken.service as never, "p1", { status: "ready", sort_order: 12 })).toBe(true);
  });

  it("kilit yerine tamamlanabilir boş adım; kilit dalı hâlâ kayıt eklemeden önce", () => {
    const plan = gapsNothingOpenPayload();
    expect(plan.action === "serve" && plan.payload).toMatchObject({
      type: "practice_empty",
      practice: "gaps",
      reason: "no_weak_topics",
      message: GAPS_NOTHING_OPEN_COPY,
    });
    expect(plan.action === "serve" && plan.payload.locked).toBeUndefined();
    const route = read("src/app/api/learning/exam-prep/node/route.ts");
    const turn = route.indexOf('kind === "gaps" && (await isPathTurn(service, prepId, node))');
    expect(turn).toBeGreaterThan(0);
    expect(turn).toBeLessThan(route.indexOf("if (local.action === \"serve\" && local.payload.locked === true) {\n"));
  });
});
