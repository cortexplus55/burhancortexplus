import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import {
  FREE_PREP_LIMIT_CODE,
  FREE_PREP_LIMIT_MESSAGE,
  freePrepLimitReached,
} from "@/lib/billing/free-prep-limit";
import { copyInvitedPrep, findJoinedCopy, loadInviteSource } from "@/lib/learning/prep-invite-store";

/**
 * Sınıf davetiyle hazırlığa katıl (31 Ekim 2026, Paket J3 #14). Bağlantı imzalı; katılan öğrenci kendi kopyasını
 * alır (konu başlıkları ve sırası; ilerleme, cevap ve puan kopyalanmaz). Aynı kişi ikinci kez katılırsa eski kopyası
 * açılır. Ücretsiz hesapta tek hazırlık kuralı burada da geçerli (okul kopyası gibi).
 */

const bodySchema = z.object({ token: z.string().min(20).max(300) });

const INVITE_ERRORS = {
  invalid: { status: 400, error: "Bu davet bağlantısı geçersiz. Arkadaşından yeni bir bağlantı iste." },
  expired: { status: 410, error: "Bu davet bağlantısının süresi dolmuş. Arkadaşından yeni bir bağlantı iste." },
  unconfigured: { status: 503, error: "Davetler şu an açılamıyor. Biraz sonra yeniden dene." },
  not_found: { status: 404, error: "Bu hazırlık artık yok." },
} as const;

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "prep-invite-join", limit: 10, dailyLimit: 60 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const found = await loadInviteSource(service, parsed.data.token);
  if (!found.ok) {
    const { status, error } = INVITE_ERRORS[found.reason];
    return NextResponse.json({ error, code: `invite_${found.reason}` }, { status });
  }
  const { source } = found;
  if (source.userId === userId) return NextResponse.json({ id: source.id, owner: true });

  const existing = await findJoinedCopy(service, { sourceId: source.id, userId });
  if (existing) return NextResponse.json({ id: existing, alreadyJoined: true });

  if (await freePrepLimitReached(service, userId)) {
    return NextResponse.json({ error: FREE_PREP_LIMIT_MESSAGE, code: FREE_PREP_LIMIT_CODE }, { status: 402 });
  }

  const copy = await copyInvitedPrep(service, { source, userId });
  if (!copy.ok) return errorResponse(500, "save_failed");
  return NextResponse.json({ id: copy.id, topics: copy.topics });
}
