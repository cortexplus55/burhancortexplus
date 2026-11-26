import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";
import { auditLog } from "@/lib/audit";
import {
  REPLY_REPORT_EXCERPT_MAX,
  REPLY_REPORT_REASON_IDS,
  replyReportMessage,
  replyReportSubject,
} from "@/lib/learning/reply-report";

export const dynamic = "force-dynamic";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const schema = z.object({
  /** Kayıtlı yanıtın kimliği; akış sırasındaki geçici kimlik (UUID değil) kaydedilmemiş yanıt sayılır. */
  messageId: z.string().max(80).nullish(),
  reason: z.enum(REPLY_REPORT_REASON_IDS),
  /** Kaydedilmemiş yanıtta ekrandaki metin; kayıtlı yanıtta metin sunucudan okunur. */
  excerpt: z.string().max(REPLY_REPORT_EXCERPT_MAX * 2).optional(),
  note: z.string().max(500).optional(),
});

/**
 * Öğretmen yanıtını bildir (26 Kasım 2026, Google Play yapay zekâ içerik politikası). Kayıtlı yanıtta metin öğrencinin
 * kendi istemcisiyle okunur (satır güvenliği başkasının yanıtını göstermez) ve yanıtın oyu "faydalı değil" olarak
 * işaretlenir; bildirim destek listesine konusu önekli yazılır (yönetim panelinde `/admin/destek`). Dakikada 6, günde 40.
 */
export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "chat-report", limit: 6, dailyLimit: 40 });
  if (!guard.ok) return guard.response;
  const { supabase, service, userId } = guard.ctx;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return errorResponse(400, "invalid_input");
  const { reason, note } = parsed.data;
  const rawId = parsed.data.messageId ?? null;
  let messageId = rawId && UUID.test(rawId) ? rawId : null;

  let excerpt = parsed.data.excerpt ?? "";
  if (messageId) {
    const { data } = await supabase
      .from("messages")
      .select("id, content")
      .eq("id", messageId)
      .eq("role", "assistant")
      .maybeSingle();
    if (!data) {
      // Satır yok ya da bu öğrencinin değil: bildirim yine alınır, ekrandaki metinle ve kimliksiz (başkasının
      // yanıtına oy yazılmaz, varlığı da ele verilmez).
      messageId = null;
    } else {
      excerpt = String((data as { content?: unknown }).content ?? "");
    }
  }
  if (messageId) {
    // Bildirim aynı zamanda olumsuz oy: yanıt kalite ölçümlerinde de görünsün.
    await supabase
      .from("messages")
      .update({ rating: -1, rating_reason: reason, rated_at: new Date().toISOString() })
      .eq("id", messageId)
      .eq("role", "assistant");
  }

  const { error } = await service.from("support_requests").insert({
    user_id: userId,
    subject: replyReportSubject(reason),
    message: replyReportMessage({ reason, messageId, excerpt, note }),
  });
  if (error) return errorResponse(500, "generation_failed");

  await auditLog(service, {
    actorId: userId,
    action: "ai.reply_reported",
    entityType: "message",
    entityId: messageId ?? undefined,
    metadata: { reason },
  });

  return NextResponse.json({ ok: true });
}
