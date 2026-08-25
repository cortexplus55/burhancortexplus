import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

const REDACTED_KEYS = [
  "password",
  "token",
  "secret",
  "authorization",
  "api_key",
  "hash",
];

export function redact(input: Record<string, unknown>) {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(input)) {
    out[REDACTED_KEYS.some((k) => key.toLowerCase().includes(k)) ? key : key] =
      REDACTED_KEYS.some((k) => key.toLowerCase().includes(k))
        ? "[redacted]"
        : value;
  }
  return out;
}

export async function auditLog(
  service: SupabaseClient,
  params: {
    actorId?: string | null;
    action: string;
    entityType?: string;
    entityId?: string;
    metadata?: Record<string, unknown>;
  },
) {
  await service.from("audit_logs").insert({
    actor_id: params.actorId ?? null,
    action: params.action,
    entity_type: params.entityType ?? null,
    entity_id: params.entityId ?? null,
    metadata: redact(params.metadata ?? {}),
  });
}
