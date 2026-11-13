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

/**
 * `--cx-ease-settle` eğrisi (cubic-bezier(0.22, 1, 0.36, 1)) JavaScript'te: sayı sayan anlar CSS'teki yerleşmeyle aynı
 * eğriyle ilerlesin. Girdi ve çıktı 0-1.
 */
export function easeSettle(progress: number): number {
  const t = Math.min(1, Math.max(0, progress));
  const cx = 3 * 0.22;
  const bx = 3 * (0.36 - 0.22) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * 1;
  const by = 3 * (1 - 1) - cy;
  const ay = 1 - cy - by;
  const sampleX = (u: number) => ((ax * u + bx) * u + cx) * u;
  const sampleY = (u: number) => ((ay * u + by) * u + cy) * u;
  const slopeX = (u: number) => (3 * ax * u + 2 * bx) * u + cx;
  // Eğri x'te tekdüze artar: Newton birkaç adımda bulur, kaçarsa ikiye bölme.
  let u = t;
  for (let step = 0; step < 8; step += 1) {
    const error = sampleX(u) - t;
    const slope = slopeX(u);
    if (Math.abs(error) < 1e-6) return sampleY(u);
    if (Math.abs(slope) < 1e-6) break;
    u -= error / slope;
  }
  let low = 0;
  let high = 1;
  u = t;
  for (let step = 0; step < 30; step += 1) {
    const x = sampleX(u);
    if (Math.abs(x - t) < 1e-6) break;
    if (x < t) low = u;
    else high = u;
    u = (low + high) / 2;
  }
  return sampleY(u);
}

/** Şu an oynayan bir an var mı (testler ve bekçiler için). */
export function momentPlaying(): boolean {
  return active !== null;
}
