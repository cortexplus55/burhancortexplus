import { NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { PREFETCH_HEADER, verifyPrefetchToken } from "@/lib/learning/lesson-prefetch";
import { errorResponse, withUser } from "@/lib/api/guards";
import { handleNodeRequest } from "@/lib/learning/node/handler";

/**
 * Üretim çağrısı 90 saniye, doğrulama ve geçici 5xx yeniden denemesi buna eklenir.
 * Tavan 300 saniye: bir zaman aşımı, kısa bekleme ve tek yeniden deneme
 * fonksiyon kesilmeden biter. Platform varsayılanı keserse öğrenci 502 görür
 * ve kredi iade edilir, ders kayda geçmez.
 */
export const maxDuration = 300;

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  // Sıradaki dersin önceden yazımı: imzalı iç istek. Hemen kabul edilir,
  // ders yanıttan sonra yazılır — çağıran beklemez, bağlantısı kopsa da
  // yazım sürer.
  const prefetchHeader = request.headers.get(PREFETCH_HEADER);
  if (prefetchHeader !== null) {
    const caller = verifyPrefetchToken(prefetchHeader);
    if (!caller) return errorResponse(401, "AUTH_REQUIRED");
    const body = await request.json().catch(() => null);
    after(async () => {
      const result = await handleNodeRequest(
        { userId: caller.userId, service: createServiceClient() },
        body,
        { origin, prefetchNodeId: caller.nodeId },
      ).catch((error: unknown) => {
        console.error("lesson_prefetch_failed", {
          cause: error instanceof Error ? error.message.slice(0, 160) : "unknown",
        });
        return null;
      });
      if (result && result.status >= 400) {
        console.error("lesson_prefetch_failed", { status: result.status });
      }
    });
    return NextResponse.json({ ok: true, accepted: true }, { status: 202 });
  }

  const guard = await withUser(request, { scope: "exam-prep-node", limit: 16 });
  if (!guard.ok) return guard.response;
  return handleNodeRequest(guard.ctx, await request.json(), { origin, prefetchNodeId: null });
}
