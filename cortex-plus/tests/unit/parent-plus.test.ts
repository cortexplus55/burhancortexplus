import { describe, expect, it } from "vitest";
import {
  paymentWalletUserId,
  planGrantsSubscription,
  resolveCheckoutBeneficiary,
} from "@/lib/payments/beneficiary";
import { parentPlusHref } from "@/lib/parent/plus-href";

describe("veli plus ödeme hedefi", () => {
  it("veli için çocuk id zorunlu", () => {
    expect(
      resolveCheckoutBeneficiary({
        payerId: "parent-1",
        payerRole: "parent",
      }),
    ).toEqual({ ok: false, code: "child_required" });
  });

  it("veli ödemesini çocuğa yazar", () => {
    expect(
      resolveCheckoutBeneficiary({
        payerId: "parent-1",
        payerRole: "parent",
        studentId: "child-1",
      }),
    ).toEqual({ ok: true, beneficiaryId: "child-1" });
  });

  it("öğrenci kendi hesabına alır", () => {
    expect(
      resolveCheckoutBeneficiary({
        payerId: "student-1",
        payerRole: "student",
      }),
    ).toEqual({ ok: true, beneficiaryId: "student-1" });
  });

  it("öğrencinin başkası adına almasını reddeder", () => {
    expect(
      resolveCheckoutBeneficiary({
        payerId: "student-1",
        payerRole: "student",
        studentId: "other-1",
      }),
    ).toEqual({ ok: false, code: "forbidden" });
  });

  it("cüzdanı beneficiary üzerinden seçer", () => {
    expect(
      paymentWalletUserId({
        user_id: "parent-1",
        beneficiary_user_id: "child-1",
      }),
    ).toBe("child-1");
    expect(paymentWalletUserId({ user_id: "student-1" })).toBe("student-1");
  });

  it("Plus adından abonelik açar", () => {
    expect(planGrantsSubscription({ name: "Cortex Plus", is_premium: false })).toBe(
      true,
    );
    expect(planGrantsSubscription({ name: "Kredi", is_premium: false })).toBe(
      false,
    );
    expect(planGrantsSubscription({ name: "Sigma", is_premium: true })).toBe(
      true,
    );
  });

  it("veli plus derin bağlantısı üretir", () => {
    expect(parentPlusHref("child-1")).toBe("/veli/plus?ogrenci=child-1");
    expect(parentPlusHref("child-1", { plan: "plan-9" })).toBe(
      "/veli/plus?ogrenci=child-1&plan=plan-9",
    );
  });
});

describe("veli Destek kotası", () => {
  it("ayrı ücretsiz hak tanır", async () => {
    const { PARENT_COACH_GRANT } = await import("@/lib/parent/constants");
    expect(PARENT_COACH_GRANT).toBe(40);
  });
});
