import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fakeSupabase, has, type FakeCall } from "./helpers/query-recorder";

/*
  Yazılı deneme yolu kapatıyordu (20 Ekim 2026): düğüm sayfası denemeyi kuruluma gönderiyor,
  notlandırma yalnız practice_exam_* tablolarına yazıyordu. Düğüm hiç bitmiyor; "Kartlarla son
  tekrar", "Son kontrol" ve "Hazırsın" sırayla hiç açılmıyor, hazırlık tahmini denemeyi görmüyordu.
*/

const mocks = vi.hoisted(() => ({ flag: vi.fn(), tracking: vi.fn() }));
vi.mock("@/lib/admin/feature-flags", () => ({
  PDF_LEARNING_V2_FLAG: "pdf_learning_v2",
  isFeatureEnabled: mocks.flag,
}));
vi.mock("@/lib/learning/learning-tracking-persist", () => ({
  recordLearningTrackingAfterComplete: mocks.tracking,
}));

import { writeBackMockToPrep, writtenExamStars } from "@/lib/learning/mock-exam/prep-writeback";
import { mockReviewHref } from "@/lib/learning/mock-exam/prep-node-link";
import { extractAnswerEvidence } from "@/lib/learning/learning-tracking";
import type { MockGradeItem } from "@/lib/learning/mock-exam";

const item = (topicLabel: string, verdict: MockGradeItem["verdict"]): MockGradeItem => ({
  questionId: `q-${topicLabel}-${verdict}`,
  userAnswer: "x",
  isCorrect: verdict === "dogru",
  pointsEarned: verdict === "dogru" ? 1 : 0,
  pointsMax: 1,
  verdict,
  explanation: "",
  feedback: null,
  topicId: null,
  topicLabel,
});

function handler(options: { node?: { id: string; status: string } | null; duplicate?: "active" | "completed" } = {}) {
  return (call: FakeCall) => {
    if (call.table === "exam_preps") return { data: { id: "p1", target_score: 75 } };
    if (call.table === "exam_prep_nodes" && call.op === "select") {
      return { data: options.node === undefined ? { id: "n-mock", status: "locked" } : options.node };
    }
    if (call.table === "exam_prep_node_attempts" && call.op === "insert") {
      return options.duplicate ? { error: { code: "23505", message: "duplicate" } } : { data: { id: "att-1", status: "active" } };
    }
    if (call.table === "exam_prep_node_attempts" && call.op === "select") {
      return { data: { id: "att-old", status: options.duplicate } };
    }
    return {};
  };
}

const input = {
  userId: "u1",
  prepId: "p1",
  scope: "all",
  practiceExamId: "e1",
  practiceAttemptId: "pa1",
  scorePct: 72.4,
  items: [item("Basınç", "dogru"), item("Sıcaklık", "kismen")],
};

