import crypto from "crypto";
import { NextResponse } from "next/server";
import { supabaseConfigIssue } from "@/lib/supabase/config-check";
import { integrationReport } from "@/lib/integrations/status";

export const dynamic = "force-dynamic";

/**
 * Constant-time compare that does not leak length through an early return.
 */
function secretMatches(provided: string, expected: string) {
  const a = crypto.createHash("sha256").update(provided).digest();
  const b = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

/**
 * Whether the caller proved they hold CRON_SECRET. Which integrations are
 * missing is a map of where the deployment is weak — "rate limiting is only
 * in-memory" is exactly what an abuser would like to know — so the detail is
 * kept behind the shared secret while the public shape stays unchanged.
 */
function isOperator(request: Request) {
  const expected = process.env.CRON_SECRET?.trim();
  if (!expected) return false;

  const header = request.headers.get("authorization") ?? "";
  const provided = header.replace(/^Bearer\s+/i, "").trim();
  if (!provided) return false;

  return secretMatches(provided, expected);
}

/** Canlı ortam yapılandırmasını doğrula (anahtar sızdırmaz). */
export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const refMatch = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  const projectRef = refMatch?.[1] ?? null;
  const issue = supabaseConfigIssue();

  const body: Record<string, unknown> = {
    ok: !issue,
    supabaseProjectRef: projectRef,
    expectedRef: "dgjfyewgrukglsehyntc",
    issue,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
  };

  if (isOperator(request)) {
    const report = integrationReport();
    body.ready = report.ready;
    body.missing = report.missing;
    body.integrations = report.integrations;
  }

  return NextResponse.json(body);
}
