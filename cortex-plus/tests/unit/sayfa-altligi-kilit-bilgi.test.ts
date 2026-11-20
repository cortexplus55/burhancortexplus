import { describe, expect, it } from "vitest";
import { lessonKeyFacts } from "@/lib/learning/lesson-key-facts";

/*
  21 Kasım 2026 (Faz 10 canlı ölçümü): her sayfanın altlığındaki numaralandırma ("Sayfa 53 / 65") kesir kilit bilgisi
  sayılıyor, ders onu öğretmediği için kapsam kapısı hiç kapanmıyordu. Sayfa sözcüğünden hemen sonra gelen kesir sayfa
  numarasıdır; öbür kesirler (oran, basınç çifti, payda) kilit bilgi kalır. Örnekler farklı derslerden.
*/
const fractions = (text: string) =>
  lessonKeyFacts([{ text }])
    .filter((fact) => fact.kind === "fraction")
    .map((fact) => fact.text);

describe("sayfa altlığı kilit bilgi değildir", () => {
  it("Türkçe ve İngilizce sayfa numaralandırması atlanır", () => {
    expect(fractions("Konu anlatımı devam ediyor.\nDers Notu · Sayfa 12 / 40")).toEqual([]);
    expect(fractions("Lecture notes\nPage 3/10")).toEqual([]);
    expect(fractions("Kaynakçanın sayfası 7/9")).toEqual([]);
    expect(fractions("Bölüm sonu, s. 5/9")).toEqual([]);
    expect(fractions("Ek tablo sf. 2 / 6")).toEqual([]);
  });

  it("gerçek kesir ve oran kilit bilgi kalır", () => {
    expect(fractions("Teklif üye tamsayısının 1/3'ü ile verilir.")).toEqual(["1/3"]);
    expect(fractions("Alveolde kısmi basınç yaklaşık 104 / 40 mmHg'dir.")).toEqual(["104/40"]);
    expect(fractions("Olasılık 3/8 olarak bulunur; ders. 4/5 değil.")).toEqual(["3/8", "4/5"]);
  });

  it("sayfa altlığı ile aynı sayfadaki gerçek kesir birbirini etkilemez", () => {
    expect(fractions("Kesrin paydası 7/12 iken sadeleşmez.\nDers Notu · Sayfa 4 / 30")).toEqual(["7/12"]);
  });
});
