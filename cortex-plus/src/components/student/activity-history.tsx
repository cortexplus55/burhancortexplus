import {
  activityWeeks,
  currentStreak,
  lastDays,
  type ActivityDay,
} from "@/lib/learning/activity-history";

/**
 * Çalışma geçmişi: son yedi gün ve yıllık ısı haritası.
 *
 * Sayılan şey DAKİKA değil ETKİNLİK — öğrencinin ekranda ne kadar
 * kaldığını ölçmüyoruz, bitirdiği etkinliği ölçüyoruz. Etiketler de
 * öyle diyor; ölçmediğimiz bir şeyi sayı gibi göstermiyoruz.
 */

const WEEKDAYS = ["Pzt", "Sal", "Çar", "Per", "Cum", "Cmt", "Paz"];

/** Yoğunluk kademesi; sıfır ayrı, gerisi üç basamak. */
function level(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  if (count === 1) return 1;
  if (count <= 3) return 2;
  return 3;
}

function dayLabel(iso: string): string {
  const [, month, day] = iso.split("-");
  return `${Number(day)}/${Number(month)}`;
}

export function ActivityHistory({ timestamps }: { timestamps: string[] }) {
  const week = lastDays(timestamps, 7);
  const weeks = activityWeeks(timestamps);
  const streak = currentStreak(timestamps);
  const weekTotal = week.reduce((sum, day) => sum + day.count, 0);
  const peak = Math.max(1, ...week.map((day) => day.count));

  return (
    <div className="cp-activity">
      <div className="cp-activity-head">
        <span>
          <strong>{weekTotal}</strong> etkinlik · son 7 gün
        </span>
        {streak > 0 ? (
          <span className="cp-activity-streak">{streak} gündür aralıksız</span>
        ) : null}
      </div>

      <ul className="cp-activity-bars" aria-label="Son yedi günün etkinlikleri">
        {week.map((day: ActivityDay) => (
          <li key={day.date}>
            <span
              className="cp-activity-bar"
              style={{ height: `${Math.max(6, (day.count / peak) * 100)}%` }}
              data-empty={day.count === 0 ? "" : undefined}
            />
            <em>{dayLabel(day.date)}</em>
            <span className="sr-only">
              {day.date}: {day.count} etkinlik
            </span>
          </li>
        ))}
      </ul>

      <p className="cp-activity-kicker">Son bir yıl</p>
      <div className="cp-activity-year" aria-label="Son bir yılın etkinlik haritası">
        <div className="cp-activity-weekdays" aria-hidden>
          {WEEKDAYS.map((label, index) => (
            <span key={label}>{index % 2 === 1 ? label : ""}</span>
          ))}
        </div>
        <div className="cp-activity-grid">
          {weeks.map((days, weekIndex) => (
            <div key={weekIndex} className="cp-activity-week">
              {days.map((day, dayIndex) =>
                day ? (
                  <span
                    key={day.date}
                    className="cp-activity-cell"
                    data-level={level(day.count)}
                    title={`${day.date}: ${day.count} etkinlik`}
                  />
                ) : (
                  <span
                    key={`${weekIndex}-${dayIndex}`}
                    className="cp-activity-cell cp-activity-cell--void"
                  />
                ),
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
