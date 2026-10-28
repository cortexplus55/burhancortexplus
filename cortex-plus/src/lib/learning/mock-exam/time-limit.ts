/**
 * Yazılı denemede serbest süre (Astra, 1 Ekim 2026): öğrenci süreyi kendisi
 * seçer ya da süresiz çözer. Soru sayısı uzunluk seçeneğinden gelir.
 *
 * Süresiz deneme `duration_minutes = 0` ile saklanır: bitiş zamanı yazılmaz,
 * süre dolunca otomatik gönderim olmaz.
 */
export const MOCK_MINUTES_MIN = 10;
export const MOCK_MINUTES_MAX = 180;
export const MOCK_MINUTES_STEP = 5;
export const UNTIMED_MINUTES = 0;

/** İstekten gelen süre: 0 süresiz; diğerleri sınırlar içinde 5'in katı. */
export function clampMockMinutes(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (value <= 0) return UNTIMED_MINUTES;
  const stepped = Math.round(value / MOCK_MINUTES_STEP) * MOCK_MINUTES_STEP;
  return Math.min(MOCK_MINUTES_MAX, Math.max(MOCK_MINUTES_MIN, stepped));
}

export function isUntimed(durationMinutes: unknown): boolean {
  return Number(durationMinutes) === UNTIMED_MINUTES && durationMinutes !== null && durationMinutes !== undefined;
}

export function mockDurationLabel(durationMinutes: number | null | undefined): string {
  if (durationMinutes == null) return "—";
  return durationMinutes === UNTIMED_MINUTES ? "Süresiz" : `${durationMinutes} dk`;
}

/** Gerçek çözüm süresinin üst sınırı: bundan uzun ölçüm (sekme günlerce açık) kayda geçmez. */
export const MAX_ELAPSED_SECONDS = 12 * 60 * 60;

/** Başlangıç ile gönderim arasındaki saniye; ölçülemiyorsa null. */
export function examElapsedSeconds(
  startedAt: string | number | null | undefined,
  submittedAt: string | number | null | undefined,
): number | null {
  if (startedAt == null || submittedAt == null) return null;
  const start = typeof startedAt === "number" ? startedAt : Date.parse(startedAt);
  const end = typeof submittedAt === "number" ? submittedAt : Date.parse(submittedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return null;
  const seconds = Math.round((end - start) / 1000);
  return seconds <= MAX_ELAPSED_SECONDS ? Math.max(1, seconds) : null;
}

/**
 * Kayda geçen süre (28 Ekim 2026). Sunucu saati esastır: `practice_exams.started_at` ile gönderim anı.
 * Başlangıç kaydı yoksa (eski deneme) istemcinin ölçtüğü süre, sınırlar içindeyse.
 */
export function recordedElapsedSeconds(input: {
  startedAt: string | null | undefined;
  submittedAt: number;
  clientSeconds?: number | null;
}): number | null {
  const server = examElapsedSeconds(input.startedAt ?? null, input.submittedAt);
  if (server != null) return server;
  const client = input.clientSeconds;
  if (typeof client !== "number" || !Number.isFinite(client) || client < 1) return null;
  return Math.min(MAX_ELAPSED_SECONDS, Math.round(client));
}

/** "6 dk 24 sn", "45 sn", "1 sa 5 dk". Dakikaya yuvarlanmaz: 82 sn "1 dk" görünüyordu. */
export function formatElapsedSeconds(seconds: number | null | undefined): string {
  if (typeof seconds !== "number" || !Number.isFinite(seconds) || seconds < 0) return "—";
  const total = Math.max(1, Math.round(seconds));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  if (hours) return minutes ? `${hours} sa ${minutes} dk` : `${hours} sa`;
  if (!minutes) return `${secs} sn`;
  return secs ? `${minutes} dk ${secs} sn` : `${minutes} dk`;
}

/** Sınavın süre sınırı değil, gerçek çözüm süresi: önce kayıtlı saniye, yoksa başlangıç–bitiş farkı. */
export function mockElapsedLabel(
  startedAt: string | null | undefined,
  completedAt: string | null | undefined,
  durationSeconds?: number | null,
): string {
  if (typeof durationSeconds === "number" && Number.isFinite(durationSeconds) && durationSeconds > 0) {
    return formatElapsedSeconds(durationSeconds);
  }
  return formatElapsedSeconds(examElapsedSeconds(startedAt ?? null, completedAt ?? null));
}
