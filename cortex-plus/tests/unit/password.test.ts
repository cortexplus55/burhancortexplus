import { describe, expect, it } from "vitest";
import { isPasswordValid, passwordIssues } from "@/lib/auth/password";

describe("password rules", () => {
  it("accepts a compliant password", () => {
    expect(isPasswordValid("Cortex123")).toBe(true);
  });

  it("rejects short passwords", () => {
    expect(passwordIssues("Ab1")).toContain("Şifre en az 8 karakter olmalı.");
  });

  it("requires an uppercase letter", () => {
    expect(passwordIssues("cortex123")).toContain("En az bir büyük harf gerekli.");
  });

  it("requires a digit", () => {
    expect(passwordIssues("CortexPlus")).toContain("En az bir rakam gerekli.");
  });
});
