import { NextResponse } from "next/server";
import { z } from "zod";
import { errorResponse, withUser } from "@/lib/api/guards";

/**
 * Okul ağı eylemleri.
 *
 * PUT   → hazırlığı okulla paylaş / paylaşımı geri al
 * POST  → paylaşılan bir hazırlığa katıl (kendi kopyanı oluştur)
 *
 * Katılma fork modeliyle çalışıyor: konu başlıkları kopyalanır, ilerleme
 * kopyalanmaz. Böylece kimse kimsenin sonuçlarını göremez — veri hiç
 * paylaşılmadığı için görünürlük sorusu hiç doğmuyor.
 */

const shareSchema = z.object({
  prepId: z.string().uuid(),
  share: z.boolean(),
});

const joinSchema = z.object({ prepId: z.string().uuid() });

export async function PUT(request: Request) {
  const guard = await withUser(request, { scope: "school-share", limit: 20 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = shareSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: profile } = await service
    .from("profiles")
    .select("school_id")
    .eq("id", userId)
    .maybeSingle();

  if (parsed.data.share && !profile?.school_id) {
    return errorResponse(409, "school_required");
  }

  const { error } = await service
    .from("exam_preps")
    .update(
      parsed.data.share
        ? { visibility: "school", school_id: profile!.school_id }
        : { visibility: "private" },
    )
    .eq("id", parsed.data.prepId)
    .eq("user_id", userId);

  if (error) return errorResponse(500, "share_failed");
  return NextResponse.json({ ok: true, shared: parsed.data.share });
}

export async function POST(request: Request) {
  const guard = await withUser(request, { scope: "school-join", limit: 15 });
  if (!guard.ok) return guard.response;
  const { userId, service } = guard.ctx;

  const parsed = joinSchema.safeParse(await request.json());
  if (!parsed.success) return errorResponse(400, "invalid_input");

  const { data: profile } = await service
    .from("profiles")
    .select("school_id")
    .eq("id", userId)
    .maybeSingle();
  if (!profile?.school_id) return errorResponse(409, "school_required");

  // Kaynak yalnızca aynı okulda paylaşılmışsa okunabilir.
  const { data: source } = await service
    .from("exam_preps")
    .select("id, user_id, title, exam_type, exam_date, target_score, visibility, school_id")
    .eq("id", parsed.data.prepId)
    .maybeSingle();

  if (
    !source ||
    source.visibility !== "school" ||
    source.school_id !== profile.school_id
  ) {
    return errorResponse(404, "not_found");
  }
  if (source.user_id === userId) return errorResponse(409, "already_owner");

  // Aynı hazırlığa iki kez katılmayı engelle.
  const { data: existing } = await service
    .from("exam_preps")
    .select("id")
    .eq("user_id", userId)
    .eq("forked_from", source.id)
    .maybeSingle();
  if (existing) return NextResponse.json({ id: existing.id, alreadyJoined: true });

  const { data: copy, error: copyError } = await service
    .from("exam_preps")
    .insert({
      user_id: userId,
      title: source.title,
      exam_type: source.exam_type,
      exam_date: source.exam_date,
      target_score: source.target_score,
      school_id: profile.school_id,
      // Kopya varsayılan olarak gizli; sahibi isterse ayrıca paylaşır.
      visibility: "private",
      forked_from: source.id,
    })
    .select("id")
    .single();

  if (copyError || !copy) return errorResponse(500, "join_failed");

  // Yalnızca konu başlıkları ve sırası kopyalanır; ilerleme kopyalanmaz.
  // Kaynağın aynı okulda paylaşıldığı yukarıda doğrulandı, bu yüzden doğrudan
  // okunuyor.
  const { data: topics } = await service
    .from("exam_prep_topics")
    .select("label, sort_order")
    .eq("exam_prep_id", source.id)
    .order("sort_order");

  const rows = (topics ?? []) as { label: string; sort_order: number }[];
  if (rows.length > 0) {
    await service.from("exam_prep_topics").insert(
      rows.map((t) => ({
        exam_prep_id: copy.id,
        label: t.label,
        sort_order: t.sort_order,
      })),
    );
  }

  // service role'de auth.uid() boş; sayacın kimlik kontrolü için kullanıcıyı
  // fonksiyona açıkça geçiyoruz.
  await service.rpc("increment_prep_view", {
    p_prep_id: source.id,
    p_viewer: userId,
  });

  return NextResponse.json({ id: copy.id as string, topics: rows.length });
}
