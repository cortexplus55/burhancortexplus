import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/guards";
import { recordLessonTiming } from "@/lib/admin/beta-metrics";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  kind: z.string().min(1).max(32),
  /** "Ders oluştur" tıklaması → ilk ekranın çizilmesi, istemci saatiyle. */
  clickToScreenMs: z.number().min(0).max(600_000),
  /** Yalnız isteğin kendisi (fetch başlangıcı → yanıt). */
  requestMs: z.number().min(0).max(600_000).optional(),
  savedReopen: z.boolean().optional(),
  /** Düğüm açılışı (3 Kasım 2026): yoldaki tıklamadan ölçüldü mü, kayıt sunucu çiziminden mi geldi. */
  route: z.enum(["node_open"]).optional(),
  fromClick: z.boolean().optional(),
  ssrResume: z.boolean().optional(),
});

/** İstemci tarafı açılış süresi (3 Kasım 2026): sunucu satırıyla (stream_first/pool/prefetch_*) yan yana okunur. */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "lesson-timing", limit: 60, windowSeconds: 3_600 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  const body = parsed.data;
  await recordLessonTiming(service, {
    userId,
    kind: body.kind,
    path: "client",
    openMs: body.clickToScreenMs,
    firstScreenMs: body.clickToScreenMs,
    meta: {
      requestMs: body.requestMs ?? null,
      savedReopen: body.savedReopen ?? false,
      ...(body.route ? { route: body.route, fromClick: body.fromClick ?? false, ssrResume: body.ssrResume ?? false } : {}),
    },
  });
  return NextResponse.json({ ok: true });
}
