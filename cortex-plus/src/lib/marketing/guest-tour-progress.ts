/**
 * Turdan kayda dürüst süreklilik (C3, 13 Kasım 2026, ürün sahibinin kararı).
 *
 * Ana sayfadaki 7 adımlı turda misafirin ulaştığı adımlar yalnız bu sekmenin oturumunda (`sessionStorage`) tutulur:
 * sunucuya gitmez, yeni API yok. Kayıt aynı sekmede biter (e-posta ile kayıt `router.push`, Google ile kayıt aynı
 * sekmede gidip döner), bu yüzden öğrenci ilk kez ana ekrana geldiğinde kayıt hâlâ okunur. Ana ekran yalnız "turda
 * yol haritasına kadar geldin" bilgisini kullanır: turdaki cevaplar ölçüm sayılmaz, hazırlık yüzdesine yazılmaz.
 *
 * - Yazan: tur (`writeTourProgress`); okuyan: ana ekranın ilk adım başlatıcısı (`readTourProgress`).
 * - Kayıt 24 saatten eskiyse ya da biçimi bozuksa yok sayılır.
 * - Depolama kapalıysa (gizli pencere, kota) yazma sessizce düşer, okuma `null` döner: kart görünmez, başka hiçbir
 *   şey değişmez.
 */

export const TOUR_PROGRESS_KEY = "cp:guest-tour";

/** Turda ulaşılan adım kimlikleri ("upload" … "plus") ve seçili hedef kitle sekmesi. */
export type TourProgress = { steps: string[]; segment: string; at: number };

/** Kaydın geçerlilik süresi: kayıt için yeter, unutulan tur ertesi gün kart çıkarmaz. */
export const TOUR_PROGRESS_TTL_MS = 24 * 60 * 60 * 1000;

const STEP_IDS = ["upload", "roadmap", "lesson", "question", "cards", "check", "plus"] as const;
const SEGMENT_IDS = ["lise", "yks-lgs", "universite", "akademik"] as const;

function isStep(value: unknown): value is string {
  return typeof value === "string" && (STEP_IDS as readonly string[]).includes(value);
}

function isSegment(value: unknown): value is string {
  return typeof value === "string" && (SEGMENT_IDS as readonly string[]).includes(value);
}

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}

function parse(raw: string | null): TourProgress | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<TourProgress>;
    if (!value || typeof value !== "object") return null;
    if (!Array.isArray(value.steps) || !value.steps.length || !value.steps.every(isStep)) return null;
    if (!isSegment(value.segment)) return null;
    if (typeof value.at !== "number" || !Number.isFinite(value.at)) return null;
    // Turun sırasıyla, tekrarsız.
    const steps = STEP_IDS.filter((id) => value.steps!.includes(id));
    return { steps, segment: value.segment, at: value.at };
  } catch {
    return null;
  }
}

/**
 * Turda bir adıma ulaşıldı: adımı önceki adımlarla birleştirir, sekmeyi ve zamanı günceller. Bilinmeyen adım ya da
 * sekme yazılmaz. Depolama kapalıysa sessiz.
 */
export function writeTourProgress(entry: { step: string; segment: string }, now = Date.now()): void {
  if (!isStep(entry.step) || !isSegment(entry.segment)) return;
  const store = storage();
  if (!store) return;
  try {
    const previous = parse(store.getItem(TOUR_PROGRESS_KEY));
    const fresh = previous && now - previous.at <= TOUR_PROGRESS_TTL_MS ? previous.steps : [];
    const steps = STEP_IDS.filter((id) => id === entry.step || fresh.includes(id));
    const next: TourProgress = { steps, segment: entry.segment, at: now };
    store.setItem(TOUR_PROGRESS_KEY, JSON.stringify(next));
  } catch {
    /* depolama kapalı ya da dolu: kart çıkmaz, başka bir şey değişmez */
  }
}

/** Bu sekmenin tur kaydı; yoksa, bozuksa ya da 24 saatten eskiyse null. */
export function readTourProgress(now = Date.now()): TourProgress | null {
  const store = storage();
  if (!store) return null;
  let progress: TourProgress | null = null;
  try {
    progress = parse(store.getItem(TOUR_PROGRESS_KEY));
  } catch {
    return null;
  }
  if (!progress) return null;
  if (progress.at > now + 60_000 || now - progress.at > TOUR_PROGRESS_TTL_MS) return null;
  return progress;
}

/** Kart kullanıldı ya da gizlendi: kayıt silinir, kart bir daha çıkmaz. */
export function clearTourProgress(): void {
  const store = storage();
  if (!store) return;
  try {
    store.removeItem(TOUR_PROGRESS_KEY);
  } catch {
    /* depolama kapalı */
  }
}
