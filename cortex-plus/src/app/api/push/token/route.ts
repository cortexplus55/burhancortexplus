import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { missingRelation } from "@/lib/learning/missing-column";

/**
 * Mobil uygulamanın anlık bildirim cihaz anahtarı (26 Kasım 2026, Aşama 1).
 * - POST: öğrenci bildirim izni verince uygulama anahtarı yazar. Anahtar tek hesaba bağlıdır: aynı telefonda başka
 *   hesapla girilince satır yeni hesaba geçer.
 * - DELETE: öğrenci bildirimi kapatınca ya da çıkış yaparken (çıkış formu da siler: `/api/auth/signout`).
 * Yazma sunucu anahtarıyla; tablo henüz yoksa (göç uygulanmadan) `{ stored: false }` döner, uygulama akışı sürer.
 */

const tokenSchema = z.string().trim().min(16).max(4096).regex(/^[A-Za-z0-9:_\-.]+$/);
const postSchema = z.object({ token: tokenSchema, platform: z.enum(["ios", "android"]) });
const deleteSchema = z.object({ token: tokenSchema });

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "push-token", limit: 10, dailyLimit: 60 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = postSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { error } = await service
    .from("user_push_tokens")
    .upsert(
      { user_id: userId, token: parsed.data.token, platform: parsed.data.platform, updated_at: new Date().toISOString() },
      { onConflict: "token" },
    );
  if (error) {
    if (missingRelation(error)) return NextResponse.json({ ok: true, stored: false });
    console.error("push_token_save_failed", { error: error.message });
    return errorResponse(503, "save_failed");
  }
  return NextResponse.json({ ok: true, stored: true });
}

export async function DELETE(request: Request) {
  const guard = await withUser(request, { scope: "push-token", limit: 10, dailyLimit: 60 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { error } = await service.from("user_push_tokens").delete().eq("user_id", userId).eq("token", parsed.data.token);
  if (error && !missingRelation(error)) {
    console.error("push_token_delete_failed", { error: error.message });
    return errorResponse(503, "delete_failed");
  }
  return NextResponse.json({ ok: true });
}
