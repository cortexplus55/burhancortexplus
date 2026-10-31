import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { verifyPrepInviteToken } from "@/lib/learning/prep-invite";
import { examTimeFromPreferences } from "@/lib/learning/exam-time";
import { awardStars } from "@/lib/stars/award";
import { PREP_JOINED_STARS } from "@/lib/stars/rules";
import { ensureReferralCode } from "@/lib/credits/invite-code";

/**
 * Sınıf davetiyle katılım (31 Ekim 2026, Paket J3 #14). Okul ağındaki katılımla (`/api/school` POST) aynı fork
 * modeli: hazırlığın başlığı, sınav türü, tarihi, hedefi ve konu başlıkları sırasıyla kopyalanır; ilerleme, cevap,
 * puan, belge ve sohbet kopyalanmaz. Okul paylaşımından farkı yalnız erişim: aynı okul şartı yerine imzalı bağlantı.
 * Sınavın saati ve yeri de kopyalanır (aynı sınav; kişisel veri değil).
 */

export type InviteSource = {
  id: string;
  userId: string;
  title: string;
  examType: string | null;
  examDate: string | null;
  targetScore: number | null;
  topicCount: number;
  learningPreferences: unknown;
};

export type InviteLookup =
  | { ok: true; source: InviteSource }
  | { ok: false; reason: "invalid" | "expired" | "unconfigured" | "not_found" };

export async function loadInviteSource(service: SupabaseClient, token: string): Promise<InviteLookup> {
  const verified = verifyPrepInviteToken(token);
  if (!verified.ok) return verified;
  const { data: prep, error } = await service
    .from("exam_preps")
    .select("id, user_id, title, exam_type, exam_date, target_score, learning_preferences")
    .eq("id", verified.claims.prepId)
    .maybeSingle();
  if (error || !prep) return { ok: false, reason: "not_found" };
  const { count } = await service
    .from("exam_prep_topics")
    .select("id", { count: "exact", head: true })
    .eq("exam_prep_id", prep.id as string);
  return {
    ok: true,
    source: {
      id: prep.id as string,
      userId: prep.user_id as string,
      title: String(prep.title ?? prep.exam_type ?? "Sınav hazırlığı"),
      examType: (prep.exam_type as string | null) ?? null,
      examDate: (prep.exam_date as string | null) ?? null,
      targetScore: typeof prep.target_score === "number" ? prep.target_score : null,
      topicCount: count ?? 0,
      learningPreferences: prep.learning_preferences ?? null,
    },
  };
}

/** Öğrencinin bu hazırlıktan daha önce aldığı kopya. */
export async function findJoinedCopy(
  service: SupabaseClient,
  input: { sourceId: string; userId: string },
): Promise<string | null> {
  const { data } = await service
    .from("exam_preps")
    .select("id")
    .eq("user_id", input.userId)
    .eq("forked_from", input.sourceId)
    .limit(1)
    .maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/** Davet edenin kayıt kodu (misafir kayıt olurken iki tarafa davet hediyesi); okunamazsa null, kayıt yine açılır. */
export async function inviterReferralCode(service: SupabaseClient, userId: string): Promise<string | null> {
  try {
    const { data } = await service.from("profiles").select("referral_code").eq("id", userId).maybeSingle();
    return await ensureReferralCode(service, userId, (data?.referral_code as string | null) ?? null);
  } catch {
    return null;
  }
}

/** Kopyayı kurar. Kaynağın sahibi ve önceki kopya çağıranda denetlenir. */
export async function copyInvitedPrep(
  service: SupabaseClient,
  input: { source: InviteSource; userId: string },
): Promise<{ ok: true; id: string; topics: number } | { ok: false }> {
  const { source, userId } = input;
  const { data: profile } = await service.from("profiles").select("school_id").eq("id", userId).maybeSingle();
  const { time, place } = examTimeFromPreferences(source.learningPreferences);
  const { data: copy, error } = await service
    .from("exam_preps")
    .insert({
      user_id: userId,
      title: source.title,
      exam_type: source.examType,
      exam_date: source.examDate,
      target_score: source.targetScore,
      school_id: (profile?.school_id as string | null | undefined) ?? null,
      // Kopya varsayılan olarak gizli; sahibi isterse ayrıca paylaşır.
      visibility: "private",
      forked_from: source.id,
      learning_preferences: { ...(time ? { examTime: time } : {}), ...(place ? { examPlace: place } : {}) },
    })
    .select("id")
    .single();
  if (error || !copy) return { ok: false };

  // Yalnız konu başlıkları ve sırası; ilerleme kopyalanmaz.
  const { data: topics } = await service
    .from("exam_prep_topics")
    .select("label, sort_order")
    .eq("exam_prep_id", source.id)
    .order("sort_order");
  const rows = (topics ?? []) as { label: string; sort_order: number }[];
  if (rows.length) {
    await service
      .from("exam_prep_topics")
      .insert(rows.map((topic) => ({ exam_prep_id: copy.id, label: topic.label, sort_order: topic.sort_order })));
  }

  // Yıldızlar: "Hazırlığında yeni öğrenci" — okul katılımıyla aynı kaynak ve anahtar (aynı kişi iki kez saymaz).
  await awardStars(service, {
    userId: source.userId,
    source: "prep_joined",
    ref: `${source.id}:${userId}`,
    amount: PREP_JOINED_STARS,
  });

  return { ok: true, id: copy.id as string, topics: rows.length };
}
