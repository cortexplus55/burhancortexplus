import { describe, expect, it } from "vitest";
import { turkishFold, turkishLower } from "@/lib/text/turkish";

describe("turkishLower", () => {
  it("noktalı İ'yi tek harfe indirir", () => {
    // Düz toLowerCase() burada "i" + U+0307 üretiyor ve ekranda çift nokta
    // görünüyordu.
    expect(turkishLower("İyi günler")).toBe("iyi günler");
    expect(turkishLower("İyi günler")).not.toContain("\u0307");
  });

  it("büyük I'yı noktasız ı yapar", () => {
    expect(turkishLower("ISPARTA")).toBe("ısparta");
  });
});

describe("turkishFold", () => {
  it("İ ile başlayan kelimeyi düz i ile aratabilir", () => {
    expect(turkishFold("İngilizce")).toBe(turkishFold("ingilizce"));
  });

  it("şapkalı harfleri düz karşılığıyla eşler", () => {
    expect(turkishFold("Öğretmen")).toBe("ogretmen");
    expect(turkishFold("ÇALIŞMA")).toBe("calisma");
  });

  it("ı ve i'yi aynı harf sayar", () => {
    expect(turkishFold("Isparta")).toBe(turkishFold("isparta"));
  });

  it("boşluk ve noktalamaya dokunmaz", () => {
    expect(turkishFold("Türev Kuralları")).toBe("turev kurallari");
  });
});
