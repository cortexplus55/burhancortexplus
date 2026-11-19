/**
 * Eşzamanlı gönderim kilidi (20 Kasım 2026, Faz 3). React durumu (`loading`) bir sonraki çizimde güncellenir; o
 * arada gelen ikinci Enter ya da çift tık ikinci isteği gönderiyordu. Kilit eşzamanlıdır: ilk çağrı alır, iş bitince
 * (başarı ya da hata) bırakır; arada gelen çağrı hiçbir şey yapmaz.
 */
export type SendLock = {
  /** Kilit boştaysa alır ve `true` döner; doluysa `false`. */
  tryAcquire(): boolean;
  release(): void;
  readonly held: boolean;
};

export function createSendLock(): SendLock {
  let held = false;
  return {
    tryAcquire() {
      if (held) return false;
      held = true;
      return true;
    },
    release() {
      held = false;
    },
    get held() {
      return held;
    },
  };
}
