import {
  REALTIME_MAX_MINUTES,
  REALTIME_MINUTE_GRACE_SECONDS,
  REALTIME_MINUTE_SECONDS,
  REALTIME_TRIAL_SECONDS,
  REALTIME_UNCONNECTED_WINDOW_SECONDS,
  REALTIME_WATCHDOG_GRACE_SECONDS,
  type RealtimeAccess,
} from "@/lib/tutor/realtime/config";

/*
  Canlı sesli öğretmenin ücret kuralı (21 Kasım 2026, Burhan'ın kararı: dakikası 40 kredi, başlayan dakika ödenir).
  Saf hesap; zaman her yerde SUNUCU saatidir (istemcinin bildirdiği süre ücrete girmez).

  - Dakika n, oturumun başlangıcından (n − 1) × 60 sn sonra başlar ve kredisi o dakika başlamadan ayrılır (dakika 1
    oturum açılırken, sonrakiler /tick ile).
  - Ayrılan dakika, oturum bittiğinde o dakikanın ilk REALTIME_MINUTE_GRACE_SECONDS (5) saniyesi geçmişse ÖDENİR
    (kesinleşir); geçmemişse ya da dakika hiç başlamadıysa İADE edilir. Yani "Durdur"a 2:05'te ya da sonra basan
    3 dakika öder, 2:04'te basan 2 dakika (3. dakikanın kredisi 1:55'te ayrılmıştı, iade edilir).
  - Tam geçen dakika bir sonraki dakika ayrılırken kesinleşir (bekleyen satır uzun durmasın).
  - Bağlantı hiç kurulmadan REALTIME_UNCONNECTED_WINDOW_SECONDS içinde biten oturum: bütün dakikalar iade (günde sınırlı,
    çağıran sayar).
*/

export const MINUTE_MS = REALTIME_MINUTE_SECONDS * 1000;
export const GRACE_MS = REALTIME_MINUTE_GRACE_SECONDS * 1000;

export type MinuteSettle = "pending" | "committed" | "refunded";
export type MinuteEntry = { minute: number; reservationId: string | null; settle: MinuteSettle };

/** Dakikanın kredi ayırma anahtarı: aynı dakika iki kez ayrılmaz (çift /tick aynı satırı bulur). */
export function minuteReservationKey(sessionId: string, minute: number): string {
  return `realtime_voice:${sessionId}:m${minute}`;
}

/** Dakika n'nin başladığı an (ms). */
export function minuteStartMs(startedAt: number, minute: number): number {
  return startedAt + (minute - 1) * MINUTE_MS;
}

/** Oturum `endedAt` anında bittiyse dakika n ödenir mi. */
export function minuteChargeable(startedAt: number, minute: number, endedAt: number): boolean {
  return endedAt - minuteStartMs(startedAt, minute) >= GRACE_MS;
}

/** Ödenen sürenin bittiği an: ücretlide ayrılmış dakikaların sonu, denemede deneme süresinin sonu. */
export function paidUntilMs(startedAt: number, access: RealtimeAccess, minutes: number): number {
  if (access === "trial") return startedAt + REALTIME_TRIAL_SECONDS * 1000;
  return startedAt + Math.max(1, minutes) * MINUTE_MS;
}

/** Bekçinin çağrıyı kapatacağı an: ödenen sürenin bitiminden REALTIME_WATCHDOG_GRACE_SECONDS sonra (denemede 5 sn). */
export function watchdogDueMs(startedAt: number, access: RealtimeAccess, minutes: number): number {
  const grace = access === "trial" ? 5_000 : REALTIME_WATCHDOG_GRACE_SECONDS * 1000;
  return paidUntilMs(startedAt, access, minutes) + grace;
}

/** Oturumun ücrete esas süresi (sn): bitiş ödenen süreyi geçemez. */
export function billedSeconds(startedAt: number, access: RealtimeAccess, minutes: number, endedAt: number): number {
  const end = Math.min(endedAt, paidUntilMs(startedAt, access, minutes));
  return Math.max(0, Math.round((end - startedAt) / 1000));
}

export type TickDecision =
  | { kind: "reserve"; minute: number }
  /** Bu dakika zaten ayrılmış (aynı /tick yeniden geldi). */
  | { kind: "already"; minute: number }
  /** Çok erken: dakikanın başlamasına 30 sn'den fazla var. */
  | { kind: "early" }
  | { kind: "max_duration" }
  /** Sırayı atlayan istek (2'den sonra 4). */
  | { kind: "invalid" };

export const TICK_EARLY_MS = 30_000;

/** /tick'in istediği dakikaya karar. `paidMinutes` = şu ana kadar ayrılmış dakika sayısı. */
export function tickDecision(input: { startedAt: number; paidMinutes: number; requested: number; now: number }): TickDecision {
  const { startedAt, paidMinutes, requested, now } = input;
  if (!Number.isInteger(requested) || requested < 2) return { kind: "invalid" };
  if (requested <= paidMinutes) return { kind: "already", minute: paidMinutes };
  if (requested !== paidMinutes + 1) return { kind: "invalid" };
  if (requested > REALTIME_MAX_MINUTES) return { kind: "max_duration" };
  if (minuteStartMs(startedAt, requested) - now > TICK_EARLY_MS) return { kind: "early" };
  return { kind: "reserve", minute: requested };
}

export type SettlePlan = { commit: MinuteEntry[]; refund: MinuteEntry[]; chargedMinutes: number };

/**
 * Bitişte bekleyen dakikaların kaderi. `refundAll` (bağlantı hiç kurulmadı) her bekleyen dakikayı iade eder.
 * Daha önce kesinleşmiş dakika sayıma girer, yeniden işlenmez.
 */
export function settlePlan(input: {
  startedAt: number;
  minutes: readonly MinuteEntry[];
  endedAt: number;
  refundAll?: boolean;
}): SettlePlan {
  const commit: MinuteEntry[] = [];
  const refund: MinuteEntry[] = [];
  let chargedMinutes = 0;
  for (const entry of input.minutes) {
    if (entry.settle === "committed") {
      chargedMinutes += 1;
      continue;
    }
    if (entry.settle === "refunded") continue;
    if (!input.refundAll && minuteChargeable(input.startedAt, entry.minute, input.endedAt)) {
      commit.push(entry);
      chargedMinutes += 1;
    } else {
      refund.push(entry);
    }
  }
  return { commit, refund, chargedMinutes };
}

/** Tam geçmiş (bir sonraki dakika ayrılırken kesinleşecek) bekleyen dakikalar. */
export function elapsedPending(input: { startedAt: number; minutes: readonly MinuteEntry[]; now: number }): MinuteEntry[] {
  return input.minutes.filter(
    (entry) => entry.settle === "pending" && minuteChargeable(input.startedAt, entry.minute, input.now),
  );
}

/** Bağlantısız erken bitiş: iade hakkı doğar mı (günlük sayaç çağıranda). */
export function unconnectedRefundEligible(input: {
  connected: boolean;
  startedAt: number;
  endedAt: number;
  paidMinutes: number;
}): boolean {
  return (
    !input.connected &&
    input.paidMinutes <= 1 &&
    input.endedAt - input.startedAt <= REALTIME_UNCONNECTED_WINDOW_SECONDS * 1000
  );
}
