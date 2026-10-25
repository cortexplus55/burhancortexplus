import { replayLessonPayload } from "@/lib/learning/lesson-replay";

/**
 * Bitmiş adımın kayıtlı gövdesi (25 Ekim 2026). Yeni üretim ve kredi yok: ders
 * "Dersi tekrarla" ile aynı kayıttan açılır; test, kart, podcast ve sözlü
 * son kaydın gövdesini taşır. Yazımı süren ders (`building`) açılmaz.
 */
export function savedReviewPayload(payload: unknown, salt: string): Record<string, unknown> | null {
  if (!payload || typeof payload !== "object") return null;
  const row = payload as Record<string, unknown>;
  if (row.building === true) return null;
  if (row.type === "lesson") return replayLessonPayload(payload, salt);
  if (typeof row.type !== "string" || !row.type) return null;
  const lists = ["questions", "items", "cards", "chapters"] as const;
  const hasList = lists.some((key) => Array.isArray(row[key]) && (row[key] as unknown[]).length > 0);
  if (!hasList) return null;
  const rest = { ...row };
  delete rest.building;
  delete rest.builtAt;
  delete rest.upcoming;
  delete rest.adoptedPrefetch;
  delete rest.prefetchVariant;
  return { ...rest, reviewed: true };
}
