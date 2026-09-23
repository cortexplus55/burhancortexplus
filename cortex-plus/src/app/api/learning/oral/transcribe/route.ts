import { NextResponse } from "next/server";
import { errorResponse, withUser } from "@/lib/api/guards";
import { getUserEntitlements, requireFeature } from "@/lib/billing/entitlements";
import { transcribeAudio } from "@/lib/ai/speech";
import { env } from "@/lib/env";
import { recordUsage } from "@/lib/credits/service";

/**
 * Sözlü sınavda öğrencinin sesini metne çevirir.
 *
 * Kayıt saklanmıyor: çözümlenip atılıyor, hiçbir kovaya ve hiçbir tabloya
 * yazılmıyor. Ses kaydı öğrencinin en kişisel verisi; tutmamak için bir
 * sebebimiz yok, tutmak için de.
 *
 * Çözümleme düğümün bedeline dahil — her cevap ayrıca kredi yakmıyor.
 */

const MAX_BYTES = 12 * 1024 * 1024;
const ALLOWED = ["audio/webm", "audio/ogg", "audio/mp4", "audio/mpeg", "audio/wav"];

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "oral-stt", limit: 60 });
  if (!guard.ok) return guard.response;

  // Sunucu sesi premium. Ucretsiz kullanici tarayici sesiyle devam ediyor.
  const entitlements = await getUserEntitlements(guard.ctx.service, guard.ctx.userId);
  if (!requireFeature(entitlements, "oral_transcribe")) {
    return errorResponse(402, "premium_required");
  }

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return errorResponse(400, "invalid_input");
  }

  const file = form.get("audio");
  if (!(file instanceof File)) return errorResponse(400, "invalid_input");
  if (file.size === 0 || file.size > MAX_BYTES) {
    return errorResponse(400, "invalid_input");
  }

  const type = file.type.split(";")[0]?.trim().toLowerCase() ?? "";
  if (type && !ALLOWED.includes(type)) return errorResponse(400, "invalid_input");

  const text = await transcribeAudio(file);
  if (!text) return errorResponse(503, "transcribe_unavailable");

  /*
    Cozumlemenin bedeli krediden dusmuyor ama bize para ediyor; bugune kadar
    hicbir yere yazilmiyordu. Fatura sesin suresiyle olculuyor, sunucuda
    sureyi cozmeden bilmiyoruz: yuklenen kilobayt sabit bit hizinda sureyle
    dogru orantili oldugu icin fatura birimi olarak o yaziliyor. Cikti da
    gercek: donen metnin karakter sayisi.
  */
  void recordUsage(guard.ctx.service, {
    userId: guard.ctx.userId,
    actionCode: "STT_TRANSCRIBE",
    model: env.OPENAI_STT_MODEL,
    tokensIn: Math.ceil(file.size / 1024),
    tokensOut: text.length,
  });

  return NextResponse.json({ text });
}
