import { NextResponse } from "next/server";
import { errorResponse, withUser } from "@/lib/api/guards";
import { missingRelation } from "@/lib/learning/missing-column";

/**
 * Öğrencinin düello engelleri (26 Kasım 2026, mobil 1. adım). GET: liste (ad, tarih); DELETE `?id=`: engeli kaldırır.
 * Yalnız öğrencinin kendi satırları (sunucu anahtarı + `blocker_id` süzgeci). Tablo yoksa boş liste.
 */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "duel-blocks-read", limit: 20 });
  if (!guard.ok) return guard.response;
  const { service, userId } = guard.ctx;
  const { data, error } = await service
    .from("duel_blocks")
    .select("id, blocked_name, created_at")
    .eq("blocker_id", userId)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) {
    if (missingRelation(error)) return NextResponse.json({ blocks: [] });
    return errorResponse(500, "load_failed");
  }
  return NextResponse.json({
    blocks: (data ?? []).map((row) => ({ id: row.id as string, name: row.blocked_name as string, createdAt: row.created_at as string })),
  });
}

export async function DELETE(request: Request) {
  const guard = await withUser(request, { scope: "duel-blocks-write", limit: 20 });
  if (!guard.ok) return guard.response;
  const { service, userId } = guard.ctx;
  const id = new URL(request.url).searchParams.get("id") ?? "";
  if (!/^[0-9a-f-]{36}$/i.test(id)) return errorResponse(400, "invalid_input");
  const { error } = await service.from("duel_blocks").delete().eq("id", id).eq("blocker_id", userId);
  if (error && !missingRelation(error)) return errorResponse(500, "save_failed");
  return NextResponse.json({ ok: true });
}
