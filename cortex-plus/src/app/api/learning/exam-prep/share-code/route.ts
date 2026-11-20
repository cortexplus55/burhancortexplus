import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { hashIp, requestIp } from "@/lib/abuse/record";
import { classShareWhatsappHref, shareCodeUrl } from "@/lib/learning/class-share";
import { createPrepInviteToken, prepInviteUrl } from "@/lib/learning/prep-invite";
import { isAbsoluteHttpUrl, prepInviteWhatsappHref } from "@/lib/learning/prep-share";
import { ensurePrepShareCode } from "@/lib/learning/prep-share-code";

/**
 * "📲 Sınıfla Paylaş" (Faz 7, 20 Kasım 2026): hazırlığın paylaşım kodunu açar (var olanı döndürür) ve mutlak
 * `/davet/<kod>` bağlantısını WhatsApp metniyle verir. Hazırlık yalnız sahibine (sunucu anahtarıyla, sahiplik
 * süzgeci); dakikada 10, günde 60 istek.
 *
 * Göç 20261120140000 henüz uygulanmadıysa (sütun yok) ya da kod yazılamadıysa bugünkü imzalı sınıf davetine düşülür
 * (`/hazirlik-davet/<belirteç>`, `mode: "invite"`): paylaşım çalışır, ders kopyası ve ödül yok.
 */

const bodySchema = z.object({ prepId: z.string().uuid() });

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "prep-share-code", limit: 10, dailyLimit: 60 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { prepId } = parsed.data;

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title, exam_type")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");
  const title = ((prep.title as string | null) ?? (prep.exam_type as string | null) ?? null) || null;

  const code = await ensurePrepShareCode(service, { prepId, userId, ipHash: hashIp(requestIp(request)) });
  if (code.ok) {
    const url = shareCodeUrl(code.code);
    return NextResponse.json({ mode: "clone", code: code.code, url, whatsappHref: classShareWhatsappHref(title, url) });
  }
  if (code.reason === "not_found") return errorResponse(404, "not_found");

  const token = createPrepInviteToken(prepId);
  const url = token ? prepInviteUrl(token) : null;
  if (!url || !isAbsoluteHttpUrl(url)) {
    return NextResponse.json(
      { error: "Paylaşım bağlantısı şu an hazırlanamadı. Biraz sonra yeniden dene.", code: "share_unavailable" },
      { status: 503 },
    );
  }
  return NextResponse.json({ mode: "invite", url, whatsappHref: prepInviteWhatsappHref(title, url) });
}
