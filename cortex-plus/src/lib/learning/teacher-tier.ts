/**
 * Hızlı işlem (OpenAI Fast mode, jeton 2 kat): yalnız öğrenci beklerken, yani önceden hazır
 * içerik yokken (18 Ekim 2026, ürün sahibinin kararı: "hızlı işlem yalnız hazır içerik yoksa").
 * Önceden yazım normal işlemde. Ders motoru kendi akışında aynı kuralı uygular
 * (`createLessonIo`); test, kart, podcast, sözlü ve doğru/yanlış bu yardımcıyla.
 *
 * Astra ile yan yana (18 Ekim 2026): soğuk podcast Astra'da 43 sn, bizde normal işlemde ~85 sn.
 */
export function fastTier(fast: boolean | undefined) {
  return fast ? ({ service_tier: "fast" } as const) : {};
}

/** Hızlı işlemin fiyatı ayrı satırda (ai_model_prices: "<model>-fast"); düşürülen istek normal fiyattır. */
export function billedModel(model: string, servedTier: string | null | undefined): string {
  return servedTier === "fast" || servedTier === "priority" ? `${model}-fast` : model;
}
