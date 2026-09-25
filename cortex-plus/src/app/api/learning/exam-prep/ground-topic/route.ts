import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { groundPrepTopics } from "@/lib/learning/ground-prep-topics";
import { PREP_SOURCE_DOCUMENT_CAP } from "@/lib/learning/prep-topic-list";

const bodySchema = z.object({
  documentIds: z.array(z.string().uuid()).min(1).max(PREP_SOURCE_DOCUMENT_CAP),
  title: z.string().min(1).max(120),
});

/**
 * Konu başlığını belgenin metnine ve konu adlarına vurur.
 * Model çağrısı yok; hazır analiz de yeniden üretilmez.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-ground-topic", limit: 40 });
  if (!guard.ok) return guard.response;

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const grounded = await groundPrepTopics(
    guard.ctx.service,
    guard.ctx.userId,
    parsed.data.documentIds,
    [parsed.data.title],
  );
  if (!grounded.ok) {
    return NextResponse.json({ error: grounded.message }, { status: 400 });
  }

  const match = grounded.matches[0];
  return NextResponse.json({
    ok: true,
    pageNumbers: match?.pageNumbers ?? [],
    linkedTitle: match?.linkedTitle ?? null,
  });
}
