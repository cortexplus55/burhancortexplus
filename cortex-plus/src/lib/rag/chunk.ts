/**
 * Belge parçalama — hattın yaprak parçası.
 *
 * `pipeline.ts` içindeydi ve orası OpenAI istemcisini, `env` doğrulamasını ve
 * özellik bayraklarını yanında getiriyor. Örnek akış sayfası (`/ornek`) giriş
 * istemeyen, hiç AI çağrısı yapmayan bir sayfa; ziyaretçiye "not kaç parçaya
 * ayrıldı" derken uydurmak yerine üretimin kendi fonksiyonunu çağırıyor.
 * Bunun için parçalayıcının hiçbir şey sürüklemeyen ayrı bir dosyada durması
 * gerekiyor. Hat aynı fonksiyonu buradan alıyor: gösterilen sayı gerçek.
 */

const CHUNK_SIZE = 1200;
const CHUNK_OVERLAP = 150;

export function chunkText(text: string): string[] {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (!normalized) return [];

  const chunks: string[] = [];
  let start = 0;
  while (start < normalized.length) {
    const end = Math.min(start + CHUNK_SIZE, normalized.length);
    chunks.push(normalized.slice(start, end));
    if (end === normalized.length) break;
    start = end - CHUNK_OVERLAP;
  }
  return chunks;
}
