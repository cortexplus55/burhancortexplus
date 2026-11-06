import { describe, expect, it } from "vitest";
import { dropFormatLabel, parseRewriteLeadText } from "@/lib/learning/rewrite-lead";

/*
  Farklı anlat giriş ekranı istemin biçim etiketini kopyalamaz (6 Kasım 2026, canlı doğrulamada görüldü).
  Akışlı istem "2. satır: ilk fikrin kısa adı" diyor; model kavram satırını "İlk Fikrin Kısa Adı: …" diye yazdı ve
  öğrenci derste bu etiketi gördü. Ayrıştırıcı istemdeki etiketleri satır başından düşürür; gerçek başlık kalır.
*/

describe("giriş ekranında biçim etiketi", () => {
  it("kopyalanan etiket düşer, iki nokta ya da tireyle", () => {
    expect(dropFormatLabel("İlk Fikrin Kısa Adı: Reformun nedenleri")).toBe("Reformun nedenleri");
    expect(dropFormatLabel("Ekran başlığı — Arz ve talep")).toBe("Arz ve talep");
    expect(dropFormatLabel("Kavram: Fotosentez")).toBe("Fotosentez");
    expect(dropFormatLabel("İlk fikrin kısa adı")).toBe("");
  });

  it("etiketle başlayan gerçek başlık bozulmaz", () => {
    expect(dropFormatLabel("Başlıkların okunması")).toBe("Başlıkların okunması");
    expect(dropFormatLabel("Kavramlar haritası")).toBe("Kavramlar haritası");
  });

  it("akış metninde başlık ve kavram etiketsiz gelir", () => {
    const text = [
      "Ekran başlığı: Tanzimat'a giden yol",
      "İlk Fikrin Kısa Adı: Islahat ihtiyacı",
      "",
      "Bir imparatorluk neden kendini yenilemek zorunda kalır?",
      "",
      "Askerî yenilgiler ve ekonomik sıkıntılar, devleti yönetimde köklü değişikliklere yöneltti.",
    ].join("\n");
    const screen = parseRewriteLeadText(text, true);
    expect(screen?.heading).toBe("Tanzimat'a giden yol");
    expect(screen?.concept).toBe("Islahat ihtiyacı");
  });
});
