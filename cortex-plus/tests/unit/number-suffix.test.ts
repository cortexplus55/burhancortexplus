import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { possessiveSuffix, withPossessive } from "@/lib/text/number-suffix";

/*
  24 Ekim 2026 (inceleme #33): Plus kartı "hakkının %67'i" yazıyordu; ek sabitti. Ek, sayının
  okunuşunun son kelimesine uyar: altmış yedi → 67'si, altmış → 60'ı, kırk beş → 45'i.
*/

describe("sayıya iyelik eki", () => {
  it("birler basamağı", () => {
    expect([1, 2, 3, 4, 5, 6, 7, 8, 9].map(withPossessive)).toEqual([
      "1'i", "2'si", "3'ü", "4'ü", "5'i", "6'sı", "7'si", "8'i", "9'u",
    ]);
  });

  it("onlar basamağı (birler sıfırsa)", () => {
    expect([10, 20, 30, 40, 50, 60, 70, 80, 90].map(withPossessive)).toEqual([
      "10'u", "20'si", "30'u", "40'ı", "50'si", "60'ı", "70'i", "80'i", "90'ı",
    ]);
  });

  it("yüzde değerlerinde son kelime karar verir", () => {
    expect(withPossessive(67)).toBe("67'si");
    expect(withPossessive(45)).toBe("45'i");
    expect(withPossessive(72)).toBe("72'si");
    expect(withPossessive(38)).toBe("38'i");
    expect(withPossessive(33)).toBe("33'ü");
    expect(withPossessive(99)).toBe("99'u");
    expect(withPossessive(16)).toBe("16'sı");
    expect(withPossessive(100)).toBe("100'ü");
    expect(withPossessive(0)).toBe("0'ı");
  });

  it("1-100 arası her sayı birler ya da onlar kelimesinden ek alır", () => {
    for (let n = 1; n <= 100; n += 1) {
      const expected =
        n === 100 ? "'ü" : n % 10 ? possessiveSuffix(n % 10) : possessiveSuffix(n);
      expect(possessiveSuffix(n), String(n)).toBe(expected);
      expect(["'i", "'ı", "'u", "'ü", "'si", "'sı", "'su", "'sü"]).toContain(possessiveSuffix(n));
    }
  });

  it("büyük sayılar: yüz, bin, milyon", () => {
    expect(withPossessive(200)).toBe("200'ü");
    expect(withPossessive(1500)).toBe("1500'ü");
    expect(withPossessive(2000)).toBe("2000'i");
    expect(withPossessive(1_000_000)).toBe("1000000'u");
  });

  it("Plus kartı eki sabit yazmıyor", () => {
    const card = readFileSync("src/components/marketing/plus-month.tsx", "utf8");
    expect(card).not.toContain("</span>&apos;i.");
    expect(card).not.toMatch(/percent\}'i/);
    expect(card).toContain("possessiveSuffix(share)");
  });
});
