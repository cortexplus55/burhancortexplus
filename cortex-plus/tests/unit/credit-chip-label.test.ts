import { describe, expect, it } from "vitest";
import { creditChipLabel, FOUNDER_CREDIT_LABEL } from "@/lib/credits/chip-label";

describe("kredi çipi", () => {
  it("yöneticide sınırsız yazar, öğrenci plan ve bakiyeyi görür", () => {
    expect(creditChipLabel({ isAdmin: true, planLabel: "Plus", balance: 0 })).toBe(
      FOUNDER_CREDIT_LABEL,
    );
    expect(creditChipLabel({ planLabel: "Plus", balance: 48 })).toBe("Plus · 48 kr");
    expect(creditChipLabel({ balance: 3 })).toBe("Plus · 3 kr");
  });
});
