import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { listExplainAttempts } from "@/lib/learning/explain-history-store";

export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "explain-history", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const topic = new URL(request.url).searchParams.get("topic")?.trim() || undefined;
  const attempts = await listExplainAttempts(service, { userId, topic, limit: 20 });
  return NextResponse.json({ attempts });
}
