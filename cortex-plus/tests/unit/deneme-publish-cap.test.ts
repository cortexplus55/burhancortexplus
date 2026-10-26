import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { semanticDuplicate } from "@/lib/learning/deliverable";
import {
  replayMismatchedPublish,
  replayPublishCap,
  replayStaleCheckpoint,
  replayWaveCap,
} from "@/lib/learning/deneme-budget-proof";
import { countAccepted, EXAM_BUILD_VERSION, pointTotal } from "@/lib/learning/exam-assembly";
import { examFactOverlap, nearDuplicate } from "@/lib/learning/item-dedup";
import { claimGenerationJob, generationJobsReady, insertGenerationJob } from "@/lib/learning/generation-jobs";
import { hasInFlightMockBuild, recoverStaleMockBuilds } from "@/lib/learning/mock-exam/fallback-exam";
import { startDurableMockExam } from "@/lib/learning/mock-exam-durable";
import { allocateQuestions, slotFromTopicRow } from "@/lib/learning/mock-exam/allocate";
import { defaultSlots } from "@/lib/learning/mock-exam/blueprint";
import type { MockExamQuestionDraft } from "@/lib/learning/mock-exam/types";
import { distinctMcq, mismatchedBag, promisedPaper } from "@/lib/learning/deneme-budget-proof";

const root = fileURLToPath(new URL("../..", import.meta.url));

