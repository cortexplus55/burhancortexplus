import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/guards";

const patchSchema = z.object({
  conversationId: z.string().uuid(),
  title: z.string().min(1).max(120).optional(),
  deleted: z.boolean().optional(),
});

/** Rename or soft-delete a conversation. */
export async function PATCH(request: Request) {
  const guard = await withUser(request, {
    scope: "conversation-manage",
    limit: 40,
    dailyLimit: 200,
  });
  if (!guard.ok) return guard.response;
  const { supabase, userId } = guard.ctx;

  const parsed = patchSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { conversationId, title, deleted } = parsed.data;
  if (title == null && deleted == null) {
    return NextResponse.json({ error: "nothing_to_update" }, { status: 400 });
  }

  const patch: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (title != null) patch.title = title.trim();
  if (deleted === true) patch.deleted_at = new Date().toISOString();
  if (deleted === false) patch.deleted_at = null;

  const { error } = await supabase
    .from("conversations")
    .update(patch)
    .eq("id", conversationId)
    .eq("user_id", userId);

  if (error) {
    return NextResponse.json(
      { error: "İşlem sırasında bir sorun oluştu. Tekrar deneyebilirsin." },
      { status: 500 },
    );
  }

  return NextResponse.json({ ok: true });
}
