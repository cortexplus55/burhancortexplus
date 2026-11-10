import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { teacherPersona } from "@/lib/learning/teacher-brain";
import { SOURCE_NUMBER_PRIORITY } from "@/lib/learning/teaching-rubric";
import { REEXPLAIN_REPLY_MAX, REEXPLAIN_TEXT_MAX, reexplainUserPrompt } from "@/lib/learning/step-reexplain";
import { studentOutputText } from "@/lib/learning/student-output-firewall";

const bodySchema = z.object({
  prepId: z.string().uuid(),
  nodeId: z.string().uuid(),
  heading: z.string().min(1).max(240),
  text: z.string().min(20).max(REEXPLAIN_TEXT_MAX * 2),
  previous: z.array(z.string().min(1).max(REEXPLAIN_REPLY_MAX)).max(4).optional(),
});

const replySchema = z.object({
  reply: z.string().min(20).max(REEXPLAIN_REPLY_MAX),
});

/**
 * Ders adımını farklı anlat (10 Kasım 2026). Ders içi yardım: eğitmenle aynı ücret ve aynı ücretsiz sayaç
 * ("derse dahil"). Adım öğrencinin kendi dersinden gelir; hazırlık ve adım sahipliği doğrulanır.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-reexplain", limit: 12 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title")
    .eq("id", parsed.data.prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const { data: node } = await service
    .from("exam_prep_nodes")
    .select("id, session_meta")
    .eq("id", parsed.data.nodeId)
    .eq("exam_prep_id", parsed.data.prepId)
    .maybeSingle();
  if (!node) return errorResponse(404, "not_found");
  const topicTitle = (node.session_meta as { topicTitle?: unknown } | null)?.topicTitle;
  const topicLabel = typeof topicTitle === "string" && topicTitle.trim() ? topicTitle.trim() : String(prep.title);

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "AI_CHAT_STANDARD",
    // Ders içi yardım: ücretsizde derse dahil (24 Ekim 2026).
    freeMeter: "included",
    isPremium: await isPremiumUser(service, userId),
    schemaHint: 'JSON: {"reply":string}. Türkçe; 4-8 cümle, son satır "Kısaca:" ile başlar.',
    // Adımın sayıları notun sayılarıdır: yazar ve denetçi "düzeltmesin".
    systemAddendum: SOURCE_NUMBER_PRIORITY,
    reviewerAddendum: SOURCE_NUMBER_PRIORITY,
    userPrompt: `${teacherPersona()}\n${reexplainUserPrompt({
      prepTitle: String(prep.title),
      topicLabel,
      heading: parsed.data.heading,
      text: parsed.data.text,
      previous: parsed.data.previous,
    })}`,
    parse: (raw) => replySchema.safeParse(raw).data ?? null,
  });
  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  return NextResponse.json({ ok: true, reply: studentOutputText(outcome.data.reply) });
}
