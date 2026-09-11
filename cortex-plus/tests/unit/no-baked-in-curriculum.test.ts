import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Kodda gömülü müfredat olmasın.
 *
 * Geliştirme boyunca aynı üç örnek PDF kullanıldı: bir zemin mekaniği ders
 * notu, bir pediatri notu, bir üslü sayılar çalışma kâğıdı. Bunların
 * konuları iki kez koda sızdı:
 *
 *   1. topic-map.ts elle yazılmış bir trigonometri müfredatı taşıyordu
 *      ("Birim çember", "Trigonometrik kimlikler"). Metin eşleşince konu
 *      diye basıyordu ve canlıda bir pediatri belgesine "Derece ve radyan"
 *      konusunu yazdı.
 *   2. Başlık kuralının örnekleri zemin PDF'inden alınmıştı ve HER belgenin
 *      isteğine ekleniyordu.
 *
 * Ürün binlerce farklı PDF alacak. Hiçbir öğrenci başka bir öğrencinin
 * belgesinden gelen bir konu adını görmemeli, modelin önüne de başka bir
 * alanın örnekleri konmamalı. Bu test onu bir daha sızarsa yakalar.
 *
 * Yalnızca ÜRETİLEN METNE karışabilecek dosyalara bakılıyor: konu haritası
 * ve ders üretimi. Yorum satırları ayıklanıyor — "şu hata şu belgede
 * çıkmıştı" demek serbest, o metin öğrenciye gitmiyor.
 */

const PRODUCTION_FILES = [
  "src/lib/documents/topic-map.ts",
  "src/lib/documents/topic-map-llm.ts",
  "src/lib/documents/topic-title.ts",
  "src/lib/documents/pdf-learning-v2.ts",
  "src/lib/learning/teaching-standards.ts",
  "src/lib/learning/podcast-from-lesson.ts",
  "src/lib/learning/lesson-diagram.ts",
  "src/app/api/learning/exam-prep/node/route.ts",
];

/** Örnek PDF'lerin konuları — hiçbiri kodda yazılı olmamalı. */
const SAMPLE_DOCUMENT_TOPICS = [
  "dane boyu",
  "atterberg",
  "boussinesq",
  "konsolidasyon",
  "permeabilite",
  "efektif gerilme",
  "faz bağıntıları",
  "zemin sınıflandırma",
  "derece ve radyan",
  "trigonometrik kimlik",
  "birim çember",
  "aşı takvimi",
  "gelişimsel basamaklar",
  "bilimsel gösterim",
];

/** Yorumlar ve JSDoc blokları atılır; geriye çalışan kod kalır. */
function stripComments(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1 ");
}

describe("no baked-in curriculum", () => {
  for (const file of PRODUCTION_FILES) {
    it(`${file} names no topic from the sample PDFs`, () => {
      const source = stripComments(
        readFileSync(resolve(process.cwd(), file), "utf8"),
      ).toLocaleLowerCase("tr");
      const found = SAMPLE_DOCUMENT_TOPICS.filter((topic) =>
        source.includes(topic),
      );
      expect(found).toEqual([]);
    });
  }

  it("the heuristic topic builder is gone for good", async () => {
    // buildTopicMap belgeyi okumuyordu, kendi müfredat listesini
    // belgeye dayatıyordu. Geri gelirse bu test düşer.
    const topicMap = await import("@/lib/documents/topic-map");
    expect("buildTopicMap" in topicMap).toBe(false);
  });

  it("builds the naming rule from the document's own lines", async () => {
    const { topicTitleRule } = await import("@/lib/documents/topic-title");
    const biyoloji = topicTitleRule([
      "1. Hücre Zarından Madde Geçişi",
      "2. Fotosentez (Işık Evresi)",
    ]);
    expect(biyoloji).toContain("Hücre Zarından Madde Geçişi");
    expect(biyoloji).toContain("Fotosentez (Işık Evresi)");

    // Numarasız belgede örnek verilmiyor ama kural yine geçerli.
    const slayt = topicTitleRule(["Giriş", "Sonuç"]);
    expect(slayt).not.toContain("Giriş");
    expect(slayt).toContain("Başlık cümle değildir");
  });
});
