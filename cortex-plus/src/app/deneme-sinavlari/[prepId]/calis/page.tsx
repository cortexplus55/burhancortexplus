import { permanentRedirect } from "next/navigation";

/**
 * Eski "ders oturumu" (konu konu ders üreten akış) kaldırıldı (3 Ekim 2026).
 * Ders, test ve podcast hazırlığın yolundaki düğümlerden, öğretmen
 * motorlarıyla gelir; eski taslak + onarım zinciri silindi. Adres eski
 * bağlantılar için duruyor.
 */
export default async function ExamPrepCalisRedirect({
  params,
}: {
  params: Promise<{ prepId: string }>;
}): Promise<never> {
  const { prepId } = await params;
  permanentRedirect(`/deneme-sinavlari/${prepId}`);
}
