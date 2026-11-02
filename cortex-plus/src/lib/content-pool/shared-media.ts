import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { poolUnitForTopic } from "@/lib/content-pool/serve";
import type { PoolUnit } from "@/lib/content-pool/keys";
import { readFillConfig, sharedContentSpent } from "@/lib/content-pool/fill-server";

/**
 * Hazır (havuz) ünitelerin video/podcast'i için paylaşımlı, ünite başına read-through önbellek (2 Kasım 2026).
 * Yalnız belgesiz hazırlıkta (belgeli hazırlık kendi belge tabanlı yolunda kalır). Öğrenciye 0 kredi; ilk üretimin
 * maliyeti SHARED_CONTENT_MEDIA koduyla yazılır. Toplam SHARED_CONTENT harcaması doldurucuyla ortak tavana
 * yaklaşınca yeni üretim yapılmaz; dürüst mesajla durulur. Plus kapıları rotalarda aynen kalır.
 */
export const SHARED_MEDIA_CODE = "SHARED_CONTENT_MEDIA" as const;

/** Tahmini ilk üretim maliyeti (USD); tavana bu kadar pay bırakılır. */
const MEDIA_ESTIMATE_USD: Record<string, number> = { podcast: 0.05, video: 0.6 };

export async function sharedMediaUnit(service: SupabaseClient, prepId: string, topicLabel: string): Promise<PoolUnit | null> {
  const { data } = await service
    .from("exam_preps")
    .select("document_id, source_document_ids, learning_preferences")
    .eq("id", prepId)
    .maybeSingle();
  if (!data) return null;
  const docs = Array.isArray(data.source_document_ids) ? data.source_document_ids.length : 0;
  if (data.document_id || docs) return null;
  return poolUnitForTopic(data.learning_preferences, topicLabel);
}

export async function readSharedMedia<T>(service: SupabaseClient, unit: PoolUnit, kind: string): Promise<T | null> {
  const { data, error } = await service
    .from("shared_unit_media")
    .select("payload")
    .eq("program_id", unit.program.id)
    .eq("unit_id", unit.unitId)
    .eq("unit_sha256", unit.sha256)
    .eq("kind", kind)
    .maybeSingle();
  if (error) return null;
  return (data?.payload as T | undefined) ?? null;
}

export async function writeSharedMedia(service: SupabaseClient, unit: PoolUnit, kind: string, payload: unknown, userId: string): Promise<void> {
  await service
    .from("shared_unit_media")
    .upsert(
      { program_id: unit.program.id, unit_id: unit.unitId, unit_sha256: unit.sha256, kind, payload, created_by: userId },
      { onConflict: "program_id,unit_id,unit_sha256,kind", ignoreDuplicates: true },
    )
    .then(({ error }) => {
      if (error) console.error("shared_media_write_failed", { kind, unit: unit.unitId, code: error.code });
    });
}

/** Tavan payı: harcama + bu türün tahmini > tavan ise false. */
export async function sharedBudgetAllows(service: SupabaseClient, kind: "podcast" | "video"): Promise<boolean> {
  const [spent, config] = await Promise.all([sharedContentSpent(service), readFillConfig(service)]);
  return spent + (MEDIA_ESTIMATE_USD[kind] ?? 0.1) <= config.capUsd;
}

export const SHARED_BUDGET_MESSAGE =
  "Hazır içerik için ayrılan üretim bütçesi doldu; bu ünitenin bu içeriği şu an üretilemiyor. Kredi düşülmedi.";
