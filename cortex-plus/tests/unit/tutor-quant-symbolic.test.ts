import { describe, expect, it } from "vitest";
import { auditQuantitative } from "@/lib/learning/tutor-quant";

/*
  Sembolik ifadeler hesap denetçisini yanıltmasın (18 Ekim 2026, trigonometri podcast'i).

  "225 × π/180 = 5π/4" cümlesinde tek-eşitlik deseni "180"in ortasındaki "80" ile "5π/4"ün
  "5"ini yakalayıp "Yazılan eşitlik tutmuyor: 80 ve 5" dedi; podcast üretimi iki kez bu yüzden
  düştü (lesson_generation_failures, kind podcast). Sayı rakam ortasından başlayamaz; π'ye
  yapışık sayı katsayıdır.
*/
function arithmetic(text: string): string[] {
  return auditQuantitative(text, "").issues.filter((issue) => issue.kind === "arithmetic").map((issue) => issue.detail);
}

describe("hesap denetçisi: π'li ifadeler", () => {
  it("derece-radyan dönüşümü cümleleri sorun üretmez", () => {
    expect(arithmetic("Dereceden radyana geçerken ölçüyü π/180 ile çarparsın; 225 × π/180 = 5π/4.")).toEqual([]);
    expect(arithmetic("225°’yi radyana çevirmek için 225 × π/180 işlemini yaparsın ve 5π/4 rad elde edersin.")).toEqual([]);
    expect(arithmetic("30° = π/6, 45° = π/4, 60° = π/3, 90° = π/2 ve 180° = π.")).toEqual([]);
    expect(arithmetic("Temel eşitlik 180° = π rad’dır; 2π radyan tam dönüştür.")).toEqual([]);
  });

  it("gerçek tutmayan eşitlik yine yakalanır", () => {
    expect(arithmetic("Bu dönüşümde 180 = 190 olur.").length).toBeGreaterThan(0);
    expect(arithmetic("Yarıçap 8 cm, yay 12 cm ise açı 12 / 8 = 1,6 rad bulunur.").length).toBeGreaterThan(0);
  });
});
