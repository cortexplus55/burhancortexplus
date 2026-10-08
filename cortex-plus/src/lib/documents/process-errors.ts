/**
 * `/api/documents/process` iki ayrı sebeple 402 dönüyor ve ikisine farklı
 * cümle kuruluyor:
 *
 *   - kredi bitti          → kredi satın alma kapısı işe yarar
 *   - fotoğraf kotası doldu → kredi satın almak HİÇBİR ŞEYİ çözmez
 *
 * İkincisine kredi kapısı açmak, ayın fotoğraf hakkını bitirmiş bir Plus
 * abonesine işine yaramayacak bir şey satmak olurdu. Ayrım gövdedeki `code`
 * alanından; Türkçe metni karşılaştırmak, metni değiştiren ilk kişide
 * sessizce kırılırdı.
 *
 * İstemci tarafında da çalışması gerektiği için bu dosyada `server-only` yok.
 */
export const PHOTO_QUOTA_CODE = "photo_quota_exhausted";

export function isPhotoQuotaError(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { code?: unknown }).code === PHOTO_QUOTA_CODE
  );
}

/**
 * Ücretsiz planın toplam 5 sayfalık hakkı doldu (3 Ekim 2026). Fotoğraf
 * kotasının aksine bunu ücretli plan çözer: istemci yükseltme kapısını açar.
 */
export const FREE_PAGE_LIMIT_CODE = "free_page_limit";

export function isFreePageLimitError(body: unknown): boolean {
  return (
    typeof body === "object" &&
    body !== null &&
    (body as { code?: unknown }).code === FREE_PAGE_LIMIT_CODE
  );
}
