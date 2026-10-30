/** Konunun kayıtlı dersi (`exam_prep_lessons`): podcast, tekrar kartları ve konu testi bunu okur. */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateJson } from "@/lib/ai/generate";
import type { LessonV2 } from "@/lib/learning/teaching-standards";
import { readLessonV2 } from "@/lib/learning/lesson-v3";

/**
 * Konunun en son doğrulanmış dersi. Podcast bunun üzerine kuruluyor;
 * yoksa (ders henüz üretilmemişse) podcast eskisi gibi kaynaktan çıkar.
 * Sorgu ya da şema tutmazsa sessizce null — podcast üretimi kırılmasın.
 */
export async function loadTopicLesson(
  service: Parameters<typeof generateJson>[0]["service"],
  topicId: string,
): Promise<LessonV2 | null> {
  const { data } = await service
    .from("exam_prep_lessons")
    .select("content_json")
    .eq("topic_id", topicId)
    .not("content_json", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!data?.content_json) return null;
  return readLessonV2(data.content_json);
}

/** Konunun son dersi: podcast ve tekrar kartları bunu okur. */
export async function saveTopicLesson(
  service: SupabaseClient,
  input: { prepId: string; topicId: string; payload: Record<string, unknown> },
) {
  const lesson = readLessonV2(input.payload.lesson);
  if (!lesson?.title) return;
  await service
    .from("exam_prep_lessons")
    .insert({
      exam_prep_id: input.prepId,
      topic_id: input.topicId,
      title: lesson.title,
      content_md: lesson.overview ?? lesson.sections?.[0]?.body ?? lesson.title,
      // Kayıt biçimi olduğu gibi (V3). Eksik kavram listesi yazılmaz; konu testi dersin bütününü sorar.
      content_json: input.payload.lesson,
    })
    .then(undefined, () => undefined);
}
