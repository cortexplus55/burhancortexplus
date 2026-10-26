/**
 * Yazılı deneme arka plan işi.
 *
 * İstek hemen döner. Parça parça dolar, kira düşünce kaldığı yerden sürer.
 * Kısa kâğıt practice_exams'e yazılmaz. Tablo yoksa çağıran eşzamanlı yola döner.
 */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { commitCredits, refundCredits, refusalCode, reserveCredits } from "@/lib/credits/service";
import { pumpJob, type PureJob } from "@/lib/learning/generation-job";
import {
  claimGenerationJob,
  findActivePrepJob,
  generationJobsReady,
  insertGenerationJob,
  listDueGenerationJobs,
  loadGenerationJob,
  patchGenerationJob,
  type GenerationJobRow,
} from "@/lib/learning/generation-jobs";
import {
  assembleMockExamQuestions,
  persistMockExam,
  planMockExam,
  type CreateMockExamInput,
} from "@/lib/learning/mock-exam/create";
import type { MockExamBlueprint, MockExamQuestionDraft, MockLengthPreset } from "@/lib/learning/mock-exam";

export type DurableMockStart =
  | {
      ok: true;
      jobId: string;
      progress: { ready: number; promised: number };
      planned: number | null;
    }
  | { ok: false; status: number; error: string };

type MockSpec = {
  prepId: string;
  preset?: MockLengthPreset;
  scope?: "all" | "topics";
  topicIds?: string[];
  durationMinutes?: number;
  isPremium: boolean;
  topicLabel?: string;
  questionCount?: number;
};

type Checkpoint = {
  ready: number;
  promised: number;
  items: MockExamQuestionDraft[];
  startedAt?: number;
  refunded?: boolean;
  blueprint?: MockExamBlueprint;
  prepTitle?: string;
  documentId?: string | null;
  topics?: Array<{ id: string; label: string; status: string | null; source_refs: unknown }>;
  blocks?: Record<string, string>;
};

function specOf(row: GenerationJobRow): MockSpec {
  const spec = row.spec ?? {};
  return {
    prepId: String(spec.prepId ?? row.prep_id ?? ""),
    preset: spec.preset as MockLengthPreset | undefined,
    scope: spec.scope as MockSpec["scope"],
    topicIds: Array.isArray(spec.topicIds) ? (spec.topicIds as string[]) : undefined,
    durationMinutes: typeof spec.durationMinutes === "number" ? spec.durationMinutes : undefined,
    isPremium: spec.isPremium === true,
    topicLabel: typeof spec.topicLabel === "string" ? spec.topicLabel : undefined,
    questionCount: typeof spec.questionCount === "number" ? spec.questionCount : undefined,
  };
}

function checkpointOf(row: GenerationJobRow): Checkpoint {
  const progress = row.progress ?? {};
  const items = Array.isArray(progress.items) ? (progress.items as MockExamQuestionDraft[]) : [];
  return {
    ready: typeof progress.ready === "number" ? progress.ready : items.length,
    promised: typeof progress.promised === "number" ? progress.promised : 0,
    items,
    startedAt: typeof progress.startedAt === "number" ? progress.startedAt : undefined,
    refunded: progress.refunded === true,
    blueprint: progress.blueprint as MockExamBlueprint | undefined,
    prepTitle: typeof progress.prepTitle === "string" ? progress.prepTitle : undefined,
    documentId: typeof progress.documentId === "string" ? progress.documentId : progress.documentId === null ? null : undefined,
    topics: Array.isArray(progress.topics)
      ? (progress.topics as Checkpoint["topics"])
      : undefined,
    blocks: progress.blocks && typeof progress.blocks === "object" ? (progress.blocks as Record<string, string>) : undefined,
  };
}

function pending(row: GenerationJobRow): DurableMockStart {
  const checkpoint = checkpointOf(row);
  return {
    ok: true,
    jobId: row.id,
    progress: { ready: checkpoint.ready, promised: checkpoint.promised },
    planned: checkpoint.promised || null,
  };
}

function toPure(row: GenerationJobRow, checkpoint: Checkpoint, now: number): PureJob<MockExamQuestionDraft> {
  return {
    state: row.state,
    leaseUntil: null,
    chargeReservationId: row.charge_reservation_id,
    refunded: checkpoint.refunded === true,
    startedAt: checkpoint.startedAt && checkpoint.startedAt > 0 ? checkpoint.startedAt : now,
    attempts: row.attempts,
    ready: checkpoint.ready,
    promised: checkpoint.promised,
    items: checkpoint.items,
    resultRef: row.result_ref && row.result_ref !== "pending" ? row.result_ref : null,
    charges: row.charge_reservation_id ? 1 : 0,
  };
}

