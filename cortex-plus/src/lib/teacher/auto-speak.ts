/*
  "Yanıtları sesli oku" (öğretmen v3, 21 Kasım 2026, ürün sahibinin onayı): açıkken her öğretmen yanıtı akış bitince
  yanıtın 🔊 düğmesiyle aynı yoldan okunur. Profilde bu tercihin sütunu ve yazma yolu yok (sütun/göç eklenmez); tercih
  tarayıcıda saklanır. Okunamazsa ya da yazılamazsa kapalı kalır. Varsayılan kapalı.
*/

export const AUTO_SPEAK_KEY = "cp:ogretmen:sesli-oku";
export const AUTO_SPEAK_LABEL = "Yanıtları sesli oku";
/** Ücretsiz hesapta ses Plus'ta (`AUDIO_SYNTHESIZE`, `PLUS_ONLY_ACTIONS`); yükseltme penceresinin adı. */
export const AUTO_SPEAK_GATE_NAME = "Yanıtları sesli okuma";

export function readAutoSpeak(): boolean {
  try {
    return window.localStorage.getItem(AUTO_SPEAK_KEY) === "1";
  } catch {
    return false;
  }
}

export function writeAutoSpeak(on: boolean): void {
  try {
    if (on) window.localStorage.setItem(AUTO_SPEAK_KEY, "1");
    else window.localStorage.removeItem(AUTO_SPEAK_KEY);
  } catch {
    // Gizli pencere ya da kapalı depolama: tercih yalnız bu açılışta geçerli.
  }
}
