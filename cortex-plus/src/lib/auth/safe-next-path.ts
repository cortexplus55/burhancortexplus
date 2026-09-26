/**
 * Auth callback / confirm `next` parametresi — open redirect engeli.
 * Yalnızca aynı-origin göreli yol kabul edilir (`/` ile başlar, `//` değil).
 */
export function safeNextPath(
  raw: string | null | undefined,
  fallback = "/dashboard",
): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("://")) return fallback;
  if (trimmed.includes("\\")) return fallback;
  // Control characters / CRLF injection
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return fallback;
  return trimmed;
}
