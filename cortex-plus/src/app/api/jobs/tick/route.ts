import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { pumpDueGenerationJobs } from "@/lib/learning/mock-exam-durable";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

/** Kira düşünce işi sürdürür. Üçüncü cron değil; günlük iş ve sekme kapanışı burayı çağırır. */
async function tick(request: Request) {
  if (!authorized(request)) return NextResponse.json({ ok: false }, { status: 401 });
  try {
    const pumped = await pumpDueGenerationJobs(createServiceClient());
    return NextResponse.json({ ok: true, pumped });
  } catch {
    return NextResponse.json({ ok: true, pumped: 0 });
  }
}

export async function GET(request: Request) {
  return tick(request);
}

export async function POST(request: Request) {
  return tick(request);
}
