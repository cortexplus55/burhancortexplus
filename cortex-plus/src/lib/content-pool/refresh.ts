import { lessonRubricIssues } from "@/lib/content-pool/rubric";
import type { LessonBody } from "@/lib/content-pool/schema";

export type RefreshRow = { id: string; unit_id: string; body: LessonBody; qa: Record<string, unknown> | null };

/** Rubriğe uymayan ve daha önce yenilemesi başarısız olmamış doğrulanmış dersler. */
export function weakLessons(rows: RefreshRow[]): RefreshRow[] {
  return rows.filter((r) => {
    const refresh = (r.qa?.rubric_refresh ?? null) as { failed_at?: string } | null;
    if (refresh?.failed_at) return false;
    return lessonRubricIssues(r.body).length > 0;
  });
}

/**
 * Yenileme döngüsü (saf; testte sahte bağımlılıklar). Her ders başlamadan bütçe tavanı denetlenir:
 * harcama + tahmini ders maliyeti tavanı aşacaksa durur ("budget"). Süre dolarsa "deadline".
 */
export async function runRefresh(
  rows: RefreshRow[],
  deps: {
    spent: () => Promise<number>;
    enabled: () => Promise<boolean>;
    refresh: (row: RefreshRow) => Promise<boolean>;
    now: () => number;
  },
  opts: { capUsd: number; lessonEstimateUsd: number; concurrency: number; deadline: number },
): Promise<{ stop: "complete" | "budget" | "deadline" | "disabled"; refreshed: number; failed: number; remaining: number }> {
  const queue = rows.slice();
  let refreshed = 0;
  let failed = 0;
  let stop: "complete" | "budget" | "deadline" | "disabled" = "complete";
  const worker = async () => {
    while (queue.length && stop === "complete") {
      if (deps.now() > opts.deadline) { stop = "deadline"; break; }
      if (!(await deps.enabled())) { stop = "disabled"; break; }
      if ((await deps.spent()) + opts.lessonEstimateUsd > opts.capUsd) { stop = "budget"; break; }
      const row = queue.shift();
      if (!row) break;
      if (await deps.refresh(row).catch(() => false)) refreshed += 1;
      else failed += 1;
    }
  };
  await Promise.all(Array.from({ length: Math.max(1, opts.concurrency) }, worker));
  return { stop, refreshed, failed, remaining: queue.length };
}
