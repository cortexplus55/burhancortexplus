import { after, NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { createMockExam, type CreateMockExamResult } from "@/lib/learning/mock-exam/create";
import { pumpMockExamJob, startDurableMockExam } from "@/lib/learning/mock-exam-durable";
import type { MockExamProgress } from "@/lib/learning/mock-exam/progress";
import { clampMockMinutes, MOCK_MINUTES_MAX } from "@/lib/learning/mock-exam/time-limit";

/** Konu başına öğretmen motoru (yazar + denetim + düzeltme), sekizli dalgalar. */
export const maxDuration = 300;

const bodySchema = z.object({
  prepId: z.string().uuid(),
  preset: z.enum(["short", "standard", "real"]).optional(),
  scope: z.enum(["all", "topics"]).optional(),
  topicIds: z.array(z.string().uuid()).max(40).optional(),
  /** Serbest süre (dk). 0 süresiz. */
  durationMinutes: z.number().int().min(0).max(MOCK_MINUTES_MAX).optional(),
});

function resultBody(result: Extract<CreateMockExamResult, { ok: true }>) {
  return {
    ok: true,
    examId: result.examId,
    planned: result.planned,
    ready: result.ready,
    note: result.note,
    durationMinutes: result.blueprint.durationMinutes,
  };
}

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-mock", limit: 8, trackSharing: true });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const fields = {
    service,
    userId,
    isPremium: await isPremiumUser(service, userId),
    prepId: parsed.data.prepId,
    preset: parsed.data.preset,
    scope: parsed.data.scope,
    topicIds: parsed.data.topicIds,
    durationMinutes: clampMockMinutes(parsed.data.durationMinutes) ?? undefined,
  };
  const durable = await startDurableMockExam(fields);
  if (durable && durable.ok) {
    after(() => pumpMockExamJob(service, durable.jobId).catch(() => undefined));
  }
  const pendingBody = durable && durable.ok
    ? {
        ok: true as const,
        jobId: durable.jobId,
        planned: durable.planned,
        ready: durable.progress.ready,
        note: null,
        progress: durable.progress,
      }
    : null;

  const run = async (onProgress?: (progress: MockExamProgress) => void) =>
    createMockExam({ ...fields, onProgress });

  // Kurulum ekranı biten konu sayısını canlı gösterir (25 Ekim 2026): NDJSON, son satır sonuç.
  if (request.headers.get("accept")?.includes("application/x-ndjson")) {
    const encoder = new TextEncoder();
    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const write = (line: unknown) => controller.enqueue(encoder.encode(`${JSON.stringify(line)}\n`));
        try {
          if (durable && !durable.ok) {
            write({ type: "done", status: durable.status, data: { error: durable.error, code: durable.error } });
            return;
          }
          if (pendingBody) {
            write({
              type: "progress",
              done: pendingBody.progress.ready,
              total: pendingBody.progress.promised,
              label: null,
            });
            write({ type: "done", status: 200, data: pendingBody });
            return;
          }
          const result = await run((progress) => write({ type: "progress", ...progress }));
          write(
            result.ok
              ? { type: "done", status: 200, data: resultBody(result) }
              : { type: "done", status: result.status, data: { error: result.error, code: result.error } },
          );
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

  if (durable && !durable.ok) return errorResponse(durable.status, durable.error);
  if (pendingBody) return NextResponse.json(pendingBody);
  const result = await run();
  if (!result.ok) return errorResponse(result.status, result.error);
  return NextResponse.json(resultBody(result));
}
