import { NextResponse } from "next/server";
import { z } from "zod";
import { guestLimit } from "@/lib/api/guards";
import raw from "@/lib/demo/lesson.json";
import { DEMO_REPORT_TARGET_ID, demoQuestionByRef, type DemoQuiz } from "@/lib/demo/demo-quiz";
import { REPORT_DEMO_THANKS, REPORT_REASONS, REPORT_UNAVAILABLE } from "@/lib/learning/question-report/copy";
import { createClient, createServiceClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  questionRef: z.string().min(1).max(16),
  reason: z.enum(REPORT_REASONS.map((item) => item.id) as ["key", "stem", "render"]),
  note: z.string().max(400).optional().nullable(),
});

/**
 * Tanıtım turunda "🚩 Soruda Hata Bildir" (Faz 5 §3.1, 19 Kasım 2026). Ziyaretçi misafir olabilir; bildirim
 * `question_reports` tablosuna `source = 'demo'` ile yazılır (oturum varsa hesabıyla). Soru sunucudaki sabit veriden
 * okunur, tarayıcının gönderdiği metne güvenilmez. Model çağrısı ve ödül yok: ekip yönetim panelinde inceler.
 * IP başına saatte 6, günde 10 bildirim (20 Kasım 2026, Faz 5 denetimi: yalnız saatlik sınır vardı, gün boyu sınırsız
 * yazılabiliyordu).
 */
const GUEST_REPORT_DAILY_LIMIT = 10;

export async function POST(request: Request) {
  const limited =
    (await guestLimit(request, { scope: "question-report-demo", limit: 6, windowSeconds: 3_600 })) ??
    (await guestLimit(request, { scope: "question-report-demo-day", limit: GUEST_REPORT_DAILY_LIMIT, windowSeconds: 86_400 }));
  if (limited) return limited;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Bildirim okunamadı." }, { status: 400 });
  const question = demoQuestionByRef((raw as { quiz: DemoQuiz[] }).quiz, parsed.data.questionRef);
  if (!question) return NextResponse.json({ error: "Bu soru bulunamadı." }, { status: 404 });

  let userId: string | null = null;
  try {
    const supabase = await createClient();
    const { data } = await supabase.auth.getUser();
    userId = data.user?.id ?? null;
  } catch {
    userId = null;
  }

  const service = createServiceClient();
  const { error } = await service.from("question_reports").insert({
    user_id: userId,
    source: "demo",
    target_id: DEMO_REPORT_TARGET_ID,
    question_ref: parsed.data.questionRef,
    reason: parsed.data.reason,
    note: parsed.data.note?.replace(/\s+/g, " ").trim() || null,
    question_snapshot: {
      type: "choice",
      text: question.text,
      options: question.options,
      correct: [question.options[question.correct]],
      multi: false,
      explanation: question.explanation,
    },
  });
  if (error?.code === "23505") {
    return NextResponse.json({ ok: true, verdict: "duplicate", message: REPORT_DEMO_THANKS, rewarded: false });
  }
  if (error) {
    console.warn("question_report_demo_insert_failed", error.message);
    return NextResponse.json({ error: REPORT_UNAVAILABLE }, { status: 503 });
  }
  console.info("question_report", JSON.stringify({ source: "demo", reason: parsed.data.reason, guest: !userId }));
  return NextResponse.json({ ok: true, verdict: "pending", message: REPORT_DEMO_THANKS, rewarded: false });
}
