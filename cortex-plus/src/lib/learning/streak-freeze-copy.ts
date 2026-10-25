// Sunucu bileşenleri de çağırıyor: "use client" dosyasına taşımayın — sunucudan
// istemci modülünün fonksiyonu çağrılınca sayfa yayında düşer (/ilerleme, Ekim 2026).

export type StreakFreezeBadgeState = {
  remaining: number;
  protected: boolean;
  used: boolean;
};

export const STREAK_FREEZE_COPY = {
  saved: "Seri Kalkanı seni korudu!",
  ready: "Seri Kalkanı hazır",
  none: "Bu hafta kalkanın bitti",
} as const;

export function streakFreezeTitle(state: StreakFreezeBadgeState): string {
  if (state.protected || state.used) return STREAK_FREEZE_COPY.saved;
  const remaining = Number(state.remaining) || 0;
  if (remaining > 0) {
    return remaining === 1
      ? `${STREAK_FREEZE_COPY.ready} · bu hafta 1 hakkın var`
      : `${STREAK_FREEZE_COPY.ready} · bu hafta ${remaining} hakkın var`;
  }
  return STREAK_FREEZE_COPY.none;
}
