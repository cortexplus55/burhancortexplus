import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

describe("verifySmtpConnection", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("returns smtp_not_configured when SMTP_PASS missing", async () => {
    vi.stubEnv("SMTP_PASS", "");
    vi.stubEnv("EMAIL_FROM", "Cortex Plus <cortexplus@cortexplus.app>");
    const { verifySmtpConnection } = await import("@/lib/email/smtp");
    const result = await verifySmtpConnection();
    expect(result).toEqual({ ok: false, reason: "smtp_not_configured" });
  });
});
