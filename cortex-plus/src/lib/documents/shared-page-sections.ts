import { headingBelongsTo, type DocumentSkeleton } from "@/lib/documents/outline-skeleton";

/**
 * Aynı sayfadaki ayrı bölümler kayıtta düşmez (6 Kasım 2026, canlı telefon denetiminde bulundu).
 *
 * Kayıt her sayfayı tek konuya verir (`exclusivePageRanges`, #247: aynı sayfa iki derste anlatılmasın); bütün sayfaları
 * başka konuca alınan konu "kopya" sayılıp birleşir. Tek sayfalık özet notta harita 7 konu çıkardı (numaralı dört bölüm
 * dahil), hepsi aynı sayfadaydı; kayıt altısını birleştirdi ve sihirbaz tek konu gösterdi.
 *
 * Kural ders bağımsız, modelsiz: sayfasız kalan konunun o sayfalarda KENDİ başlığı varsa (iskeletteki numaralı başlık,
 * Markdown/kalın başlık ya da numaralı madde; adı başlığı anıyor) ve o başlık kalan hiçbir konunun adı değilse, konu
 * düşmez: o başlığın sayfalarını paylaşır. Ders ve konu testi paylaşılan sayfayı konunun bölümüne daraltır
 * (`topic-section.ts`). Başlığı olmayan ya da başlığı başka konunun olan konu (gerçek kopya) eskisi gibi birleşir.
 */

type Leaf = { topic: { title: string; pageNumbers: number[] }; order: number };

/** Bu kadar sayfadan uzun dosyada geri alma yapılmaz (iskelet bütün dosyadan kurulur; kısa notların sorunu). */
export const SECTION_RESTORE_MAX_PAGES = 60;

/**
 * `cited`: haritanın bu dosyadaki konuları (özgün sayfalarıyla); `kept`: tekil sayfa dağıtımından sonra kalanlar.
 * Dönen liste `cited` sırasıyla: kalanlar dağıtılmış sayfalarıyla, geri alınanlar kendi bölümlerinin sayfalarıyla.
 */
export function restoreSectionLeaves<L extends Leaf>(cited: L[], kept: L[], skeleton: DocumentSkeleton): L[] {
  const keptOrders = new Set(kept.map((leaf) => leaf.order));
  const dropped = cited.filter((leaf) => !keptOrders.has(leaf.order));
  if (!dropped.length) return kept;
  const headings = skeleton.headings.filter((heading) => !heading.documentTitle && !heading.parent);
  const owners = [...kept];
  const restored: L[] = [];
  for (const leaf of dropped) {
    const own = new Set(leaf.topic.pageNumbers);
    const section = headings.find(
      (heading) =>
        heading.pages.some((page) => own.has(page)) &&
        headingBelongsTo(heading, leaf.topic.title) &&
        // Başlık zaten kalan bir konunun bölümüyse bu konu onun kopyasıdır.
        !owners.some((other) => headingBelongsTo(heading, other.topic.title)),
    );
    if (!section) continue;
    const shared = section.pages.filter((page) => own.has(page));
    const pageNumbers = shared.length ? shared : leaf.topic.pageNumbers;
    const back = { ...leaf, topic: { ...leaf.topic, pageNumbers } };
    restored.push(back);
    owners.push(back);
  }
  if (!restored.length) return kept;
  const byOrder = new Map([...kept, ...restored].map((leaf) => [leaf.order, leaf]));
  return cited.flatMap((leaf) => {
    const hit = byOrder.get(leaf.order);
    return hit ? [hit] : [];
  });
}
