import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { recordUsage } from "@/lib/credits/service";
import type { PoolStore, StoredContent, StoredItem } from "@/lib/content-pool/pool";
import type { LessonBody } from "@/lib/content-pool/schema";

type ItemRow = StoredItem & { outcome_code?: string };

/** Supabase deposu: servis rolü istemcisiyle (RLS: herkes yalnız doğrulanmışı okur, yazan servis). */
export function supabasePoolStore(service: SupabaseClient): PoolStore {
  return {
    async readVerified(unitId, version) {
      const { data } = await service
        .from("topic_content")
        .select("id, body, unit_sha256")
        .eq("unit_id", unitId)
        .eq("kind", "lesson")
        .eq("version", version)
        .eq("status", "verified")
        .maybeSingle();
      if (!data) return null;
      const { data: items } = await service
        .from("item_bank")
        .select("id, outcome_id, difficulty, stem, choices, answer, explanation, qa")
        .eq("content_id", data.id)
        .eq("status", "verified")
        .order("created_at");
      return {
        id: data.id as string,
        unitSha256: data.unit_sha256 as string,
        body: data.body as LessonBody,
        items: ((items ?? []) as (ItemRow & { qa?: { outcome_code?: string } })[]).map((row) => ({
          ...row,
          outcome_code: row.qa?.outcome_code ?? "",
        })),
      };
    },
    async claim(unit, version) {
      const { data, error } = await service
        .from("topic_content")
        .insert({
          unit_id: unit.unitId,
          program_id: unit.program.id,
          version,
          kind: "lesson",
          unit_sha256: unit.sha256,
          outcome_ids: unit.outcomes.map((o) => o.outcomeId),
          source_links: unit.sourceLinks,
          status: "draft",
        })
        .select("id")
        .single();
      if (data) return { claimed: true, id: data.id as string };
      if (error && error.code !== "23505") throw new Error(`topic_content claim: ${error.message}`);
      const { data: live } = await service
        .from("topic_content")
        .select("id, created_at, status")
        .eq("unit_id", unit.unitId)
        .eq("kind", "lesson")
        .eq("version", version)
        .in("status", ["draft", "verified"])
        .maybeSingle();
      if (!live) return { claimed: false, ageMs: 0, id: "" };
      return { claimed: false, ageMs: Date.now() - Date.parse(live.created_at as string), id: live.id as string };
    },
    async retire(id, status, qa) {
      if (!id) return;
      await service
        .from("topic_content")
        .update({ status, ...(qa ? { qa } : {}), updated_at: new Date().toISOString() })
        .eq("id", id);
      if (status === "stale") await service.from("item_bank").update({ status: "stale" }).eq("content_id", id);
    },
    async writeVerified(id, unit, version, content) {
      const byCode = new Map(unit.outcomes.map((o) => [o.code, o.outcomeId]));
      const rows = content.items.map((item) => ({
        content_id: id,
        unit_id: unit.unitId,
        outcome_id: byCode.get(item.outcome_code)!,
        program_id: unit.program.id,
        version,
        difficulty: item.difficulty,
        stem: item.stem,
        choices: item.choices,
        answer: item.answer,
        explanation: item.explanation,
        status: "verified",
        qa: { outcome_code: item.outcome_code, verified_by: content.qa.verify_model },
      }));
      const { data: inserted, error: itemError } = await service
        .from("item_bank")
        .insert(rows)
        .select("id, outcome_id, difficulty, stem, choices, answer, explanation");
      if (itemError) throw new Error(`item_bank insert: ${itemError.message}`);
      const at = new Date().toISOString();
      const { error } = await service
        .from("topic_content")
        .update({ body: content.lesson, qa: content.qa, model: content.model, status: "verified", verified_at: at, updated_at: at })
        .eq("id", id);
      if (error) throw new Error(`topic_content verify: ${error.message}`);
      const codeById = new Map(unit.outcomes.map((o) => [o.outcomeId, o.code]));
      return {
        id,
        unitSha256: unit.sha256,
        body: content.lesson,
        items: ((inserted ?? []) as StoredItem[]).map((row) => ({ ...row, outcome_code: codeById.get(row.outcome_id) ?? "" })),
      } satisfies StoredContent;
    },
    async recordUsage(userId, usage) {
      for (const entry of usage) {
        if (!entry.tokensIn && !entry.tokensOut) continue;
        await recordUsage(service, { userId, ...entry });
      }
    },
  };
}
