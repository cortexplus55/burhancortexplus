import { after, NextResponse } from "next/server";
import { errorResponse, withUser } from "@/lib/api/guards";
import { pumpMockExamJob, retryGenerationJob } from "@/lib/learning/mock-exam-durable";

export const maxDuration = 60;

/** Aynı belirtimi yeniden sıraya alır. Önceki ayrılış iade edilmiş olmalı. */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await withUser(request, { scope: "generation-job-retry", limit: 10 });
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return errorResponse(404, "not_found");

  const result = await retryGenerationJob(guard.ctx.service, guard.ctx.userId, id);
  if (!result.ok) return errorResponse(result.status, result.error);
  after(() => pumpMockExamJob(guard.ctx.service, result.jobId).catch(() => undefined));
  return NextResponse.json({
    ok: true,
    jobId: result.jobId,
    progress: result.progress,
    note: null,
  });
}
