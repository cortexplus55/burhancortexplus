import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { rateLimit } from "@/lib/rate-limit";
import {
  founderApiGuard,
  jsonError,
  NO_STORE,
} from "@/lib/founder-cockpit/api-guard";
import { runFounderHealthCheck } from "@/lib/founder-cockpit/health-run";

/** "Şimdi kontrol et" (Faz 13): sağlık kontrolünü hemen çalıştırır (alarmlar aynı kilitle). Yalnız kurucu, dakikada 4. */
export const maxDuration = 60;

export async function POST() {
  const guard = await founderApiGuard();
  if (!guard.ok) return guard.response;
  const limit = await rateLimit(`founder-cockpit:check:${guard.userId}`, 4, 60);
  if (!limit.allowed)
    return jsonError(
      429,
      "rate_limited",
      "Biraz bekle: dakikada en çok dört kez kontrol edilir.",
    );
  const report = await runFounderHealthCheck(guard.service);
  await auditLog(guard.service, {
    actorId: guard.userId,
    action: "founder_cockpit.check.run",
    entityType: "founder_health_snapshots",
    metadata: { overall: report.overall },
  });
  revalidatePath("/admin/kokpit");
  return NextResponse.json({ ok: true, report }, { headers: NO_STORE });
}
