import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { processPendingDeletionRequests } from "@/lib/privacy/account-deletion";
import { processPendingDocumentDeletions } from "@/lib/privacy/document-deletion";

export const dynamic = "force-dynamic";

function authorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") ?? "";
  return header === `Bearer ${secret}`;
}

/** Bekleyen veri silme taleplerini işler (yedek; self-serve çoğu zaman anında biter). */
export async function GET(request: Request) {
  if (!authorized(request)) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }

  const service = createServiceClient();
  try {
    const documents = await processPendingDocumentDeletions(service);
    const processed = await processPendingDeletionRequests(service);
    return NextResponse.json({ ok: true, processed, documents });
  } catch {
    console.error("data_deletion_worker_failed");
    return NextResponse.json({ error: "deletion_worker_failed" }, { status: 503 });
  }
}
