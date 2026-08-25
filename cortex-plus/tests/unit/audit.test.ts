import { describe, expect, it } from "vitest";
import { redact } from "@/lib/audit";

describe("log redaction", () => {
  it("masks sensitive keys but keeps safe values", () => {
    const result = redact({
      plan: "plus",
      password: "gizli",
      paytr_token: "abc",
      api_key: "sk-test",
      amount_try: 29900,
    });

    expect(result.plan).toBe("plus");
    expect(result.amount_try).toBe(29900);
    expect(result.password).toBe("[redacted]");
    expect(result.paytr_token).toBe("[redacted]");
    expect(result.api_key).toBe("[redacted]");
  });
});
