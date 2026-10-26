import { NextResponse } from "next/server";
import { errorResponse, withUser } from "@/lib/api/guards";
import { loadGenerationJob } from "@/lib/learning/generation-jobs";
import { pumpMockExamJob } from "@/lib/learning/mock-exam-durable";

export const maxDuration = 300;

/** İşin sahibi ilerlemeyi okur. Kira düşmüşse bir parça daha ilerler. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const guard = await withUser(request, { scope: "generation-job", limit: 90 });
  if (!guard.ok) return guard.response;
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return errorResponse(404, "not_found");

  let row = await loadGenerationJob(guard.ctx.service, id);
  if (!row || row.user_id !== guard.ctx.userId) return errorResponse(404, "not_found");

  const leaseOpen = !row.lease_until || Date.parse(row.lease_until) <= Date.now();
  if ((row.state === "queued" || row.state === "running") && leaseOpen && row.kind === "mock_exam") {
    await pumpMockExamJob(guard.ctx.service, id).catch(() => undefined);
    row = (await loadGenerationJob(guard.ctx.service, id)) ?? row;
  }

  const progress = row.progress ?? {};
  const ready = typeof progress.ready === "number" ? progress.ready : 0;
  const promised = typeof progress.promised === "number" ? progress.promised : 0;
  return NextResponse.json({
    jobId: row.id,
    state: row.state,
    progress: { ready, promised },
    examId: row.state === "done" ? row.result_ref : null,
  });
}
