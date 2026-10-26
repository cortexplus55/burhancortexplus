import { DAILY_STAR_GOAL, LEADERBOARD_TOP, type StarSource } from "@/lib/stars/rules";

export type StarScope = "school" | "country" | "schools";
export type StarPeriod = "week" | "all";

export type MyStars = {
  today: number;
  week: number;
  all: number;
  sourcesWeek: Partial<Record<StarSource, number>>;
  sourcesAll: Partial<Record<StarSource, number>>;
  hidden: boolean;
  hasSchool: boolean;
};

export type LeaderboardRow = {
  rank: number;
  label: string;
  detail: string | null;
  students: number | null;
  stars: number;
  isMe: boolean;
};

const num = (value: unknown) => (Number.isFinite(Number(value)) ? Number(value) : 0);

function sources(raw: unknown): Partial<Record<StarSource, number>> {
  if (!raw || typeof raw !== "object") return {};
  return Object.fromEntries(Object.entries(raw as Record<string, unknown>).map(([key, value]) => [key, num(value)]));
}

export function toMyStars(raw: unknown): MyStars {
  const row = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  return {
    today: num(row.today),
    week: num(row.week),
    all: num(row.all),
    sourcesWeek: sources(row.sourcesWeek),
    sourcesAll: sources(row.sourcesAll),
    hidden: row.hidden === true,
    hasSchool: row.hasSchool === true,
  };
}

export function toLeaderboardRows(raw: unknown): LeaderboardRow[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item) => {
    const row = (item ?? {}) as Record<string, unknown>;
    return {
      rank: num(row.rank),
      label: String(row.label ?? ""),
      detail: typeof row.detail === "string" && row.detail ? row.detail : null,
      students: row.students == null ? null : num(row.students),
      stars: num(row.stars),
      isMe: row.is_me === true,
    };
  });
}

/**
 * "İlk 20 arasına girmek için N yıldız": öğrenci ilk 20'de değilse 20. sıradakini
 * geçmek için gereken yıldız; ilk 20'deyse ya da liste kısaysa null.
 */
export function starsToTop(rows: LeaderboardRow[], top = LEADERBOARD_TOP): number | null {
  const me = rows.find((row) => row.isMe);
  const cutoff = rows.find((row) => row.rank === top);
  if (!cutoff || (me && me.rank <= top)) return null;
  return Math.max(1, cutoff.stars - (me?.stars ?? 0) + 1);
}

/** Üst çubuk yazısı: "Yıldızlar: bugün 11 · hedef 50". 50 bir tavan değil, hedeftir. */
export function todayLine(today: number): string {
  return `Yıldızlar: bugün ${today} · hedef ${DAILY_STAR_GOAL}`;
}
