/**
 * Kayıtta kullanılacak ad.
 *
 * Sihirbazdaki "Google ile devam et" ad alanı doldurulmadan basılabiliyor;
 * o zaman ad Google hesabından (full_name / name) alınır, o da yoksa
 * e-postanın @ öncesi. Öğrenci adını sonra profilden değiştirebilir.
 */
export function resolveFullName(
  typed: string | null | undefined,
  user: { email?: string | null; user_metadata?: Record<string, unknown> | null },
): string {
  const fromForm = (typed ?? "").trim();
  if (fromForm.length >= 2) return fromForm.slice(0, 120);
  const meta = user.user_metadata ?? {};
  for (const key of ["full_name", "name"]) {
    const value = meta[key];
    if (typeof value === "string" && value.trim().length >= 2) return value.trim().slice(0, 120);
  }
  return (user.email?.split("@")[0]?.trim() ?? "").slice(0, 120);
}
