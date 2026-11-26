import { NextResponse } from "next/server";
import { auditLog } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import {
  founderApiGuard,
  jsonError,
  NO_STORE,
} from "@/lib/founder-cockpit/api-guard";
import { sendTestAlert } from "@/lib/founder-cockpit/alert-dispatch";
import { testAlertCandidate } from "@/lib/founder-cockpit/alert-email";
import { loadCockpitSettings } from "@/lib/founder-cockpit/settings";

/** "Test Alarm E-Postası Gönder" (Faz 13): alarm adresine deneme e-postası. Yalnız kurucu, dakikada bir. */
export async function POST() {
  const guard = await founderApiGuard();
  if (!guard.ok) return guard.response;
  const limit = await rateLimit(
    `founder-cockpit:test-alert:${guard.userId}`,
    1,
    60,
  );
  if (!limit.allowed)
    return jsonError(
      429,
      "rate_limited",
      "Deneme e-postası dakikada bir gönderilebilir.",
    );
  const { settings } = await loadCockpitSettings(guard.service);
  const sent = await sendTestAlert(
    guard.service,
    testAlertCandidate(),
    settings.alertEmail,
  );
  await auditLog(guard.service, {
    actorId: guard.userId,
    action: "founder_cockpit.alert.test",
    entityType: "founder_alert_logs",
    metadata: { sent },
  });
  if (!sent)
    return jsonError(
      502,
      "send_failed",
      "E-posta gönderilemedi. E-posta (Resend) kartına bak.",
    );
  return NextResponse.json(
    { ok: true, to: settings.alertEmail },
    { headers: NO_STORE },
  );
}
