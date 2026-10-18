/**
 * Parça parça açılan ders (18 Ekim 2026, ürün sahibinin kararı).
 *
 * Ders yazılırken her denetlenmiş kavram öğrencinin ders kaydına (`payload`) eklenir;
 * `building: true` dersin sürdüğünü söyler, `builtAt` son eklemenin anı. Öğrenci ekranı
 * kısa aralıklarla sorar (`action: "progress"`). Yazım bittiğinde bayraklar kalkar.
 *
 * Yazımı yürüten fonksiyon düşerse (zaman sınırı, dağıtım) kayıt `building`de takılı
 * kalırdı. Son eklemeden bu kadar süre geçtiyse ders olduğu kadarıyla kapanır.
 * Bir kavramın denetimi ve iki düzeltme turu normalde bir dakikanın altında.
 */
export const BUILD_STALE_MS = 120_000;

export type BuildFlags = { building?: boolean; builtAt?: string; upcoming?: string[]; truncated?: boolean };

export function isBuilding(payload: unknown): boolean {
  return Boolean(payload && typeof payload === "object" && (payload as BuildFlags).building === true);
}

/** Yazım sürüyor: denetlenen kısım + sıradaki kavramların adları. */
export function buildingPayload(payload: Record<string, unknown>, now = Date.now()): Record<string, unknown> {
  return { ...payload, building: true, builtAt: new Date(now).toISOString() };
}

/** Son eklemeden beri yazım ilerlemedi: fonksiyon düşmüş sayılır. */
export function isStaleBuild(payload: unknown, now = Date.now()): boolean {
  if (!isBuilding(payload)) return false;
  const at = Date.parse(String((payload as BuildFlags).builtAt ?? ""));
  return !Number.isFinite(at) || now - at > BUILD_STALE_MS;
}

/** Ders olduğu kadarıyla kapanır: öğrenci okuduğunu kaybetmez, sonu özetsiz biter. */
export function truncatedPayload(payload: Record<string, unknown>): Record<string, unknown> {
  const { building, builtAt, upcoming, ...rest } = payload as Record<string, unknown> & BuildFlags;
  void building;
  void builtAt;
  void upcoming;
  return { ...rest, truncated: true };
}
