import { NextResponse } from "next/server";
import { openaiClient } from "@/lib/ai/openai-client";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { contentModel } from "@/lib/ai/model-router";
import { recordUsage } from "@/lib/credits/service";
import { env } from "@/lib/env";
import { parseModelJson } from "@/lib/learning/teaching-standards";
import {
  PAPER_MAX_PHOTOS,
  PAPER_READ_SYSTEM,
  paperAnswers,
  paperReadUserPrompt,
  parsePaperRead,
  type PaperQuestion,
} from "@/lib/learning/paper-exam";

export const maxDuration = 120;

/** Sıkıştırılmış JPEG/PNG/WebP veri adresi; 10 fotoğraf Vercel'in 4,5 MB gövde sınırının altında kalsın. */
const photo = z
  .string()
  .max(900_000)
  .regex(/^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/);

const bodySchema = z.object({
  examId: z.string().uuid(),
  photos: z.array(photo).min(1).max(PAPER_MAX_PHOTOS),
});

/**
 * Kâğıtta çözülen denemenin fotoğraflarını okur (17 Ekim 2026, Astra'daki gibi).
 * Yalnız cevapları okur ve uygulamadaki cevap biçimine çevirir; not yine
 * `/api/learning/exam/grade`'den çıkar. Değerlendirme denemenin ücretine dahil
 * (kurulum: "Değerlendirme dahildir"); kullanım kaydı yazılır, kredi düşmez.
 * Fotoğraflar saklanmaz.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-paper-read", limit: 6, dailyLimit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: exam } = await service
    .from("practice_exams")
    .select("id, user_id")
    .eq("id", parsed.data.examId)
    .maybeSingle();
  if (!exam || exam.user_id !== userId) return errorResponse(404, "not_found");

  const { data: rows } = await service
    .from("practice_exam_questions")
    .select("id, question_text, options, question_type")
    .eq("exam_id", parsed.data.examId)
    .order("sort_order");
  const questions: PaperQuestion[] = (rows ?? []).map((row) => ({
    id: row.id as string,
    text: String(row.question_text ?? ""),
    options: Array.isArray(row.options) ? (row.options as string[]) : [],
    question_type: String(row.question_type ?? "mcq"),
  }));
  if (!questions.length) return errorResponse(404, "not_found");

  const model = contentModel();
  try {
    const openai = openaiClient({ apiKey: env.OPENAI_API_KEY, timeout: 100_000, maxRetries: 0 });
    const response = await openai.chat.completions.create({
      model,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: PAPER_READ_SYSTEM },
        {
          role: "user",
          content: [
            { type: "text", text: paperReadUserPrompt(questions) },
            ...parsed.data.photos.map((url) => ({ type: "image_url" as const, image_url: { url, detail: "high" as const } })),
          ],
        },
      ],
    });
    await recordUsage(service, {
      userId,
      actionCode: "PRACTICE_EXAM_GRADE",
      model,
      tokensIn: response.usage?.prompt_tokens ?? 0,
      tokensOut: response.usage?.completion_tokens ?? 0,
    }).catch(() => undefined);
    const read = parsePaperRead(parseModelJson(response.choices[0]?.message?.content ?? ""));
    const { answers, unread } = paperAnswers(questions, read);
    return NextResponse.json({ answers, unread, total: questions.length });
  } catch (error) {
    console.error("paper_read_failed", {
      cause: error instanceof Error ? `${error.name}: ${error.message}`.slice(0, 200) : "unknown",
    });
    return errorResponse(503, "paper_read_failed");
  }
}
