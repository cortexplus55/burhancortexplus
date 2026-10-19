import { describe, expect, it } from "vitest";
import { isOverviewQuestion, looselyContains, normalizeForMatch, verifyDocumentAnswer } from "@/lib/ai/document-answer-verification";

describe("normalizeForMatch — PDF metni ile model alıntısı eşleşir", () => {
  const source =
    '1897\'de Ahmet Midhat Efendi,   Sabah   gazetesinde "Dekadanlar" başlıklı yazısını yayımladı. Dekadan,\nFransızcada "çöküş dönemi sanatçısı" anlamına gelir.';
  it("tipografik tırnak, çoklu boşluk ve satır sonu farkı eşleşmeyi bozmaz", () => {
    const quote = "Sabah gazetesinde “Dekadanlar” başlıklı yazısını yayımladı. Dekadan, Fransızcada “çöküş dönemi sanatçısı” anlamına gelir";
    expect(normalizeForMatch(source)).toContain(normalizeForMatch(quote));
  });
  it("kesme işareti varyantı ve büyük-küçük harf eşitlenir", () => {
    expect(normalizeForMatch(source)).toContain(normalizeForMatch("1897’DE AHMET MİDHAT EFENDİ"));
  });
  it("satır sonu tirelemesi birleştirilir", () => {
    expect(normalizeForMatch("dilin gün-\ndelik olandan")).toContain(normalizeForMatch("dilin gündelik olandan"));
  });
  it("kaynakta olmayan içerik yine eşleşmez", () => {
    expect(normalizeForMatch(source)).not.toContain(normalizeForMatch("Sabah gazetesinde 1898'de"));
  });
});

describe("looselyContains — canlıda belgede yazan cevaplar düşmesin (19 Ekim 2026)", () => {
  // Canlıdaki 3 sayfalık biyoloji notunun 2. sayfası, PDF'ten çıktığı gibi.
  const page = "Bu evrenin ürünleri: ATP, NADPH ve O₂ . ATP ve NADPH bir sonraki evrede kullanılır; O₂ dışarı verilir.";
  it("Markdown kalın yazı ve [1] atfı eşleşmeyi bozmaz", () => {
    expect(looselyContains("Fotosentezin ışığa bağımlı evresinin ürünleri **ATP, NADPH ve O₂**'dir [1].", "ışığa bağımlı evresinin ürünleri ATP, NADPH ve O₂'dir")).toBe(true);
  });
  it("PDF'teki noktadan önceki boşluk ve alt simge eşleşmeyi bozmaz", () => {
    expect(looselyContains(page, "Bu evrenin ürünleri: ATP, NADPH ve O2.")).toBe(true);
  });
  it("satırlara bölünmüş formül, bir iki kelime farkla bulunur", () => {
    const source = "Sürtünmesiz eğik düzlemde cismin ivmesi kütleden bağımsızdır: a = g · sin θ . Örneğin 30°'lik\nsürtünmesiz eğik düzlemde (sin 30° = 0,5, g = 10 m/s²) ivme 5 m/s² 'dir.";
    expect(looselyContains(source, "Örneğin 30°'lik sürtünmesiz eğik düzlemde sin 30° = 0,5 ve g = 10 m/s² için ivme 5 m/s²'dir")).toBe(true);
  });
  it("sayısı tutmayan alıntı geçmez", () => {
    const source = "Sırpsındığı Savaşı (1364): Haçlılarla yapılan ilk savaştır ve kazanıldı.";
    expect(looselyContains(source, "Sırpsındığı Savaşı (1364): Haçlılarla yapılan ilk savaştır")).toBe(true);
    expect(looselyContains(source, "Sırpsındığı Savaşı (1371): Haçlılarla yapılan ilk savaştır")).toBe(false);
  });
  it("kelimelerinin çoğu kaynakta olmayan alıntı geçmez", () => {
    expect(looselyContains(page, "Calvin döngüsünde RuBisCO enzimi karbondioksiti bağlar ve glikoz üretir")).toBe(false);
  });
  it("dört kelimeden kısa alıntı yalnız birebir eşleşir", () => {
    expect(looselyContains(page, "ATP NADPH O2")).toBe(false);
    expect(looselyContains(page, "ATP, NADPH ve O₂")).toBe(true);
  });
});

describe("genel sorular (özet) — 19 Ekim 2026", () => {
  it("özet ve konu sorularını tanır", () => {
    for (const q of ["Bu notta hangi konular var? Kısaca özetle.", "Bu belge ne anlatıyor?", "Notumu özetle", "Konuları neler?"]) {
      expect(isOverviewQuestion(q), q).toBe(true);
    }
    expect(isOverviewQuestion("Haçlılarla yapılan ilk savaş hangisi?")).toBe(false);
  });
  it("genel soruda birleştirilmiş alıntı geniş pencerede bulunur, sayı yine birebir", () => {
    const page = "Fotosentez, klorofil taşıyan canlıların ışık enerjisini kullanarak inorganik maddelerden organik besin ürettiği olaydır. Bitkilerde, alglerde ve siyanobakterilerde görülür. Ökaryot hücrelerde fotosentez kloroplastta gerçekleşir.";
    const merged = "Fotosentez ışık enerjisini kullanarak organik besin üretme olayıdır ve ökaryot hücrelerde kloroplastta gerçekleşir";
    expect(looselyContains(page, merged)).toBe(false);
    expect(looselyContains(page, merged, { ratio: 0.7, widthFactor: 3 })).toBe(true);
    expect(looselyContains("Ankara Savaşı (1402) Timur'a yenilgi ile bitti.", "Ankara Savaşı 1403 yılında Timur'a yenilgiyle bitti", { ratio: 0.7, widthFactor: 3 })).toBe(false);
  });
});

describe("verifyDocumentAnswer (no LLM paths)", () => {
  it("rejects document claims when evidence is empty", async () => {
    const result = await verifyDocumentAnswer({
      client: {} as never,
      question: "X nedir?",
      answer: "Belgeden: foo [1]",
      evidence: [],
      strict: true,
    });
    expect(result.ok).toBe(false);
    expect(result.citations).toEqual([]);
  });

  it("accepts general-only answer without citations in mixed mode", async () => {
    const result = await verifyDocumentAnswer({
      client: {} as never,
      question: "X nedir?",
      answer: "Genel bilgiden: fotosentez bitkilerde ışıkla glikoz üretimidir.",
      evidence: [{ reference: 1, documentId: "d", documentName: "a.pdf", pageNumber: 1, chunkId: null, content: "x" }],
      strict: false,
    });
    expect(result.ok).toBe(true);
  });
});
