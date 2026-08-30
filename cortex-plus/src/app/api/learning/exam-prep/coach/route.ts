import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";

const bodySchema = z.object({
  prepId: z.string().uuid(),
  nodeId: z.string().uuid(),
  itemText: z.string().min(1).max(600),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .max(12),
});

const replySchema = z.object({
  reply: z.string().min(8).max(800),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-coach", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title, exam_type, active_topic_id")
    .eq("id", parsed.data.prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const { data: node } = await service
    .from("exam_prep_nodes")
    .select("id")
    .eq("id", parsed.data.nodeId)
    .eq("exam_prep_id", parsed.data.prepId)
    .maybeSingle();
  if (!node) return errorResponse(404, "not_found");

  const { data: topic } = prep.active_topic_id
    ? await service
        .from("exam_prep_topics")
        .select("label")
        .eq("id", prep.active_topic_id)
        .maybeSingle()
    : { data: null };

  const transcript = parsed.data.messages
    .map((m) => `${m.role === "user" ? "Öğrenci" : "Eğitmen"}: ${m.content}`)
    .join("\n");

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "AI_CHAT_STANDARD",
    isPremium: await isPremiumUser(service, userId),
    schemaHint: 'JSON: {"reply":string}. Kısa Türkçe, 3-6 cümle.',
    userPrompt: `Öğrenci dersin içinde takıldı. Doğru şıkkı açıkça söyleme; kavramı anlat, ipucu ver, kendi bulmasına yardım et.
Sınav: ${prep.title} (${prep.exam_type}). Konu: ${topic?.label ?? prep.title}.
Üzerindeki madde: ${parsed.data.itemText}
${transcript}`,
    parse: (raw) => replySchema.safeParse(raw).data ?? null,
  });
  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  return NextResponse.json({ ok: true, reply: outcome.data.reply });
}
