"use client";

import { isNativeApp } from "@/lib/platform/native";
import { cortexDevice } from "@/lib/platform/native-device";

/**
 * Mağaza değerlendirme penceresi (26 Kasım 2026, mobil 1. adım). App Store ve Google Play'in kendi penceresi açılır;
 * kendi "Bizi değerlendir" ekranımız yok (iki mağaza da bunu ister), puan ya da yorum karşılığında hiçbir şey verilmez.
 *
 * Ne zaman: öğrenci gerçekten bir şey başardığında (puanlı bir etkinliği %80 ve üstüyle bitirince). Şartlar cihazda:
 * en az 3 başarı, uygulamanın ilk açılışından en az 3 gün sonra ve son istekten en az 120 gün sonra. Pencerenin
 * gösterilip gösterilmeyeceğine yine mağaza karar verir (Apple yılda en çok 3 kez gösterir).
 */

export const REVIEW_STATE_KEY = "cp.review";
export const REVIEW_MIN_WINS = 3;
export const REVIEW_MIN_AGE_MS = 3 * 24 * 60 * 60 * 1000;
export const REVIEW_GAP_MS = 120 * 24 * 60 * 60 * 1000;
export const REVIEW_SCORE_THRESHOLD = 0.8;

export type ReviewState = { since: number; wins: number; askedAt: number | null };

export function parseReviewState(raw: string | null | undefined, now: number): ReviewState {
  try {
    const value = JSON.parse(String(raw ?? "")) as Partial<ReviewState>;
    const since = typeof value.since === "number" && value.since > 0 && value.since <= now ? value.since : now;
    const wins = typeof value.wins === "number" && value.wins >= 0 ? Math.floor(value.wins) : 0;
    const askedAt = typeof value.askedAt === "number" && value.askedAt > 0 ? value.askedAt : null;
    return { since, wins, askedAt };
  } catch {
    return { since: now, wins: 0, askedAt: null };
  }
}

export function reviewDue(state: ReviewState, now: number): boolean {
  if (state.wins < REVIEW_MIN_WINS) return false;
  if (now - state.since < REVIEW_MIN_AGE_MS) return false;
  return state.askedAt === null || now - state.askedAt >= REVIEW_GAP_MS;
}

/** Başarı sayılır mı: puanlı etkinlikte doğru oranı eşiğin üstünde. */
export function isReviewWin(correct: number, total: number): boolean {
  return total > 0 && correct / total >= REVIEW_SCORE_THRESHOLD;
}

let busy = false;

/** Başarıyı kaydeder; şartlar tutarsa mağaza penceresini ister. Hiçbir zaman atmaz. */
export async function noteLearningWin(): Promise<void> {
  if (!isNativeApp() || busy) return;
  busy = true;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const now = Date.now();
    const state = parseReviewState((await Preferences.get({ key: REVIEW_STATE_KEY })).value, now);
    const next: ReviewState = { ...state, wins: state.wins + 1 };
    if (reviewDue(next, now)) {
      const plugin = await cortexDevice();
      if (plugin) {
        await plugin.requestReview().catch(() => ({ requested: false }));
        next.askedAt = now;
        next.wins = 0;
      }
    }
    await Preferences.set({ key: REVIEW_STATE_KEY, value: JSON.stringify(next) });
  } catch {
    /* değerlendirme isteği bir süs: düşerse akış sürer */
  } finally {
    busy = false;
  }
}

/** İlk açılış zamanını yazar (yoksa); uygulama açılışında çağrılır. */
export async function markReviewInstall(): Promise<void> {
  if (!isNativeApp()) return;
  try {
    const { Preferences } = await import("@capacitor/preferences");
    const current = (await Preferences.get({ key: REVIEW_STATE_KEY })).value;
    if (current) return;
    await Preferences.set({ key: REVIEW_STATE_KEY, value: JSON.stringify(parseReviewState(null, Date.now())) });
  } catch {
    /* yazılamazsa ilk başarıda yazılır */
  }
}
