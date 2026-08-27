/** Pure helpers shared by Server and Client Components (no "use client"). */

export function astraGreetingName(fullName: string | null | undefined): string {
  if (!fullName?.trim()) return "Merhaba";
  return fullName.trim().split(/\s+/)[0] ?? "Merhaba";
}

export function astraTimeGreeting(): string {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 12) return "Günaydın";
  if (hour >= 12 && hour < 18) return "İyi günler";
  if (hour >= 18 && hour < 23) return "İyi akşamlar";
  return "İyi geceler";
}

export function astraUserInitial(
  fullName: string | null | undefined,
  email: string | null | undefined,
): string {
  const first = astraGreetingName(fullName ?? email);
  return first.slice(0, 1).toUpperCase() || "?";
}
