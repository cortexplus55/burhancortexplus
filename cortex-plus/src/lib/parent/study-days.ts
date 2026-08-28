/** Son N takvim günü (UTC); en eski solda. */
export function buildStudyDayFlags(
  isoTimestamps: string[],
  days = 14,
  now = new Date(),
): boolean[] {
  const active = new Set(
    isoTimestamps.map((value) => String(value).slice(0, 10)).filter(Boolean),
  );
  const flags: boolean[] = [];
  for (let offset = days - 1; offset >= 0; offset -= 1) {
    const day = new Date(now);
    day.setUTCDate(day.getUTCDate() - offset);
    flags.push(active.has(day.toISOString().slice(0, 10)));
  }
  return flags;
}

export function planBadgeFromName(
  name: string | null | undefined,
): "Plus" | "Sigma" | null {
  if (!name?.trim()) return null;
  const lower = name.toLocaleLowerCase("tr");
  if (lower.includes("sigma")) return "Sigma";
  return "Plus";
}
