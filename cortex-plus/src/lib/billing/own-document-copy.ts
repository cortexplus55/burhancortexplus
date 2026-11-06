import { documentPagesFor } from "@/lib/billing/plan-value";
import { FREE_PAGE_TOTAL } from "@/lib/billing/free-tier-copy";
import { PLAN_ALLOWANCES } from "@/lib/credits/price-table";

const trCount = (n: number) => n.toLocaleString("tr-TR");

/**
 * Resmî müfredat kurulumunda "Kendi belgeni de ekle" seçeneğinin açıklaması (6 Kasım 2026, Paket 4). Canlıda
 * "sayfa başı 5 kredi (taranmış sayfa +6) … 15 kredi" yazıyordu; öğrenci kredi sayısı görmez, hak somut işle
 * anlatılır. Sayılar elle yazılmaz: ücretsiz sayfa tavanı ve Plus'ın aylık sayfa karşılığı tek kaynaktan.
 */
export const OWN_DOCUMENT_NOTE =
  `Belgen sayfa hakkından okunur: ücretsiz hesapta toplam ${trCount(FREE_PAGE_TOTAL)} sayfa, ` +
  `Plus'ta ayda ${trCount(documentPagesFor(PLAN_ALLOWANCES.plusMonthly).pages)} sayfaya kadar not. ` +
  `Belgen bir üniteyi kapsıyorsa o ünitenin dersine "Senin belgenden ek" bölümü ünite başına bir kez eklenir. ` +
  `Hazır içerik yine ücretsiz.`;
