import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { oralTeacherStyleLine } from "@/lib/learning/oral-exam-chrome";
import { TUTOR_ANSWER_DISCIPLINE } from "@/lib/learning/tutor-style";
import { loadTeacherBrief } from "@/lib/documents/teacher-analysis-run";
import { prepLanguage, teacherTurnGuidance, voiceReplySchemaHint } from "@/lib/learning/teacher-brain";

const bodySchema = z.object({
  prepId: z.string().uuid(),
  nodeId: z.string().uuid(),
  kind: z.enum(["qa", "oral"]),
  topicLabel: z.string().min(1).max(120),
  difficulty: z.enum(["kolay", "orta", "ileri"]).default("orta"),
  /** Sözlü kabuktaki öğretmen havası. Yoksa eski sohbet davranışı durur. */
  teacherStyle: z.enum(["strict", "helpful", "harsh"]).optional(),
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
    .select("id, title, exam_type, document_id, learning_preferences")
    .eq("id", parsed.data.prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const language = prepLanguage(prep.learning_preferences);
  const transcript = parsed.data.messages
    .map((m) =>
      language === "en"
        ? `${m.role === "user" ? "Student" : "Teacher"}: ${m.content}`
        : `${m.role === "user" ? "Öğrenci" : "Eğitmen"}: ${m.content}`,
    )
    .join("\n");

  const mode =
    language === "en"
      ? parsed.data.kind === "oral"
        ? "You are an oral-exam teacher. Ask a short question, listen, hint if needed, then move on. Four or five turns is enough."
        : "You are a private tutor. Explain one step, ask a question, and wait. Spoken language, two to four sentences."
      : parsed.data.kind === "oral"
        ? "Sözlü sınav eğitmenisin. Kısa soru sor, öğrencinin cevabını dinle, gerekirse ipucu ver, sonra sonraki soruya geç. 4-5 tur yeter."
        : "Özel ders öğretmenisin. Konuyu adım adım anlat, ara ara soru sor, cevabı bekle. Uzun paragraf yazma; konuşma dili, 2-4 cümle.";
  const style = parsed.data.teacherStyle
    ? oralTeacherStyleLine(parsed.data.teacherStyle)
    : "";

  const teacherBrief = await loadTeacherBrief(
    service,
    (prep.document_id as string | null) ?? null,
    parsed.data.topicLabel,
  );
  const lastStudent = [...parsed.data.messages].reverse().find((item) => item.role === "user");
  const lastTeacher = [...parsed.data.messages].reverse().find((item) => item.role === "assistant");

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "AI_CHAT_STANDARD",
    isPremium: await isPremiumUser(service, userId),
    schemaHint: voiceReplySchemaHint(language),
    userPrompt: `${TUTOR_ANSWER_DISCIPLINE}
${teacherTurnGuidance({
  message: lastStudent?.content ?? "",
  lastAssistant: lastTeacher?.content,
  language,
  hasSource: Boolean(teacherBrief.trim()),
})}
${mode}
${style}
Sınav: ${prep.title} (${prep.exam_type}). Konu: ${parsed.data.topicLabel}. Zorluk: ${parsed.data.difficulty}.
${teacherBrief}
${transcript || (language === "en" ? "The student has not spoken yet. Say hello and begin." : "Öğrenci henüz konuşmadı; sen merhaba deyip başla.")}`,
    parse: (raw) => replySchema.safeParse(raw).data ?? null,
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  return NextResponse.json({
    ok: true,
    reply: outcome.data.reply,
    done: Boolean(outcome.data.done),
  });
}
