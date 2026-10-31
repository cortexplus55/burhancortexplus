import { NextResponse, after } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { createServiceClient } from "@/lib/supabase/server";
import {
  advancePendingMaterials,
  MAX_CHAIN_HOPS,
  requestPendingAdvance,
  verifyWindowChainToken,
  WINDOW_CHAIN_HEADER,
  type AdvanceResult,
} from "@/lib/learning/pending-windows";

/*
  Pencere işçisi (31 Ekim 2026, pending-windows.ts). Hazırlık sayfasındaki şerit dürter (öğrencinin oturumuyla, iş
  yanıtta biter) ya da işçi kendini sürdürür (imzalı iç istek, hemen 202 döner, iş arkada). Süre dolunca iş bitmediyse
  bir sonraki halka başlatılır; öğrenci sekmeyi kapatsa da kitap pencere pencere yola girer.
*/
export const maxDuration = 300;

const bodySchema = z.object({
  prepId: z.string().uuid(),
  /** Öğrenci "Hepsini şimdi oku" dedi: taranmış kitap da duraklamadan okunur. */
  eager: z.boolean().optional(),
  hop: z.number().int().min(0).max(MAX_CHAIN_HOPS + 1).optional(),
});

async function ownsPrep(service: ReturnType<typeof createServiceClient>, userId: string, prepId: string) {
  const { data, error } = await service.from("exam_preps").select("id").eq("id", prepId).eq("user_id", userId).maybeSingle();
  return !error && Boolean(data);
}

function continueIfNeeded(
  result: AdvanceResult,
  input: { origin: string; userId: string; prepId: string; hop: number; eager: boolean },
) {
  if (result.state !== "deadline") return;
  after(() => requestPendingAdvance({ ...input, hop: input.hop + 1 }));
}

export async function POST(request: Request) {
  const origin = new URL(request.url).origin;
  const chainHeader = request.headers.get(WINDOW_CHAIN_HEADER);
  if (chainHeader !== null) {
    const caller = verifyWindowChainToken(chainHeader);
    if (!caller) return errorResponse(401, "AUTH_REQUIRED");
    const parsed = bodySchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success || parsed.data.prepId !== caller.prepId) return errorResponse(400, "invalid_input");
    const hop = parsed.data.hop ?? 0;
    const eager = parsed.data.eager === true;
    after(async () => {
      const service = createServiceClient();
      const result = await advancePendingMaterials(service, { userId: caller.userId, prepId: caller.prepId, eager })
        .catch((error: unknown) => {
          console.error("pending_windows_failed", { cause: error instanceof Error ? error.message.slice(0, 160) : "unknown" });
          return null;
        });
      if (!result) return;
      console.info("pending_windows_round", { prepId: caller.prepId, hop, ...result });
      if (result.state === "deadline" && hop + 1 <= MAX_CHAIN_HOPS) {
        await requestPendingAdvance({ origin, userId: caller.userId, prepId: caller.prepId, hop: hop + 1, eager });
      }
    });
    return NextResponse.json({ ok: true, accepted: true }, { status: 202 });
  }

  const guard = await withUser(request, { scope: "exam-prep-pending-advance", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { prepId } = parsed.data;
  if (!(await ownsPrep(service, userId, prepId))) return errorResponse(404, "not_found");
  const eager = parsed.data.eager === true;
  const result = await advancePendingMaterials(service, { userId, prepId, eager });
  console.info("pending_windows_round", { prepId, hop: 0, ...result });
  continueIfNeeded(result, { origin, userId, prepId, hop: 0, eager });
  return NextResponse.json(result);
}
