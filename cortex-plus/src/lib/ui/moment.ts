/**
 * Anlar (his katmanı), depo kararı 11 (13 Kasım 2026, ürün sahibinin kararı).
 *
 * "An", öğrencinin ya da misafirin yaptığı bir işin karşılığını gösteren kısa harekettir (tarama, halkanın dolması,
 * yoldaki adımın kapanması, ipucu izinin parlaması). Kurallar burada tek yerde:
 *
 * - Bir ekranda aynı anda en çok bir an oynar: yenisi başlarsa öncekinin sonucu hemen gösterilir (`finish`).
 * - Bir an en çok 2,5 sn sürer (`MOMENT_MAX_MS`); istenen süre bunu aşarsa kırpılır.
 * - Tıklama, dokunma ya da Enter / Space / Escape anı hemen bitirir. Olay engellenmez: o tıklama kendi işini de yapar.
 *   An hiçbir işlemi bekletmez ya da kilitlemez.
 * - `prefers-reduced-motion: reduce` açıkken an hiç başlamaz; `finish` aynı anda çağrılır (sonuç 0 ms'de).
 *
 * Anı başlatan tıklamanın kendisi anı atlatmasın diye dinleyiciler bir sonraki karede bağlanır.
 */

export const MOMENT_MAX_MS = 2500;

/** §5'ten süreler (ms): onay işareti, çizgi dolması, yerleşme. CSS karşılıkları tokens.css'te. */
export const MOMENT_MS = { check: 220, line: 380, settle: 600 } as const;

const SKIP_KEYS = new Set(["Enter", " ", "Spacebar", "Escape"]);

export function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" && typeof window.matchMedia === "function"
    ? window.matchMedia("(prefers-reduced-motion: reduce)").matches
    : false;
}

type Active = { id: number; end: (skipped: boolean) => void };

let active: Active | null = null;
let counter = 0;

export type MomentHandle = {
  /** Anı hemen bitirir (sonucu gösterir). Birden çok çağrı zararsız. */
  end: () => void;
  /** An hareket azaltma yüzünden hiç oynamadı mı. */
  instant: boolean;
};

/**
 * Bir an başlatır. `finish(skipped)` an bittiğinde bir kez çağrılır: süre dolunca, kullanıcı atlayınca, başka bir an
 * başlayınca ya da `end()` çağrılınca. Hareket azaltmada aynı anda çağrılır ve `instant: true` döner.
 */
export function startMoment(durationMs: number, finish: (skipped: boolean) => void): MomentHandle {
  if (active) active.end(true);
  if (typeof window === "undefined" || prefersReducedMotion() || durationMs <= 0) {
    finish(false);
    return { end: () => undefined, instant: true };
  }

  const id = (counter += 1);
  let done = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let frame: number | null = null;

  const onPointer = () => end(true);
  const onKey = (event: KeyboardEvent) => {
    if (SKIP_KEYS.has(event.key)) end(true);
  };

  function detach() {
    if (timer) clearTimeout(timer);
    if (frame !== null && typeof cancelAnimationFrame === "function") cancelAnimationFrame(frame);
    window.removeEventListener("pointerdown", onPointer, true);
    window.removeEventListener("keydown", onKey, true);
  }

  function end(skipped: boolean) {
    if (done) return;
    done = true;
    detach();
    if (active?.id === id) active = null;
    finish(skipped);
  }

  active = { id, end };
  timer = setTimeout(() => end(false), Math.min(durationMs, MOMENT_MAX_MS));
  const attach = () => {
    frame = null;
    if (done) return;
    window.addEventListener("pointerdown", onPointer, true);
    window.addEventListener("keydown", onKey, true);
  };
  if (typeof requestAnimationFrame === "function") frame = requestAnimationFrame(attach);
  else attach();

  return { end: () => end(true), instant: false };
}

/** Şu an oynayan bir an var mı (testler ve bekçiler için). */
export function momentPlaying(): boolean {
  return active !== null;
}
