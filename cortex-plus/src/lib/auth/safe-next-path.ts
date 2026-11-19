/**
 * Auth callback / confirm `next` parametresi — open redirect engeli.
 * Yalnızca aynı-origin göreli yol kabul edilir (`/` ile başlar, `//` değil).
 */
export function safeNextPath(
  raw: string | null | undefined,
  // 6 Kasım 2026: doğrudan ev (`/dashboard` yalnız `/ogretmen`'e yönlenen eski rota; bir sekme kazanılır).
  fallback = "/ogretmen",
): string {
  if (!raw) return fallback;
  const trimmed = raw.trim();
  if (!trimmed.startsWith("/")) return fallback;
  if (trimmed.startsWith("//")) return fallback;
  if (trimmed.includes("://")) return fallback;
  if (trimmed.includes("\\")) return fallback;
  // Control characters / CRLF injection
  if (/[\u0000-\u001f\u007f]/.test(trimmed)) return fallback;
  // Kodlanmış hileler (19 Kasım 2026, Faz 3): "/%2F%2Fevil.com", "/%5Cevil.com", "/%09/evil.com". Bir ve iki kez
  // çözülmüş hâli de aynı kurallardan geçmeli; çözülemeyen (bozuk %) adres reddedilir.
  let current = trimmed;
  for (let depth = 0; depth < 2; depth += 1) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(current);
    } catch {
      return fallback;
    }
    if (unsafeDecoded(decoded)) return fallback;
    if (decoded === current) break;
    current = decoded;
  }
  return trimmed;
}

function unsafeDecoded(path: string): boolean {
  if (!path.startsWith("/") || path.startsWith("//")) return true;
  if (path.includes("://") || path.includes("\\")) return true;
  for (const char of path) {
    const code = char.charCodeAt(0);
    if (code < 0x20 || code === 0x7f) return true;
  }
  return false;
}
