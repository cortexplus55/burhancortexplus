import { describe, expect, it } from "vitest";
import {
  quantityClaimGrounded,
  withoutUnsupportedQuantities,
  unsupportedQuantities,
} from "@/lib/learning/teacher-brain";

const CHEM =
  "0,5 mol su alınır. Mol kütlesi 18 g/mol. Ideal gaz sabiti kullanılır. " +
  "2 × 10^3 Pa basınç ölçülür. Avogadro sayısı 6,02 × 10^23.";

const GAS =
  "1 mol gaz NŞA'da 22,4 L. Gaz hacmi 44,8 L. Suyun mol kütlesi 18 g/mol.";

describe("quantityClaimGrounded — türetilmiş nicelik", () => {
  it("0,5 mol × 18 g/mol = 9 g kalır; = 10 g silinir", () => {
    expect(quantityClaimGrounded("0,5 mol × 18 g/mol = 9 g", CHEM)).toBe(true);
    expect(quantityClaimGrounded("0,5 mol × 18 g/mol = 10 g", CHEM)).toBe(false);
  });

  it("dayanaksız %37 silinir", () => {
    expect(quantityClaimGrounded("Verim %37 bulundu.", CHEM)).toBe(false);
    expect(
      withoutUnsupportedQuantities("Verim %37 bulundu. Mol tanımı önemlidir.", CHEM),
    ).toBe("Mol tanımı önemlidir.");
  });

  it("zincirli işlem ve ×10^n", () => {
    expect(quantityClaimGrounded("0,5 × 18 ÷ 9 = 1", CHEM)).toBe(true);
    expect(quantityClaimGrounded("(0,5 × 18) ÷ 9 = 1", CHEM)).toBe(true);
    expect(quantityClaimGrounded("2 × 10^3 × 0,5 = 1000", CHEM)).toBe(true);
    expect(quantityClaimGrounded("2 × 10^3 × 0,5 = 9999", CHEM)).toBe(false);
  });

  it("fizik / matematik / tarih — konu sabiti yok", () => {
    const physics = "ivme 2 m/s², hız 10 m/s, süre 5 s";
    expect(quantityClaimGrounded("10 ÷ 5 = 2", physics)).toBe(true);
    const math = "f(x) = x^2, x = 4";
    expect(quantityClaimGrounded("4 × 4 = 16", math)).toBe(true);
    const history = "1789 yılında başlar, 1799'da biter";
    expect(quantityClaimGrounded("1799 - 1789 = 10", history)).toBe(true);
  });

  it("aynı cümlede doğru zincir + yanlış ikili → ret", () => {
    expect(
      quantityClaimGrounded(
        "m = 44,8 ÷ 22,4 × 18 = 36 g olur ve 2 × 18 = 38 g bulunur.",
        GAS,
      ),
    ).toBe(false);
    expect(
      quantityClaimGrounded(
        "n = 44,8 / 22,4 = 2 mol, dolayısıyla m = 2 × 18 = 36 g.",
        GAS,
      ),
    ).toBe(true);
  });

  it("doğru eşitlik + uydurma nicelik aynı cümlede → ret", () => {
    expect(
      quantityClaimGrounded(
        "n = 44,8 / 22,4 = 2 mol olur; basınç P = 5 atm alınır.",
        GAS,
      ),
    ).toBe(false);
    expect(
      quantityClaimGrounded(
        "m = 44,8 ÷ 22,4 × 18 = 36 g olur, T = 300 K alınır.",
        GAS,
      ),
    ).toBe(false);
  });

  it("uydurma bilimsel gösterim tutulmaz", () => {
    expect(
      quantityClaimGrounded("Molekül sayısı N = 3,5 × 10^22 olur.", CHEM),
    ).toBe(false);
    expect(unsupportedQuantities("Molekül sayısı N = 3,5 × 10^22 olur.", CHEM).length).toBeGreaterThan(
      0,
    );
  });

  it("doğru bilimsel aritmetik ~%1 toleransla kalır", () => {
    expect(
      quantityClaimGrounded("N = 2 × 6,02 × 10^23 = 1,204 × 10^24", CHEM),
    ).toBe(true);
    expect(
      quantityClaimGrounded("N = 2 × 6,02 × 10^23 = 9 × 10^30", CHEM),
    ).toBe(false);
  });

  it("a = b = c sayısal eşitlik ister", () => {
    expect(quantityClaimGrounded("44,8 = 22,4 = 18 olur.", GAS)).toBe(false);
    expect(quantityClaimGrounded("22,4 = 22,4 = 22,4", GAS)).toBe(true);
  });

  it("çok cümleli doğru örnek: sonraki adım önceki sonuçla kalır", () => {
    expect(
      withoutUnsupportedQuantities(
        "n = 44,8 / 22,4 = 2 mol bulunur. m = 2 × 18 = 36 g olur.",
        GAS,
      ),
    ).toBe("n = 44,8 / 22,4 = 2 mol bulunur. m = 2 × 18 = 36 g olur.");
  });

  it("cümle cümle: iyi cümle kalır, kötü düşer", () => {
    expect(
      withoutUnsupportedQuantities(
        "0,5 mol × 18 g/mol = 9 g su elde edilir. Bu sırada sıcaklık T = 350 K olur.",
        CHEM,
      ),
    ).toBe("0,5 mol × 18 g/mol = 9 g su elde edilir.");
  });
});
