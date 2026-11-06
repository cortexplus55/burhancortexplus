"use server";

import { currentAdminActor } from "@/lib/auth/admin-actor";
import { adminGateConfig, clearAdminGateCookie, issueAdminGateCookie } from "@/lib/auth/admin-gate";
import { ADMIN_GATE_FAILURE_WINDOW_SECONDS, ADMIN_GATE_MAX_FAILURES } from "@/lib/auth/admin-gate-core";
import { decideAdminGateAttempt, gateAttemptMessage } from "@/lib/auth/admin-gate-attempt";
import { auditLog } from "@/lib/audit";
import { peekCount, rateLimit, userKey } from "@/lib/rate-limit";
import { createServiceClient } from "@/lib/supabase/server";

export type GateActionResult = { ok: true } | { ok: false; error: string };

/** "🔐 Kurucu Yönetim Girişi": PIN'i doğrular, kapı çerezini yazar. Her deneme denetim kaydına. */
export async function verifyAdminGatePin(pin: string): Promise<GateActionResult> {
  const actor = await currentAdminActor();
  if (!actor) return { ok: false, error: "Yetkisiz işlem." };

  const key = userKey(actor.userId, "admin_gate_fail");
  const outcome = await decideAdminGateAttempt({
    pin: typeof pin === "string" ? pin : "",
    config: adminGateConfig(),
    failures: {
      count: () => peekCount(key),
      record: async () => {
        const result = await rateLimit(key, ADMIN_GATE_MAX_FAILURES, ADMIN_GATE_FAILURE_WINDOW_SECONDS);
        return ADMIN_GATE_MAX_FAILURES - result.remaining;
      },
    },
  });

  if (outcome.kind === "off") return { ok: true };
  if (outcome.kind === "passed") {
    const issued = await issueAdminGateCookie(actor.userId);
    if (!issued) return { ok: false, error: gateAttemptMessage({ kind: "misconfigured" }) ?? "Kapı açılamadı." };
  }

  await auditLog(createServiceClient(), {
    actorId: actor.userId,
    action: `admin_gate.${outcome.kind}`,
    entityType: "admin_gate",
    entityId: actor.userId,
    metadata: { role: actor.role, ...(outcome.kind === "wrong" ? { remaining: outcome.remaining } : {}) },
  }).catch(() => undefined);

  const message = gateAttemptMessage(outcome);
  return message ? { ok: false, error: message } : { ok: true };
}

/** Bu cihazda kapıyı kilitler (çerezi siler). */
export async function lockAdminGate(): Promise<GateActionResult> {
  const actor = await currentAdminActor();
  if (!actor) return { ok: false, error: "Yetkisiz işlem." };
  await clearAdminGateCookie();
  await auditLog(createServiceClient(), {
    actorId: actor.userId,
    action: "admin_gate.locked_by_user",
    entityType: "admin_gate",
    entityId: actor.userId,
  }).catch(() => undefined);
  return { ok: true };
}
