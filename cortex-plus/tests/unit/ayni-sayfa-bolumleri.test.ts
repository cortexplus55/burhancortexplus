import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { exclusivePageRanges } from "@/lib/documents/topic-page-ranges";
import { buildDocumentSkeleton } from "@/lib/documents/outline-skeleton";
import { restoreSectionLeaves } from "@/lib/documents/shared-page-sections";

/*
  Aynı sayfadaki ayrı bölümler kayıtta düşmez (6 Kasım 2026, canlı telefon denetiminde bulundu). Tek sayfalık özet
  notta harita yedi konu çıkardı, hepsi aynı sayfadaydı; kayıt her sayfayı tek konuya verdiği için altısı "kopya"
  sayılıp birleşti, sihirbaz tek konu gösterdi. Kendi başlığı olan konu sayfayı paylaşır; başlığı olmayan ya da
  başlığı başka konunun olan konu eskisi gibi birleşir. Örnekler başka derslerden.
*/

type Leaf = { topic: { title: string; pageNumbers: number[] }; order: number };

function persist(titles: string[], text: string): string[] {
  const cited: Leaf[] = titles.map((title, order) => ({ topic: { title, pageNumbers: [1] }, order }));
  const ranged = exclusivePageRanges(
    cited.map((leaf) => ({ title: leaf.topic.title, pageNumbers: leaf.topic.pageNumbers, leaf })),
  ).topics;
  const kept = ranged.map((row) => ({ ...row.leaf, topic: { ...row.leaf.topic, pageNumbers: row.pageNumbers } }));
  const skeleton = buildDocumentSkeleton([{ fileIndex: 0, pages: [{ pageNumber: 1, text }] }]);
  return restoreSectionLeaves(cited, kept, skeleton).map((leaf) => leaf.topic.title);
}

const ITEM_NOTE = [
  "Kimya Ara Sınav Özeti",
  "1. Asitler suda hidrojen iyonu verir; tadı ekşidir ve turnusolü kırmızıya çevirir.",
  "Kuvvetli asitler suda tamamen iyonlaşır.",
  "2. Bazlar suda hidroksit iyonu verir ve ele kayganlık hissi verir.",
  "3. Tuzlar nötrleşme tepkimesiyle oluşur.",
  "4. İndikatörler ortamın asitliğine göre renk değiştirir.",
  "pH 7'den küçükse ortam asidiktir.",
].join("\n");

describe("aynı sayfadaki ayrı bölümler", () => {
  it("numaralı madde bölümleri sayfayı paylaşır; kendi başlığı olmayan alt fikir ilk konuya katılır", () => {
    expect(persist(["Asitler", "Kuvvetli Asitler", "Bazlar", "Tuzlar", "İndikatörler", "pH Ölçeği"], ITEM_NOTE)).toEqual([
      "Asitler",
      "Bazlar",
      "Tuzlar",
      "İndikatörler",
    ]);
  });

  it("aynı sayfadaki numaralı başlık bölümleri de kalır", () => {
    const text = [
      "1. Arz",
      "Arz, fiyat yükseldikçe satıcıların piyasaya sunduğu miktarın artmasıdır.",
      "2. Talep",
      "Talep, fiyat düştükçe alıcıların istediği miktarın artmasıdır.",
      "3. Piyasa Dengesi",
      "Arz ile talebin kesiştiği fiyatta piyasa dengededir.",
    ].join("\n");
    expect(persist(["Arz", "Talep", "Piyasa Dengesi"], text)).toEqual(["Arz", "Talep", "Piyasa Dengesi"]);
  });

  it("gerçek kopya (aynı başlığı anan ikinci konu) eskisi gibi birleşir", () => {
    const text = ["1. Arz", "Arz tanımı ve örnekleri burada anlatılır, fiyat ve miktar ilişkisi gösterilir.", "2. Talep", "Talep tanımı."].join(
      "\n",
    );
    expect(persist(["Arz", "Arz Kavramı", "Talep"], text)).toEqual(["Arz", "Talep"]);
  });

  it("başlıksız sayfada tekil dağıtım aynen kalır", () => {
    const text = "Bu sayfada yalnız düz bir paragraf var ve hiçbir başlık ya da numaralı bölüm bulunmuyor. ".repeat(4);
    expect(persist(["Birinci Fikir", "İkinci Fikir"], text)).toHaveLength(1);
  });

  it("kayıt adımı geri almayı çağırır; uzun dosyada çağırmaz", () => {
    const source = readFileSync("src/lib/documents/pdf-learning-v2.ts", "utf8");
    expect(source).toContain("leaves = restoreSectionLeaves(cited, leaves, skeleton)");
    expect(source).toContain("light.length <= SECTION_RESTORE_MAX_PAGES");
  });
});
