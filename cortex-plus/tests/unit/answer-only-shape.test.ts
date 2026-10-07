import { describe, expect, it } from "vitest";
import { shapeAnswerOnly } from "@/lib/learning/tutor-reply";

/*
  Canlı sohbette "Sadece cevap" modu şunu yazdı (30 Eylül 2026):
  "Sadece cevap: Sadece cevap: Calvin döngüsü ve solunum denklemi, yüklenen
  belgelerde yer almıyo." Model cevabı kalın yazmayınca etiket iki kez
  ekleniyor, ilk satır 80. harfte kelimenin ortasından kesiliyordu.
*/
describe("sadece cevap biçimi", () => {
  it("modelin yazdığı etiketi ikinci kez eklemez", () => {
    const shaped = shapeAnswerOnly(
      "Sadece cevap: Calvin döngüsü ve solunum denklemi, yüklenen belgelerde yer almıyor. Genel bilgiyle anlatabilirim.",
    );
    expect(shaped).not.toMatch(/Sadece cevap:\s*Sadece cevap/i);
    expect(shaped.match(/Sadece cevap:/gi)?.length).toBe(1);
  });

  it("uzun ilk satırı kelime ortasından kesmez", () => {
    const shaped = shapeAnswerOnly(
      "Calvin döngüsü ve solunum denklemi yüklenen belgelerde yer almıyor ama genel biyoloji bilgisiyle kısaca özetleyebilirim\nAdımlar burada.",
    );
    const answer = shaped.match(/\*\*Sadece cevap: (.+?)\*\*/)?.[1] ?? "";
    expect(answer.endsWith("…")).toBe(true);
    expect(answer).not.toMatch(/almıyo…$/);
    expect(answer.length).toBeLessThanOrEqual(82);
  });

  it("kalın kısa cevabı olduğu gibi kullanır, sonuna ikinci nokta koymaz", () => {
    const shaped = shapeAnswerOnly("**0,1 mol.**\n\nCaCO₃ mol kütlesi 100 g/mol; 10 / 100 = 0,1.");
    expect(shaped.startsWith("**Sadece cevap: 0,1 mol.**")).toBe(true);
  });
});
