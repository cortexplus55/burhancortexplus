import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { collectReviewMetrics, percentLabel } from "@/lib/admin/review-metrics";

/**
 * Günü gelen tekrarın yönetim ölçüsü (20 Ekim 2026): kayda düşen yanlış 7 gün içinde yeniden
 * soruldu mu (hedef ≥ %80), ilk tekrarda doğru mu. Yalnız 7 günü dolmuş yanlışlar sayılır.
 * Beta çıkış ölçütlerinden (altı satır) ayrı kart.
 */
type Row = Record<string, unknown>;
function fakeService(rows: Row[], fail = false): SupabaseClient {
  return {
    from() {
      const filters: ((row: Row) => boolean)[] = [];
      const builder: Record<string, unknown> = {
        select: () => builder,
        gte: (col: string, value: string) => {
          filters.push((row) => row[col] != null && String(row[col]) >= value);
          return builder;
        },
        lte: (col: string, value: string) => {
          filters.push((row) => row[col] != null && String(row[col]) <= value);
          return builder;
        },
        limit: () => builder,
        then: (resolve: (value: unknown) => void) =>
          resolve(fail ? { data: null, error: { message: "missing" } } : { data: rows.filter((row) => filters.every((f) => f(row))), error: null }),
      };
      return builder;
    },
  } as unknown as SupabaseClient;
}

const NOW = new Date("2026-10-30T09:00:00Z"); // İstanbul 30 Ekim

describe("aralıklı tekrar ölçüsü", () => {
  it("7 günü dolmamış yanlış sayılmaz; 6. günde sorulan sayılır, 9. günde sorulan sayılmaz; doğruluk", async () => {
    const metrics = await collectReviewMetrics(
      fakeService([
        { first_missed_on: "2026-10-27", first_reasked_on: "2026-10-28", first_reask_correct: true }, // 3 günlük: dışarıda
        { first_missed_on: "2026-10-20", first_reasked_on: "2026-10-26", first_reask_correct: true }, // 6. gün
        { first_missed_on: "2026-10-18", first_reasked_on: "2026-10-27", first_reask_correct: true }, // 9. gün
        { first_missed_on: "2026-10-21", first_reasked_on: "2026-10-22", first_reask_correct: false },
        { first_missed_on: "2026-10-19", first_reasked_on: null, first_reask_correct: null }, // hiç sorulmadı
      ]),
      { now: NOW, days: 30 },
    );
    expect(metrics).toEqual({ days: 30, cohort: 4, reasked: 2, share: 0.5, reaskCorrect: 1, accuracy: 0.5 });
    expect(percentLabel(metrics.share)).toBe("%50");
  });

  it("veri yoksa ya da tablo yoksa 'Veri yok'", async () => {
    const empty = await collectReviewMetrics(fakeService([]), { now: NOW, days: 7 });
    expect(empty.share).toBeNull();
    expect(percentLabel(empty.share)).toBe("Veri yok");
    const broken = await collectReviewMetrics(fakeService([], true), { now: NOW, days: 7 });
    expect(broken).toMatchObject({ cohort: 0, share: null, accuracy: null });
  });

  it("çıkış ölçütlerine girmez; /admin/beta'da ayrı kart", () => {
    expect(readFileSync("src/lib/admin/beta-metrics.ts", "utf8")).not.toContain("exam_prep_review_items");
    const page = readFileSync("src/app/admin/beta/page.tsx", "utf8");
    expect(page).toContain('title="Aralıklı tekrar"');
    expect(page).toContain("collectReviewMetrics(service, { now, days: 7 })");
  });
});
