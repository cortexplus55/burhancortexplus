import Link from "next/link";
import { Trophy } from "lucide-react";
import {
  DAILY_PUZZLES,
  formatDuration,
  type PuzzleId,
} from "@/lib/parity/daily-puzzles";

/**
 * "Bugünün bulmacaları" — mağazadaki günlük döngü.
 *
 * Her bulmaca günün tohumuyla üretiliyor, yani herkes aynı tahtayı çözüyor.
 * Çözülmüş olanlarda kendi süren, çözülmemişlerde Astra'daki gibi
 * "ilk çözen sen ol" daveti duruyor.
 */
export function DailyPuzzleStrip({
  solved,
}: {
  /** puzzle_my_day() sonucundan: bulmaca kimliği → bugünkü en iyi süre (ms). */
  solved: Record<string, number>;
}) {
  const solvedCount = DAILY_PUZZLES.filter((p) => solved[p.id]).length;

  return (
    <section className="ap-daily">
      <div className="ap-daily-head">
        <h2>Bugünün bulmacaları</h2>
        <span className="ap-daily-count">
          {solvedCount}/{DAILY_PUZZLES.length} çözüldü
        </span>
      </div>

      <div className="ap-daily-grid">
        {DAILY_PUZZLES.map((puzzle) => {
          const best = solved[puzzle.id as PuzzleId];
          return (
            <Link
              key={puzzle.id}
              href={`/uygulamalar/bulmaca/${puzzle.id}`}
              className="ap-daily-card"
            >
              <span className="ap-daily-subject">{puzzle.subject}</span>
              <span className="ap-daily-title">{puzzle.title}</span>
              <span className="ap-daily-blurb">{puzzle.blurb}</span>
              <span className="ap-daily-foot">
                {best ? (
                  <>
                    <Trophy className="h-3.5 w-3.5" aria-hidden />
                    Süren: {formatDuration(best)}
                  </>
                ) : (
                  "İlk çözen sen ol — süren burada görünecek."
                )}
              </span>
            </Link>
          );
        })}
      </div>
    </section>
  );
}
