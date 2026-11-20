import { documentUploadCredits } from "@/lib/credits/price-table";

/**
 * Faz 4 (19 Kasım 2026): sihirbazdaki yükleme önizleme şeridi. Belge ücreti belge başına ve yalnız ilk yüklemede
 * alınır: metin sayfaları ceil(n / 5), fotoğraf / taranmış sayfa 5 kredi (`documentUploadCredits`). Şerit yüklenen
 * belgelerin toplamını ve tahmini kurulum kredisini söyler. İstemci de okur (`server-only` yok).
 */
export type UploadPageKinds = { textPages: number; photoPages: number };

export function uploadPreview(docs: readonly UploadPageKinds[]): { textPages: number; photoPages: number; credits: number } {
  let textPages = 0;
  let photoPages = 0;
  let credits = 0;
  for (const doc of docs) {
    const text = Math.max(0, Math.floor(doc.textPages || 0));
    const photo = Math.max(0, Math.floor(doc.photoPages || 0));
    textPages += text;
    photoPages += photo;
    credits += documentUploadCredits({ textPages: text, photoPages: photo });
  }
  return { textPages, photoPages, credits };
}

/** "Yüklenen: X metin sayfası + Y fotoğraf · Tahmini kurulum: Z kredi (Üretilen yolu sonradan tekrar çözmek %100 ücretsizdir)" */
export function uploadPreviewLine(docs: readonly UploadPageKinds[]): string {
  const preview = uploadPreview(docs);
  const tr = (value: number) => value.toLocaleString("tr-TR");
  return (
    `Yüklenen: ${tr(preview.textPages)} metin sayfası + ${tr(preview.photoPages)} fotoğraf · ` +
    `Tahmini kurulum: ${tr(preview.credits)} kredi (Üretilen yolu sonradan tekrar çözmek %100 ücretsizdir)`
  );
}
