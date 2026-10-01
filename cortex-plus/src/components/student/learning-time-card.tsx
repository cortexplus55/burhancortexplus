import { Info } from "lucide-react";
import { formatNumber } from "@/lib/format";
import {
  TUTOR_TL_PER_HOUR,
  favoriteSubjects,
  formatLearningDuration,
  lastSevenDays,
  savingsTl,
  type LearningTimeRow,
} from "@/lib/learning/learning-time";

const DAY = new Intl.DateTimeFormat("tr-TR", { weekday: "short", timeZone: "UTC" });

function dayLabel(date: string): { weekday: string; day: string } {
  const at = new Date(`${date}T12:00:00Z`);
  return { weekday: DAY.format(at), day: `${at.getUTCDate()}/${at.getUTCMonth() + 1}` };
}

/**
 * Aktivitelerim: son 7 günün öğrenme süresi, tasarruf ve en sevilen dersler.
 * Astra'daki kartların karşılığı (30 Eylül 2026). Süre yalnızca ders, test ve
 * sohbette aktif geçen dakikalar.
 */
export function LearningTimeCard({ rows, today }: { rows: LearningTimeRow[]; today: string }) {
  const week = lastSevenDays(rows, today);
  const weekSeconds = week.reduce((sum, day) => sum + day.minutes * 60, 0);
  const totalSeconds = rows.reduce((sum, row) => sum + row.seconds, 0);
  const peak = Math.max(1, ...week.map((day) => day.minutes));
  const favorites = favoriteSubjects(rows);

  return (
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[minmax(0,2fr)_minmax(0,1fr)]">
        <section className="cs-pay-card p-4" aria-labelledby="learning-time-title">
          <div className="flex items-baseline justify-between gap-2">
            <h2 id="learning-time-title" className="text-sm font-semibold text-[var(--cs-text)]">
              Öğrenme süresi
            </h2>
            <span className="text-xs text-[var(--cs-muted)]">Son 7 gün</span>
          </div>
          <div className="mt-4 flex h-36 items-end gap-2" role="list" aria-label="Son 7 günün dakikaları">
            {week.map((day) => {
              const label = dayLabel(day.date);
              return (
                <div key={day.date} role="listitem" className="flex min-w-0 flex-1 flex-col items-center gap-1">
                  <span className="text-[10px] text-[var(--cs-muted)]">{day.minutes ? `${day.minutes} dk` : ""}</span>
                  <div
                    className="w-full rounded-md bg-[var(--cs-primary)]/80"
                    style={{ height: `${Math.max(day.minutes ? 6 : 2, Math.round((day.minutes / peak) * 96))}px` }}
                    aria-hidden
                  />
                  <span className="text-[10px] text-[var(--cs-muted)]">
                    <span className="font-semibold text-[var(--cs-text)]">{label.weekday}</span> {label.day}
                  </span>
                  <span className="sr-only">{`${label.weekday} ${label.day}: ${day.minutes} dakika`}</span>
                </div>
              );
            })}
          </div>
          {!totalSeconds ? (
            <p className="mt-3 text-xs text-[var(--cs-muted)]">
              Ders, test ve sohbette aktif geçen süre burada birikir.
            </p>
          ) : null}
        </section>
        <div className="grid gap-3">
          <div className="cs-pay-card p-4 text-center">
            <p className="text-xs text-[var(--cs-muted)]">Son 7 gün</p>
            <p className="mt-1 text-2xl font-semibold text-[var(--cs-text)]">{formatLearningDuration(weekSeconds)}</p>
          </div>
          <div className="cs-pay-card p-4 text-center">
            <p className="flex items-center justify-center gap-1 text-xs text-[var(--cs-muted)]">
              Tüm zamanların tasarrufu
              <span
                title={`Çalıştığın süre, saati ${formatNumber(TUTOR_TL_PER_HOUR)} ₺ özel ders ücretiyle hesaplanır.`}
                aria-label={`Çalıştığın süre, saati ${formatNumber(TUTOR_TL_PER_HOUR)} ₺ özel ders ücretiyle hesaplanır.`}
              >
                <Info className="h-3.5 w-3.5" aria-hidden />
              </span>
            </p>
            <p className="mt-1 text-2xl font-semibold text-emerald-400">{formatNumber(savingsTl(totalSeconds))} ₺</p>
          </div>
        </div>
      </div>
      {favorites.length ? (
        <section className="cs-pay-card p-4" aria-labelledby="favorite-subjects-title">
          <h2 id="favorite-subjects-title" className="text-sm font-semibold text-[var(--cs-text)]">
            En sevilen dersler
          </h2>
          <ul className="mt-3 flex flex-wrap gap-2">
            {favorites.map((subject) => (
              <li
                key={subject}
                className="rounded-full border border-white/10 px-3 py-1 text-xs font-semibold text-[var(--cs-text)]"
              >
                {subject}
              </li>
            ))}
          </ul>
        </section>
      ) : null}
    </div>
  );
}
