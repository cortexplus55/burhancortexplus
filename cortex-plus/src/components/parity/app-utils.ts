/** Pure helpers shared by Server and Client Components (no "use client"). */

export function parityGreetingName(fullName: string | null | undefined): string {
  if (!fullName?.trim()) return "Merhaba";
  return fullName.trim().split(/\s+/)[0] ?? "Merhaba";
}

/**
 * Sunucuda çalışır; Vercel saati UTC. Türkiye saatine sabitlenmezse sabah
 * 07:40'ta "iyi geceler" yazıyordu (30 Eylül 2026).
 */
export function parityTimeGreeting(now: Date = new Date()): string {
  const hour = Number(
    new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Istanbul", hour: "2-digit", hourCycle: "h23" }).format(now),
  );
  if (hour >= 5 && hour < 12) return "Günaydın";
  if (hour >= 12 && hour < 18) return "İyi günler";
  if (hour >= 18 && hour < 23) return "İyi akşamlar";
  return "İyi geceler";
}

export function parityUserInitial(
  fullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const first = parityGreetingName(fullName ?? email);
  return first.slice(0, 1).toUpperCase() || "?";
}
