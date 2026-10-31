import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/guards";
import { env } from "@/lib/env";
import { createHash } from "node:crypto";
import { redisPipeline } from "@/lib/rate-limit";
import { awardStars } from "@/lib/stars/award";
import { sameOptionSet, selectedOptions } from "@/lib/learning/exam-quiz";
import { openTwin, sealTwin } from "@/lib/learning/twin-question";
import { TWIN_RIGHT, TWIN_RIGHT_AGAIN, TWIN_STARS, TWIN_UNAVAILABLE, TWIN_WRONG } from "@/lib/learning/twin-question-copy";
import { loadAttemptQuizQuestion, writeTwinQuestion } from "@/lib/learning/twin-question-run";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const bodySchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("create"), attemptId: z.string().uuid(), index: z.number().int().min(0).max(200) }),
  z.object({
    action: z.literal("answer"),
    token: z.string().min(20).max(4000),
    answer: z.union([z.string().max(600), z.array(z.string().max(600)).max(8)]),
  }),
]);

function secret() {
  return env.APP_SECRET || env.SUPABASE_SECRET_KEY || null;
}

/**
 * İkiz soru (31 Ekim 2026, Paket J3 #12). "create": yoldaki testin yanlış yapılan sorusundan tek kardeş soru; cevap
 * anahtarı şifreli belirteçte, tarayıcıda okunmaz. "answer": cevap sunucuda notlanır; doğruysa +5 yıldız, aynı test
 * sorusunun ikizi için bir kez (yıldız kaydı `twin:<deneme>:<soru>` anahtarıyla tekil). Kredi düşmez. Saatte 20 ikiz.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "twin-question", limit: 20, windowSeconds: 3_600, dailyLimit: 80 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const key = secret();
  if (!key) return NextResponse.json({ error: TWIN_UNAVAILABLE }, { status: 503 });

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "İstek okunamadı." }, { status: 400 });

  if (parsed.data.action === "create") {
    const { attemptId, index } = parsed.data;
    const original = await loadAttemptQuizQuestion(service, { userId, attemptId, index });
    if (!original) return NextResponse.json({ error: "Bu soru bulunamadı." }, { status: 404 });
    const twin = await writeTwinQuestion(service, userId, original);
    if (!twin) return NextResponse.json({ error: TWIN_UNAVAILABLE }, { status: 503 });
    console.info("twin_question", JSON.stringify({ stage: "create", multi: twin.multi }));
    return NextResponse.json({
      ok: true,
      question: { text: twin.text, options: twin.options, multi: twin.multi },
      token: sealTwin({ attemptId, index, correct: twin.correct, explanation: twin.explanation }, key),
    });
  }

  const seal = openTwin(parsed.data.token, key);
  if (!seal) return NextResponse.json({ error: "İkiz sorunun süresi doldu; yeniden aç." }, { status: 410 });
  // Belirteç başkasının denemesinden kopyalanmasın: deneme bu öğrencinin olmalı.
  const { data: owner } = await service.from("exam_prep_node_attempts").select("user_id").eq("id", seal.a).maybeSingle();
  if (!owner || owner.user_id !== userId) return NextResponse.json({ error: "Bu soru bulunamadı." }, { status: 404 });
  // Tek cevap: aynı belirteçle şık şık denenip yıldız alınmasın. Redis yoksa geçer (yıldız zaten soru başına bir kez).
  const used = await redisPipeline([
    ["SET", `twin-used:${createHash("sha256").update(parsed.data.token).digest("hex").slice(0, 32)}`, "1", "NX", "PX", "21600000"],
  ]).catch(() => null);
  const firstAnswer = !used || used[0] === "OK";
  const correct = sameOptionSet(selectedOptions(parsed.data.answer), seal.c);
  let stars = 0;
  if (correct && firstAnswer) stars = await awardStars(service, { userId, source: "prep", ref: `twin:${seal.a}:${seal.i}`, amount: TWIN_STARS });
  console.info("twin_question", JSON.stringify({ stage: "answer", correct, stars }));
  return NextResponse.json({
    ok: true,
    correct,
    correctOptions: seal.c,
    explanation: seal.x ?? null,
    stars,
    message: correct ? (stars > 0 ? TWIN_RIGHT : TWIN_RIGHT_AGAIN) : TWIN_WRONG,
  });
}
