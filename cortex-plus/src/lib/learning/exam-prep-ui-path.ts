/**
 * Stage 9 — pure helpers for daily study path / calendar grouping in the UI.
 */

export type PathNodeLike = {
  id: string;
  dayIndex: number;
  status: "locked" | "ready" | "done";
  sessionMeta?: {
    calendarDate?: string;
    durationMinutes?: number;
    topicTitle?: string;
    role?: string;
  } | null;
};

export type DayPathGroup = {
  key: string;
  dayIndex: number;
  calendarDate: string | null;
  label: string;
  isToday: boolean;
  isPast: boolean;
  nodes: PathNodeLike[];
  totalMinutes: number;
  doneCount: number;
};

function todayIsoLocal(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatDayLabel(calendarDate: string | null, dayIndex: number): string {
  if (!calendarDate) return `Gün ${dayIndex}`;
  const [y, m, d] = calendarDate.split("-").map(Number);
  if (!y || !m || !d) return `Gün ${dayIndex}`;
  const date = new Date(y, m - 1, d);
  const weekday = date.toLocaleDateString("tr-TR", { weekday: "short" });
  return `${weekday} ${d}.${m} · Gün ${dayIndex}`;
}

/** Group trail nodes by calendar day (falls back to dayIndex). */
export function groupNodesByStudyDay(
  nodes: PathNodeLike[],
  now = new Date(),
): DayPathGroup[] {
  const today = todayIsoLocal(now);
  const buckets = new Map<string, PathNodeLike[]>();

  for (const node of nodes) {
    const date = node.sessionMeta?.calendarDate?.trim() || null;
    const key = date ? `d:${date}` : `i:${node.dayIndex}`;
    const list = buckets.get(key) ?? [];
    list.push(node);
    buckets.set(key, list);
  }

  const groups: DayPathGroup[] = [];
  for (const [key, list] of buckets) {
    const sorted = [...list].sort((a, b) => {
      const ao = a.dayIndex - b.dayIndex;
      if (ao !== 0) return ao;
      return a.id.localeCompare(b.id);
    });
    const calendarDate = sorted[0]?.sessionMeta?.calendarDate?.trim() || null;
    const dayIndex = sorted[0]?.dayIndex ?? 0;
    const isToday = Boolean(calendarDate && calendarDate === today);
    const isPast = Boolean(calendarDate && calendarDate < today);
    groups.push({
      key,
      dayIndex,
      calendarDate,
      label: formatDayLabel(calendarDate, dayIndex),
      isToday,
      isPast,
      nodes: sorted,
      totalMinutes: sorted.reduce(
        (sum, n) => sum + (n.sessionMeta?.durationMinutes ?? 0),
        0,
      ),
      doneCount: sorted.filter((n) => n.status === "done").length,
    });
  }

  return groups.sort((a, b) => {
    if (a.calendarDate && b.calendarDate) {
      return a.calendarDate.localeCompare(b.calendarDate) || a.dayIndex - b.dayIndex;
    }
    return a.dayIndex - b.dayIndex;
  });
}

export function findTodayGroup(groups: DayPathGroup[]): DayPathGroup | null {
  return groups.find((g) => g.isToday) ?? null;
}

export function missedIncompleteGroups(groups: DayPathGroup[]): DayPathGroup[] {
  return groups.filter(
    (g) => g.isPast && g.doneCount < g.nodes.length && g.nodes.some((n) => n.status !== "done"),
  );
}

export type LearningPreferencesView = {
  style?: "examples" | "theory" | "mixed";
  pace?: "slow" | "normal" | "fast";
  notes?: string;
};

export function parseLearningPreferences(raw: unknown): LearningPreferencesView {
  if (!raw || typeof raw !== "object") return {};
  const o = raw as Record<string, unknown>;
  const style =
    o.style === "examples" || o.style === "theory" || o.style === "mixed"
      ? o.style
      : undefined;
  const pace =
    o.pace === "slow" || o.pace === "normal" || o.pace === "fast"
      ? o.pace
      : undefined;
  const notes = typeof o.notes === "string" ? o.notes.slice(0, 400) : undefined;
  return { style, pace, notes };
}

export type TopicProgress = {
  title: string;
  done: number;
  total: number;
  pct: number;
  /** İlk etkinliğin geldiği gün — konular plandaki sıraya göre dizilsin. */
  firstDayIndex: number;
};

/**
 * Konu başına ilerleme.
 *
 * Astra'nın "Konular" sekmesinde her konunun yanında yüzdesi ve
 * "0 tamamlandı" yazıyor; öğrenci nerede kaldığını konu bazında
 * görüyor. Bizde yalnızca toplam yüzde vardı ve konu listesi ayrı bir
 * sayfada, ilerleme bilgisi olmadan duruyordu.
 *
 * Yeni sorgu gerekmiyor: plan düğümleri zaten hangi konuya ait olduğunu
 * taşıyor. Konusu belli olmayan düğümler (deneme sınavı, genel tekrar)
 * bir konuya yazılamaz, o yüzden dışarıda kalıyor.
 */
export function topicProgressFromNodes(nodes: PathNodeLike[]): TopicProgress[] {
  const byTitle = new Map<string, { done: number; total: number; firstDayIndex: number }>();

  for (const node of nodes) {
    const title = node.sessionMeta?.topicTitle?.trim();
    if (!title) continue;
    const row = byTitle.get(title) ?? {
      done: 0,
      total: 0,
      firstDayIndex: node.dayIndex,
    };
    row.total += 1;
    if (node.status === "done") row.done += 1;
    row.firstDayIndex = Math.min(row.firstDayIndex, node.dayIndex);
    byTitle.set(title, row);
  }

  return [...byTitle.entries()]
    .map(([title, row]) => ({
      title,
      done: row.done,
      total: row.total,
      // Bir etkinlik bitmişken %0 göstermek çalışmayı yok saymak olur.
      pct: row.total ? Math.round((row.done / row.total) * 100) : 0,
      firstDayIndex: row.firstDayIndex,
    }))
    .sort((a, b) => a.firstDayIndex - b.firstDayIndex || a.title.localeCompare(b.title, "tr"));
}
