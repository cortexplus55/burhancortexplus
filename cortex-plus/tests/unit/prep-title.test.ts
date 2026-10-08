import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PREP_TITLE_SYSTEM, prepTitleFromModel, prepTitleUserPrompt } from "@/lib/learning/prep-title";

/*
  3 Ekim 2026: aynı KPSS kitabına Astra "Vatandaşlık ve Hukukun Temel
  Kavramları" diyor, biz dosya adından "KPSS Vatandaslik Konu Anlatimi"
  yazıyorduk. Ad artık ana konulardan; kartta da ana konu değil dersin adı.
*/
describe("hazırlığın adı içerikten", () => {
  it("geçerli ad yazım düzeltilerek alınır", () => {
    expect(prepTitleFromModel({ title: "Vatandaşlık ve Hukukun Temel Kavramları" })).toBe(
      "Vatandaşlık ve Hukukun Temel Kavramları",
    );
    expect(prepTitleFromModel({ title: "ÜSLÜ SAYILAR VE UYGULAMALARI" })).toBe("Üslü Sayılar ve Uygulamaları");
  });

  it("dosya adı kalıbı, tek kelime, çok uzun ya da boş ad reddedilir", () => {
    expect(prepTitleFromModel({ title: "KPSS Vatandaşlık Konu Anlatımı" })).toBeNull();
    expect(prepTitleFromModel({ title: "Vatandaşlık.pdf" })).toBeNull();
    expect(prepTitleFromModel({ title: "Hukuk" })).toBeNull();
    expect(prepTitleFromModel({ title: "Bir iki üç dört beş altı yedi sekiz dokuz on" })).toBeNull();
    expect(prepTitleFromModel({})).toBeNull();
    expect(prepTitleFromModel(null)).toBeNull();
  });

  it("istem ana konuları ve dersi taşır; kurulum adı önce modelden alır", () => {
    const prompt = prepTitleUserPrompt({ subject: "Vatandaşlık", topics: ["Hukukun Temel Kavramları", "Anayasa Hukuku"] });
    expect(prompt).toContain("Ders: Vatandaşlık");
    expect(prompt).toContain("2. Anayasa Hukuku");
    expect(PREP_TITLE_SYSTEM).toContain("Konu Anlatımı");
    const intake = readFileSync("src/app/api/learning/exam-prep/intake/route.ts", "utf8");
    expect(intake).toContain("const named = await namePrepFromTopics(service, { userId, topics: topicTitles });");
  });

  // 8 Ekim 2026: ücretsiz 5 sayfadan tek konu çıktı, ad dosya adına düştü.
  it("tek ana konuda ad o konudur; model çağrılmaz", () => {
    expect(prepTitleFromModel({ title: "Açı Ölçüsü ve Radyan Kavramı" })).toBe("Açı Ölçüsü ve Radyan Kavramı");
    const intake = readFileSync("src/app/api/learning/exam-prep/intake/route.ts", "utf8");
    const single = intake.indexOf("topicTitles.length === 1 ? prepTitleFromModel({ title: topicTitles[0] }) : null");
    expect(single).toBeGreaterThan(-1);
    expect(single).toBeLessThan(intake.indexOf("const named = await namePrepFromTopics"));
  });

  it("yol kartı kavram birimli derste dersin adını yazar", () => {
    const home = readFileSync("src/components/parity/exam-prep-home.tsx", "utf8");
    expect(home).toContain('if (unit) return unit.replace(/^Ders \\d+\\/\\d+: /, "");');
  });
});
