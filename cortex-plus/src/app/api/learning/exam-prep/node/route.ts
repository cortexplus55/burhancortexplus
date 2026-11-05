import { NextResponse, after } from "next/server";
import { createServiceClient } from "@/lib/supabase/server";
import { PREFETCH_HEADER, verifyPrefetchToken } from "@/lib/learning/lesson-prefetch";
import { errorResponse, withUser } from "@/lib/api/guards";
import { handleNodeRequest } from "@/lib/learning/node/handler";
import { spendBreakerBlocks } from "@/lib/billing/spend-breaker";

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
    // Lansman zırhı (5 Kasım 2026): sigorta atmışsa ücretsiz hesabın önceden yazımı (kredisiz ama model maliyetli) başlamaz.
    if (await spendBreakerBlocks(createServiceClient(), caller.userId, { meter: "lesson" })) {
      return NextResponse.json({ ok: true, accepted: false, skipped: "spend_cap" }, { status: 202 });
    }
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

  // Server-Timing (3 Kasım 2026): sonraki istekler (progress, check, finish) de ölçülür; üretim yanıtının kendi başlığı korunur.
  const startedAt = performance.now();
  const guard = await withUser(request, { scope: "exam-prep-node", limit: 16 });
  if (!guard.ok) return guard.response;
  const authMs = performance.now() - startedAt;
  const body = await request.json();
  const response = await handleNodeRequest(guard.ctx, body, { origin, prefetchNodeId: null });
  const action = body && typeof body === "object" && typeof (body as { action?: unknown }).action === "string" ? (body as { action: string }).action : "start";
  const entry = `auth;dur=${authMs.toFixed(1)}, node;desc="${action.replace(/[^a-z_-]/gi, "").slice(0, 24)}";dur=${(performance.now() - startedAt).toFixed(1)}`;
  const existing = response.headers.get("Server-Timing");
  response.headers.set("Server-Timing", existing ? `${existing}, ${entry}` : entry);
  return response;
}
