import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/*
  29 Eylül 2026: öğrenci yalnızca "TYT matematik: Üslü sayılar" yazdı; asistan
  "sınavında sadece üslü sayılar var" dedi, tarih girilince plana "Temel
  Matematik" ve "Problemler" de eklendi. Şemadaki "ready yalnızca en az 3 konu
  netse" eşiği modeli konu uydurmaya itiyordu.
*/
describe("sınav oluşturma sohbeti konu uydurmuyor", () => {
  const route = readFileSync("src/app/api/learning/exam-prep/intake/route.ts", "utf8");

  it("konu sayısı için bir alt eşik koymuyor", () => {
    // Yorumdaki alıntı değil, şemanın kendisi.
    expect(route).not.toContain("en az 3 konu netse. needDate");
    expect(route).toContain("ready true konu listesi netse. needDate");
  });

  it("konuları yalnızca öğrencinin söylediğinden çıkarmasını istiyor", () => {
    expect(route).toContain("topics YALNIZCA öğrencinin yazdığı");
    expect(route).toContain("Öğrencinin söylemediği bir konuyu listeye ekleme");
  });

  it("hazır olma kararı kodda: tarih ve en az bir konu", () => {
    expect(route).toMatch(/const ready = Boolean\(examDate\) && draft\.topics\.length >= 1;/);
  });
});
