import { after, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { pumpMockExamJob, startDurableMockExam } from "@/lib/learning/mock-exam-durable";
import {
  hasInFlightMockBuild,
  mockExamSpecKey,
  recoverStaleMockBuilds,
  runFallbackMockExam,
  type FallbackExamInput,
} from "@/lib/learning/mock-exam/fallback-exam";
import type { ChunkOutcome } from "@/lib/learning/mock-exam/fallback-chunk";
import { clampMockMinutes, MOCK_MINUTES_MAX } from "@/lib/learning/mock-exam/time-limit";

/** Konu başına öğretmen motoru (yazar + denetim + düzeltme). Parça parça, aynı kâğıtta. */
export const maxDuration = 300;

const bodySchema = z.object({
  prepId: z.string().uuid(),
  preset: z.enum(["short", "standard", "real"]).optional(),
  scope: z.enum(["all", "topics"]).optional(),
  topicIds: z.array(z.string().uuid()).max(40).optional(),
  /** Serbest süre (dk). 0 süresiz. */
  durationMinutes: z.number().int().min(0).max(MOCK_MINUTES_MAX).optional(),
  /** Süregelen kâğıt. Yeni istek açılmaz. */
  resumeId: z.string().uuid().optional(),
  /** Bütçe bitince öğrenci aynı kâğıdı sürdürür. */
  retry: z.boolean().optional(),
});

function publishedData(recovery: { examId: string; planned: number; topicTotal: number; resumeId: string }) {
  return {
    ok: true as const,
    examId: recovery.examId,
    resumeId: recovery.resumeId,
    running: false,
    planned: recovery.planned,
    ready: recovery.topicTotal,
    note: null,
    topicsReady: recovery.topicTotal,
    topicTotal: recovery.topicTotal,
  };
}

function chunkData(result: Extract<ChunkOutcome, { ok: true }>) {
  return {
    ok: true as const,
    examId: result.examId,
    resumeId: result.resumeId,
    running: result.running,
    planned: result.promised,
    ready: result.topicsReady,
    note: null,
    topicsReady: result.topicsReady,
    topicTotal: result.topicTotal,
  };
}

function ndjsonResponse(run: (write: (line: unknown) => void) => Promise<void>) {
  const encoder = new TextEncoder();
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const write = (line: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
      try {
        await run(write);
      } catch {
        write({ type: "done", status: 500, data: { error: "generation_failed", code: "generation_failed" } });
      } finally {
        controller.close();
      }
    },
  });
  return new Response(stream, {
    headers: { "Content-Type": "application/x-ndjson; charset=utf-8", "Cache-Control": "no-store" },
  });
}

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-mock", limit: 8, trackSharing: true });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const fields: FallbackExamInput = {
    service,
    userId,
    isPremium: await isPremiumUser(service, userId),
    prepId: parsed.data.prepId,
    preset: parsed.data.preset,
    scope: parsed.data.scope,
    topicIds: parsed.data.topicIds,
    durationMinutes: clampMockMinutes(parsed.data.durationMinutes) ?? undefined,
    resumeId: parsed.data.resumeId,
    explicitRetry: parsed.data.retry === true,
    signal: request.signal,
  };
  const stream = request.headers.get("accept")?.includes("application/x-ndjson") === true;
  const recovery = await recoverStaleMockBuilds({
    service,
    userId,
    prepId: fields.prepId,
    resumeId: fields.resumeId,
    specKey: mockExamSpecKey(fields),
  });
  if (recovery.kind === "published") {
    const body = publishedData(recovery);
    if (stream) {
      return ndjsonResponse(async (write) => {
        write({ type: "done", status: 200, data: body });
      });
    }
    return NextResponse.json(body);
  }
  if (recovery.droppedResume) fields.resumeId = undefined;
  const inFlight = Boolean(fields.resumeId) || (await hasInFlightMockBuild(service, userId, parsed.data.prepId));

  if (!inFlight) {
    const durable = await startDurableMockExam({
      service,
      userId,
      isPremium: fields.isPremium,
      prepId: fields.prepId,
      preset: fields.preset,
      scope: fields.scope,
      topicIds: fields.topicIds,
      durationMinutes: fields.durationMinutes,
    });
    if (durable && !durable.ok) {
      if (stream) {
        return ndjsonResponse(async (write) => {
          write({ type: "done", status: durable.status, data: { error: durable.error, code: durable.error } });
        });
      }
      return errorResponse(durable.status, durable.error);
    }
    if (durable && durable.ok) {
      after(() => pumpMockExamJob(service, durable.jobId, request.signal).catch(() => undefined));
      const pendingBody = {
        ok: true as const,
        jobId: durable.jobId,
        planned: durable.planned,
        ready: durable.progress.ready,
        note: null,
        progress: durable.progress,
      };
      if (stream) {
        return ndjsonResponse(async (write) => {
          write({
            type: "progress",
            done: pendingBody.progress.ready,
            total: pendingBody.progress.promised,
            label: null,
          });
          write({ type: "done", status: 200, data: pendingBody });
        });
      }
      return NextResponse.json(pendingBody);
    }
  }

  if (stream) {
    return ndjsonResponse(async (write) => {
      const result = await runFallbackMockExam({
        ...fields,
        onProgress: (progress) =>
          write({
            type: "progress",
            done: progress.done,
            total: progress.total,
            label: progress.label ?? null,
            resumeId: progress.resumeId,
          }),
      });
      write(
        result.ok
          ? { type: "done", status: 200, data: chunkData(result) }
          : {
              type: "done",
              status: result.status,
              data: { error: result.error, code: result.error, ...(result.resumeId ? { resumeId: result.resumeId } : {}) },
            },
      );
    });
  }

  const result = await runFallbackMockExam(fields);
  if (!result.ok) return errorResponse(result.status, result.error, result.resumeId ? { resumeId: result.resumeId } : {});
  return NextResponse.json(chunkData(result));
}
