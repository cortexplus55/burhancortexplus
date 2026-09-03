import { describe, expect, it } from "vitest";
import { wordAt, wordTimings } from "@/lib/learning/podcast-script";

/**
 * Kelime zamanlaması cümlenin ölçülen süresini paylaştırıyor. Kritik olan
 * toplamın taşmaması: transkript sesin önüne geçerse vurgu yanlış kelimede
 * kalır ve senkron hissi tamamen kaybolur.
 */

describe("wordTimings", () => {
  it("son kelime tam olarak cümle süresinde biter", () => {
    const words = wordTimings("Limit kavramı süreklilikle yakından ilgilidir.", 4200);
    expect(words).toHaveLength(5);
    expect(words[0].startMs).toBe(0);
    expect(words[words.length - 1].endMs).toBe(4200);
  });

  it("aralıklar bitişik ve artan", () => {
    const words = wordTimings("Bir iki üç dört beş altı.", 3000);
    for (let i = 0; i < words.length; i++) {
      expect(words[i].endMs).toBeGreaterThan(words[i].startMs);
      if (i > 0) expect(words[i].startMs).toBe(words[i - 1].endMs);
    }
  });

  it("uzun kelimeye kısa kelimeden fazla süre verir", () => {
    const words = wordTimings("a matematiksel", 2000);
    const kisa = words[0].endMs - words[0].startMs;
    const uzun = words[1].endMs - words[1].startMs;
    expect(uzun).toBeGreaterThan(kisa);
  });

  it("noktalamadan sonra duraklama payı bırakır", () => {
    // Aynı harf sayısı; farkı yalnızca virgül yaratmalı.
    const [duz] = wordTimings("kalem kalem", 2000);
    const [virgullu] = wordTimings("kalem, kalem", 2000);
    expect(virgullu.endMs).toBeGreaterThan(duz.endMs);
  });

  it("boş metin ya da sıfır süre için boş döner", () => {
    expect(wordTimings("", 1000)).toEqual([]);
    expect(wordTimings("bir şey", 0)).toEqual([]);
    expect(wordTimings("bir şey", -5)).toEqual([]);
  });
});

describe("wordAt", () => {
  const words = wordTimings("Türev anlık değişim hızıdır.", 4000);

  it("başlangıçta ilk kelimeyi verir", () => {
    expect(wordAt(words, 0)).toBe(0);
  });

  it("son ana kadar geçerli bir kelime verir", () => {
    expect(wordAt(words, 3999)).toBe(words.length - 1);
  });

  it("süre bitince -1 verir", () => {
    expect(wordAt(words, 4000)).toBe(-1);
    expect(wordAt(words, -1)).toBe(-1);
  });

  it("ilerledikçe kelime indeksi geri gitmez", () => {
    let previous = -1;
    for (let ms = 0; ms < 4000; ms += 50) {
      const index = wordAt(words, ms);
      expect(index).toBeGreaterThanOrEqual(previous);
      previous = index;
    }
  });
});
