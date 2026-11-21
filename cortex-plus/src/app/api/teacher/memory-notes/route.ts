import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";
import { TEACHER_V2_FLAG } from "@/lib/ai/teacher-v2";
import { deleteTutorNotes, listTutorNotes } from "@/lib/tutor/memory-notes";
import { forgetTutorContext } from "@/lib/tutor/student-context";

/**
 * "Öğretmenin seni nasıl tanıyor" (öğretmen v3, teacher.v2, 21 Kasım 2026): öğrencinin öğretmen notları. GET son 20
 * notu döndürür; DELETE gövdesi `{ id }` ile tek notu, `{ all: true }` ile hepsini siler. Yalnız öğrencinin kendi
 * satırları (`user_id` süzgeci). Model, kredi ve sayaç yok. Bayrak kapalıyken 404. Not tablosu yoksa boş liste / 200.
 * Silmeden sonra öğretmenin bağlam önbelleği düşer: bir sonraki tur silinen notu görmez.
 */
const NO_STORE = { "Cache-Control": "private, no-store" };

const deleteSchema = z.union([z.object({ id: z.string().uuid() }).strict(), z.object({ all: z.literal(true) }).strict()]);

export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "teacher-memory-notes", limit: 30 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const on = await isFeatureEnabled(service, TEACHER_V2_FLAG, userId).catch(() => false);
  if (!on) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const notes = await listTutorNotes(service, userId);
  if (!notes) return errorResponse(503, "notes_unavailable");
  return NextResponse.json({ notes }, { headers: NO_STORE });
}

export async function DELETE(request: Request) {
  const guard = await withUser(request, { scope: "teacher-memory-notes-delete", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const on = await isFeatureEnabled(service, TEACHER_V2_FLAG, userId).catch(() => false);
  if (!on) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const deleted = await deleteTutorNotes(service, userId, "all" in parsed.data ? { all: true } : { id: parsed.data.id });
  if (deleted == null) return errorResponse(503, "notes_unavailable");
  forgetTutorContext(userId);
  return NextResponse.json({ ok: true, deleted }, { headers: NO_STORE });
}
