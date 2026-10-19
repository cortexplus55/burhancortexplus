import { describe, expect, it } from "vitest";
import { nearDuplicateSentence } from "@/lib/text/turkish";

/*
  19 Ekim 2026, canlı belgesiz ders (hücre bölünmeleri): doğru/yanlış sorusunun "Açıklama"sı ile
  "Doğrusu" aynı bilgiyi iki kez veriyordu. Tekrar ise "Doğrusu" gösterilmez.
*/
describe("aynı cümle mi", () => {
  it("canlıdaki çift: tekrar sayılır", () => {
    expect(
      nearDuplicateSentence(
        "DNA, interfazın S evresinde bölünmeden önce eşlenir.",
        "DNA eşlenmesi, bölünme başlamadan önce interfazın S evresinde gerçekleşir.",
      ),
    ).toBe(true);
  });

  it("farklı bilgi: tekrar sayılmaz", () => {
    expect(
      nearDuplicateSentence(
        "Çocuklar hipotansiyonu uzun süre kompanse edebildiği için dolaşım bozukluğunun erken bulguları önemlidir.",
        "Tansiyon normal olsa da kapiller dolum ve nabız erken uyarı verir.",
      ),
    ).toBe(false);
    expect(nearDuplicateSentence("", "bir şey")).toBe(false);
  });
});
