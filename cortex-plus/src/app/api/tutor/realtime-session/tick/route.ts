import { errorResponse } from "@/lib/api/guards";
import { outcomeResponse, readJson, realtimeGuard, routeDeps } from "@/lib/tutor/realtime/route-guard";
import { tickBodySchema, tickRealtimeSession } from "@/lib/tutor/realtime/session";

/** Bekçi (yanıttan sonra) bir sonraki dakikanın bitiminden 15 sn sonrasına kadar uyur. */
export const maxDuration = 120;

/**
 * Bir sonraki dakika (teacher.v2, 21 Kasım 2026). İstemci her dakikanın bitiminden 5 sn önce ister; uç dakikanın
 * kredisini ayırır, tam geçen dakikayı kesinleştirir. Ayıramazsa çağrıyı kapatır ve söyler. Dakikada 20.
 */
export async function POST(request: Request) {
  const guard = await realtimeGuard(request, { scope: "tutor-realtime-tick", limit: 20, dailyLimit: 2000 });
  if (!guard.ok) return guard.response;
  const parsed = tickBodySchema.safeParse(await readJson(request));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { userId, service } = guard.ctx;
  return outcomeResponse(await tickRealtimeSession(service, routeDeps(), { userId, body: parsed.data }));
}
