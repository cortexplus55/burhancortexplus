"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auditLog } from "@/lib/audit";
import { requireAdminActor } from "@/lib/auth/admin-actor";
import { createServiceClient } from "@/lib/supabase/server";

const inputSchema = z.object({ reportId: z.string().uuid(), decision: z.enum(["hidden", "dismissed"]) });

/**
 * Düello bildirimine karar (26 Kasım 2026, mobil 1. adım; App Store 1.2). Karar turun bütün açık bildirimlerine yazılır:
 * "Adı gizle" turun adını sıralamada "Oyuncu" yapar (puan ve sıra yerinde), "Bildirimi kapat" kendiliğinden gizlemeyi
 * de kaldırır. Satır silinmez; her karar denetim kaydına geçer.
 */
export async function decideDuelReport(reportId: string, decision: "hidden" | "dismissed"): Promise<{ ok: boolean; error?: string }> {
  const actorId = await requireAdminActor();
  if (!actorId) return { ok: false, error: "Yetkisiz işlem." };
  const parsed = inputSchema.safeParse({ reportId, decision });
  if (!parsed.success) return { ok: false, error: "Geçersiz kayıt." };

  const service = createServiceClient();
  const { data: report, error: readError } = await service
    .from("duel_reports")
    .select("id, run_id")
    .eq("id", parsed.data.reportId)
    .maybeSingle();
  if (readError || !report) return { ok: false, error: "Bildirim bulunamadı." };

  const now = new Date().toISOString();
  const { error } = await service
    .from("duel_reports")
    .update({ status: parsed.data.decision, reviewed_by: actorId, reviewed_at: now })
    .eq("run_id", report.run_id as string)
    .in("status", parsed.data.decision === "hidden" ? ["open", "dismissed"] : ["open"]);
  if (error) return { ok: false, error: "Kaydedilemedi." };

  await auditLog(service, {
    actorId,
    action: parsed.data.decision === "hidden" ? "duel.report_hidden" : "duel.report_dismissed",
    entityType: "duel_report",
    entityId: parsed.data.reportId,
    metadata: { runId: report.run_id },
  }).catch(() => undefined);
  revalidatePath("/admin/duello-bildirimleri");
  return { ok: true };
}
