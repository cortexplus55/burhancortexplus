import { NextResponse } from "next/server";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isPremiumUser } from "@/lib/ai/generate";
import { transcribeAudio } from "@/lib/ai/speech";

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
  if (!(await isPremiumUser(guard.ctx.service, guard.ctx.userId))) {
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

  return NextResponse.json({ text });
}
