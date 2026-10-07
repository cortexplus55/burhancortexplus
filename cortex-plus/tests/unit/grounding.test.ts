import { describe, expect, it } from "vitest";
import { NO_SOURCE_MARKER, NO_SOURCE_MESSAGE, saidNoSource, stripNoSourceMarker } from "@/lib/ai/grounding";
import { GROUNDING_QUESTIONS, GROUPS } from "../eval/grounding-questions";

describe("kaynakta yok işareti", () => {
  it("recognizes the exact unmarked refusal without truncating it", () => {
    expect(saidNoSource(NO_SOURCE_MESSAGE)).toBe(true);
    expect(stripNoSourceMarker(NO_SOURCE_MESSAGE)).toBe(NO_SOURCE_MESSAGE);
    expect(saidNoSource(`${NO_SOURCE_MESSAGE}\nHere is a paid general explanation.`)).toBe(false);
  });
  it("işaretli cevabı tanıyor", () => {
    expect(saidNoSource(`${NO_SOURCE_MARKER} Bu konu notunda geçmiyor.`)).toBe(true);
    expect(saidNoSource("  " + NO_SOURCE_MARKER + " boşlukla da")).toBe(true);
  });

  it("normal cevabı işaretli sanmıyor", () => {
    expect(saidNoSource("Fotosentez kloroplastlarda gerçekleşir.")).toBe(false);
  });

  it("işareti öğrenciye göstermiyor", () => {
    const shown = stripNoSourceMarker(`${NO_SOURCE_MARKER} Bu konu notunda yok.`);
    expect(shown).toBe("Bu konu notunda yok.");
    expect(shown).not.toContain("[");
  });

  it("işaretsiz cevabı olduğu gibi bırakıyor", () => {
    const answer = "Fotosentez kloroplastlarda gerçekleşir. [Sayfa 1]";
    expect(stripNoSourceMarker(answer)).toBe(answer);
  });
});

/*
  Soru seti ölçümün kendisi kadar önemli: dengesiz bir set, düzelme
  yanılsaması üretir. Her şey "reddet" beklerse model her şeyi reddederek
  tam puan alır ve ürün kullanılamaz hâle gelir.
*/
describe("ölçüm soru seti", () => {
  it("dört kümenin hepsi temsil ediliyor", () => {
    for (const g of GROUPS) {
      expect(GROUNDING_QUESTIONS.filter((q) => q.group === g).length).toBeGreaterThanOrEqual(4);
    }
  });

  it("cevaplanması ve reddedilmesi gerekenler dengeli", () => {
    const answer = GROUNDING_QUESTIONS.filter((q) => q.expect === "answer").length;
    const refuse = GROUNDING_QUESTIONS.filter((q) => q.expect === "refuse").length;
    // Tek yöne kayarsa "her şeyi reddet" ya da "her şeyi cevapla" tam puan alır.
    expect(answer).toBeGreaterThanOrEqual(refuse * 0.8);
    expect(refuse).toBeGreaterThanOrEqual(answer * 0.5);
  });

  it("tuzak sorular cevaplanmayı bekliyor — sessiz kalmak düzeltmek değil", () => {
    for (const q of GROUNDING_QUESTIONS.filter((q) => q.group === "trap")) {
      expect(q.expect).toBe("answer");
      expect(q.note).toMatch(/YANLIŞ/);
    }
  });

  it("her sorunun tekil kimliği var", () => {
    const ids = GROUNDING_QUESTIONS.map((q) => q.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
