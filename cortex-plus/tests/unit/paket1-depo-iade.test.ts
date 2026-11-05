import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { makeRecordingDb } from "./helpers/recording-db";

/*
  Güvenlik paketi 1 (6 Kasım 2026): kaydedilemeyen içerik ücretlendirilmez. Motor krediyi düğümün anahtarıyla
  ayırıp kesinleştirir; ardından kayıt yarışı kaybedilirse (409 stale_generation) ya da kayıt yazılamazsa
  (500 generation_failed) öğrenci içeriği görmez — bedel geri dönmeli. Model çağrısı yok: motor sahte.
*/

const h = vi.hoisted(() => ({
  engine: null as null | ((input: Record<string, unknown>) => Promise<Record<string, unknown>>),
}));

vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => undefined,
}));
vi.mock("@/lib/learning/node/generate", () => ({
  generateNodePayload: async (input: Record<string, unknown>) => h.engine!(input),
}));

const USER = "00000000-0000-4000-8000-00000000aaaa";
const NODE = "00000000-0000-4000-8000-0000000000b1";
const PREP = "00000000-0000-4000-8000-0000000000a1";

function db(tables: Record<string, Record<string, unknown>[]>) {
  const timeline: string[] = [];
  const rpcs: { name: string; args: Record<string, unknown> }[] = [];
  let giftError: unknown = null;
  const made = makeRecordingDb(tables, {
    timeline,
    rpc: (name, args) => {
      rpcs.push({ name, args });
      if (name === "credit_gift") return giftError ? { error: giftError } : { data: true };
      return undefined;
    },
  });
  return { ...made, rpcs, failGift: (e: unknown) => (giftError = e) };
}

let info: ReturnType<typeof vi.spyOn>;
let errors: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  info = vi.spyOn(console, "info").mockImplementation(() => undefined);
  errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
});
afterEach(() => {
  info.mockRestore();
  errors.mockRestore();
  h.engine = null;
});

