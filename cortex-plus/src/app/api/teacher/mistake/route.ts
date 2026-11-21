import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";
import { TEACHER_V2_FLAG } from "@/lib/ai/teacher-v2";
import { saveChatMistake } from "@/lib/teacher/chat-mistake";
import { forgetTutorContext } from "@/lib/tutor/student-context";

const bodySchema = z.object({
  conversationId: z.string().uuid(),
  messageId: z.string().uuid(),
});

/**
 * "📝 Bunu Yanlışlar Defterime ekle" (Faz 11, teacher.v2): öğretmen yanıtı ve öncesindeki öğrenci sorusu deftere düşer.
 * Oturum zorunlu; konuşma ve mesajın sahibi sunucuda denetlenir; aynı mesaj ikinci kez eklenmez. Model ve kredi yok.
 * Bayrak kapalıyken 404. Dakikada en çok 10 istek.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "teacher-mistake", limit: 10 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const on = await isFeatureEnabled(service, TEACHER_V2_FLAG, userId).catch(() => false);
  if (!on) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const result = await saveChatMistake(service, userId, parsed.data);
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: result.status });
  // Öğretmenin bağlamı bir sonraki turda yeni kaydı görsün.
  if (!result.already) forgetTutorContext(userId);
  return NextResponse.json(
    { ok: true, already: result.already, entryId: result.entryId, quizHref: result.quizHref },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
