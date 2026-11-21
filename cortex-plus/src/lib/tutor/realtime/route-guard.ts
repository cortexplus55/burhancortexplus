import "server-only";
import { after, NextResponse } from "next/server";
import { withUser, type ApiContext } from "@/lib/api/guards";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";
import { TEACHER_V2_FLAG } from "@/lib/ai/teacher-v2";
import { defaultRealtimeDeps, type Outcome, type RealtimeDeps } from "@/lib/tutor/realtime/session";

/*
  Canlı ses uçlarının ortak kapısı: oturum zorunlu (401), kişi başına hız sınırı, teacher.v2 bayrağı (kapalıyken 404,
  özelliğin varlığı bile görünmez). Bekçi `after()` ile yanıttan sonra çalışır.
*/

export const NO_STORE = { "Cache-Control": "private, no-store" } as const;

export async function realtimeGuard(
  request: Request,
  options: { scope: string; limit: number; dailyLimit?: number },
): Promise<{ ok: true; ctx: ApiContext } | { ok: false; response: NextResponse }> {
  const guard = await withUser(request, { scope: options.scope, limit: options.limit, dailyLimit: options.dailyLimit });
  if (!guard.ok) return guard;
  const on = await isFeatureEnabled(guard.ctx.service, TEACHER_V2_FLAG, guard.ctx.userId).catch(() => false);
  if (!on) return { ok: false, response: NextResponse.json({ error: "not_found" }, { status: 404, headers: NO_STORE }) };
  return guard;
}

/** Üretim bağımlılıkları; bekçi yanıttan sonra (`after`) uyur ve çağrıyı kontrol eder. */
export function routeDeps(): RealtimeDeps {
  return defaultRealtimeDeps({ schedule: (task) => after(task) });
}

export function outcomeResponse<T>(outcome: Outcome<T>): NextResponse {
  return NextResponse.json(outcome.body, { status: outcome.status, headers: NO_STORE });
}

export async function readJson(request: Request): Promise<unknown> {
  return request.json().catch(() => null);
}
