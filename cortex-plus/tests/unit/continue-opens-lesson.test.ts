import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  3 Ekim 2026, canlı karşılaştırma: Astra'da yeni hazırlıkta "Devam et"
  ilk dersi doğrudan açıyor. Bizde önce "Konu seç" ekranı, sonra zorunlu
  8 soruluk tanı geliyordu; ders ancak üçüncü ekranda açılıyordu.
*/
describe("Devam et dersi doğrudan açar", () => {
  it("hazırlık sayfası etkin konuyu ilk konudan seçer; tanı kapı değil", () => {
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/page.tsx", "utf8");
    expect(page).toContain("activeTopicId = prepTopics[0].id;");
    expect(page).toContain("const needsIntro = false;");
    // Seviye tespiti tamamlanana kadar yolun ilk düğümü.
    expect(page).toContain("introPending={!prep.intro_completed_at}");
  });

  it("düğüm sayfası tanıya yönlendirmez; ölçümü erteler", () => {
    const node = readFileSync("src/app/deneme-sinavlari/[prepId]/dugum/[nodeId]/page.tsx", "utf8");
    expect(node).not.toContain("redirect(examPrepIntroHref(prepId))");
    expect(node).toContain("intro_deferred_at: new Date().toISOString()");
  });
});
