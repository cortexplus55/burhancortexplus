/**
 * Sınav Radyosu'nun kilit ekranı / kulaklık denetimleri (Faz 7, 20 Kasım 2026): `navigator.mediaSession` başlığı ve
 * oynat, duraklat, önceki, sonraki, 15 sn geri / ileri. Tarayıcı desteklemiyorsa (ya da bir eylemi tanımıyorsa)
 * sessizce geçer; radyo ekrandaki düğmelerle çalışmaya devam eder.
 */

export type RadioMediaHandlers = {
  play: () => void;
  pause: () => void;
  previous: () => void;
  next: () => void;
  seekBackward: () => void;
  seekForward: () => void;
};

export type RadioMediaMeta = { title: string; artist: string; album: string };

export const RADIO_MEDIA_ACTIONS = ["play", "pause", "previoustrack", "nexttrack", "seekbackward", "seekforward"] as const;

type SessionLike = {
  metadata: unknown;
  playbackState?: string;
  setActionHandler: (action: string, handler: ((details?: unknown) => void) | null) => void;
};

function sessionOf(nav: unknown): SessionLike | null {
  if (!nav || typeof nav !== "object" || !("mediaSession" in nav)) return null;
  const session = (nav as { mediaSession?: unknown }).mediaSession;
  return session && typeof (session as SessionLike).setActionHandler === "function" ? (session as SessionLike) : null;
}

function metadataOf(meta: RadioMediaMeta): unknown {
  const Ctor = (globalThis as { MediaMetadata?: new (init: RadioMediaMeta) => unknown }).MediaMetadata;
  if (typeof Ctor !== "function") return null;
  try {
    return new Ctor(meta);
  } catch {
    return null;
  }
}

/** Başlığı ve eylemleri bağlar; dönen işlev hepsini geri alır. Destek yoksa hiçbir şey yapmayan işlev döner. */
export function bindRadioMediaSession(nav: unknown, meta: RadioMediaMeta, handlers: RadioMediaHandlers): () => void {
  const session = sessionOf(nav);
  if (!session) return () => undefined;
  const metadata = metadataOf(meta);
  if (metadata) {
    try {
      session.metadata = metadata;
    } catch {
      // Salt okunur ya da desteksiz.
    }
  }
  const map: Record<(typeof RADIO_MEDIA_ACTIONS)[number], () => void> = {
    play: handlers.play,
    pause: handlers.pause,
    previoustrack: handlers.previous,
    nexttrack: handlers.next,
    seekbackward: handlers.seekBackward,
    seekforward: handlers.seekForward,
  };
  const bind = (action: string, run: (() => void) | null) => {
    try {
      session.setActionHandler(action, run);
    } catch {
      // Bu tarayıcı eylemi tanımıyor.
    }
  };
  for (const action of RADIO_MEDIA_ACTIONS) bind(action, map[action]);
  return () => {
    for (const action of RADIO_MEDIA_ACTIONS) bind(action, null);
    try {
      session.metadata = null;
      session.playbackState = "none";
    } catch {
      // Desteksiz.
    }
  };
}

export function setRadioPlaybackState(nav: unknown, playing: boolean): void {
  const session = sessionOf(nav);
  if (!session) return;
  try {
    session.playbackState = playing ? "playing" : "paused";
  } catch {
    // Desteksiz.
  }
}
