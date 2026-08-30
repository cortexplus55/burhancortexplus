import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { buildExamPlan, daysUntilExam } from "@/lib/learning/exam-prep-plan";

const bodySchema = z.object({
  messages: z
    .array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string().min(1).max(2000),
      }),
    )
    .min(1)
    .max(24),
  examDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

const draftSchema = z.object({
  reply: z.string().min(8).max(600),
  title: z.string().min(2).max(120),
  examType: z.string().min(2).max(40),
  topics: z.array(z.string().min(1).max(80)).max(16),
  needDate: z.boolean(),
  ready: z.boolean(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-intake", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const transcript = parsed.data.messages
    .map((message) => `${message.role === "user" ? "Öğrenci" : "Eğitmen"}: ${message.content}`)
    .join("\n");

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "STUDY_PLAN_GENERATE",
    isPremium: await isPremiumUser(service, userId),
    schemaHint:
      'JSON: {"reply":string,"title":string,"examType":string,"topics":string[],"needDate":boolean,"ready":boolean}. examType: LGS, TYT, AYT, TUS, Okul veya Serbest. Konular kısa başlık. ready true yalnızca en az 3 konu netse. needDate true konu listesi hazır ama tarih yoksa.',
    userPrompt: `Sınav hazırlığı sohbeti. Öğrencinin yazdıklarından sınavı ve konuları çıkar.
Tarih henüz yoksa konuları netleştirip tarihi iste.
${transcript}`,
    parse: (raw) => {
      const result = draftSchema.safeParse(raw);
      return result.success ? result.data : null;
    },
  });

  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  const draft = outcome.data;
  const examDate = parsed.data.examDate;
  const ready = Boolean(examDate) && draft.topics.length >= 1;
  const days = examDate ? daysUntilExam(examDate) : null;

  return NextResponse.json({
    ok: true,
    reply: examDate
      ? `${days} günlük yolunu hazırladım. Konuları kontrol et, planı başlat.`
      : draft.reply,
    draft: {
      title: draft.title,
      examType: draft.examType,
      topics: draft.topics,
    },
    needDate: !examDate && (draft.needDate || draft.topics.length >= 2),
    ready,
    days,
    preview: days ? buildExamPlan(days) : [],
  });
}
