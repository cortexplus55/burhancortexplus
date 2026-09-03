import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";

const createSchema = z.object({
  title: z.string().min(1).max(120),
  eventDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  subject: z.string().max(60).optional(),
  note: z.string().max(400).optional(),
});

const deleteSchema = z.object({ id: z.string().uuid() });

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "calendar", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data, error } = await service
    .from("calendar_events")
    .insert({
      user_id: userId,
      title: parsed.data.title,
      event_date: parsed.data.eventDate,
      subject: parsed.data.subject ?? null,
      note: parsed.data.note ?? null,
    })
    .select("id, title, event_date, subject, note")
    .single();

  if (error || !data) return errorResponse(500, "create_failed");
  return NextResponse.json({ event: data });
}

export async function DELETE(request: Request) {
  const guard = await withUser(request, { scope: "calendar", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = deleteSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  // user_id koşulu, servis anahtarıyla çalışırken RLS'in yerini tutar.
  const { error } = await service
    .from("calendar_events")
    .delete()
    .eq("id", parsed.data.id)
    .eq("user_id", userId);

  if (error) return errorResponse(500, "delete_failed");
  return NextResponse.json({ ok: true });
}
