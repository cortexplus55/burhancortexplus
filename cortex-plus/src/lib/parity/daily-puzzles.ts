/**
 * Günün bulmacaları.
 *
 * Her bulmaca tarihten türeyen bir tohumla üretilir: aynı gün herkes aynı
 * tahtayı çözer. Liderlik tablosu ancak böyle anlamlı olur — farklı tahtalarda
 * süre karşılaştırmanın bir anlamı yok.
 *
 * Gün sınırı Türkiye saatiyle çiziliyor; veritabanı tarafı da
 * (`puzzle_submit`, `puzzle_leaderboard`) `Europe/Istanbul` kullanıyor.
 * İkisi ayrışırsa gece yarısı civarı kayıtlar yanlış güne düşer.
 */

export type PuzzleId = "hanoi" | "nonogram" | "sudoku";

export type DailyPuzzle = {
  id: PuzzleId;
  title: string;
  blurb: string;
  /** Katalogdaki ders rozeti. */
  subject: string;
};

export const DAILY_PUZZLES: DailyPuzzle[] = [
  {
    id: "hanoi",
    title: "Hanoi Kulesi",
    blurb: "Diskleri en az hamlede üçüncü çubuğa taşı.",
    subject: "Matematik",
  },
  {
    id: "nonogram",
    title: "Nonogram",
    blurb: "Satır ve sütun ipuçlarından gizli deseni çıkar.",
    subject: "Mantık",
  },
  {
    id: "sudoku",
    title: "Sudoku 6×6",
    blurb: "Her satır, sütun ve 3×2 kutuda 1–6 birer kez.",
    subject: "Mantık",
  },
];

/** Türkiye saatiyle bugünün YYYY-MM-DD'si. */
export function puzzleDay(now = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Istanbul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);
}

/**
 * mulberry32 — küçük, hızlı, deterministik. Kriptografik değil, olması da
 * gerekmiyor: amaç herkese aynı tahtayı vermek.
 */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Gün + bulmaca kimliğinden tohum. Aynı gün farklı bulmacalar farklı tahta alır. */
export function puzzleSeed(id: PuzzleId, day: string): number {
  const key = `${id}:${day}`;
  let h = 2166136261;
  for (let i = 0; i < key.length; i++) {
    h ^= key.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** "1:57.8" / "41.9s" — Astra'nın liderlik tablosundaki biçim. */
export function formatDuration(ms: number): string {
  const totalSeconds = ms / 1000;
  if (totalSeconds < 60) return `${totalSeconds.toFixed(1)}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds - minutes * 60;
  return `${minutes}:${seconds.toFixed(1).padStart(4, "0")}`;
}
