"use server";

import { revalidatePath } from "next/cache";
import { auditLog } from "@/lib/audit";
import { checkFounderActor } from "@/lib/auth/admin-actor";
import { createServiceClient } from "@/lib/supabase/server";
import { cleanupExpiredUploads } from "@/lib/documents/upload-cleanup";
import { evictColdEmbeddings } from "@/lib/documents/vector-lifecycle";
import {
  MAINTENANCE_AUDIT_ACTION,
  MAINTENANCE_CONFIRM,
  MAINTENANCE_EVICTION_BUDGET_MS,
  MAINTENANCE_EVICTION_LIMIT,
  maintenanceAuditMetadata,
  maintenanceMessage,
  type MaintenanceOutcome,
} from "@/lib/admin/maintenance";

/*
  Sistem Sağlığı sayfasının tek eylemi (6 Kasım 2026): elle bakım. Yalnız kurucu (PIN kapısı dahil,
  `checkFounderActor`); ekranda iki adımlı onay, sunucuda onay sözcüğü. Günlük bakım turunun iki işlevini aynı
  sınırlarla çağırır (yeni silme mantığı yok); her çalıştırma denetim kaydına yazılır.
*/

export type MaintenanceResult = { ok: true; message: string } | { ok: false; error: string };

export async function runSystemMaintenance(confirm: string): Promise<MaintenanceResult> {
  const founder = await checkFounderActor();
  if (!founder.ok) return { ok: false, error: founder.error };
  if (confirm !== MAINTENANCE_CONFIRM) return { ok: false, error: "Onay eksik: işlem çalıştırılmadı." };

  const service = createServiceClient();
  const outcome: MaintenanceOutcome = { expiredUploads: null, eviction: null };
  try {
    outcome.expiredUploads = await cleanupExpiredUploads(service);
  } catch (cause) {
    console.error("admin_maintenance_uploads_failed", { cause: cause instanceof Error ? cause.message.slice(0, 120) : "unknown" });
  }
  try {
    outcome.eviction = await evictColdEmbeddings(service, {
      limit: MAINTENANCE_EVICTION_LIMIT,
      budgetMs: MAINTENANCE_EVICTION_BUDGET_MS,
    });
  } catch (cause) {
    console.error("admin_maintenance_eviction_failed", { cause: cause instanceof Error ? cause.message.slice(0, 120) : "unknown" });
  }

  await auditLog(service, {
    actorId: founder.userId,
    action: MAINTENANCE_AUDIT_ACTION,
    entityType: "system",
    entityId: "maintenance",
    metadata: maintenanceAuditMetadata(outcome),
  });
  revalidatePath("/admin/sistem");
  return { ok: true, message: maintenanceMessage(outcome) };
}
