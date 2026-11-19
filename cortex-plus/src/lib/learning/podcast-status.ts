/**
 * Podcast üretim durumu (19 Kasım 2026, Faz 1-A §4.2) — ders bağımsız.
 *
 * Sıra: queued → generating_script → synthesizing_audio → ready (düşerse failed). Sunucu ilk üç adımı ve hatayı
 * `podcast_generation_status` tablosuna yazar; istemci 2,5 sn'de bir okur (GET /api/learning/exam-prep/podcast/status).
 * Son adım (ready) oynatıcıda ilk bölümün sesi çalmaya hazır olunca istemcide kapanır. Tablo yoksa (göç uygulanmadan)
 * yazım ve okuma sessizce atlanır, günlüğe iner: podcast bugünkü gibi çalışır, adımlar istemcinin kendi aşamasıyla
 * ilerler.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export const PODCAST_STATUS_STEPS = ["queued", "generating_script", "synthesizing_audio", "ready"] as const;
export type PodcastStatusStep = (typeof PODCAST_STATUS_STEPS)[number];
export type PodcastStatus = PodcastStatusStep | "failed";

/** Öğrencinin gördüğü adım adları (iç kod adı değil). */
export const PODCAST_STATUS_LABEL: Record<PodcastStatusStep, string> = {
  queued: "Sıraya alındı",
  generating_script: "Senaryo yazılıyor",
  synthesizing_audio: "Ses hazırlanıyor",
  ready: "Dinlemeye hazır",
};

export const PODCAST_STATUS_TABLE = "podcast_generation_status";
/** İstemcinin okuma aralığı (ms). */
export const PODCAST_STATUS_POLL_MS = 2_500;

export function parsePodcastStatus(value: unknown): PodcastStatus | null {
  return value === "failed" || (PODCAST_STATUS_STEPS as readonly unknown[]).includes(value) ? (value as PodcastStatus) : null;
}

/** Adımın sırası (failed ve bilinmeyen -1). */
export function podcastStatusRank(status: PodcastStatus | null | undefined): number {
  return status ? (PODCAST_STATUS_STEPS as readonly string[]).indexOf(status) : -1;
}

/** İki kaynaktan (sunucu, istemci) ileride olan adım; geri gitmez. */
export function furtherPodcastStatus(a: PodcastStatus | null | undefined, b: PodcastStatus | null | undefined): PodcastStatus | null {
  if (a === "failed" || b === "failed") return "failed";
  return podcastStatusRank(a) >= podcastStatusRank(b) ? (a ?? null) : (b ?? null);
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function validPodcastStatusId(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}

/** Durum yazımı: hata podcast'i durdurmaz, günlüğe iner. */
export async function writePodcastStatus(
  service: SupabaseClient,
  input: {
    id: string | null | undefined;
    userId: string;
    prepId: string;
    topicId: string | null;
    status: PodcastStatus;
    errorCode?: string | null;
  },
): Promise<void> {
  if (!validPodcastStatusId(input.id)) return;
  try {
    const { error } = await service.from(PODCAST_STATUS_TABLE).upsert(
      {
        id: input.id,
        user_id: input.userId,
        exam_prep_id: input.prepId,
        topic_id: input.topicId,
        status: input.status,
        error_code: input.errorCode ?? null,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    );
    if (error) console.warn("podcast_status_write_skipped", { code: error.code ?? "unknown", status: input.status });
  } catch (caught) {
    console.warn("podcast_status_write_skipped", { code: caught instanceof Error ? caught.name : "throw", status: input.status });
  }
}

/** Öğrencinin kendi satırı; yoksa ya da okunamazsa null. */
export async function readPodcastStatus(
  service: SupabaseClient,
  userId: string,
  id: string,
): Promise<{ status: PodcastStatus; errorCode: string | null; updatedAt: string | null } | null> {
  if (!validPodcastStatusId(id)) return null;
  try {
    const { data, error } = await service
      .from(PODCAST_STATUS_TABLE)
      .select("status, error_code, updated_at")
      .eq("id", id)
      .eq("user_id", userId)
      .maybeSingle();
    if (error) {
      console.warn("podcast_status_read_skipped", { code: error.code ?? "unknown" });
      return null;
    }
    const status = parsePodcastStatus((data as { status?: unknown } | null)?.status);
    if (!status) return null;
    const row = data as { error_code?: unknown; updated_at?: unknown };
    return {
      status,
      errorCode: typeof row.error_code === "string" ? row.error_code : null,
      updatedAt: typeof row.updated_at === "string" ? row.updated_at : null,
    };
  } catch (caught) {
    console.warn("podcast_status_read_skipped", { code: caught instanceof Error ? caught.name : "throw" });
    return null;
  }
}

/**
 * İlk bölümün sesi istemcide çalmaya hazır: satır "ready" olur. Yalnız öğrencinin kendi, ses aşamasındaki satırı;
 * düşmüş (failed) ya da henüz senaryo yazılan satır ileri atlatılmaz.
 */
export async function markPodcastReady(service: SupabaseClient, userId: string, id: string): Promise<boolean> {
  if (!validPodcastStatusId(id)) return false;
  try {
    const { data, error } = await service
      .from(PODCAST_STATUS_TABLE)
      .update({ status: "ready", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", userId)
      .eq("status", "synthesizing_audio")
      .select("id");
    if (error) {
      console.warn("podcast_status_ready_skipped", { code: error.code ?? "unknown" });
      return false;
    }
    return Array.isArray(data) && data.length > 0;
  } catch (caught) {
    console.warn("podcast_status_ready_skipped", { code: caught instanceof Error ? caught.name : "throw" });
    return false;
  }
}
