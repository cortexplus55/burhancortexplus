import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isMissingFunctionError } from "@/lib/auth/admin-role";
import { runPool } from "@/lib/documents/upload-batch";
import { missingColumn } from "@/lib/learning/missing-column";
import { contradictionsByTopicTitleResolved, readContradictionDocuments } from "@/lib/learning/prep-contradiction-read";
import {
  mergeTopicWrites,
  parseSetupFinish,
  setupFinishIsStale,
  withContradictions,
  type PrepSetupFinish,
  type SetupNodeWrite,
  type SetupTopicWrite,
} from "@/lib/learning/prep-setup-split";

/**
 * Faz 2 (madde 7.4): hazırlık kurulumunun arka plan yarısı ve kurtarması.
 *
 * Kök neden: kurulum isteği yanıt vermeden önce (1) her düğüm için ayrı `session_meta` UPDATE'i (~900 istek),
 * (2) konu başına iki UPDATE, (3) kaynak çelişkisi için model yargısı (`judgeEquivalence`) ve (4) uyarlanabilir plan
 * anlık görüntüsünü bekliyordu; ilk ekran saniyelerce "Kuruluyor…"da kalıyordu. Şimdi istek yalnız yol haritasını ve
 * 1. ünitenin adımlarını tek RPC ile yazar; kalanı `after()` ile yanıt sonrası koşar. Kalan iş `exam_preps.setup_finish`
 * içinde durduğu için fonksiyon yarıda ölse de hazırlık sayfası bir sonraki açılışta işi kaldığı yerden başlatır.
 */

const WRITE_LANES = 16;
const WRITE_WAIT_WARN_MS = 1_000;

/** Düğüm ve konu yazımı: tek RPC; göç henüz yoksa (ya da RPC hata verirse) eski satır satır yazım. */
export async function applySetupWrites(
  service: SupabaseClient,
  input: { prepId: string; userId: string; nodes: readonly SetupNodeWrite[]; topics: readonly SetupTopicWrite[] },
): Promise<boolean> {
  if (!input.nodes.length && !input.topics.length) return true;
  const { error } = await service.rpc("apply_exam_prep_setup", {
    p_prep_id: input.prepId,
    p_user_id: input.userId,
    p_nodes: input.nodes,
    p_topics: input.topics,
  });
  if (!error) return true;
  if (!isMissingFunctionError(error)) console.error("prep_setup_rpc_failed", error.message);
  return applySetupWritesRowByRow(service, input);
}

async function applySetupWritesRowByRow(
  service: SupabaseClient,
  input: { prepId: string; nodes: readonly SetupNodeWrite[]; topics: readonly SetupTopicWrite[] },
): Promise<boolean> {
  let ok = true;
  if (input.nodes.length) {
    const { data: rows, error } = await service
      .from("exam_prep_nodes")
      .select("id, sort_order")
      .eq("exam_prep_id", input.prepId)
      .order("sort_order");
    if (error) return false;
    const metaBySort = new Map(input.nodes.map((node) => [node.sort_order, node.meta]));
    const outcome = await runPool(rows ?? [], WRITE_LANES, async (row) => {
      const meta = metaBySort.get(row.sort_order as number);
      if (!meta) return true;
      const write = await service.from("exam_prep_nodes").update({ session_meta: meta }).eq("id", row.id);
      return !write.error;
    });
    if (outcome.failed) ok = false;
  }
  await runPool(input.topics, WRITE_LANES, async (topic) => {
    const { id, source_refs, contradictions, subtopics, ...core } = topic;
    if (Object.keys(core).length) {
      const write = await service.from("exam_prep_topics").update(core).eq("id", id);
      if (write.error) ok = false;
    }
    const extras = {
      ...(source_refs ? { source_refs } : {}),
      ...(contradictions ? { contradictions } : {}),
    };
    if (Object.keys(extras).length) {
      const extraWrite = await service.from("exam_prep_topics").update(extras).eq("id", id);
      if (extraWrite.error && !missingColumn(extraWrite.error)) {
        console.error("topic sources", extraWrite.error.message);
        ok = false;
      }
    }
    // Alt başlıklar ayrı yazılır: sütun yoksa (göç uygulanmadı) kaynaklar yine yazılmış olur.
    if (subtopics?.length) {
      const subWrite = await service.from("exam_prep_topics").update({ subtopics }).eq("id", id);
      if (subWrite.error && !missingColumn(subWrite.error)) {
        console.error("topic subtopics", subWrite.error.message);
        ok = false;
      }
    }
    return true;
  });
  return ok;
}

/** Kalan işi kayda yazar. Sütun yoksa (göç uygulanmadı) false: çağıran işi istek içinde bitirir (eski davranış). */
export async function saveSetupFinish(
  service: SupabaseClient,
  input: { prepId: string; userId: string; finish: PrepSetupFinish },
): Promise<boolean> {
  const { error } = await service
    .from("exam_preps")
    .update({ setup_finish: input.finish })
    .eq("id", input.prepId)
    .eq("user_id", input.userId);
  if (!error) return true;
  if (!missingColumn(error)) console.error("prep_setup_save_failed", error.message);
  return false;
}

