/**
 * Yön ve eğilim anlamı (Faz 1-B düzeltmesi, 19 Kasım 2026): etiketteki "soldan sağa", "yukarıdan aşağıya",
 * "artar", "azalır" gibi ifadeler çizimle çelişmesin. Saf fonksiyonlar; şema ayrıştırmasında ve sahne
 * çiziminde aynı kural çalışır (kayıttaki eski veri de okunurken onarılır).
 */

export type PlainDirection = "up" | "down" | "left" | "right" | "up_right" | "up_left" | "down_right" | "down_left";
export type Trend = "increase" | "decrease";

/** Türkçe harfleri de kelime sayan sınır (JS `\b` yalnız ASCII bilir). */
function word(pattern: string): RegExp {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${pattern})(?![\\p{L}\\p{N}])`, "iu");
}

const RIGHT = word("soldan sağa|sola(?:dan)? sağa|sağa doğru|sağa gidildikçe|sağa ilerledikçe|sağa ilerleme|sağa gidiş");
const LEFT = word("sağdan sola|sola doğru|sola gidildikçe|sola ilerledikçe|sola ilerleme|sola gidiş");
const DOWN = word("yukarıdan aşağıya|yukarıdan aşağı|üstten alta|aşağı doğru|aşağıya doğru|aşağı inildikçe|aşağı inince|aşağı indikçe|aşağıya inildikçe");
const UP = word("aşağıdan yukarıya|aşağıdan yukarı|alttan üste|yukarı doğru|yukarıya doğru|yukarı çıkıldıkça|yukarı çıkınca|yukarıya çıkıldıkça");

const INCREASE = word("artar|artış|artan|artıyor|büyür|büyüyen|büyüyor|yükselir|yükselen|çoğalır|güçlenir|kuvvetlenir|genişler");
const DECREASE = word("azalır|azalış|azalan|azalıyor|küçülür|küçülen|küçülüyor|düşer|düşen|zayıflar|daralır");

/** Etiketin söylediği ilerleme yönü; ifade yoksa ya da kendi içinde çelişiyorsa null. */
export function phraseDirection(text: string): PlainDirection | null {
  const right = RIGHT.test(text);
  const left = LEFT.test(text);
  const down = DOWN.test(text);
  const up = UP.test(text);
  if ((right && left) || (up && down)) return null;
  const h = right ? "right" : left ? "left" : null;
  const v = down ? "down" : up ? "up" : null;
  if (h && v) return `${v}_${h}` as PlainDirection;
  return h ?? v;
}

/** Etiketin söylediği eğilim (artar / azalır); yoksa ya da ikisi birden geçiyorsa null. */
export function trendOf(text: string): Trend | null {
  const inc = INCREASE.test(text);
  const dec = DECREASE.test(text);
  if (inc === dec) return null;
  return inc ? "increase" : "decrease";
}

/**
 * İlerleme ifadesi ("soldan sağa", "yukarıdan aşağıya", "…ilerledikçe"): bir kuvvetin yönünü değil bir eğilimin
 * yönünü anlatır. "Yukarı doğru" gibi kuvvet dili bunu tetiklemez.
 */
const PROGRESSION = word(
  "soldan sağa|sağdan sola|yukarıdan aşağıya|yukarıdan aşağı|aşağıdan yukarıya|aşağıdan yukarı|üstten alta|alttan üste|[\\p{L}]+(?:dıkça|dikçe|dukça|dükçe|tıkça|tikçe|tukça|tükçe)",
);
export function isProgression(text: string): boolean {
  return PROGRESSION.test(text);
}

export const TREND_WORD: Record<Trend, string> = { increase: "artar", decrease: "azalır" };

/** Etikete eğilim kelimesi ekler (zaten söylüyorsa olduğu gibi bırakır): okun neyi gösterdiği yazıda okunsun. */
export function withTrend(label: string, trend: Trend | null | undefined): string {
  if (!trend || trendOf(label)) return label;
  return `${label}: ${TREND_WORD[trend]}`;
}
