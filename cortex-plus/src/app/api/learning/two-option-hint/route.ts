import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/guards";
import { answerKey } from "@/lib/learning/exam-quiz";
import { TWO_OPTION_FALLBACK } from "@/lib/learning/twin-question-copy";
import { loadAttemptQuizQuestion, writeTwoOptionHint } from "@/lib/learning/twin-question-run";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

const bodySchema = z.object({
  attemptId: z.string().uuid(),
  index: z.number().int().min(0).max(200),
  options: z.tuple([z.string().min(1).max(600), z.string().min(1).max(600)]),
});

/**
 * "🤔 İki şık arasında kaldım" (31 Ekim 2026, Paket J3 #12): cevap kilitlenmeden önce, iki şık arasındaki kavramsal
 * farkı hatırlatan tek cümle. Cevabı söylemez (kod ele veren cümleyi geri çevirir, yerine sabit yönlendirme). Ekran
 * soruyu ipuçlu sayar. Kredi düşmez; saatte 30, günde 120.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "two-option-hint", limit: 30, windowSeconds: 3_600, dailyLimit: 120 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "İstek okunamadı." }, { status: 400 });
  const { attemptId, index } = parsed.data;
  const question = await loadAttemptQuizQuestion(service, { userId, attemptId, index });
  if (!question) return NextResponse.json({ error: "Bu soru bulunamadı." }, { status: 404 });
  // Şıklar sorunun kendi şıklarından olmalı (tarayıcı metni yalnız seçimi taşır).
  const pick = (value: string) => question.options.find((option) => answerKey(option) === answerKey(value)) ?? null;
  const a = pick(parsed.data.options[0]);
  const b = pick(parsed.data.options[1]);
  if (!a || !b || a === b) return NextResponse.json({ error: "İki farklı şık seç." }, { status: 400 });
  const hint = await writeTwoOptionHint(service, userId, question, [a, b]);
  console.info("two_option_hint", JSON.stringify({ fallback: !hint }));
  return NextResponse.json({ ok: true, hint: hint ?? TWO_OPTION_FALLBACK, fallback: !hint });
}
