/** Yanılgı kayıtları: yazım, ders sonu tekrar kartları ve görülmemiş tekrar süzgeci. */
import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { cardsFromLessonReviews, type LessonReviewCard } from "@/lib/learning/teaching-standards";
import { withOpenMisconceptions } from "@/lib/learning/misconception-store";

/** Tablo yoksa veya yazma düşerse deneme yine tamamlanır. */
export async function rememberMisconceptions(
  service: SupabaseClient,
  rows: Record<string, unknown>[],
) {
  if (!rows.length) return;
  try {
    const { error } = await service.from("exam_prep_misconceptions").insert(rows);
    if (error) console.error("exam_prep_misconceptions_skipped", error.message);
  } catch (error) {
    console.error(
      "exam_prep_misconceptions_skipped",
      error instanceof Error ? error.message : "insert_failed",
    );
  }
}

export async function loadLessonReviewCards(
  service: SupabaseClient,
  userId: string,
  prepId: string,
  topicLabel: string | null,
): Promise<LessonReviewCard[]> {
  // Çözülen yanılgı karta dönmez (20 Ekim 2026); sütun yoksa eskisi gibi hepsi.
  const { data, error } = await withOpenMisconceptions((onlyOpen) => {
    const query = service
      .from("exam_prep_misconceptions")
      .select("question_preview, corrected, claim, source_kind, topic_label")
      .eq("user_id", userId)
      .eq("exam_prep_id", prepId)
      .eq("source_kind", "lesson_review");
    return (onlyOpen ? query.is("resolved_at", null) : query)
      .order("created_at", { ascending: false })
      .limit(60);
  });
  if (error || !data) return [];
  return cardsFromLessonReviews(data, topicLabel);
}

export async function unseenLessonReviews<
  T extends { sourceKind: string; questionPreview: string | null },
>(service: SupabaseClient, userId: string, prepId: string, drafts: T[]): Promise<T[]> {
  const lesson = drafts.filter((draft) => draft.sourceKind === "lesson_review");
  const rest = drafts.filter((draft) => draft.sourceKind !== "lesson_review");
  const previews = lesson
    .map((draft) => draft.questionPreview)
    .filter((preview): preview is string => Boolean(preview));
  if (!previews.length) return drafts;
  // Yalnız AÇIK satır engeller (20 Ekim 2026): çözüldükten sonra yine kaçırılan soru yeniden açılır.
  const { data, error } = await withOpenMisconceptions((onlyOpen) => {
    const query = service
      .from("exam_prep_misconceptions")
      .select("question_preview")
      .eq("user_id", userId)
      .eq("exam_prep_id", prepId)
      .eq("source_kind", "lesson_review")
      .in("question_preview", previews);
    return onlyOpen ? query.is("resolved_at", null) : query;
  });
  if (error) return drafts;
  const seen = new Set((data ?? []).map((row) => row.question_preview as string));
  return [
    ...rest,
    ...lesson.filter((draft) => !draft.questionPreview || !seen.has(draft.questionPreview)),
  ];
}
