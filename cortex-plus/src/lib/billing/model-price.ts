/**
 * Kullanım kaydının fiyatı (`ai_model_prices`, bin jeton başına).
 *
 * Hızlı işlem kaydı "<model>-fast" adıyla yazılır (`billedModel`). 31 Ekim 2026: taranmış PDF'te 25 sayfa
 * `gpt-4.1-fast` ile okundu ve bu adın fiyat satırı yoktu; maliyet sayfası o çağrıları saymıyordu. Satır göçle eklendi
 * (`20261031150000`); yine de bir gün yeni bir model hızlı işlemde çalışıp satırı unutulursa gider gizlenmesin diye
 * "-fast" satırı yoksa normal fiyatın iki katı sayılır (OpenAI hızlı işlem tablosu: girdi ve çıktı iki kat).
 */
export type ModelPrice = { input: number; output: number };

export const FAST_SUFFIX = "-fast";
export const FAST_PRICE_FACTOR = 2;

export function priceForModel(model: string, prices: ReadonlyMap<string, ModelPrice>): ModelPrice | null {
  const direct = prices.get(model);
  if (direct) return direct;
  if (!model.endsWith(FAST_SUFFIX)) return null;
  const base = prices.get(model.slice(0, -FAST_SUFFIX.length));
  return base ? { input: base.input * FAST_PRICE_FACTOR, output: base.output * FAST_PRICE_FACTOR } : null;
}
