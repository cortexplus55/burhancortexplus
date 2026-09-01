import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { integrationReport } from "@/lib/integrations/status";

const KEYS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY",
  "OPENAI_API_KEY",
  "SMTP_PASS",
  "EMAIL_FROM",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "KV_REST_API_URL",
  "KV_REST_API_TOKEN",
  "PAYTR_MERCHANT_ID",
  "PAYTR_MERCHANT_KEY",
  "PAYTR_MERCHANT_SALT",
  "NEXT_PUBLIC_POSTHOG_KEY",
  "SENTRY_DSN",
] as const;

const saved: Record<string, string | undefined> = {};

function configureFully() {
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    "https://dgjfyewgrukglsehyntc.supabase.co";
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY = "sb_publishable_test";
  process.env.OPENAI_API_KEY = "sk-test";
  process.env.SMTP_PASS = "app-password";
  process.env.EMAIL_FROM = "Cortex Plus <cortexplus@cortexplus.app>";
  process.env.UPSTASH_REDIS_REST_URL = "https://example.upstash.io";
  process.env.UPSTASH_REDIS_REST_TOKEN = "token";
}

describe("integration readiness", () => {
  beforeEach(() => {
    for (const key of KEYS) {
      saved[key] = process.env[key];
      delete process.env[key];
    }
  });

  afterEach(() => {
    for (const key of KEYS) {
      if (saved[key] === undefined) delete process.env[key];
      else process.env[key] = saved[key];
    }
  });

  it("reports ready once every required integration is configured", () => {
    configureFully();
    const report = integrationReport();
    expect(report.missing).toEqual([]);
    expect(report.ready).toBe(true);
  });

  it("treats a half-configured rate limit store as missing", () => {
    configureFully();
    // The token alone is the exact shape .env.example used to document, and it
    // leaves the limiter on its per-instance fallback.
    delete process.env.UPSTASH_REDIS_REST_URL;

    const report = integrationReport();
    expect(report.ready).toBe(false);
    expect(report.missing).toContain("rateLimitStore");
    expect(report.integrations.rateLimitStore.detail).toContain(
      "bellek içi yedek",
    );
  });

  it("accepts the names Vercel's Upstash integration provisions", () => {
    configureFully();
    // Provisioning through Vercel yields KV_REST_API_*, not UPSTASH_REDIS_REST_*.
    delete process.env.UPSTASH_REDIS_REST_URL;
    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    process.env.KV_REST_API_URL = "https://fra1-example.upstash.io";
    process.env.KV_REST_API_TOKEN = "kv-token";

    const report = integrationReport();
    expect(report.ready).toBe(true);
    expect(report.integrations.rateLimitStore.configured).toBe(true);
    expect(report.integrations.rateLimitStore.detail).toBe(
      "fra1-example.upstash.io",
    );
  });

  it("does not let optional integrations block readiness", () => {
    configureFully();
    const report = integrationReport();
    expect(report.integrations.paytr.configured).toBe(false);
    expect(report.integrations.posthog.configured).toBe(false);
    expect(report.ready).toBe(true);
  });

  it("never echoes a secret back", () => {
    configureFully();
    process.env.PAYTR_MERCHANT_ID = "merchant-id";
    process.env.PAYTR_MERCHANT_KEY = "merchant-key";
    process.env.PAYTR_MERCHANT_SALT = "merchant-salt";

    const serialised = JSON.stringify(integrationReport());
    for (const secret of [
      "sk-test",
      "app-password",
      "token",
      "sb_publishable_test",
      "merchant-key",
      "merchant-salt",
    ]) {
      expect(serialised).not.toContain(secret);
    }
  });
});
