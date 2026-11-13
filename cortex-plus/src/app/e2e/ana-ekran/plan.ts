/** Profil kimliği fikstürü (13 Kasım 2026, Faz 2): `?plan=plus|hafta|sigma|kurucu`, yoksa ücretsiz. */
export type FixturePlan = "free" | "plus" | "week" | "sigma" | "founder";

export function fixturePlan(value: string | undefined): FixturePlan {
  if (value === "plus") return "plus";
  if (value === "hafta") return "week";
  if (value === "sigma") return "sigma";
  if (value === "kurucu") return "founder";
  return "free";
}
