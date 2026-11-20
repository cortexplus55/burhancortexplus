/**
 * Eski içe aktarma yolu (31 Ekim 2026). 20 Kasım 2026'dan beri tek küçültücü `@/lib/upload/compress-image`: uzun
 * kenar 1600 piksel, JPEG %82, döndürme düzeltilir, saydamlık beyaza çizilir; çözülemeyen ya da kazandırmayan dosya
 * olduğu gibi gider. Yeni kod doğrudan oradan alır; bu dosya yalnız adları yeniden verir, kendi kodu ve sabiti yok.
 */

export {
  IMAGE_MAX_SIDE as UPLOAD_IMAGE_MAX_SIDE,
  IMAGE_QUALITY as UPLOAD_IMAGE_QUALITY,
  compressImageForUpload,
  compressedName,
  scaledSize,
} from "@/lib/upload/compress-image";
