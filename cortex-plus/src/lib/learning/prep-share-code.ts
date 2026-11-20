import "server-only";
import { randomInt } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { generateShareCode, maskFirstName, normalizeShareCode } from "@/lib/learning/class-share";
import { inviterReferralCode } from "@/lib/learning/prep-invite-store";
import { missingSchema } from "@/lib/learning/missing-column";
import { withoutOutcomeCode } from "@/lib/learning/path-labels";

/**
 * Hazırlığın paylaşım kodu (Faz 7, 20 Kasım 2026). Göç 20261120140000 yoksa (`share_code` sütunu tanınmıyor) çağıran
 * bugünkü imzalı davete düşer (`unavailable`). Bütün okuma ve yazma sunucu anahtarıyla, sahiplik süzgeciyle.
 */

export type ShareCodeResult =
  | { ok: true; code: string }
  | { ok: false; reason: "not_found" | "unavailable" | "save_failed" };

/** Kodu açar ya da var olanı döndürür (idempotent). Hazırlık çağıranın değilse `not_found`. */
export async function ensurePrepShareCode(
  service: SupabaseClient,
  input: { prepId: string; userId: string; ipHash?: string | null },
): Promise<ShareCodeResult> {
  const { data: prep, error } = await service
    .from("exam_preps")
    .select("id, share_code, is_public_cloneable")
    .eq("id", input.prepId)
    .eq("user_id", input.userId)
    .maybeSingle();
  if (error) return { ok: false, reason: missingSchema(error) ? "unavailable" : "save_failed" };
  if (!prep) return { ok: false, reason: "not_found" };

  const existing = normalizeShareCode(prep.share_code as string | null);
  if (existing) {
    // Kod durur; bayrak kapalıysa açılır, IP özeti en son paylaşımı tutar (aynı IP kuralı).
    const patch: Record<string, unknown> = {};
    if (prep.is_public_cloneable !== true) patch.is_public_cloneable = true;
    if (input.ipHash) patch.share_ip_hash = input.ipHash;
    if (Object.keys(patch).length) {
      await service.from("exam_preps").update(patch).eq("id", input.prepId).eq("user_id", input.userId);
    }
    return { ok: true, code: existing };
  }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const code = generateShareCode((size) => randomInt(size));
    const { data, error: updateError } = await service
      .from("exam_preps")
      .update({ share_code: code, is_public_cloneable: true, ...(input.ipHash ? { share_ip_hash: input.ipHash } : {}) })
      .eq("id", input.prepId)
      .eq("user_id", input.userId)
      .is("share_code", null)
      .select("share_code")
      .maybeSingle();
    if (updateError && missingSchema(updateError)) return { ok: false, reason: "unavailable" };
    const written = normalizeShareCode((data?.share_code as string | null | undefined) ?? null);
    if (written) return { ok: true, code: written };
    // Ya kod çakıştı (benzersiz kısıt) ya da bu arada başka istek kod yazdı: yeniden oku.
    const { data: again } = await service
      .from("exam_preps")
      .select("share_code")
      .eq("id", input.prepId)
      .eq("user_id", input.userId)
      .maybeSingle();
    const raced = normalizeShareCode((again?.share_code as string | null | undefined) ?? null);
    if (raced) return { ok: true, code: raced };
  }
  return { ok: false, reason: "save_failed" };
}

export type SharedPrep = {
  id: string;
  userId: string;
  title: string;
  examType: string | null;
  examDate: string | null;
  targetScore: number | null;
  learningPreferences: unknown;
  /** Konu başlıkları yolun sırasıyla; kazanım kodu atılmış. */
  units: string[];
  topicCount: number;
  sharedBy: string | null;
};

export type SharedPrepLookup = { ok: true; prep: SharedPrep } | { ok: false; reason: "invalid" | "not_found" | "unavailable" };

/**
 * Paylaşım kodunun hazırlığı (herkese açık sayfa ve kopyalama). Yalnız başlık, sınav bilgisi, konu adları ve paylaşanın
 * maskeli ilk adı okunur; belge, ilerleme, cevap ve sonuç okunmaz.
 */
export async function loadSharedPrep(service: SupabaseClient, rawCode: string | null | undefined): Promise<SharedPrepLookup> {
  const code = normalizeShareCode(rawCode);
  if (!code) return { ok: false, reason: "invalid" };
  const { data: prep, error } = await service
    .from("exam_preps")
    .select("id, user_id, title, exam_type, exam_date, target_score, learning_preferences, is_public_cloneable")
    .eq("share_code", code)
    .maybeSingle();
  if (error) return { ok: false, reason: missingSchema(error) ? "unavailable" : "not_found" };
  if (!prep || prep.is_public_cloneable !== true) return { ok: false, reason: "not_found" };

  const [{ data: topics }, { data: owner }] = await Promise.all([
    service.from("exam_prep_topics").select("label, sort_order").eq("exam_prep_id", prep.id as string).order("sort_order").limit(200),
    service.from("profiles").select("full_name").eq("id", prep.user_id as string).maybeSingle(),
  ]);
  const units = ((topics ?? []) as { label: string | null }[])
    .map((topic) => withoutOutcomeCode(String(topic.label ?? "")).trim())
    .filter(Boolean);
  return {
    ok: true,
    prep: {
      id: prep.id as string,
      userId: prep.user_id as string,
      title: String(prep.title ?? prep.exam_type ?? "Sınav hazırlığı"),
      examType: (prep.exam_type as string | null) ?? null,
      examDate: (prep.exam_date as string | null) ?? null,
      targetScore: typeof prep.target_score === "number" ? prep.target_score : null,
      learningPreferences: prep.learning_preferences ?? null,
      units,
      topicCount: units.length,
      sharedBy: maskFirstName((owner?.full_name as string | null | undefined) ?? null),
    },
  };
}

/** Paylaşanın davet kodu (misafir kayıt olurken; okunamazsa null, kayıt yine açılır). */
export function sharerReferralCode(service: SupabaseClient, userId: string): Promise<string | null> {
  return inviterReferralCode(service, userId);
}
