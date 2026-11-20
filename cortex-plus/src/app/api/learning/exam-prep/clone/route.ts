import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { requestIp } from "@/lib/abuse/record";
import { FREE_PREP_LIMIT_CODE, FREE_PREP_LIMIT_MESSAGE } from "@/lib/billing/free-tier-copy";
import { gateFromRefusal } from "@/lib/entitlements/gate";
import { cloneSharedPrepForUser } from "@/lib/learning/viral-clone";

/**
 * Paylaşılan çalışma yolunu hesabıma klonla (Faz 7, 20 Kasım 2026). Model ve kredi yok; kopya kayıtlardan kurulur
 * (`cloneSharedPrepForUser`). Aynı kişi ikinci kez isterse eski kopyası açılır; sahibi kendi hazırlığına gider.
 * Ücretsiz hesapta tek hazırlık kuralı geçerli: 402 ve yükseltme kapısı (sessizce düşmez). Dakikada 10, günde 40.
 */

const bodySchema = z.object({ shareCode: z.string().min(4).max(40) });

const CLONE_ERRORS = {
  invalid: { status: 400, error: "Bu paylaşım bağlantısı geçersiz. Arkadaşından yeni bir bağlantı iste." },
  not_found: { status: 404, error: "Bu çalışma yolu artık paylaşılmıyor. Arkadaşından yeni bir bağlantı iste." },
  unavailable: { status: 503, error: "Paylaşılan yollar şu an açılamıyor. Biraz sonra yeniden dene." },
  save_failed: { status: 500, error: "Kopya bu sefer kurulamadı. Yeniden dene." },
} as const;

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "prep-clone", limit: 10, dailyLimit: 40 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const result = await cloneSharedPrepForUser(service, { shareCode: parsed.data.shareCode, userId, ip: requestIp(request) });
  if (result.ok) return NextResponse.json({ id: result.id, status: result.status, lessonCopied: result.lessonCopied });
  if (result.reason === "free_prep_limit") {
    return NextResponse.json(
      { error: FREE_PREP_LIMIT_MESSAGE, code: FREE_PREP_LIMIT_CODE, gate: gateFromRefusal(FREE_PREP_LIMIT_CODE) },
      { status: 402 },
    );
  }
  const { status, error } = CLONE_ERRORS[result.reason];
  return NextResponse.json({ error, code: `clone_${result.reason}` }, { status });
}
