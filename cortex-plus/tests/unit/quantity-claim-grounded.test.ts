import { describe, expect, it } from "vitest";
import {
  quantityClaimGrounded,
  withoutUnsupportedQuantities,
} from "@/lib/learning/teacher-brain";

const CHEM =
  "0,5 mol su alınır. Mol kütlesi 18 g/mol. Ideal gaz sabiti kullanılır. " +
  "2 × 10^3 Pa basınç ölçülür.";

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
});