/** Tablo yoksa null. Varsa bekleyen iş; ikinci ücret yok. */
export async function startDurableMockExam(input: CreateMockExamInput): Promise<DurableMockStart | null> {
  if (!(await generationJobsReady(input.service))) return null;
  const active = await findActivePrepJob(input.service, input.userId, input.prepId, "mock_exam");
  if (active === "missing") return null;
  if (active) return pending(active);

  const spec: MockSpec = {
    prepId: input.prepId,
    preset: input.preset,
    scope: input.scope,
    topicIds: input.topicIds,
    durationMinutes: input.durationMinutes,
    isPremium: input.isPremium,
    topicLabel: input.topicLabel,
    questionCount: input.questionCount,
  };
  const inserted = await insertGenerationJob(input.service, {
    userId: input.userId,
    prepId: input.prepId,
    kind: "mock_exam",
    spec,
  });
  if ("missing" in inserted) return null;
  if ("duplicate" in inserted) {
    const again = await findActivePrepJob(input.service, input.userId, input.prepId, "mock_exam");
    if (again && again !== "missing") return pending(again);
    return { ok: false, status: 503, error: "generation_failed" };
  }
  if ("error" in inserted) return { ok: false, status: 503, error: "generation_failed" };

  const job = inserted.row;
  const chargeKey = `practice-exam:${input.prepId}:${input.userId}:${job.id}`;
  const charge = await reserveCredits(input.service, input.userId, "PRACTICE_EXAM_GENERATE", chargeKey);
  if (!charge.ok) {
    await patchGenerationJob(input.service, job.id, { state: "failed", lease_until: null });
    return { ok: false, status: charge.reason === "insufficient_credits" ? 402 : 409, error: refusalCode(charge) };
  }
  await patchGenerationJob(input.service, job.id, { charge_reservation_id: charge.reservationId });
  return pending({ ...job, charge_reservation_id: charge.reservationId });
}

function appOrigin(): string | null {
  const explicit = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (explicit) return explicit;
  const vercel = process.env.VERCEL_URL?.replace(/\/$/, "");
  if (!vercel) return null;
  return vercel.startsWith("http") ? vercel : `https://${vercel}`;
}

function kickTick(): void {
  const secret = process.env.CRON_SECRET;
  const origin = appOrigin();
  if (!secret || !origin) return;
  void fetch(`${origin}/api/jobs/tick`, {
    method: "POST",
    headers: { Authorization: `Bearer ${secret}` },
  }).catch(() => undefined);
}

