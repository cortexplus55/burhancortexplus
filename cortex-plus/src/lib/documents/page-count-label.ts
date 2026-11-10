/**
 * Belgenin sayfa sayısı etiketi (10 Kasım 2026): sunu dosyasında birim "slayt"tır, öbür belgelerde "sayfa".
 * Karar yalnız dosya uzantısından; içerik okunmaz.
 */
const SLIDE_EXTENSIONS = /\.(pptx?|ppsx?|odp|key)$/i;

export function isSlideDeck(fileName: string | null | undefined): boolean {
  return SLIDE_EXTENSIONS.test((fileName ?? "").trim());
}

export function pageUnit(fileName: string | null | undefined): "slayt" | "sayfa" {
  return isSlideDeck(fileName) ? "slayt" : "sayfa";
}

export function pageCountLabel(fileName: string | null | undefined, count: number): string {
  return `${count} ${pageUnit(fileName)}`;
}
