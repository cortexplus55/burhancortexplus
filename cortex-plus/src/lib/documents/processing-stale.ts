/**
 * Belge işleme ne zaman "takılı" sayılır.
 *
 * 24 Eylül 2026'da test hesabında 29 Ağustos'tan beri `processing`te duran
 * bir PDF vardı ve dashboard'un tek ana aksiyonu bir aydır "Belge işleniyor"
 * diyordu. İşleme gerçekten dakikalar sürüyor; yarım saat kımıldamayan kayıt
 * bitmeyecek demektir. Bu eşik iki yerde aynı: ana aksiyon seçimi
 * (learning-hub) ve belge sayfasındaki "Yeniden işle" düğmesi.
 */
export const STALE_PROCESSING_MS = 30 * 60 * 1000;

export function isProcessingStale(
  status: string | null | undefined,
  updatedAt: string | null | undefined,
  now = new Date(),
): boolean {
  if (status !== "processing" && status !== "pending") return false;
  if (!updatedAt) return true;
  const t = new Date(updatedAt).getTime();
  if (Number.isNaN(t)) return true;
  return now.getTime() - t > STALE_PROCESSING_MS;
}