describe("refundUnsavedGeneration", () => {
  it("bekleyen ayırma credit_refund ile iade edilir", async () => {
    const { refundUnsavedGeneration } = await import("@/lib/learning/node/generation");
    const s = db({ credit_reservations: [{ id: "r1", user_id: USER, idempotency_key: "k", status: "pending", amount: 30 }] });
    expect(await refundUnsavedGeneration(s.client, { userId: USER, key: "k", reason: "t" })).toBe(true);
    expect(s.rpcs).toEqual([{ name: "credit_refund", args: { p_reservation_id: "r1" } }]);
  });

  it("kesinleşmiş ayırma bir kez sahiplenilir ve ödenen tutar ayrı anahtarla geri döner", async () => {
    const { refundUnsavedGeneration } = await import("@/lib/learning/node/generation");
    const s = db({ credit_reservations: [{ id: "r1", user_id: USER, idempotency_key: "k", status: "committed", amount: 30, free_spent: 0, action_code: "LESSON_GENERATE" }] });
    expect(await refundUnsavedGeneration(s.client, { userId: USER, key: "k", reason: "t" })).toBe(true);
    expect(s.tables.credit_reservations[0].status).toBe("refunded");
    expect(s.rpcs).toHaveLength(1);
    expect(s.rpcs[0]).toMatchObject({ name: "credit_gift", args: { p_user_id: USER, p_amount: 30, p_key: "unsaved_refund:r1" } });
    // İkinci çağrı iki kez iade etmez.
    expect(await refundUnsavedGeneration(s.client, { userId: USER, key: "k", reason: "t" })).toBe(false);
    expect(s.rpcs).toHaveLength(1);
  });

  it("dönemi bitmiş hak payı geri verilmez, sürüyorsa verilir", async () => {
    const { refundUnsavedGeneration } = await import("@/lib/learning/node/generation");
    const future = new Date(Date.now() + 86_400_000).toISOString();
    const past = new Date(Date.now() - 86_400_000).toISOString();
    const live = db({
      credit_reservations: [{ id: "r1", user_id: USER, idempotency_key: "k", status: "committed", amount: 30, free_spent: 10, allowance_period_end: future }],
      credit_wallets: [{ user_id: USER, period_ends_at: future }],
    });
    await refundUnsavedGeneration(live.client, { userId: USER, key: "k", reason: "t" });
    expect(live.rpcs[0].args.p_amount).toBe(30);
    const expired = db({
      credit_reservations: [{ id: "r1", user_id: USER, idempotency_key: "k", status: "committed", amount: 30, free_spent: 10, allowance_period_end: past }],
      credit_wallets: [{ user_id: USER, period_ends_at: future }],
    });
    await refundUnsavedGeneration(expired.client, { userId: USER, key: "k", reason: "t" });
    expect(expired.rpcs[0].args.p_amount).toBe(20);
  });

  it("sayaçlı ücretsiz işte sayaç bir geri alınır", async () => {
    const { refundUnsavedGeneration } = await import("@/lib/learning/node/generation");
    const s = db({
      credit_reservations: [{ id: "r1", user_id: USER, idempotency_key: "k", status: "committed", amount: 0, free_meter: "lesson", free_period: "2026-W45" }],
      free_usage: [{ user_id: USER, meter: "lesson", period_key: "2026-W45", used: 2 }],
    });
    expect(await refundUnsavedGeneration(s.client, { userId: USER, key: "k", reason: "t" })).toBe(true);
    expect(s.tables.free_usage[0].used).toBe(1);
    expect(s.rpcs).toEqual([]);
  });

  it("hediye düşerse ayırma geri çevrilir (sonraki deneme yine iade edebilir)", async () => {
    const { refundUnsavedGeneration } = await import("@/lib/learning/node/generation");
    const s = db({ credit_reservations: [{ id: "r1", user_id: USER, idempotency_key: "k", status: "committed", amount: 30 }] });
    s.failGift({ message: "boom" });
    expect(await refundUnsavedGeneration(s.client, { userId: USER, key: "k", reason: "t" })).toBe(false);
    expect(s.tables.credit_reservations[0].status).toBe("committed");
  });

  it("anahtar ya da ayırma yoksa hiçbir şey yapmaz", async () => {
    const { refundUnsavedGeneration } = await import("@/lib/learning/node/generation");
    const s = db({ credit_reservations: [] });
    expect(await refundUnsavedGeneration(s.client, { userId: USER, key: undefined, reason: "t" })).toBe(false);
    expect(await refundUnsavedGeneration(s.client, { userId: USER, key: "k", reason: "t" })).toBe(false);
    expect(s.rpcs).toEqual([]);
  });
});

function startArgs(service: unknown, input: { teachingV2: boolean; creditKey?: string; creatingAttemptId?: string }) {
  const context = {
    userId: USER,
    service,
    options: { origin: "https://x" },
    requestStarted: 1_793_350_800_000,
    parsed: { data: {} },
    prepId: PREP,
    nodeId: NODE,
    lessonFormat: 3,
    prefetch: false,
    teachingV2: input.teachingV2,
    prep: { title: "Biyoloji", exam_type: "yks", hard_topics_self: [], learning_preferences: null },
    node: { id: NODE, kind: "flashcards", title: "Kartlar", status: "ready", session_meta: {} },
    kind: "flashcards",
    oralCount: 0,
    oralMultiTopic: false,
    difficulty: "orta",
    voiceMode: "text",
    familiarity: "new",
    mood: "neutral",
    lessonReviewCards: [],
  };
  const state = {
    sessionMeta: null, topic: null, topicLabel: "Hücre", topicWiden: false, title: "Kartlar", warm: false,
    refreshTopicQuiz: () => undefined, voiceSession: false, premium: false, freeMeter: undefined, practiceTopics: null,
    finalFill: null, retargetedTopic: null, quizLesson: null, variant: null, peekBuildingMs: null,
  };
  const sourced = {
    prepSource: { document_id: null }, prepDocs: [], teachingPlan: { brief: "", examPoints: [], priority: null, checklist: [] },
    sourceMode: "topic_only", source: { block: "", matches: [], formulas: [], documentName: "" }, sourceTrace: null,
    lessonCoreDocumentId: null, lessonCorePages: [], lessonTopicOnly: true, oralAllPlan: null, podcastSyllabus: "", alternativeOf: null,
  };
  const reserved = {
    clientRequestId: input.teachingV2 ? "req" : undefined,
    generationId: input.teachingV2 ? "gen" : undefined,
    creatingAttemptId: input.creatingAttemptId,
    creditKey: input.creditKey,
  };
  return [context, state, sourced, reserved] as never[];
}

