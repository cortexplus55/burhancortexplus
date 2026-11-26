import { NextResponse } from "next/server";
import { errorResponse } from "@/lib/api/guards";
import { HEAVY_AI_BLOCK_CODE, HEAVY_AI_BLOCK_MESSAGE, heavyAiProtectionActive } from "@/lib/founder-cockpit/breaker";
import { NO_STORE, outcomeResponse, readJson, realtimeGuard, routeDeps } from "@/lib/tutor/realtime/route-guard";
import { createBodySchema, createRealtimeSession } from "@/lib/tutor/realtime/session";

/** Bekçi (yanıttan sonra) ödenen sürenin bitiminden 15 sn sonrasına kadar uyur: ~75 sn + pay. */
export const maxDuration = 120;

/**
 * Canlı sesli öğretmen oturumu (teacher.v2, 21 Kasım 2026). Gövde: WebRTC teklifi (`sdp`) ve isteğe bağlı sohbet ve
 * hazırlık kimliği. Kapı, kredi ve OpenAI çağrısı `session.ts`'te; istemciye anahtar gitmez, cevap SDP'si döner.
 * Dakikada 6, günde 60 oturum.
 */
export async function POST(request: Request) {
  const guard = await realtimeGuard(request, { scope: "tutor-realtime-session", limit: 6, dailyLimit: 60 });
  if (!guard.ok) return guard.response;
  const parsed = createBodySchema.safeParse(await readJson(request));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { userId, service } = guard.ctx;
  // Koruma modu (Faz 13, Kurucu Kokpiti): günlük OpenAI bütçesi aşıldıysa yeni sesli oturum açılmaz (süren oturum biter).
  if (await heavyAiProtectionActive(service)) {
    return NextResponse.json(
      { ok: false, code: HEAVY_AI_BLOCK_CODE, message: HEAVY_AI_BLOCK_MESSAGE },
      { status: 503, headers: NO_STORE },
    );
  }
  return outcomeResponse(await createRealtimeSession(service, routeDeps(), { userId, body: parsed.data }));
}
