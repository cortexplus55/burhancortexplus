/*
  Büyüme yerleşimleri (Faz 11C, bayrak `ui.v2.buyume`, ANA-PROMPT 11C). Kurallar her yerleşimde aynı:
  - yalnız olumlu anda ve çalışma ekranlarının dışında (yerleşimi çağıran yer bunu seçer);
  - gün başına en çok BİR öneri (bütün yerleşimler toplamı), sayaç aygıta özel `localStorage`; okunamazsa gösterilmez;
  - kapatılan yerleşim `GROWTH_DISMISS_COOLDOWN_DAYS` gün çıkmaz;
  - hiçbir şey kendiliğinden gönderilmez; plana bağlı değil, yükseltme teklifi değil.
  Saf mantık burada (zaman ve depo enjekte edilir); kanca `use-growth-prompt.ts`.
*/

export const GROWTH_DISMISS_COOLDOWN_DAYS = 30;
export const GROWTH_PLACEMENTS = ["home_invite"] as const;
export type GrowthPlacement = (typeof GROWTH_PLACEMENTS)[number];

/** `localStorage` benzeri; testte bellek içi. */
export type GrowthStore = { getItem(key: string): string | null; setItem(key: string, value: string): void };

const DAY_KEY = "cx-growth-day";
const dismissKey = (placement: GrowthPlacement) => `cx-growth-dismiss:${placement}`;

/** İstanbul günü (YYYY-AA-GG): "günde bir" sayacı yerel güne göre. */
export function istanbulDay(now: Date): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Istanbul", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}

/** Bu yerleşim şimdi gösterilebilir mi. Depo okunamazsa (gizli sekme, engelli depolama) hayır. */
export function growthVisible(placement: GrowthPlacement, now: Date, store: GrowthStore | null): boolean {
  if (!store) return false;
  try {
    const dismissed = store.getItem(dismissKey(placement));
    if (dismissed) {
      const at = Date.parse(dismissed);
      if (Number.isFinite(at) && now.getTime() - at < GROWTH_DISMISS_COOLDOWN_DAYS * 86_400_000) return false;
    }
    const raw = store.getItem(DAY_KEY);
    if (raw) {
      const shown = JSON.parse(raw) as { day?: string; placement?: string };
      // Bugün başka bir yerleşim gösterildiyse bu gösterilmez; aynı yerleşim aynı gün yeniden çizilebilir.
      if (shown.day === istanbulDay(now) && shown.placement !== placement) return false;
    }
    return true;
  } catch {
    return false;
  }
}

/** Öneri gerçekten çizildi: günün önerisi bu yerleşim. İlk kez çizildiyse true (olay bir kez gönderilsin). */
export function markGrowthShown(placement: GrowthPlacement, now: Date, store: GrowthStore | null): boolean {
  if (!store) return false;
  try {
    const day = istanbulDay(now);
    const raw = store.getItem(DAY_KEY);
    const shown = raw ? (JSON.parse(raw) as { day?: string; placement?: string }) : null;
    if (shown?.day === day && shown.placement === placement) return false;
    store.setItem(DAY_KEY, JSON.stringify({ day, placement }));
    return true;
  } catch {
    return false;
  }
}

export function dismissGrowth(placement: GrowthPlacement, now: Date, store: GrowthStore | null): void {
  if (!store) return;
  try {
    store.setItem(dismissKey(placement), now.toISOString());
  } catch {
    // Depo yazılamıyorsa öneri bu oturumda gizli kalır (kanca durumu).
  }
}
