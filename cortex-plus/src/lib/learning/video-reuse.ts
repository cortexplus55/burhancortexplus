import type { SupabaseClient } from "@supabase/supabase-js";
import { isSketchStored } from "@/lib/learning/video-lesson";

/**
 * Öğrencinin bu konu için daha önce ürettiği çizimli video (en yenisi). İkinci izleme ücretsiz (19 Kasım 2026, Faz 4
 * denetimi): çizimli videonun girişi her açılışta üretim isterdi ve aynı konunun videosu varken 22 kredi yeniden
 * kesiliyordu. Eski kayıtta tarz "whiteboard" olabilir (tarz kısıtı göçünden önce); sahnesinde resim yolu olmayıp şema
 * taşıyan kayıt da çizimli sayılır (`isSketchStored`). Okuma düşerse null: üretim eski yoldan sürer.
 */
export async function findStoredSketchVideo(
  service: SupabaseClient,
  input: { userId: string; prepId: string; topicId: string },
): Promise<string | null> {
  const { data, error } = await service
    .from("prep_videos")
    .select("id, style, scenes")
    .eq("user_id", input.userId)
    .eq("exam_prep_id", input.prepId)
    .eq("topic_id", input.topicId)
    .in("style", ["sketch_reel", "whiteboard"])
    .order("created_at", { ascending: false })
    .limit(3);
  if (error) return null;
  const row = (data ?? []).find((item) =>
    isSketchStored(
      String(item.style ?? ""),
      (Array.isArray(item.scenes) ? item.scenes : []) as Parameters<typeof isSketchStored>[1],
    ),
  );
  return row ? String(row.id) : null;
}
