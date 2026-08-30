type Tone = "correct" | "wrong" | "fanfare";

function beep(
  ctx: AudioContext,
  frequency: number,
  start: number,
  duration: number,
  gain = 0.08,
) {
  const oscillator = ctx.createOscillator();
  const amp = ctx.createGain();
  oscillator.type = "sine";
  oscillator.frequency.value = frequency;
  amp.gain.setValueAtTime(0, start);
  amp.gain.linearRampToValueAtTime(gain, start + 0.02);
  amp.gain.exponentialRampToValueAtTime(0.001, start + duration);
  oscillator.connect(amp);
  amp.connect(ctx.destination);
  oscillator.start(start);
  oscillator.stop(start + duration);
}

export function playPlusTone(kind: Tone) {
  if (typeof window === "undefined") return;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const Ctor =
    window.AudioContext ||
    (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return;
  const ctx = new Ctor();
  const now = ctx.currentTime;
  if (kind === "correct") {
    beep(ctx, 523, now, 0.12);
    beep(ctx, 784, now + 0.1, 0.16);
  } else if (kind === "wrong") {
    beep(ctx, 196, now, 0.18, 0.06);
  } else {
    beep(ctx, 392, now, 0.12);
    beep(ctx, 523, now + 0.1, 0.12);
    beep(ctx, 659, now + 0.2, 0.14);
    beep(ctx, 784, now + 0.34, 0.28, 0.09);
  }
  window.setTimeout(() => void ctx.close(), 900);
}
