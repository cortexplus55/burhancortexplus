import { describe, expect, it } from "vitest";
import { teacherSystem, verifySystem } from "@/lib/learning/teacher-lesson";

/*
  3 Ekim 2026, Astra'yla yan yana: KPSS dersinde "Diğer sosyal düzen
  kurallarına aykırılık ise kaynakta manevi yaptırımlarla açıklanır" cümlesi
  çıktı. Astra aynı bilgiyi doğrudan söylüyor. Kural yazarda ve denetçide
  aynı: biri yasaklayıp öbürü sorun saymazsa düzeltme turu işe yaramaz.
*/
describe("ders bilgiyi kaynağa atfetmez", () => {
  it("yazar ve denetçi aynı kuralı taşır", () => {
    expect(teacherSystem("document")).toContain("Bilgiyi kaynağa atfetme");
    expect(teacherSystem("topic")).toContain("Bilgiyi kaynağa atfetme");
    expect(verifySystem("document")).toContain("bilgiyi kaynağa atfeden cümle");
  });
});
