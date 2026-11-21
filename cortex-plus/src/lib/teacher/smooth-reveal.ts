/*
  Yumuşak kelime akışı (öğretmen v3, 21 Kasım 2026): sunucudan gelen parçalar ekrana küt diye düşmez; metin kelime kelime,
  doğal okuma hızında açılır. Saf hesap: hangi uzunluğa kadar görüneceği. Tampon büyürse hız artar (açılış hiçbir zaman
  ~1,2 sn'den fazla geride kalmaz); akış bitince kalan kısım en çok ~0,6 sn'de tamamlanır. Hareket azaltmada kullanılmaz
  (metin geldiği gibi).
*/

/** Taban hız: saniyede karakter (~9 kelime). Gözün rahat izlediği akış. */
export const REVEAL_BASE_CPS = 48;
/** Görünen metin gelen metnin en çok bu kadar gerisinde kalır. */
export const REVEAL_MAX_LAG_MS = 1200;
/** Akış bittiğinde kalan kısım en geç bu sürede biter. */
export const REVEAL_FINISH_MS = 600;
/** Yeni kelimenin belirme süresi (CSS ile aynı). */
export const REVEAL_FADE_MS = 120;

export type RevealState = { shown: number; carry: number };

/** Kelimenin sonuna (boşluğa ya da metnin sonuna) kadar ilerler: yarım kelime görünmez. */
export function wordEnd(text: string, from: number): number {
  let index = Math.max(0, Math.min(from, text.length));
  while (index < text.length && !/\s/.test(text[index]!)) index += 1;
  return index;
}

/**
 * Bir karelik ilerleme. `dtMs` iki kare arasındaki süre; `streaming` akış sürüyor mu. Küsurat (`carry`) bir sonraki
 * kareye taşınır; kelime sınırına yuvarlanan fazlalık küsurattan düşülür (hız ortalamada korunur).
 */
export function revealStep(state: RevealState, target: string, dtMs: number, streaming: boolean, baseCps = REVEAL_BASE_CPS): RevealState {
  const total = target.length;
  if (state.shown >= total) return { shown: total, carry: 0 };
  const backlog = total - state.shown;
  let rate = Math.max(baseCps, backlog / (REVEAL_MAX_LAG_MS / 1000));
  if (!streaming) rate = Math.max(rate, backlog / (REVEAL_FINISH_MS / 1000));
  const budget = state.carry + (rate * Math.max(0, dtMs)) / 1000;
  const whole = Math.floor(budget);
  if (whole <= 0) return { shown: state.shown, carry: budget };
  const raw = Math.min(total, state.shown + whole);
  const snapped = raw >= total ? total : wordEnd(target, raw);
  return { shown: snapped, carry: budget - whole - (snapped - raw) };
}
