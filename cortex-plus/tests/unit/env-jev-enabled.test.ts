import { describe, expect, it } from "vitest";
import { envSchema, jevEnabledFromEnv } from "@/lib/env";

/**
 * JEV_ENABLED tamamen yokken önceden `true` çıkıyordu (`v !== "false" && v !== "0"`
 * mantığı `undefined` için de doğru veriyordu). Jev açık onay istiyor: anahtar
 * yoksa hâlâ zararsızdı (TYPESAFE_API_KEY de gerekiyordu) ama üretimde anahtar
 * eklenince tek başına sessizce Jev'i açardı.
 */
describe("jevEnabledFromEnv", () => {
  it("returns true only for an explicit truthy value", () => {
    expect(jevEnabledFromEnv("true")).toBe(true);
    expect(jevEnabledFromEnv("1")).toBe(true);
    expect(jevEnabledFromEnv("TRUE")).toBe(true);
  });

  it("returns false for an explicit falsy value", () => {
    expect(jevEnabledFromEnv("false")).toBe(false);
    expect(jevEnabledFromEnv("0")).toBe(false);
  });

  it("returns false when the variable is entirely absent", () => {
    expect(jevEnabledFromEnv(undefined)).toBe(false);
  });

  it("returns false for an unrecognized value", () => {
    expect(jevEnabledFromEnv("")).toBe(false);
    expect(jevEnabledFromEnv("maybe")).toBe(false);
  });
});

describe("envSchema JEV_ENABLED wiring", () => {
  it("defaults to disabled when the process env var is missing", () => {
    const parsed = envSchema.safeParse({});
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.JEV_ENABLED).toBe(false);
  });

  it("a present TYPESAFE_API_KEY alone does not enable Jev", () => {
    const parsed = envSchema.safeParse({ TYPESAFE_API_KEY: "sk-typesafe-test" });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.JEV_ENABLED).toBe(false);
  });

  it("DECISION_PROVIDER stays auto and Jev stays off without explicit opt-in", () => {
    const parsed = envSchema.safeParse({
      DECISION_PROVIDER: "auto",
      TYPESAFE_API_KEY: "sk-typesafe-test",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.DECISION_PROVIDER).toBe("auto");
      expect(parsed.data.JEV_ENABLED).toBe(false);
    }
  });

  it("requires JEV_ENABLED=true explicitly to turn Jev on", () => {
    const parsed = envSchema.safeParse({
      JEV_ENABLED: "true",
      TYPESAFE_API_KEY: "sk-typesafe-test",
    });
    expect(parsed.success).toBe(true);
    if (parsed.success) expect(parsed.data.JEV_ENABLED).toBe(true);
  });
});
