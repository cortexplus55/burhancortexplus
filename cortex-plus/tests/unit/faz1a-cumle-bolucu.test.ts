import { describe, expect, it } from "vitest";
import {
  firstTurkishSentence,
  splitTurkishSentences,
  splitTurkishSentencesInline,
  turkishSentenceEnds,
} from "@/lib/text/turkish-sentences";
import { splitSentences } from "@/lib/learning/podcast-script";
import { fitCramText } from "@/lib/learning/cram-sheet";

/*
  Faz 1-A §5.1 (19 Kasım 2026): merkezi Türkçe cümle bölücü Roma rakamı, sıra sayısı / kanun maddesi ve kısaltma
  noktasında cümleyi bölmez. Örnekler yalnız şartnamenin kendi örnekleri.
*/

describe("splitTurkishSentences: noktadan yanlış bölmez (§5.1)", () => {
  it('"II. Mehmet 1453\'te..." Roma rakamından sonra bölünmez', () => {
    const text = "II. Mehmet 1453'te İstanbul'u aldı. Bu olay bir çağı kapattı.";
    expect(splitTurkishSentences(text)).toEqual([
      "II. Mehmet 1453'te İstanbul'u aldı.",
      "Bu olay bir çağı kapattı.",
    ]);
  });

  it('"Anayasanın 116. maddesi gereğince..." madde numarasından sonra bölünmez', () => {
    const text = "Anayasanın 116. maddesi gereğince seçimlerin yenilenmesine karar verilebilir. Karar ayrıca ilan edilir.";
    expect(splitTurkishSentences(text)).toEqual([
      "Anayasanın 116. maddesi gereğince seçimlerin yenilenmesine karar verilebilir.",
      "Karar ayrıca ilan edilir.",
    ]);
  });

  it('"Prof. Dr. Ahmet vb. araştırmacılar..." unvan ve kısaltmadan sonra bölünmez', () => {
    const text = "Prof. Dr. Ahmet vb. araştırmacılar bu görüşü savunur. Diğerleri karşı çıkar.";
    expect(splitTurkishSentences(text)).toEqual([
      "Prof. Dr. Ahmet vb. araştırmacılar bu görüşü savunur.",
      "Diğerleri karşı çıkar.",
    ]);
  });

  it("şartnamedeki öbür Roma rakamları, sıra sayıları ve kısaltmalar da bölmez", () => {
    for (const lead of ["I.", "II.", "III.", "IV.", "V.", "X."]) {
      expect(splitTurkishSentences(`${lead} Mehmet dönemi başladı. Sonra savaş oldu.`)).toHaveLength(2);
    }
    expect(splitTurkishSentences("Kanunun 87. fıkrası uygulanır. Süre işlemez.")).toEqual([
      "Kanunun 87. fıkrası uygulanır.",
      "Süre işlemez.",
    ]);
    expect(splitTurkishSentences("Önce 2. adım yapılır. Sonra kontrol edilir.")).toHaveLength(2);
    expect(splitTurkishSentences("1. Madde okunur. 2. Madde yazılır.")).toEqual(["1. Madde okunur.", "2. Madde yazılır."]);
    for (const abbreviation of ["Dr.", "Prof.", "Av.", "Md.", "vb.", "örn.", "bkz.", "yy.", "TL."]) {
      const text = `Bu not ${abbreviation} Ahmet ile ilgilidir. Ayrı cümle.`;
      expect(splitTurkishSentences(text), abbreviation).toEqual([`Bu not ${abbreviation} Ahmet ile ilgilidir.`, "Ayrı cümle."]);
    }
  });

  it("gerçek cümle sonları yine bölünür; ondalık sayı ve satır sonu korunur", () => {
    expect(splitTurkishSentences("Avogadro sayısı 6,02 x 10^23'tür. Değer 3.14 değildir! Neden?")).toEqual([
      "Avogadro sayısı 6,02 x 10^23'tür.",
      "Değer 3.14 değildir!",
      "Neden?",
    ]);
    expect(splitTurkishSentences("Başlık\nII. Mehmet dönemi.")).toEqual(["Başlık", "II. Mehmet dönemi."]);
    expect(splitTurkishSentencesInline("Başlık\nII. Mehmet dönemi.")).toEqual(["Başlık II. Mehmet dönemi."]);
    expect(firstTurkishSentence("Prof. Dr. Ahmet vb. araştırmacılar yazdı. İkinci.")).toBe("Prof. Dr. Ahmet vb. araştırmacılar yazdı.");
    expect(turkishSentenceEnds("II. Mehmet 1453'te geldi.")).toEqual([]);
  });

  it("karaoke / ses parçası birimi (podcast) ve özet kâğıdı aynı bölücüyü kullanır", () => {
    expect(splitSentences("II. Mehmet 1453'te İstanbul'u aldı. Anayasanın 116. maddesi gereğince karar verildi.")).toEqual([
      "II. Mehmet 1453'te İstanbul'u aldı.",
      "Anayasanın 116. maddesi gereğince karar verildi.",
    ]);
    // Özet kâğıdı satırı cümle sınırında kesilir; "Prof." ya da "II." noktasında bitmez.
    const long =
      "Prof. Dr. Ahmet vb. araştırmacılar kaldırma kuvvetinin sıvının yoğunluğuna bağlı olduğunu gösterdi. " +
      "II. Mehmet döneminde başlayan çalışmalar ise uzun yıllar sürdü ve pek çok belgede ayrıntılı olarak anlatıldı.";
    const fitted = fitCramText(long, { max: 140 });
    expect(fitted).toBe("Prof. Dr. Ahmet vb. araştırmacılar kaldırma kuvvetinin sıvının yoğunluğuna bağlı olduğunu gösterdi.");
  });
});
