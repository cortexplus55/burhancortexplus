import { describe, expect, it } from "vitest";
import {
  parseJevAccess,
  resolveJevAccessSync,
  resolveJevModelName,
  resolveJevBaseUrl,
} from "@/lib/adaptive/jev/access";

describe("Jev access resolver", () => {
  it("parses access mode; unknown → auto", () => {
    expect(parseJevAccess(undefined)).toBe("auto");
    expect(parseJevAccess("typesafe")).toBe("typesafe");
    expect(parseJevAccess("gateway")).toBe("gateway");
    expect(parseJevAccess("weird")).toBe("auto");
  });

  it("typesafe requires TYPESAFE_API_KEY", () => {
    expect(
      resolveJevAccessSync({
        mode: "typesafe",
        typesafeKey: "",
        gatewayKey: "gw",
      }).access,
    ).toBeNull();
    const ok = resolveJevAccessSync({
      mode: "typesafe",
      typesafeKey: "ts-key",
    });
    expect(ok.access).toBe("typesafe");
    if (ok.access) {
      expect(ok.model).toBe("jev-1.13.0");
      expect(ok.baseUrl).toBe("https://api.typesafe.ai");
      expect(ok.source).toBe("typesafe_key");
    }
  });

  it("gateway requires gateway key or oidc", () => {
    expect(
      resolveJevAccessSync({
        mode: "gateway",
        gatewayKey: "",
      }).access,
    ).toBeNull();
    const withKey = resolveJevAccessSync({
      mode: "gateway",
      gatewayKey: "gw-key",
    });
    expect(withKey.access).toBe("gateway");
    if (withKey.access) {
      expect(withKey.model).toBe("typesafe-ai/jev");
      expect(withKey.baseUrl).toBe("https://ai-gateway.vercel.sh/typesafe");
    }
    const withOidc = resolveJevAccessSync({
      mode: "gateway",
      oidcAvailable: true,
    });
    expect(withOidc.access).toBe("gateway");
    if (withOidc.access) expect(withOidc.source).toBe("oidc");
  });

  it("auto prefers TypeSafe → gateway → oidc", () => {
    expect(
      resolveJevAccessSync({
        mode: "auto",
        typesafeKey: "ts",
        gatewayKey: "gw",
      }).access,
    ).toBe("typesafe");
    expect(
      resolveJevAccessSync({
        mode: "auto",
        gatewayKey: "gw",
      }).access,
    ).toBe("gateway");
    expect(
      resolveJevAccessSync({
        mode: "auto",
        oidcAvailable: true,
      }).access,
    ).toBe("gateway");
    const missing = resolveJevAccessSync({ mode: "auto" });
    expect(missing.access).toBeNull();
    if (!missing.access) expect(missing.reason).toBe("missing_credential");
  });

  it("honors model and base URL overrides", () => {
    expect(
      resolveJevModelName({ access: "typesafe", configured: "jev-1.13.0" }),
    ).toBe("jev-1.13.0");
    expect(
      resolveJevBaseUrl({
        access: "gateway",
        override: "https://proxy.example/typesafe/",
      }),
    ).toBe("https://proxy.example/typesafe");
  });
});
