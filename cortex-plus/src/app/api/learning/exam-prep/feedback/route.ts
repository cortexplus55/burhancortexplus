import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { generateJson, isPremiumUser } from "@/lib/ai/generate";
import { PLAN_NODE_META, type PlanNodeKind } from "@/lib/learning/exam-prep-plan";
import { normalizeQuizQuestion } from "@/lib/learning/exam-quiz";

const bodySchema = z.object({
  prepId: z.string().uuid(),
  nodeId: z.string().uuid(),
});

const feedbackSchema = z.object({
  headline: z.string().min(4).max(80),
  note: z.string().min(20).max(500),
  gaps: z.array(z.string().min(2)).max(5),
  nextFocus: z.array(z.string().min(2)).max(4),
});

export type InstructorFeedback = z.infer<typeof feedbackSchema>;

function missSummary(payload: unknown, answers: Record<string, unknown>) {
  const data = (payload ?? {}) as Record<string, unknown>;
  if (data.type === "quiz") {
    const questions = ((data.questions as Parameters<typeof normalizeQuizQuestion>[0][]) ?? [])
      .map(normalizeQuizQuestion)
      .filter((question) => question !== null);
    return questions
      .filter((question, index) => {
        const raw = answers[String(index)];
        const selected = Array.isArray(raw)
          ? raw.map(String)
          : raw == null || raw === ""
            ? []
            : [String(raw)];
        const a = [...selected].sort().join("|");
        const b = [...question.correct].sort().join("|");
        return a !== b;
      })
      .map((question) => question.text)
      .slice(0, 5);
  }
  if (data.type === "true_false") {
    const items = (data.items as { text: string; correct: boolean }[]) ?? [];
    return items
      .filter((item, index) => {
        const value = answers[String(index)];
        return value !== item.correct && value !== String(item.correct);
      })
      .map((item) => item.text)
      .slice(0, 5);
  }
  return [];
}

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-feedback", limit: 12 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = bodySchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { prepId, nodeId } = parsed.data;

  const { data: prep } = await service
    .from("exam_preps")
    .select("id, title, exam_type, active_topic_id")
    .eq("id", prepId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!prep) return errorResponse(404, "not_found");

  const { data: node } = await service
    .from("exam_prep_nodes")
    .select("id, kind, title")
    .eq("id", nodeId)
    .eq("exam_prep_id", prepId)
    .maybeSingle();
  if (!node) return errorResponse(404, "not_found");

  const { data: attempt } = await service
    .from("exam_prep_node_attempts")
    .select("id, payload, answers, score, total, feedback")
    .eq("node_id", nodeId)
    .eq("user_id", userId)
    .eq("status", "completed")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!attempt) return errorResponse(404, "not_found");

  const cached = feedbackSchema.safeParse(attempt.feedback).data;
  if (cached) return NextResponse.json({ ok: true, feedback: cached });

  const { data: topic } = prep.active_topic_id
    ? await service
        .from("exam_prep_topics")
        .select("label")
        .eq("id", prep.active_topic_id)
        .maybeSingle()
    : { data: null };

  const kind = node.kind as PlanNodeKind;
  const misses = missSummary(
    attempt.payload,
    (attempt.answers as Record<string, unknown> | null) ?? {},
  );
  const meta = PLAN_NODE_META[kind];

  const outcome = await generateJson({
    service,
    userId,
    actionCode: "AI_CHAT_STANDARD",
    isPremium: await isPremiumUser(service, userId),
    schemaHint:
      'JSON: {"headline":string,"note":string,"gaps":string[],"nextFocus":string[]}. headline kısa. note 2-4 cümle, konuşma dili Türkçe. gaps yanlış/eksik noktalar. nextFocus somut sonraki adımlar.',
    userPrompt: `Sınav hazırlığı eğitmen notu yaz.
Sınav: ${prep.title} (${prep.exam_type}).
Konu: ${topic?.label ?? prep.title}.
Ders: ${meta?.setupLabel ?? node.title} (${kind}).
Skor: ${attempt.score ?? 0}/${attempt.total ?? 1}.
${
  misses.length
    ? `Kaçırılan sorular: ${misses.join(" | ")}`
    : "Kaçırılan soru yok. gaps dizisini boş bırak."
}
Öğrenciye cesaret ver ama şişirme. Kısa tut.`,
    parse: (raw) => feedbackSchema.safeParse(raw).data ?? null,
  });
  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  await service
    .from("exam_prep_node_attempts")
    .update({ feedback: outcome.data })
    .eq("id", attempt.id);

  return NextResponse.json({ ok: true, feedback: outcome.data });
}
