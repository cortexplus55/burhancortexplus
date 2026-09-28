/**
 * Resolve how we reach TypeSafe Jev: direct API vs Vercel AI Gateway.
 * Pure helpers stay sync; credential resolution may call OIDC at request time.
 */

import { parseJevAccess, type JevAccessMode } from "@/lib/env";

export type { JevAccessMode };
export type JevAccessResolved = "typesafe" | "gateway";

export type JevCredential =
  | {
      access: JevAccessResolved;
      apiKey: string;
      baseUrl: string;
      model: string;
      source: "typesafe_key" | "gateway_key" | "oidc";
    }
  | { access: null; reason: "missing_credential" | "unknown_mode" };

const TYPESAFE_BASE = "https://api.typesafe.ai";
const GATEWAY_BASE = "https://ai-gateway.vercel.sh/typesafe";
const TYPESAFE_DEFAULT_MODEL = "jev-1.13.0";
const GATEWAY_DEFAULT_MODEL = "typesafe-ai/jev";

export { parseJevAccess };

export function resolveJevBaseUrl(input: {
  access: JevAccessResolved;
  override?: string | null;
}): string {
  const override = input.override?.trim();
  if (override) return override.replace(/\/$/, "");
  return input.access === "gateway" ? GATEWAY_BASE : TYPESAFE_BASE;
}

/**
 * Pure model picker — no network. Prefer pinned version on TypeSafe;
 * gateway uses the provider/model slug.
 */
export function resolveJevModelName(input: {
  access: JevAccessResolved;
  configured?: string | null;
}): string {
  const configured = input.configured?.trim();
  if (configured) return configured;
  return input.access === "gateway"
    ? GATEWAY_DEFAULT_MODEL
    : TYPESAFE_DEFAULT_MODEL;
}

export function resolveJevAccessSync(input: {
  mode: JevAccessMode;
  typesafeKey?: string | null;
  gatewayKey?: string | null;
  baseUrlOverride?: string | null;
  modelOverride?: string | null;
  /** When true, treat OIDC as available (tests / pre-resolved). */
  oidcAvailable?: boolean;
}): JevCredential {
  const typesafeKey = input.typesafeKey?.trim() || "";
  const gatewayKey = input.gatewayKey?.trim() || "";

  if (input.mode === "typesafe") {
    if (!typesafeKey) {
      return { access: null, reason: "missing_credential" };
    }
    return {
      access: "typesafe",
      apiKey: typesafeKey,
      baseUrl: resolveJevBaseUrl({
        access: "typesafe",
        override: input.baseUrlOverride,
      }),
      model: resolveJevModelName({
        access: "typesafe",
        configured: input.modelOverride,
      }),
      source: "typesafe_key",
    };
  }

  if (input.mode === "gateway") {
    if (gatewayKey) {
      return {
        access: "gateway",
        apiKey: gatewayKey,
        baseUrl: resolveJevBaseUrl({
          access: "gateway",
          override: input.baseUrlOverride,
        }),
        model: resolveJevModelName({
          access: "gateway",
          configured: input.modelOverride,
        }),
        source: "gateway_key",
      };
    }
    if (input.oidcAvailable) {
      return {
        access: "gateway",
        apiKey: "", // filled at request time
        baseUrl: resolveJevBaseUrl({
          access: "gateway",
          override: input.baseUrlOverride,
        }),
        model: resolveJevModelName({
          access: "gateway",
          configured: input.modelOverride,
        }),
        source: "oidc",
      };
    }
    return { access: null, reason: "missing_credential" };
  }

  // auto: TypeSafe key → gateway key → OIDC
  if (typesafeKey) {
    return {
      access: "typesafe",
      apiKey: typesafeKey,
      baseUrl: resolveJevBaseUrl({
        access: "typesafe",
        override: input.baseUrlOverride,
      }),
      model: resolveJevModelName({
        access: "typesafe",
        configured: input.modelOverride,
      }),
      source: "typesafe_key",
    };
  }
  if (gatewayKey) {
    return {
      access: "gateway",
      apiKey: gatewayKey,
      baseUrl: resolveJevBaseUrl({
        access: "gateway",
        override: input.baseUrlOverride,
      }),
      model: resolveJevModelName({
        access: "gateway",
        configured: input.modelOverride,
      }),
      source: "gateway_key",
    };
  }
  if (input.oidcAvailable) {
    return {
      access: "gateway",
      apiKey: "",
      baseUrl: resolveJevBaseUrl({
        access: "gateway",
        override: input.baseUrlOverride,
      }),
      model: resolveJevModelName({
        access: "gateway",
        configured: input.modelOverride,
      }),
      source: "oidc",
    };
  }
  return { access: null, reason: "missing_credential" };
}

/**
 * Request-time credential resolution. OIDC is fetched here (not at module load)
 * because Vercel injects the token per-request.
 */
export async function resolveJevCredential(input: {
  mode: JevAccessMode;
  typesafeKey?: string | null;
  gatewayKey?: string | null;
  baseUrlOverride?: string | null;
  modelOverride?: string | null;
}): Promise<JevCredential> {
  const sync = resolveJevAccessSync({
    ...input,
    oidcAvailable: false,
  });
  if (sync.access) return sync;

  const needsOidc =
    input.mode === "gateway" ||
    input.mode === "auto" ||
    parseJevAccess(String(input.mode)) === "auto";

  if (!needsOidc) return sync;
  if (input.mode === "typesafe") return sync;

  // Only try OIDC when TypeSafe key is absent and (auto or gateway).
  if (input.typesafeKey?.trim() && input.mode === "auto") return sync;

  try {
    const { getVercelOidcToken } = await import("@vercel/oidc");
    const token = await getVercelOidcToken();
    if (typeof token === "string" && token.trim()) {
      return {
        access: "gateway",
        apiKey: token.trim(),
        baseUrl: resolveJevBaseUrl({
          access: "gateway",
          override: input.baseUrlOverride,
        }),
        model: resolveJevModelName({
          access: "gateway",
          configured: input.modelOverride,
        }),
        source: "oidc",
      };
    }
  } catch {
    // Silent: no credential.
  }
  return { access: null, reason: "missing_credential" };
}

export function hasJevCredentialSync(input: {
  mode: JevAccessMode;
  typesafeKey?: string | null;
  gatewayKey?: string | null;
  oidcAvailable?: boolean;
}): boolean {
  return resolveJevAccessSync(input).access !== null;
}
