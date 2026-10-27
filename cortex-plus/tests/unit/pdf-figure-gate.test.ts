import { describe, expect, it } from "vitest";
import { FIGURE_VECTOR_MIN, pageHasFigureGraphics } from "@/lib/documents/render-pdf-pages";
import { pageNeedsFigureRead, textLayerNeedsOcr } from "@/lib/documents/pdf-ingestion";

describe("pdf şekil kapısı", () => {
  it("metin katmanı dolu bir şekil cümlesini okumaya alır", () => {
    const text = "Aşağıdaki şekilde f(x) ve g(x) grafiği verilmiştir. Eğri x eksenini iki noktada keser.";
    expect(textLayerNeedsOcr(text)).toBe(false);
    expect(pageNeedsFigureRead(text)).toBe(true);
  });

  it("yandaki tabloyu alır, çıplak tablo sözünü almaz", () => {
    expect(pageNeedsFigureRead("Yandaki tablo eşikleri gösterir ve sınavda sorulur.")).toBe(true);
    expect(pageNeedsFigureRead("Bu konu tablo halinde ezberlenmez, kural cümleyle anlatılır.")).toBe(false);
  });

  it("düz anlatım sayfasını şekil sanmaz", () => {
    expect(pageNeedsFigureRead("Hücre zarı seçici geçirgendir. Proteinler taşımayı sağlar.")).toBe(false);
  });

  it("gömülü resim veya yoğun çizim şekil sayılır, az çizgi sayılmaz", () => {
    expect(FIGURE_VECTOR_MIN).toBe(30);
    expect(pageHasFigureGraphics({ hasImage: true, vectorOps: 0 })).toBe(true);
    expect(pageHasFigureGraphics({ hasImage: false, vectorOps: 30 })).toBe(true);
    expect(pageHasFigureGraphics({ hasImage: false, vectorOps: 4 })).toBe(false);
  });
});
