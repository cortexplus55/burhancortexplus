import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/*
  İlk derse giden akışta tek konulu hazırlık da "Konu seç" ekranını
  gösteriyordu: tek seçenek arasında seçim, boş bir tıklama. /konu sayfası
  artık tek konuda seçimi sunucuda yapıp sonraki adıma yönlendiriyor; uç ve
  sayfa aynı fonksiyonu kullanıyor ki iki yol ayrışmasın.
*/
describe("tek konulu hazırlıkta konu seçimi atlanır", () => {
  it("/konu sayfası tek konuda seçip yönlendirir", () => {
    const page = readFileSync("src/app/deneme-sinavlari/[prepId]/konu/page.tsx", "utf8");
    expect(page).toMatch(/topics\.length === 1/);
    expect(page).toContain("selectPrepTopic(");
    expect(page).toMatch(/redirect\(selected\.nextHref\)/);
  });

  it("konu seç ucu aynı fonksiyonu kullanır", () => {
    const route = readFileSync("src/app/api/learning/exam-prep/select-topic/route.ts", "utf8");
    expect(route).toContain("selectPrepTopic(");
  });
});
