/**
 * Takvim görünümü.
 *
 * İki kaynak birleşir: kullanıcının kendi eklediği etkinlikler
 * (`calendar_events`) ve sınav hazırlıklarının tarihleri. Sınav tarihleri
 * kopyalanmaz — `exam_preps.exam_date` tek doğru kaynak kalır, burada yalnızca
 * okunur bir görünüme dönüştürülür. Böylece hazırlık tarihi değişince takvim
 * kendiliğinden doğru olur.
 */

export type CalendarKind = "personal" | "exam";

export type CalendarItem = {
  id: string;
  kind: CalendarKind;
  title: string;
  /** YYYY-MM-DD */
  date: string;
  subject: string | null;
  note: string | null;
  /** Sınav etkinliklerinde ilgili hazırlığın kimliği. */
  prepId?: string;
};

export type CalendarFilter = "all" | "mine" | "exams";

export function buildCalendarItems(
  events: {
    id: string;
    title: string;
    event_date: string;
    subject: string | null;
    note: string | null;
  }[],
  preps: { id: string; title: string | null; exam_type: string | null; exam_date: string | null }[],
): CalendarItem[] {
  const personal: CalendarItem[] = events.map((e) => ({
    id: e.id,
    kind: "personal",
    title: e.title,
    date: e.event_date,
    subject: e.subject,
    note: e.note,
  }));

  const exams: CalendarItem[] = preps
    .filter((p): p is typeof p & { exam_date: string } => Boolean(p.exam_date))
    .map((p) => ({
      id: `prep-${p.id}`,
      kind: "exam",
      title: p.title ?? p.exam_type ?? "Sınav",
      date: p.exam_date,
      subject: p.exam_type,
      note: null,
      prepId: p.id,
    }));

  return [...personal, ...exams].sort((a, b) => a.date.localeCompare(b.date));
}

export function filterCalendar(
  items: CalendarItem[],
  filter: CalendarFilter,
): CalendarItem[] {
  if (filter === "mine") return items.filter((i) => i.kind === "personal");
  if (filter === "exams") return items.filter((i) => i.kind === "exam");
  return items;
}

/** Bugünden itibaren olanlar — "Yaklaşan" listesi. */
export function upcoming(items: CalendarItem[], today = new Date()): CalendarItem[] {
  const iso = toIsoDate(today);
  return items.filter((i) => i.date >= iso);
}

export function toIsoDate(date: Date): string {
  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

/** Ay ızgarası — pazartesi başlangıçlı, önceki/sonraki ayın günleriyle doldurulmuş. */
export function monthGrid(year: number, month: number): string[] {
  const first = new Date(year, month, 1);
  // getDay: 0=Pazar. Pazartesi başlangıcı için kaydır.
  const lead = (first.getDay() + 6) % 7;
  const start = new Date(year, month, 1 - lead);
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(start);
    d.setDate(start.getDate() + i);
    return toIsoDate(d);
  });
}

export function daysUntil(dateIso: string, today = new Date()): number {
  const target = new Date(`${dateIso}T00:00:00`);
  const base = new Date(today);
  base.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - base.getTime()) / 86_400_000);
}

export function formatDayLabel(dateIso: string, today = new Date()): string {
  const diff = daysUntil(dateIso, today);
  if (diff === 0) return "Bugün";
  if (diff === 1) return "Yarın";
  if (diff < 0) return `${Math.abs(diff)} gün önce`;
  return `${diff} gün sonra`;
}
