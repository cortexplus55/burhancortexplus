import { describe, expect, it } from "vitest";
import {
  isOptionalPhoneValid,
  stepIdsForRole,
} from "@/lib/parity/signup";

describe("veli kayıt yardımcıları", () => {
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