export async function pumpMockExamJob(service: SupabaseClient, jobId: string): Promise<void> {
  const existing = await loadGenerationJob(service, jobId);
  if (!existing || existing.kind !== "mock_exam") return;
  if (existing.state === "done" || existing.state === "failed") return;
  const now = Date.now();
  const claimed = await claimGenerationJob(service, jobId, now);
  if (!claimed) return;

  const checkpoint = checkpointOf(claimed.row);
  const spec = specOf(claimed.row);
  const stash: Checkpoint = { ...checkpoint };
  const pure = toPure(claimed.row, checkpoint, now);
  const reservationId = claimed.row.charge_reservation_id;

  const next = await pumpJob(pure, {
    now,
    generate: async (items) => {
      const fresh = await loadGenerationJob(service, jobId);
      if (fresh?.result_ref && fresh.result_ref !== "pending") {
        if (reservationId) await commitCredits(service, reservationId).catch(() => undefined);
        return { items, done: true, resultRef: fresh.result_ref, promised: checkpointOf(fresh).promised || undefined };
      }
      if (!reservationId) throw new Error("missing_reservation");
      let blueprint = stash.blueprint;
      let topics = stash.topics;
      let prepTitle = stash.prepTitle;
      let documentId = stash.documentId ?? null;
      let blocks = stash.blocks;
      if (!blueprint || !topics || !prepTitle) {
        const planned = await planMockExam({
          service,
          userId: claimed.row.user_id,
          isPremium: spec.isPremium,
          prepId: spec.prepId,
          preset: spec.preset,
          scope: spec.scope,
          topicIds: spec.topicIds,
          durationMinutes: spec.durationMinutes,
          topicLabel: spec.topicLabel,
          questionCount: spec.questionCount,
        });
        if (!planned.ok) throw new Error(planned.error);
        blueprint = planned.plan.blueprint;
        topics = planned.plan.topics;
        prepTitle = planned.plan.prepTitle;
        documentId = planned.plan.documentId;
        blocks = Object.fromEntries(planned.plan.blocks);
        stash.blueprint = blueprint;
        stash.topics = topics;
        stash.prepTitle = prepTitle;
        stash.documentId = documentId;
        stash.blocks = blocks;
        stash.promised = blueprint.questionCount;
      }
      const assembled = await assembleMockExamQuestions({
        service,
        userId: claimed.row.user_id,
        isPremium: spec.isPremium,
        prepTitle,
        documentId,
        topics,
        blueprint,
        reservationId,
        chargeKey: `practice-exam:${spec.prepId}:${claimed.row.user_id}:${jobId}`,
        prior: items,
        maxWaves: 1,
        blocks: blocks ? new Map(Object.entries(blocks)) : undefined,
      });
      stash.items = assembled.questions;
      if (!assembled.ok) {
        return { items: assembled.questions, done: false, promised: blueprint.questionCount };
      }
      const locked = await patchGenerationJob(
        service,
        jobId,
        { result_ref: "pending" },
        { leaseUntil: claimed.leaseUntil },
      );
      if (!locked) {
        const raced = await loadGenerationJob(service, jobId);
        if (raced?.result_ref && raced.result_ref !== "pending") {
          return { items: assembled.questions, done: true, resultRef: raced.result_ref, promised: blueprint.questionCount };
        }
        return { items: assembled.questions, done: false, promised: blueprint.questionCount };
      }
      const saved = await persistMockExam({
        service,
        userId: claimed.row.user_id,
        prepId: spec.prepId,
        prepTitle,
        blueprint,
        questions: assembled.questions,
        slots: assembled.slots,
        scope: spec.scope,
        topicIds: spec.topicIds,
      });
      if (!saved.ok) {
        await patchGenerationJob(service, jobId, { result_ref: null }, { leaseUntil: claimed.leaseUntil });
        return { items: assembled.questions, done: false, promised: blueprint.questionCount };
      }
      await commitCredits(service, reservationId).catch(() => undefined);
      return { items: assembled.questions, done: true, resultRef: saved.examId, promised: blueprint.questionCount };
    },
    refund: (id) => {
      void refundCredits(service, id).catch(() => undefined);
    },
  });

  const savedProgress: Checkpoint = {
    ...stash,
    ready: next.ready,
    promised: next.promised,
    items: next.items,
    startedAt: next.startedAt,
    refunded: next.refunded,
  };
  const wrote = await patchGenerationJob(
    service,
    jobId,
    {
      state: next.state,
      attempts: next.attempts,
      progress: savedProgress,
      result_ref: next.resultRef,
      lease_until: next.state === "running" ? new Date(now + 60_000).toISOString() : null,
      charge_reservation_id: next.chargeReservationId,
    },
    { leaseUntil: claimed.leaseUntil },
  );
  if (wrote && next.state === "running") kickTick();
}

/** Günlük cron ve /api/jobs/tick. Tablo yoksa 0; cron düşmez. */
export async function pumpDueGenerationJobs(service: SupabaseClient, limit = 8): Promise<number> {
  if (!(await generationJobsReady(service))) return 0;
  const due = await listDueGenerationJobs(service, limit);
  let pumped = 0;
  for (const row of due) {
    if (row.kind !== "mock_exam") continue;
    await pumpMockExamJob(service, row.id);
    pumped += 1;
  }
  return pumped;
}

/** Başarısız işi aynı belirtimle yeniden sıraya alır. Önceki ayrılış iade edilmiştir. */
export async function retryGenerationJob(
  service: SupabaseClient,
  userId: string,
  jobId: string,
): Promise<DurableMockStart | { ok: false; status: number; error: string }> {
  const row = await loadGenerationJob(service, jobId);
  if (!row || row.user_id !== userId) return { ok: false, status: 404, error: "not_found" };
  if (row.state !== "failed") return pending(row);
  const spec = specOf(row);
  const cleared = await patchGenerationJob(service, jobId, {
    state: "queued",
    lease_until: null,
    charge_reservation_id: null,
    result_ref: null,
    progress: { ...checkpointOf(row), refunded: false, startedAt: Date.now() },
  });
  if (!cleared) return { ok: false, status: 503, error: "generation_failed" };
  const chargeKey = `practice-exam:${spec.prepId}:${userId}:${jobId}:retry:${Date.now()}`;
  const charge = await reserveCredits(service, userId, "PRACTICE_EXAM_GENERATE", chargeKey);
  if (!charge.ok) {
    await patchGenerationJob(service, jobId, { state: "failed" });
    return { ok: false, status: charge.reason === "insufficient_credits" ? 402 : 409, error: refusalCode(charge) };
  }
  await patchGenerationJob(service, jobId, { charge_reservation_id: charge.reservationId, state: "queued" });
  const reloaded = await loadGenerationJob(service, jobId);
  return reloaded ? pending(reloaded) : { ok: false, status: 503, error: "generation_failed" };
}
