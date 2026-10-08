import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { runWithTeacherModel } from "@/lib/learning/teacher-engine-run";
import { teacherOralLoop } from "@/lib/learning/teacher-practice";

const bodySchema = z.object({
  topic: z.string().min(3).max(300),
});

/**
 * Araçlar > Sözlü sınav (3 Ekim 2026): sınav hazırlığındaki öğretmen sözlü
 * motoru, belgesiz kipte — her soruyu kendisi cevaplayan denetim, sorunlu
 * sorunun düzeltilmesi ya da elenmesi. Eski şablon + kalıp denetimi kalktı.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "oral-generate", limit: 6 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsedBody = bodySchema.safeParse(await request.json());
  if (!parsedBody.success) return errorResponse(400, "invalid_input");
  const topic = parsedBody.data.topic.trim();

  const outcome = await runWithTeacherModel(service, {
    userId,
    actionCode: "AI_CHAT_STANDARD",
    idempotencyKey: `studio-oral:${userId}:${crypto.randomUUID()}`,
    label: "studio_oral",
    topic,
    work: async (ask, started) => {
      const loop = await teacherOralLoop(ask, { topicLabel: topic, prepTitle: topic, pages: [], mode: "topic", count: 5 }, started);
      const log = { kept: loop.items.length, rejected: loop.rejected.length, rounds: loop.rounds };
      return loop.items.length >= 3
        ? { ok: true as const, result: loop.items, log }
        : { ok: false as const, reasons: loop.rejected.slice(0, 4).map((row) => row.problems[0] ?? "sorun"), log };
    },
  });
  if (!outcome.ok) return errorResponse(outcome.status, outcome.error);

  return NextResponse.json({
    title: topic,
    questions: outcome.result.map((item) => ({ prompt: item.prompt, hint: item.hint ?? "" })),
  });
}
