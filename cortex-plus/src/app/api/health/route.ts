import { NextResponse } from "next/server";
import { supabaseConfigIssue } from "@/lib/supabase/config-check";

export const dynamic = "force-dynamic";

/** Canlı ortam Supabase yapılandırmasını doğrula (anahtar sızdırmaz). */
export async function GET() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const refMatch = url.match(/https:\/\/([^.]+)\.supabase\.co/);
  const projectRef = refMatch?.[1] ?? null;
  const issue = supabaseConfigIssue();

  return NextResponse.json({
    ok: !issue,
    supabaseProjectRef: projectRef,
    expectedRef: "dgjfyewgrukglsehyntc",
    issue,
    appUrl: process.env.NEXT_PUBLIC_APP_URL ?? null,
  });
}
