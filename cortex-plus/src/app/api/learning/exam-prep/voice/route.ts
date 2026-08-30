import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";

const bodySchema = z.object({
  prepId: z.string().uuid(),
  nodeId: z.string().uuid(),
  kind: z.enum(["qa", "oral"]),
  topicLabel: z.string().min(1).max(120),
  difficulty: z.enum(["kolay", "orta", "ileri"]).default("orta"),
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .max(20),
});

const replySchema = z.object({
  reply: z.string().min(8).max(700),
  done: z.boolean().optional(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-voice", limit: 24 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title, exam_type")
    .eq("id", parsed.data.prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const transcript = parsed.data.messages
    .map((m) => `${m.role === "user" ? "Öğrenci" : "Eğitmen"}: ${m.content}`)
    .join("\n");

  const mode =
    parsed.data.kind === "oral"
      ? "Sözlü sınav eğitmenisin. Kısa soru sor, öğrencinin cevabını dinle, gerekirse ipucu ver, sonra sonraki soruya geç. 4-5 tur yeter."
      : "Özel ders öğretmenisin. Konuyu adım adım anlat, ara ara soru sor, cevabı bekle. Uzun paragraf yazma; konuşma dili, 2-4 cümle.";

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "AI_CHAT_STANDARD",
    isPremium: await isPremiumUser(service, userId),
    schemaHint:
      'JSON: {"reply":string,"done":boolean}. reply sesli okunacak, kısa Türkçe. done true yalnızca oturum doğal bittiyse.',
    userPrompt: `${mode}
Sınav: ${prep.title} (${prep.exam_type}). Konu: ${parsed.data.topicLabel}. Zorluk: ${parsed.data.difficulty}.
${transcript || "Öğrenci henüz konuşmadı; sen merhaba deyip başla."}`,
    parse: (raw) => replySchema.safeParse(raw).data ?? null,
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  return NextResponse.json({
    ok: true,
    reply: outcome.data.reply,
    done: Boolean(outcome.data.done),
  });
}
