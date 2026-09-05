import { NextResponse } from "next/server";
import { z } from "zod";
import { withUser } from "@/lib/api/guards";

/**
 * Yanıt oylaması.
 *
 * Kullanıcının kendi istemcisiyle yazıyoruz; satır güvenliği kuralı
 * (`msg_own`) sohbetin sahibi olup olmadığını zaten kontrol ediyor, yani
 * başkasının yanıtını oylamak mümkün değil. Servis anahtarı kullanmak o
 * kontrolü atlar ve burada hiçbir gerekçesi yok.
 */
const schema = z.object({
  messageId: z.string().uuid(),
  // null = oyu geri al. Öğrenci fikrini değiştirebilmeli.
  rating: z.union([z.literal(1), z.literal(-1), z.null()]),
  reason: z.enum(["yanlis", "anlasilmadi", "eksik"]).nullish(),
});

export async function POST(request: Request) {
  const guard = await withUser(request, {
    scope: "chat-feedback",
    limit: 30,
    dailyLimit: 300,
  });
  if (!guard.ok) return guard.response;
  const { supabase } = guard.ctx;

  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) {
    return NextResponse.json({ error: "invalid_input" }, { status: 400 });
  }

  const { messageId, rating } = parsed.data;
  // Sebep yalnızca olumsuz oyda tutuluyor; veritabanı kısıtı da bunu istiyor.
  const reason = rating === -1 ? (parsed.data.reason ?? null) : null;

  const { data, error } = await supabase
    .from("messages")
    .update({
      rating,
      rating_reason: reason,
      rated_at: rating === null ? null : new Date().toISOString(),
    })
    .eq("id", messageId)
    .eq("role", "assistant")
    .select("id")
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: "update_failed" }, { status: 500 });
  }
  if (!data) {
    // Ya satır yok ya da bu kullanıcıya ait değil. İkisini ayırmıyoruz:
    // ayırmak, başkasının mesaj kimliğini deneyerek varlığını doğrulamaya
    // izin verirdi.
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
