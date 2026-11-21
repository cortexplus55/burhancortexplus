import { errorResponse } from "@/lib/api/guards";
import { outcomeResponse, readJson, realtimeGuard, routeDeps } from "@/lib/tutor/realtime/route-guard";
import { endBodySchema, endRealtimeSession } from "@/lib/tutor/realtime/session";

export const maxDuration = 60;

/**
 * Sesli dersin bitişi (teacher.v2, 21 Kasım 2026): çağrı kapanır, son dakika kurala göre kesinleşir ya da iade edilir,
 * konuşma metni sohbete yazılır (ses saklanmaz), gider satırları kaydedilir. Hepsi bir kez; ikinci istek aynı sonucu
 * döner. Dakikada 20.
 */
export async function POST(request: Request) {
  const guard = await realtimeGuard(request, { scope: "tutor-realtime-end", limit: 20, dailyLimit: 400 });
  if (!guard.ok) return guard.response;
  const parsed = endBodySchema.safeParse(await readJson(request));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { userId, service } = guard.ctx;
  return outcomeResponse(await endRealtimeSession(service, routeDeps(), { userId, body: parsed.data }));
}
