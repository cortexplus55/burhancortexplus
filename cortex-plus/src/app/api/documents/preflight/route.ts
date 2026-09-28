import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { preflightPdfPages } from "@/lib/documents/extract-text";
import { getDocumentLimits } from "@/lib/documents/document-limits";
import { AdminCheckError } from "@/lib/auth/roles";
import { userFacingIngestionMessage } from "@/lib/documents/ingestion-errors";

const bodySchema = z.object({ documentId: z.string().uuid() });

/** ~seconds per OCR page for ETA (conservative). */
const SECONDS_PER_SCAN_PAGE = 8;

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "doc-preflight", limit: 60, dailyLimit: 400 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: doc } = await service
    .from("documents")
    .select("id, user_id, mime_type, storage_path, status")
    .eq("id", parsed.data.documentId)
    .is("deleted_at", null)
    .maybeSingle();

  if (!doc) return errorResponse(404, "not_found");
  if (doc.user_id !== userId) return errorResponse(403, "forbidden");

  let limits;
  try {
    limits = await getDocumentLimits(service, userId);
  } catch (error) {
    if (error instanceof AdminCheckError) {
      return NextResponse.json({
        code: "admin_check_failed",
        error: userFacingIngestionMessage("admin_check_failed"),
        retryable: true,
      }, { status: 503 });
    }
    throw error;
  }

  if (doc.mime_type !== "application/pdf") {
    return NextResponse.json({
      pageCount: 1,
      scannedPages: 0,
      textPages: 1,
      quota: {
        unlimited: limits.unlimited,
        limit: limits.scanPagesPerMonth,
        used: limits.scanPagesUsed,
        remaining: limits.scanPagesRemaining,
        tier: limits.tier,
      },
      fits: true,
      estimatedMinutes: 1,
    });
  }

  const { data: file, error: downloadError } = await service.storage
    .from("documents")
    .download(doc.storage_path);
  if (downloadError || !file) {
    return NextResponse.json({
      code: "download_failed",
      error: userFacingIngestionMessage("download_failed"),
      retryable: true,
    }, { status: 503 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const counts = await preflightPdfPages(buffer);

  await service
    .from("documents")
    .update({ page_count: counts.pageCount })
    .eq("id", doc.id)
    .eq("user_id", userId);

  const remaining = limits.scanPagesRemaining;
  const fits =
    limits.unlimited ||
    remaining == null ||
    counts.scannedPages <= remaining;

  const estimatedMinutes = Math.max(
    1,
    Math.ceil((counts.scannedPages * SECONDS_PER_SCAN_PAGE) / 60),
  );

  return NextResponse.json({
    pageCount: counts.pageCount,
    scannedPages: counts.scannedPages,
    textPages: counts.textPages,
    quota: {
      unlimited: limits.unlimited,
      limit: limits.scanPagesPerMonth,
      used: limits.scanPagesUsed,
      remaining: limits.scanPagesRemaining,
      tier: limits.tier,
    },
    fits,
    estimatedMinutes,
  });
}
