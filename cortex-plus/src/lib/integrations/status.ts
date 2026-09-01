import "server-only";
import { getSmtpConfig } from "@/lib/email/smtp";
import { rateLimitStore } from "@/lib/rate-limit";
import { supabaseConfigIssue } from "@/lib/supabase/config-check";

export type IntegrationStatus = {
  /** Whether the deployment can actually use this integration right now. */
  configured: boolean;
  /** A missing required integration means the app is degraded, not merely plain. */
  required: boolean;
  /** Non-secret detail: never a key, token or password. */
  detail?: string;
};

export type IntegrationReport = {
  ready: boolean;
  missing: string[];
  integrations: Record<string, IntegrationStatus>;
};

const isSet = (value: string | undefined) => Boolean(value?.trim());

/**
 * Reports what the running deployment can actually do, so a half-configured
 * environment is visible instead of failing quietly at the first real request.
 *
 * Values are deliberately reduced to booleans and non-secret descriptors — this
 * is safe to hand to an operator, but never echoes a credential.
 */
export function integrationReport(): IntegrationReport {
  const supabaseIssue = supabaseConfigIssue();

  const limiterStore = rateLimitStore();

  const paytrParts = {
    id: isSet(process.env.PAYTR_MERCHANT_ID),
    key: isSet(process.env.PAYTR_MERCHANT_KEY),
    salt: isSet(process.env.PAYTR_MERCHANT_SALT),
  };
  const paytrConfigured = paytrParts.id && paytrParts.key && paytrParts.salt;

  const smtp = getSmtpConfig();

  const integrations: Record<string, IntegrationStatus> = {
    supabase: {
      configured: !supabaseIssue,
      required: true,
      detail: supabaseIssue ?? undefined,
    },
    openai: {
      configured: isSet(process.env.OPENAI_API_KEY),
      required: true,
      detail: `${process.env.OPENAI_STANDARD_MODEL ?? "gpt-4o-mini"} / ${
        process.env.OPENAI_ADVANCED_MODEL ?? "gpt-4o"
      }`,
    },
    smtp: {
      configured: Boolean(smtp),
      required: true,
      // Host and port carry no secret; the password and address never appear.
      detail: smtp ? `${smtp.host}:${smtp.port}` : "SMTP_PASS veya EMAIL_FROM yok",
    },
    // Without Upstash the limiter silently falls back to a per-instance memory
    // bucket. On Vercel each lambda gets its own, so the ceiling stops being a
    // ceiling — the failure mode is invisible, which is why it is required.
    rateLimitStore: {
      configured: Boolean(limiterStore),
      required: true,
      // The host identifies which store is in use without exposing the token.
      detail: limiterStore
        ? new URL(limiterStore.url).host
        : "bellek içi yedek — dağıtık limit YOK (KV_REST_API_URL/TOKEN veya " +
          "UPSTASH_REDIS_REST_URL/TOKEN gerekli)",
    },
    paytr: {
      configured: paytrConfigured,
      required: false,
      detail: paytrConfigured
        ? `test modu: ${process.env.PAYTR_TEST_MODE ?? "1"}`
        : `eksik: ${[
            !paytrParts.id && "PAYTR_MERCHANT_ID",
            !paytrParts.key && "PAYTR_MERCHANT_KEY",
            !paytrParts.salt && "PAYTR_MERCHANT_SALT",
          ]
            .filter(Boolean)
            .join(", ")}`,
    },
    posthog: {
      configured: isSet(process.env.NEXT_PUBLIC_POSTHOG_KEY),
      required: false,
    },
    sentry: {
      configured: isSet(process.env.SENTRY_DSN),
      required: false,
    },
  };

  const missing = Object.entries(integrations)
    .filter(([, status]) => status.required && !status.configured)
    .map(([name]) => name);

  return { ready: missing.length === 0, missing, integrations };
}
