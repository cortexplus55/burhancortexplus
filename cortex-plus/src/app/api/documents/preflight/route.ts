import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { preflightPdfPages } from "@/lib/documents/extract-text";
import { getDocumentLimits } from "@/lib/documents/document-limits";
import { AdminCheckError } from "@/lib/auth/roles";
import { userFacingIngestionMessage } from "@/lib/documents/ingestion-errors";
import { FREE_PAGE_TOTAL, freePagesRemaining } from "@/lib/documents/free-pages";
import { FREE_PAGE_LIMIT_CODE } from "@/lib/documents/process-errors";
import { getUserEntitlements } from "@/lib/billing/entitlements";
import { getActionCost } from "@/lib/credits/service";
import { spendableCredits } from "@/lib/credits/spendable-server";

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

  // Ücretsiz plan: hesap başına toplam 5 sayfa (3 Ekim 2026). Hak hiç
  // kalmadıysa uzun işleme beklemeden yükseltme kapısı açılsın.
  const freeRemaining = await freePagesRemaining(service, userId, doc.id);
  if (freeRemaining === 0) {
    return NextResponse.json(
      { error: userFacingIngestionMessage(FREE_PAGE_LIMIT_CODE), code: FREE_PAGE_LIMIT_CODE },
      { status: 402 },
    );
  }
  const freePages = freeRemaining == null ? null : { total: FREE_PAGE_TOTAL, remaining: freeRemaining };

  if (doc.mime_type !== "application/pdf") {
    return NextResponse.json({
      freePages,
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

  // Ücretli hesap, sayfa başına kredi (kredi sistemi v2, 8 Ekim 2026):
  // öğrenci yüklemeden önce belgenin hakkının ne kadarını kullanacağını,
  // yetmiyorsa kaç sayfasının işleneceğini görür.
  const creditUse = freePages ? null : await documentCreditUse(service, userId, counts);

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
    freePages,
    creditUse,
    pageCount: counts.pageCount,
    // Upper bound: pages without a text layer. Truly blank pages are counted
    // here but ingestion does not charge quota for them.
    scannedPages: counts.scannedPages,
    textPages: counts.textPages,
    scannedPagesNote:
      "Ön kontrol metin katmanı olmayan sayfaları tarama sayar; gerçekten boş sayfalar kota düşmez.",
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

async function documentCreditUse(
  service: Parameters<typeof spendableCredits>[0],
  userId: string,
  counts: { textPages: number; scannedPages: number },
): Promise<{ percent: number; pagesAffordable: number | null } | null> {
  const spendable = await spendableCredits(service, userId);
  if (!Number.isFinite(spendable)) return null;
  const [pageCost, scanCost, entitlements] = await Promise.all([
    getActionCost(service, "DOCUMENT_PAGE_PROCESS"),
    getActionCost(service, "DOCUMENT_SCAN_PAGE"),
    getUserEntitlements(service, userId),
  ]);
  const page = Math.max(1, pageCost ?? 2);
  const cost = (counts.textPages + counts.scannedPages) * page + counts.scannedPages * (scanCost ?? 6);
  const allowance = entitlements.monthlyAllowance ?? 0;
  return {
    percent: allowance > 0 ? Math.max(1, Math.round((cost / allowance) * 100)) : 0,
    pagesAffordable: spendable >= cost ? null : Math.floor(spendable / page),
  };
}
