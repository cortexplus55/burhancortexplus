import type { NextConfig } from "next";

// `||` rather than `??`: these are routinely present but set to "" in .env
// files, and an empty origin silently produces a malformed directive.
const supabaseOrigin = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseSocket = supabaseOrigin.replace(/^https:/, "wss:");
const posthogOrigin =
  process.env.NEXT_PUBLIC_POSTHOG_HOST || "https://eu.i.posthog.com";

const QR_ORIGIN = "https://api.qrserver.com";

const join = (parts: (string | false)[]) => parts.filter(Boolean).join("; ");

/** Build one directive, dropping sources that are empty (unset env vars). */
const sources = (directive: string, values: string[]) =>
  [directive, ...values.filter(Boolean)].join(" ");

/**
 * Enforced today. These directives cannot affect rendering, so they are safe to
 * turn on without a soak period, and they still block base-tag injection,
 * plugin embedding and clickjacking.
 */
const enforcedCsp = join([
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
]);

/**
 * The policy we intend to enforce, shipped report-only first so violations show
 * up in the console (and in any report collector we add) before they can break
 * checkout or sign-in.
 *
 * 'unsafe-inline' stays in script-src until a per-request nonce is threaded
 * through middleware: the App Router inlines its hydration payload.
 */
const reportOnlyCsp = join([
  "default-src 'self'",
  sources("script-src", [
    "'self'",
    "'unsafe-inline'",
    "'unsafe-eval'",
    posthogOrigin,
  ]),
  "style-src 'self' 'unsafe-inline'",
  sources("img-src", ["'self'", "data:", "blob:", QR_ORIGIN, supabaseOrigin]),
  "font-src 'self' data:",
  sources("connect-src", [
    "'self'",
    supabaseOrigin,
    supabaseSocket,
    posthogOrigin,
  ]),
  "media-src 'self' https://videos.pexels.com",
  "frame-src https://www.paytr.com",
  "form-action 'self'",
  "base-uri 'self'",
  "object-src 'none'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
]);

const nextConfig: NextConfig = {
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
          { key: "Content-Security-Policy", value: enforcedCsp },
          {
            key: "Content-Security-Policy-Report-Only",
            value: reportOnlyCsp,
          },
        ],
      },
    ];
  },
};

export default nextConfig;
