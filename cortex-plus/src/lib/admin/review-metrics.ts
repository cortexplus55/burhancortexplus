import type { SupabaseClient } from "@supabase/supabase-js";
import { addDays, istanbulDay } from "@/lib/istanbul-day";

/**
 * Günü gelen tekrar (20 Ekim 2026) — yönetim ölçüsü, `/admin/beta`'da ayrı kart. Beta çıkış
 * ölçütlerine (altı satır, Faz 5.3) girmez.
 *
 * Soru: kayda düşen yanlış 7 gün içinde gerçekten yeniden soruldu mu (hedef ≥ %80) ve ilk tekrarda
 * doğru mu cevaplandı. Yalnız 7 günü dolmuş yanlışlar sayılır; daha yenisi henüz sorulmamış olabilir.
 * Payda yalnız kayda düşen yanlışlar: sayısal / açıklama ders soruları ve yazılı deneme kayda girmez.
 */

export const REVIEW_REASK_TARGET = 0.8;
export const REVIEW_REASK_WINDOW_DAYS = 7;

export type ReviewMetrics = {
  days: number;
  /** 7 günü dolmuş yanlış sayısı. */
  cohort: number;
  /** Bunlardan 7 gün içinde yeniden sorulan. */
  reasked: number;
  share: number | null;
  /** İlk tekrarda doğru (yeniden sorulanlar içinde). */
  reaskCorrect: number;
  accuracy: number | null;
};

type Row = { first_missed_on: string | null; first_reasked_on: string | null; first_reask_correct: boolean | null };

export async function collectReviewMetrics(
  service: SupabaseClient,
  input: { now: Date; days: number },
): Promise<ReviewMetrics> {
  const today = istanbulDay(input.now);
  const end = addDays(today, -REVIEW_REASK_WINDOW_DAYS);
  const start = addDays(end, -(Math.max(1, input.days) - 1));
  let rows: Row[] = [];
  try {
    const { data, error } = await service
      .from("exam_prep_review_items")
      .select("first_missed_on, first_reasked_on, first_reask_correct")
      .gte("first_missed_on", start)
      .lte("first_missed_on", end)
      .limit(20000);
    if (!error && data) rows = data as Row[];
  } catch {
    rows = [];
  }
  const cohort = rows.filter((row) => row.first_missed_on);
  const reasked = cohort.filter(
    (row) =>
      row.first_reasked_on &&
      row.first_reasked_on <= addDays(String(row.first_missed_on).slice(0, 10), REVIEW_REASK_WINDOW_DAYS),
  );
  const reaskCorrect = reasked.filter((row) => row.first_reask_correct === true).length;
  return {
    days: input.days,
    cohort: cohort.length,
    reasked: reasked.length,
    share: cohort.length ? reasked.length / cohort.length : null,
    reaskCorrect,
    accuracy: reasked.length ? reaskCorrect / reasked.length : null,
  };
}

export function percentLabel(value: number | null): string {
  return value == null ? "Veri yok" : `%${Math.round(value * 100)}`;
}
