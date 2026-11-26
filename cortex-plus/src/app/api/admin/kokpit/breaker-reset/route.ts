import { NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import {
  founderApiGuard,
  jsonError,
  NO_STORE,
} from "@/lib/founder-cockpit/api-guard";
import { resetHeavyAiProtectionCache } from "@/lib/founder-cockpit/breaker";
import { saveCockpitSettings } from "@/lib/founder-cockpit/settings";

/** Koruma modunu kaldır (Faz 13): ağır yapay zekâ işleri hemen açılır. Anahtar açık kalır; bütçe yeniden aşılırsa yeniden devreye girer. */
export async function POST() {
  const guard = await founderApiGuard();
  if (!guard.ok) return guard.response;
  const saved = await saveCockpitSettings(guard.service, {
    circuit_breaker_triggered_at: null,
  });
  if (!saved.ok) {
    return saved.reason === "missing_table"
      ? jsonError(409, "migration_pending", "Ayar tablosu henüz yok.")
      : jsonError(500, "save_failed", "Koruma modu kaldırılamadı.");
  }
  resetHeavyAiProtectionCache();
  await auditLog(guard.service, {
    actorId: guard.userId,
    action: "founder_cockpit.breaker.reset",
    entityType: "founder_cockpit_settings",
    entityId: "default",
  });
  revalidatePath("/admin/kokpit");
  return NextResponse.json({ ok: true }, { headers: NO_STORE });
}