const CARDS = { type: "flashcards", cards: [{ front: "Mitoz", back: "Sayı korunur" }] };

describe("kayıt düşünce iade (runStartGeneration)", () => {
  it("devralan üretim aynı anahtarı kullanır: yarışı kaybeden (409) onun bedelini iade etmez", async () => {
    const { runStartGeneration } = await import("@/lib/learning/node/generation");
    // Kayıt aynı istek kimliğiyle gelen yeni üretime geçmiş; kredi anahtarı ortak, ücret kazananın.
    const s = db({
      exam_prep_node_attempts: [{ id: "att1", status: "creating", generation_id: "newer" }],
      exam_prep_nodes: [{ id: NODE, session_meta: {} }],
      credit_reservations: [],
    });
    h.engine = async (input) => {
      s.tables.credit_reservations.push({ id: "r1", user_id: USER, idempotency_key: input.idempotencyKey, status: "committed", amount: 4 });
      return CARDS;
    };
    const res = await (runStartGeneration as (...a: never[]) => Promise<Response>)(...startArgs(s.client, { teachingV2: true, creditKey: "exam_node_slot_k", creatingAttemptId: "att1" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ refunded: false });
    expect(s.rpcs).toEqual([]);
    expect(s.tables.credit_reservations[0].status).toBe("committed");
  });

  it("kayıt düşmüşse (409 stale_generation, satır failed) kesinleşen bedel geri döner", async () => {
    const { runStartGeneration } = await import("@/lib/learning/node/generation");
    // Satır takılı yazım temizliğiyle düşmüş: içerik hiçbir üretimle teslim edilmeyecek.
    const s = db({
      exam_prep_node_attempts: [{ id: "att1", status: "failed", generation_id: "newer" }],
      exam_prep_nodes: [{ id: NODE, session_meta: {} }],
      credit_reservations: [],
    });
    h.engine = async (input) => {
      // Motor krediyi düğümün anahtarıyla ayırıp kesinleştirir.
      s.tables.credit_reservations.push({ id: "r1", user_id: USER, idempotency_key: input.idempotencyKey, status: "committed", amount: 4 });
      return CARDS;
    };
    const res = await (runStartGeneration as (...a: never[]) => Promise<Response>)(...startArgs(s.client, { teachingV2: true, creditKey: "exam_node_slot_k", creatingAttemptId: "att1" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toMatchObject({ refunded: true });
    expect(s.rpcs).toEqual([
      expect.objectContaining({ name: "credit_gift", args: expect.objectContaining({ p_amount: 4, p_key: "unsaved_refund:r1" }) }),
    ]);
    expect(s.tables.credit_reservations[0].status).toBe("refunded");
  });

  it("kayıt yazılamayınca (500 generation_failed) bedel geri döner; v1 yolu da bilinen anahtarla ücretlenir", async () => {
    const { runStartGeneration } = await import("@/lib/learning/node/generation");
    const s = db({ exam_prep_nodes: [{ id: NODE, session_meta: {} }], credit_reservations: [] });
    const realFrom = s.client.from;
    s.client.from = (name: string) => {
      const builder = realFrom(name);
      if (name === "exam_prep_node_attempts") {
        builder.insert = () => ({ select: () => ({ single: async () => ({ data: null, error: { message: "insert failed" } }) }) });
      }
      return builder;
    };
    let engineKey: unknown;
    h.engine = async (input) => {
      engineKey = input.idempotencyKey;
      s.tables.credit_reservations.push({ id: "r2", user_id: USER, idempotency_key: input.idempotencyKey, status: "pending", amount: 4 });
      return CARDS;
    };
    const res = await (runStartGeneration as (...a: never[]) => Promise<Response>)(...startArgs(s.client, { teachingV2: false }));
    expect(res.status).toBe(500);
    expect(await res.json()).toMatchObject({ refunded: true });
    expect(engineKey).toBe(`exam_node_v1_${USER}_${NODE}_1793350800000`);
    expect(s.rpcs).toEqual([{ name: "credit_refund", args: { p_reservation_id: "r2" } }]);
  });
});