describe("writeBackMockToPrep", () => {
  beforeEach(() => {
    mocks.flag.mockReset().mockResolvedValue(true);
    mocks.tracking.mockReset().mockResolvedValue({ nextNodeId: null, tracking: null, topicGain: null });
  });

  it("tam deneme: kilitli düğüm açılır, kayıt yazılır, düğüm tamamlanır, kanıt işlenir", async () => {
    const fake = fakeSupabase(handler());
    const result = await writeBackMockToPrep(fake.service as never, input);
    // P1-7: yazılı deneme yıldızı da yazılır (sahte istemcide ödül 0 döner).
    expect(result).toMatchObject({ nodeId: "n-mock" });
    const unlock = fake.calls.find((call) => call.table === "exam_prep_nodes" && call.op === "update")!;
    expect(unlock.payload).toEqual({ status: "ready" });
    expect(has(unlock, "eq", "status", "locked")).toBe(true);
    const insert = fake.calls.find((call) => call.table === "exam_prep_node_attempts" && call.op === "insert")!;
    expect(insert.payload).toMatchObject({
      node_id: "n-mock",
      exam_prep_id: "p1",
      total: 100,
      status: "active",
      // Anahtar denemenin kimliği (22 Ekim 2026): aynı deneme ikinci kez notlansa da düğüm bir kez biter.
      client_request_id: "mock:e1",
      practice_exam_id: "e1",
      payload: {
        type: "mock_exam",
        practiceExamId: "e1",
        practiceAttemptId: "pa1",
        items: [
          { topic: "Basınç", verdict: "dogru", correct: true },
          { topic: "Sıcaklık", verdict: "kismen", correct: false },
        ],
      },
    });
    expect(fake.rpcCalls).toEqual([
      {
        name: "complete_exam_prep_node",
        args: { p_user_id: "u1", p_prep_id: "p1", p_node_id: "n-mock", p_attempt_id: "att-1", p_score: 72, p_total: 100, p_answers: {} },
      },
      {
        name: "award_stars",
        args: { p_user: "u1", p_source: "prep", p_ref: "attempt:att-1", p_amount: writtenExamStars(input.items) },
      },
    ]);
    expect(mocks.tracking).toHaveBeenCalledWith(
      fake.service,
      expect.objectContaining({ kind: "written_exam", nodeId: "n-mock", attemptId: "att-1", targetScore: 75, topicLabel: null }),
    );
    // Kayıttaki içerik kanıta dönüşür: her soru kendi konusuna.
    const payload = (insert.payload as { payload: unknown }).payload;
    const evidence = extractAnswerEvidence({ kind: "written_exam", payload, answers: {}, topicLabel: null, isFirstAttempt: true });
    expect(evidence.map((row) => [row.topicKey, row.correct])).toEqual([
      ["basınç", true],
      ["sıcaklık", false],
    ]);
  });

  it("konu seçili deneme, hazırlıksız deneme ve kapalı bayrak yola yazmaz", async () => {
    for (const variant of [{ scope: "topics" }, { prepId: null }]) {
      const fake = fakeSupabase(handler());
      expect(await writeBackMockToPrep(fake.service as never, { ...input, ...variant })).toBeNull();
      expect(fake.calls).toHaveLength(0);
    }
    mocks.flag.mockResolvedValue(false);
    const off = fakeSupabase(handler());
    expect(await writeBackMockToPrep(off.service as never, input)).toBeNull();
    expect(off.rpcCalls).toHaveLength(0);
  });

  it("yolunda deneme düğümü olmayan hazırlık (Araçlar'ın geçici denemesi) hiçbir şey yazmaz", async () => {
    const fake = fakeSupabase(handler({ node: null }));
    expect(await writeBackMockToPrep(fake.service as never, input)).toBeNull();
    expect(fake.calls.some((call) => call.op === "insert")).toBe(false);
    expect(fake.rpcCalls).toHaveLength(0);
  });

  it("aynı notlandırma ikinci kez gelirse düğüm yeniden tamamlanmaz", async () => {
    const fake = fakeSupabase(handler({ duplicate: "completed" }));
    expect(await writeBackMockToPrep(fake.service as never, input)).toEqual({ nodeId: "n-mock" });
    expect(fake.rpcCalls).toHaveLength(0);
    expect(mocks.tracking).not.toHaveBeenCalled();
  });

  it("notlandırma yola, takvim yeniden kurulmadan önce yazar", () => {
    const grade = readFileSync("src/lib/learning/mock-exam/grade-exam.ts", "utf8");
    expect(grade).toContain('.select("id, title, user_id, started_at, deadline_at, blueprint, exam_prep_id, scope")');
    expect(grade.indexOf("await writeBackMockToPrep(service, {")).toBeGreaterThan(0);
    expect(grade.indexOf("await writeBackMockToPrep(service, {")).toBeLessThan(grade.indexOf("await maybeRescheduleMissedDays(service"));
  });
});

describe("bitmiş deneme düğümünün sonucu", () => {
  it("soru incelemesini açar; başka kayıtlar kendi sonuç kartında kalır", () => {
    expect(mockReviewHref("p1", "written_exam", { type: "mock_exam", practiceExamId: "e1" })).toBe(
      "/deneme-sinavlari/p1/deneme/e1/incele",
    );
    expect(mockReviewHref("p1", "written_exam", { type: "quiz" })).toBeNull();
    expect(mockReviewHref("p1", "quiz", { type: "mock_exam", practiceExamId: "e1" })).toBeNull();
    expect(mockReviewHref("p1", "written_exam", null)).toBeNull();
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/sonuc/page.tsx", "utf8");
    expect(page).toContain("mockReviewHref(prepId, node.kind as string, attempt.payload)");
  });
});

describe("22 Ekim 2026 inceleme: aynı deneme ikinci kez notlanmaz", () => {
  it("notlanmış kayıt varken yeni kayıt açılmaz, yola ve kanıta yeniden yazılmaz", () => {
    const grade = readFileSync("src/lib/learning/mock-exam/grade-exam.ts", "utf8");
    const guard = grade.indexOf('.not("completed_at", "is", null)');
    expect(guard).toBeGreaterThan(0);
    expect(guard).toBeLessThan(grade.search(/\.from\("practice_exam_attempts"\)\s*\.insert\(/));
    expect(grade.indexOf("if (graded?.id) {")).toBeLessThan(grade.indexOf("await writeBackMockToPrep(service, {"));
  });
});
