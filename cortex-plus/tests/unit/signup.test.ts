import { describe, expect, it } from "vitest";
import {
  isOptionalPhoneValid,
  stepIdsForRole,
  stepIdsForRoleLegacy,
  STUDENT_SIGNUP_STEPS,
} from "@/lib/parity/signup";

describe("kayıt adımları", () => {
  it("öğrenci adımları rol seçimi olmadan", () => {
    expect(stepIdsForRole("student")).toEqual([...STUDENT_SIGNUP_STEPS]);
  });

  it("legacy veli adımları ayrı fonksiyonda kalır", () => {
    expect(stepIdsForRoleLegacy("parent")).toEqual([
      "role",
      "parent-intro",
      "parent-relation",
      "parent-phone",
      "parent-link",
      "account",
    ]);
  });

  it("telefonu boş bırakmaya izin verir", () => {
    expect(isOptionalPhoneValid("")).toBe(true);
    expect(isOptionalPhoneValid(undefined)).toBe(true);
    expect(isOptionalPhoneValid("0532 111 22 33")).toBe(true);
    expect(isOptionalPhoneValid("123")).toBe(false);
  });
});
