import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { markPodcastReady, readPodcastStatus, validPodcastStatusId } from "@/lib/learning/podcast-status";

/**
 * Podcast üretim durumu (19 Kasım 2026, Faz 1-A §4.2): istemci üretim sürerken 2,5 sn'de bir okur ve adımları
 * gösterir. Yalnız öğrencinin kendi satırı; satır yoksa `status: null` (göç uygulanmadan ya da istek henüz yazmadan).
 */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-podcast-status", limit: 40 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const id = new URL(request.url).searchParams.get("id");
  if (!validPodcastStatusId(id)) return errorResponse(400, "invalid_input");

  const row = await readPodcastStatus(service, userId, id);
  return NextResponse.json(
    { ok: true, status: row?.status ?? null, errorCode: row?.errorCode ?? null },
    { headers: { "Cache-Control": "no-store" } },
  );
}

const readySchema = z.object({ id: z.string().uuid() });

/** Oynatıcı ilk bölümün sesini çalmaya hazır: son adım (ready). Model çağrısı ve kredi yok. */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "exam-prep-podcast-status", limit: 40 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = readySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const updated = await markPodcastReady(service, userId, parsed.data.id);
  return NextResponse.json({ ok: true, updated });
}