function source(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

type ExamRow = {
  id: string;
  user_id: string;
  exam_prep_id: string;
  blueprint: { cpBuild: Record<string, unknown> };
  created_at: string;
};

function chain(result: Record<string, unknown>) {
  const builder: Record<string, unknown> = {};
  const self = () => builder;
  for (const name of ["select", "eq", "gte", "order", "limit", "is", "in", "update", "insert", "delete"]) {
    builder[name] = self;
  }
  builder.maybeSingle = async () => result;
  builder.single = async () => result;
  builder.then = (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return builder;
}

function examClient(rows: ExamRow[]) {
  const questions: unknown[][] = [];
  const client = {
    from(table: string) {
      const filters: Record<string, unknown> = {};
      let patch: Record<string, unknown> | null = null;
      let inserted: unknown = null;
      const builder = chain({});
      const run = () => {
        if (table === "practice_exam_questions") {
          if (inserted) {
            const list = Array.isArray(inserted) ? inserted : [inserted];
            questions.push(list);
            return { data: list, error: null, count: list.length };
          }
          return { data: null, error: null, count: 0 };
        }
        const matched = rows.filter((row) => {
          if (filters.user_id && row.user_id !== filters.user_id) return false;
          if (filters.exam_prep_id && row.exam_prep_id !== filters.exam_prep_id) return false;
          if (filters.id && row.id !== filters.id) return false;
          return true;
        });
        if (patch) {
          const row = matched[0];
          if (row && patch.blueprint) row.blueprint = patch.blueprint as ExamRow["blueprint"];
          return { data: row ? [{ id: row.id }] : [], error: null };
        }
        return { data: matched, error: null };
      };
      builder.select = () => builder;
      builder.eq = (column: string, value: unknown) => {
        filters[column] = value;
        return builder;
      };
      builder.gte = () => builder;
      builder.order = () => builder;
      builder.limit = () => builder;
      builder.update = (next: Record<string, unknown>) => {
        patch = next;
        return builder;
      };
      builder.insert = (next: unknown) => {
        inserted = next;
        return builder;
      };
      builder.delete = () => builder;
      builder.maybeSingle = async () => {
        const payload = run();
        const list = Array.isArray(payload.data) ? payload.data : [];
        return { data: list[0] ?? null, error: payload.error ?? null };
      };
      builder.single = builder.maybeSingle;
      builder.then = (resolve: (value: unknown) => unknown, reject?: (error: unknown) => unknown) =>
        Promise.resolve(run()).then(resolve, reject);
      return builder;
    },
    questions,
    rows,
  };
  return client;
}

function stuckBlueprint(input: { items: MockExamQuestionDraft[]; wave: number; leaseUntil: number; startedAt: number }) {
  const labels = ["Alfa", "Beta", "Gama", "Delta", "Epsilon", "Zeta", "Kappa", "Teta", "Iota"];
  const topics = labels.map((label, index) => slotFromTopicRow({ id: `k${index + 1}`, label, passageChars: 400 }));
  const allocation = allocateQuestions(topics, 20);
  return {
    cpBuild: {
      v: 1,
      prepKey: "user:prep:spec",
      specKey: "spec",
      items: input.items,
      topicsAttempted: [],
      topicTotal: allocation.length,
      promised: 20,
      reservationId: null,
      startedAt: input.startedAt,
      leaseUntil: input.leaseUntil,
      leaseToken: input.leaseUntil > 0 ? "live" : "",
      refunded: false,
      failed: false,
      building: true,
      examId: null,
      publishedAt: null,
      modelIndexes: {},
      wave: input.wave,
      forced: false,
      failError: null,
      attempts: 0,
      prepTitle: "Hazirlik",
      documentId: null,
      topics: [],
      plan: {
        preset: "standard",
        questionCount: 20,
        durationMinutes: 40,
        slots: defaultSlots(20, false),
        formatSummary: null,
        fromSyllabus: false,
        allocation,
        allowNumeric: false,
      },
      blocks: {},
      scope: "all",
      topicIds: null,
      userId: "user",
      prepId: "prep",
    },
  };
}

function draftFrom(item: ReturnType<typeof distinctMcq>): MockExamQuestionDraft {
  return {
    text: item.text,
    type: "mcq",
    options: [...(item.options ?? [])],
    correctAnswers: [...(item.correctAnswers ?? [])],
    points: 4,
    explanation: item.explanation ?? "",
    optionWhy: [],
    rubric: [],
    modelAnswer: "",
    topicId: item.topicId ?? null,
    topicLabel: item.topicLabel,
    source: { documentId: null, page: null, label: "kaynak" },
    difficulty: "medium",
  };
}

describe("deneme publishes once N items exist", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("publishes 20 from 59 accepted items when slot types do not match", async () => {
    const result = await replayMismatchedPublish();
    expect(result.generateCalls).toBe(0);
    expect(result.originalCanPublish).toBe(false);
    expect(result.delivered).toBe(20);
    expect(result.promised).toBe(20);
    expect(result.ok).toBe(true);
    expect(result.pointTotal).toBe(result.originalPointTotal);
    expect(result.pointTotal).toBe(pointTotal(promisedPaper()));
    expect(result.openPointsKept).toBe(true);
    const slots = promisedPaper();
    expect(slots.filter((slot) => slot.type === "mcq")).toHaveLength(14);
    expect(slots.filter((slot) => slot.type === "multi_mcq")).toHaveLength(2);
    expect(slots.filter((slot) => slot.type === "open")).toHaveLength(4);
    expect(countAccepted(slots, mismatchedBag(59), (item) => item)).toBe(59);
  });

  it("hits the wave cap, force-fills the missing count, and publishes 20 inside the budget", async () => {
    const result = await replayWaveCap();
    expect(result.emptyCalls).toBeGreaterThan(0);
    expect(result.completedWave).toBe(6);
    expect(result.forced).toBe(true);
    expect(result.relaxedCalls).toBe(1);
    expect(result.relaxedCount).toBe(20);
    expect(result.delivered).toBe(20);
    expect(result.elapsedMs).toBe(120_000);
    expect(result.elapsedMs).toBeLessThanOrEqual(180_000);
    expect(result.ok).toBe(true);
  });

  it("finalizes a stale v1 checkpoint with 59 items and discards a short one", () => {
    const stale = replayStaleCheckpoint();
    expect(stale.full).toBe("publish");
    expect(stale.fullDelivered).toBe(20);
    expect(stale.short).toBe("discard");
    expect(stale.fresh).toBe("resume");
    expect(stale.agedFull).toBe("publish");
    expect(stale.agedShort).toBe("discard");
    expect(EXAM_BUILD_VERSION).toBe(2);
  });

  it("publishes the stuck 59-item row on the next open and drops a short leased row", async () => {
    const now = Date.now();
    const math = examClient([
      {
        id: "f3de8850-6dd4-4f0a-b72a-31976041e172",
        user_id: "user",
        exam_prep_id: "prep",
        created_at: new Date(now).toISOString(),
        blueprint: stuckBlueprint({
          items: mismatchedBag(59).map(draftFrom),
          wave: 245,
          leaseUntil: 0,
          startedAt: now - 60 * 60 * 1000,
        }),
      },
    ]);
    expect(await hasInFlightMockBuild(math as unknown as SupabaseClient, "user", "prep", now)).toBe(false);
    const published = await recoverStaleMockBuilds({
      service: math as unknown as SupabaseClient,
      userId: "user",
      prepId: "prep",
      now,
    });
    expect(published.kind).toBe("published");
    if (published.kind !== "published") return;
    expect(published.examId).toBe("f3de8850-6dd4-4f0a-b72a-31976041e172");
    expect(math.questions).toHaveLength(1);
    expect(math.questions[0]).toHaveLength(20);
    const points = (math.questions[0] as Array<{ points: number; question_type: string }>).reduce(
      (sum, row) => sum + row.points,
      0,
    );
    expect(points).toBe(pointTotal(promisedPaper()));
    expect(math.rows[0]?.blueprint.cpBuild.v).toBe(2);
    expect(math.rows[0]?.blueprint.cpBuild.building).toBe(false);
    expect(math.rows[0]?.blueprint.cpBuild.items).toEqual([]);

    const circuits = examClient([
      {
        id: "0d003770-f92d-4dd9-b771-4b41707ede0a",
        user_id: "user",
        exam_prep_id: "prep",
        created_at: new Date(now).toISOString(),
        blueprint: stuckBlueprint({
          items: mismatchedBag(8).map(draftFrom),
          wave: 225,
          leaseUntil: now + 60_000,
          startedAt: now,
        }),
      },
    ]);
    const cleared = await recoverStaleMockBuilds({
      service: circuits as unknown as SupabaseClient,
      userId: "user",
      prepId: "prep",
      resumeId: "0d003770-f92d-4dd9-b771-4b41707ede0a",
      now,
    });
    expect(cleared).toEqual({ kind: "cleared", droppedResume: true });
    expect(circuits.questions).toHaveLength(0);
    expect(circuits.rows[0]?.blueprint.cpBuild.failError).toBe("stale");
    expect(circuits.rows[0]?.blueprint.cpBuild.leaseUntil).toBe(0);
    expect(circuits.rows[0]?.blueprint.cpBuild.leaseToken).toBe("stale");
    expect(circuits.rows[0]?.blueprint.cpBuild.failed).toBe(true);
  });

  it("rejects a same fact when only the number changes and keeps a template stem", () => {
    const left = "birinci antlasma sinir cizgisi 1453 yilinda imzalandi";
    const right = "birinci antlasma sinir cizgisi 1923 yilinda imzalandi";
    expect(nearDuplicate(left, right)).toBe(false);
    expect(examFactOverlap(left, right)).toBe(true);
    expect(
      semanticDuplicate(
        { topicLabel: "Alfa", type: "mcq", text: left, correctAnswers: ["bir cevap"] },
        { topicLabel: "Alfa", type: "mcq", text: right, correctAnswers: ["baska cevap"] },
      ),
    ).toBe(true);
    const templateA = distinctMcq("Alfa", "k1", 3);
    const templateB = distinctMcq("Alfa", "k1", 4);
    expect(semanticDuplicate(templateA, templateB)).toBe(false);
  });

  it("logs job create and claim failures and falls back instead of returning 503", async () => {
    const logs: unknown[][] = [];
    vi.spyOn(console, "info").mockImplementation((...args: unknown[]) => {
      logs.push(args);
    });
    const jobLogs = () => logs.filter((args) => args[0] === "generation_job").map((args) => args[1]);

    const probe = {
      from: () => chain({ data: null, error: { code: "42501", message: "x".repeat(240) } }),
    };
    expect(await generationJobsReady(probe as unknown as SupabaseClient)).toBe(false);
    const probeLog = jobLogs().at(-1) as { event: string; message?: string };
    expect(probeLog.event).toBe("probe_failed");
    expect(probeLog.message).toHaveLength(180);

    const durable = await startDurableMockExam({
      service: probe as unknown as SupabaseClient,
      userId: "user",
      isPremium: true,
      prepId: "prep",
    });
    expect(durable).toBeNull();
    expect(jobLogs().some((entry) => (entry as { reason?: string }).reason === "jobs_unavailable")).toBe(true);

    let calls = 0;
    const insertFail = {
      from: () => {
        calls += 1;
        const n = calls;
        if (n === 3) return chain({ data: null, error: { code: "42501", message: "denied ".repeat(40) } });
        return chain({ data: [], error: null });
      },
    };
    const started = await startDurableMockExam({
      service: insertFail as unknown as SupabaseClient,
      userId: "user",
      isPremium: true,
      prepId: "prep",
    });
    expect(started).toBeNull();
    expect(jobLogs().some((entry) => (entry as { reason?: string }).reason === "insert_failed")).toBe(true);
    const created = jobLogs().find((entry) => (entry as { event?: string }).event === "create_failed") as {
      message?: string;
    };
    expect(created.message?.length).toBeLessThanOrEqual(180);

    const ready = { from: () => chain({ data: [], error: null }) };
    expect(await generationJobsReady(ready as unknown as SupabaseClient)).toBe(true);

    let claimCalls = 0;
    const claimed = await claimGenerationJob(
      {
        from: () => {
          claimCalls += 1;
          const n = claimCalls;
          if (n === 1) {
            return chain({
              data: {
                id: "job-1",
                user_id: "user",
                prep_id: "prep",
                node_id: null,
                kind: "mock_exam",
                spec: {},
                state: "queued",
                progress: {},
                result_ref: null,
                attempts: 0,
                charge_reservation_id: null,
                lease_until: null,
                created_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              },
              error: null,
            });
          }
          return chain({ data: null, error: { code: "42501", message: "claim denied" } });
        },
      } as unknown as SupabaseClient,
      "job-1",
      Date.now(),
    );
    expect(claimed).toBeNull();
    expect(jobLogs().some((entry) => (entry as { event?: string }).event === "claim_failed")).toBe(true);

    const direct = await insertGenerationJob(
      { from: () => chain({ data: null, error: { code: "42501", message: "no insert" } }) } as unknown as SupabaseClient,
      { userId: "user", prepId: "prep", kind: "mock_exam", spec: {} },
    );
    expect(direct).toEqual({ error: true });
  });

  it("asserts the script delivers the promised count inside the budget", async () => {
    const proof = await replayPublishCap();
    expect(proof.ok).toBe(true);
    expect(proof.delivered).toBe(proof.promised);
    expect(proof.elapsedMs).toBeLessThanOrEqual(proof.budgetMs);
    const bin = fileURLToPath(new URL("../../node_modules/.bin/tsx", import.meta.url));
    const tsx = process.platform === "win32" ? `${bin}.cmd` : bin;
    const script = fileURLToPath(new URL("../../scripts/deneme-deliver-budget.ts", import.meta.url));
    const run = spawnSync(tsx, [script], { cwd: root, encoding: "utf8", shell: process.platform === "win32" });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('"delivered":20');
    expect(run.stdout).toContain('"promised":20');
  }, 20_000);

  it("keeps the job path, the fallback, and the angle prompt wired", () => {
    const route = source("../../src/app/api/learning/exam-prep/mock-exam/route.ts");
    expect(route).toContain("recoverStaleMockBuilds");
    expect(route).toContain("startDurableMockExam");
    expect(route).toContain("runFallbackMockExam");
    expect(route).toContain("application/x-ndjson");
    expect(route).not.toContain("createMockExam(");
    expect(route.indexOf("await recoverStaleMockBuilds")).toBeLessThan(route.indexOf("await startDurableMockExam"));
    const fallback = source("../../src/lib/learning/mock-exam/fallback-exam.ts");
    expect(fallback).toContain("maxWaves: 1");
    expect(fallback).toContain("prior");
    expect(fallback).toContain("EXAM_BUILD_VERSION");
    expect(fallback).toContain("publishReady");
    const jobs = source("../../src/lib/learning/generation-jobs.ts");
    expect(jobs).toContain("CHUNK_LEASE_MS");
    expect(jobs).toContain('console.info("generation_job"');
    const durable = source("../../src/lib/learning/mock-exam-durable.ts");
    expect(durable).toContain("MOCK_EXAM_BUDGET_MS");
    expect(durable).toContain('event: "fallback"');
    const create = source("../../src/lib/learning/mock-exam/create.ts");
    expect(create).toContain("Aynı olguyu, aynı cevabı ya da aynı kökü ikinci kez sorma.");
    expect(create).toContain("assertDeliverable");
    expect(create).toContain("note: null");
  });
});
