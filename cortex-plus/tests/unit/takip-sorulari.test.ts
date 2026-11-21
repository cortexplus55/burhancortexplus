import { describe, expect, it } from "vitest";
import {
  FOLLOW_UP_COUNT,
  cleanFollowUp,
  extractFollowUps,
  followUpMarker,
  hideStreamingFollowUps,
  normalizeFollowUps,
} from "@/lib/teacher/follow-ups";

/* Öğretmen v3 (21 Kasım 2026): dinamik takip sorularının tek biçimi. Örnekler farklı derslerden. */

describe("takip soruları biçimi", () => {
  it("işaret ayrılır, sorular sırasıyla döner, gövde temiz kalır", () => {
    const content = "Süzülme basınçla olur.\n\nSence neden?\n\n[[sorular:Süzülme nerede olur?|Basınç düşerse ne olur?|Geri emilim nedir?]]";
    expect(extractFollowUps(content)).toEqual({
      body: "Süzülme basınçla olur.\n\nSence neden?",
      questions: ["Süzülme nerede olur?", "Basınç düşerse ne olur?", "Geri emilim nedir?"],
    });
  });

  it("biçim düzeltilir: ok, numara, tırnak atılır; soru işareti eklenir; aynı soru bir kez", () => {
    expect(cleanFollowUp("↳ Kanun teklifi nedir")).toBe("Kanun teklifi nedir?");
    expect(cleanFollowUp("2) \"Türev neden limittir.\"")).toBe("Türev neden limittir?");
    expect(cleanFollowUp("x")).toBe("");
    expect(cleanFollowUp("a".repeat(90))).toBe("");
    expect(normalizeFollowUps(["Asit nedir?", "asit nedir", "Baz nedir?", "Tuz nedir?", "pH nedir?"])).toEqual([
      "Asit nedir?",
      "Baz nedir?",
      "Tuz nedir?",
    ]);
    expect(normalizeFollowUps(["a|b?", "Geçerli soru?"])).toEqual(["Geçerli soru?"]);
  });

  it("birden çok işarette sonuncusu geçerli, hepsi metinden silinir; işaret yoksa soru yok", () => {
    const content = "A [[sorular:Bir?|İki?|Üç?]] B\n[[sorular:Dört?|Beş?|Altı?]]";
    expect(extractFollowUps(content)).toEqual({ body: "A  B", questions: ["Dört?", "Beş?", "Altı?"] });
    expect(extractFollowUps("Düz yanıt.")).toEqual({ body: "Düz yanıt.", questions: [] });
  });

  it("normalleşmiş işaret en çok üç soru taşır; soru yoksa boş", () => {
    expect(followUpMarker(["Birinci soru", "İkinci soru?", "Üçüncü soru?", "Dördüncü soru?"])).toBe(
      "[[sorular:Birinci soru?|İkinci soru?|Üçüncü soru?]]",
    );
    // Dört harften kısa "soru" soru sayılmaz.
    expect(followUpMarker(["Üç?"])).toBe("");
    expect(followUpMarker([])).toBe("");
    expect(FOLLOW_UP_COUNT).toBe(3);
  });

  it("akış sürerken yarım işaret görünmez", () => {
    expect(hideStreamingFollowUps("Yanıt metni.\n\n[[sor")).toBe("Yanıt metni.");
    expect(hideStreamingFollowUps("Yanıt metni.\n\n[[sorular:Bir soru bu mu")).toBe("Yanıt metni.");
    expect(hideStreamingFollowUps("Yanıt metni. [")).toBe("Yanıt metni.");
    expect(hideStreamingFollowUps("Yanıt [[sorular:Bir?|İki?]] sürüyor")).toBe("Yanıt  sürüyor");
    expect(hideStreamingFollowUps("Dizi [[1, 2]] örneği")).toBe("Dizi [[1, 2]] örneği");
  });
});
