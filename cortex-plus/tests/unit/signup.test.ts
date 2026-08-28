import { describe, expect, it } from "vitest";
import {
  isOptionalPhoneValid,
  stepIdsForRole,
} from "@/lib/parity/signup";

describe("veli kayıt yardımcıları", () => {
  it("öğrenci adımlarına AI öğretmen stili ekler", () => {
    expect(stepIdsForRole("student")).toEqual([
      "role",
      "grade",
      "subject",
      "goal",
      "tutor-style",
      "avatar",
      "account",
    ]);
  });

  it("veli adımlarına yakınlık ve telefon ekler", () => {
    expect(stepIdsForRole("parent")).toEqual([
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
