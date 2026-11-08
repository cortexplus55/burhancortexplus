import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { MOOD_OPTIONS, parseMood } from "@/lib/learning/session-signals";
import { saveTodayMood } from "@/lib/companion/today-mood";

export const dynamic = "force-dynamic";

/**
 * Bugünkü ruh hali (8 Kasım 2026): sohbetteki hap buraya yazar; ders açılışı ve ana ekran aynı günün kaydını okur,
 * ders bir daha sormaz. Günde en çok 20 değişiklik.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "student-mood", limit: 20 });
  if (!guard.ok) return guard.response;
  const body = (await request.json().catch(() => null)) as { mood?: unknown } | null;
  if (!body || !MOOD_OPTIONS.some((option) => option.id === body.mood)) {
    return NextResponse.json({ ok: false, error: "Ruh hali okunamadı." }, { status: 400 });
  }
  const ok = await saveTodayMood(guard.ctx.service, guard.ctx.userId, parseMood(body.mood));
  return NextResponse.json({ ok });
}
