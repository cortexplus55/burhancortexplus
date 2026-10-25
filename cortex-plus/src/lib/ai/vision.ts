/**
 * Görsel soru / OCR çağrıları: OpenAI `image_url.detail` varsayılanı "auto" küçük
 * rakamı, Romen öncülü ve şık harfini kaçırabiliyor. Sınav fotoğrafında her zaman high.
 */
export function visionImage(url: string): { url: string; detail: "high" } {
  return { url, detail: "high" };
}
