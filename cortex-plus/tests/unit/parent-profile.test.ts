import { describe, expect, it } from "vitest";
import {
  formatParentPaymentAmount,
  parseParentProfileUpdate,
} from "@/lib/parent/profile";

describe("veli profil kaydı", () => {
  it("yakınlık ve geçerli telefonu kabul eder", () => {
    const result = parseParentProfileUpdate({
      fullName: "Ayşe Yılmaz",
      locale: "tr",
      parentRelation: "anne",
      phone: "0532 111 22 33",
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.parentRelation).toBe("anne");
      expect(result.data.phone).toBe("0532 111 22 33");
    }
  });

  it("telefonu boş bırakmaya izin verir", () => {
    const result = parseParentProfileUpdate({
      fullName: "Ayşe Yılmaz",
      locale: "tr",
      parentRelation: "baba",
      phone: "",
    });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.phone).toBe(null);
  });

  it("yakınlık olmadan reddeder", () => {
    expect(
      parseParentProfileUpdate({
        fullName: "Ayşe",
        locale: "tr",
        parentRelation: "",
        phone: "",
      }).ok,
    ).toBe(false);
  });

  it("ödeme tutarını lira olarak yazar", () => {
    expect(formatParentPaymentAmount(770)).toBe("₺770");
  });
});