async function writeCheckpoint(
  service: SupabaseClient,
  input: { prepId: string; userId: string; finish: PrepSetupFinish | null },
) {
  const { error } = await service
    .from("exam_preps")
    .update({ setup_finish: input.finish })
    .eq("id", input.prepId)
    .eq("user_id", input.userId);
  if (error && !missingColumn(error)) console.error("prep_setup_checkpoint_failed", error.message);
}

/**
 * Arka plan yarısı: çelişki yargısı → kalan düğüm/konu yazımı → uyarlanabilir plan → alanı temizle. Her adım tekrar
 * çalıştırılabilir (aynı değerler yeniden yazılır); yazım biterse ilerleme kaydı daralır, plan adımı tek kalır.
 * `persisted` false ise (sütun yok) kayıt güncellenmez.
 */
export async function runPrepSetupFinish(
  service: SupabaseClient,
  input: { prepId: string; userId: string; finish: PrepSetupFinish; persisted: boolean },
): Promise<boolean> {
  const { prepId, userId, persisted } = input;
  let finish = input.finish;
  const startedAt = Date.now();
  try {
    if (finish.nodes.length || finish.topics.length || finish.contradictions) {
      let contradictionWrites: SetupTopicWrite[] = [];
      if (finish.contradictions) {
        const documents = await readContradictionDocuments(service, finish.contradictions.documentIds).catch(() => []);
        const byTitle = await contradictionsByTopicTitleResolved(
          service,
          userId,
          finish.contradictions.topics,
          documents,
        ).catch((error) => {
          console.warn("prep_setup_contradictions_failed", error instanceof Error ? error.message : String(error));
          return null;
        });
        if (byTitle) {
          const { data: prepTopics } = await service.from("exam_prep_topics").select("id, label").eq("exam_prep_id", prepId);
          contradictionWrites = withContradictions(
            ((prepTopics ?? []) as { id: string; label: string }[]),
            byTitle,
          );
        }
      }
      const written = await applySetupWrites(service, {
        prepId,
        userId,
        nodes: finish.nodes,
        topics: mergeTopicWrites(finish.topics, contradictionWrites),
      });
      if (!written) return false;
      finish = { ...finish, startedAt: new Date().toISOString(), nodes: [], topics: [], contradictions: null };
      if (persisted && finish.masterPlan) await writeCheckpoint(service, { prepId, userId, finish });
    }

    if (finish.masterPlan) {
      try {
        const { isFeatureEnabled, ADAPTIVE_LEARNING_FLAG } = await import("@/lib/admin/feature-flags");
        if (await isFeatureEnabled(service, ADAPTIVE_LEARNING_FLAG, userId)) {
          const { commitMasterPlanVersion } = await import("@/lib/adaptive/master-plan-engine");
          const { data: prepRow } = await service.from("exam_preps").select("schedule_v2").eq("id", prepId).maybeSingle();
          if (prepRow?.schedule_v2) {
            await commitMasterPlanVersion(service, {
              userId,
              examPrepId: prepId,
              trigger: "initial",
              schedule: prepRow.schedule_v2 as import("@/lib/learning/exam-schedule-v2").ScheduleBuildResult,
              previousVersion: 0,
            });
          }
        }
      } catch {
        // Uyarlanabilir plan anlık görüntüsü kurulumu bozmaz (eski davranış).
      }
    }

    if (persisted) await writeCheckpoint(service, { prepId, userId, finish: null });
    const elapsed = Date.now() - startedAt;
    if (elapsed > WRITE_WAIT_WARN_MS) console.info("prep_setup_finished_ms", elapsed);
    return true;
  } catch (error) {
    console.error("prep_setup_finish_failed", error instanceof Error ? error.message : String(error));
    return false;
  }
}

/**
 * Kurtarma: hazırlık sayfası açılınca (yanıttan sonra) çağrılır. Kalan iş varsa ve son sahiplenme bayatsa
 * (arka plan işi yarıda kesildi) koşullu UPDATE ile sahiplenip işi bitirir; aynı anda iki sekme açılsa da yalnız
 * biri sahiplenir. Sütun yoksa ya da iş yoksa hiçbir şey yapmaz.
 */
export async function resumeStalePrepSetup(
  service: SupabaseClient,
  input: { prepId: string; userId: string; now?: number },
): Promise<"none" | "busy" | "resumed" | "failed"> {
  const { data, error } = await service
    .from("exam_preps")
    .select("setup_finish")
    .eq("id", input.prepId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (error || !data) return "none";
  const finish = parseSetupFinish((data as { setup_finish?: unknown }).setup_finish);
  if (!finish) return "none";
  if (!setupFinishIsStale(finish, input.now)) return "busy";
  const claimed: PrepSetupFinish = { ...finish, startedAt: new Date(input.now ?? Date.now()).toISOString() };
  const { data: claimRows, error: claimError } = await service
    .from("exam_preps")
    .update({ setup_finish: claimed })
    .eq("id", input.prepId)
    .eq("user_id", input.userId)
    .eq("setup_finish->>startedAt", finish.startedAt)
    .select("id");
  if (claimError || !claimRows?.length) return "busy";
  const ok = await runPrepSetupFinish(service, {
    prepId: input.prepId,
    userId: input.userId,
    finish: claimed,
    persisted: true,
  });
  return ok ? "resumed" : "failed";
}
