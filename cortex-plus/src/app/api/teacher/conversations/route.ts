import { NextResponse } from "next/server";
import { withUser } from "@/lib/api/guards";
import { isFeatureEnabled } from "@/lib/admin/feature-flags";
import { TEACHER_V2_FLAG } from "@/lib/ai/teacher-v2";
import { generalOnly, loadConversationGroups, loadConversationList } from "@/lib/tutor/conversation-groups";

/**
 * Öğretmen ana ekranının geçmiş paneli (Faz 11, teacher.v2, 21 Kasım 2026): konuşmalar hazırlığa göre gruplu. Yalnız okur;
 * model çağrısı ve kredi yok. Bayrak kapalıyken uç yokmuş gibi 404. Konuşma listesi öğrencinin kendi istemcisiyle (satır
 * güvenliği), bağlar ve hazırlıklar sunucu anahtarıyla, öğrencinin kimliğiyle süzülür. Bağ tablosu yoksa ya da okunamazsa
 * bütün konuşmalar Genel grupta (`grouped: false`).
 */
export async function GET(request: Request) {
  const guard = await withUser(request, { scope: "teacher-conversations-read", limit: 60 });
  if (!guard.ok) return guard.response;
  const { supabase, service, userId } = guard.ctx;

  const enabled = await isFeatureEnabled(service, TEACHER_V2_FLAG, userId).catch(() => false);
  if (!enabled) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let conversations;
  try {
    conversations = await loadConversationList(supabase, userId);
  } catch {
    return NextResponse.json({ error: "Geçmiş konuşmalar şu an okunamadı." }, { status: 503 });
  }
  const groups = await loadConversationGroups(service, userId, conversations).catch(() => null);

  return NextResponse.json(
    { groups: groups ?? generalOnly(conversations), grouped: groups !== null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}
