import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuizQuestion } from "@/lib/learning/exam-quiz";
import { podcastCheckOf, podcastPayloadEpisode } from "@/lib/learning/podcast-check";
import { writePodcastCache } from "@/lib/learning/podcast-episode";

/**
 * Dinleme kontrolü yayımdan sonra (30 Ekim 2026, ürün sahibi: "kullanıcı beklerse sıkılır ve dersten kopar").
 *
 * Kontrol podcast'in sonunda gösteriliyor ama yayımı bekletiyordu: canlı modelle dört konuda 13-15 sn, soğuk podcast'in
 * %13-16'sı. Öğrenci bekliyorsa rota podcast'i kontrolsüz (`checkPending: true`) yayımlar, kontrol yanıttan sonra
 * yazılır ve öğrencinin kaydına girer; oynatıcı bitince `progress` ile alır. Önceden yazımda bugünkü gibi birlikte.
 *
 * Kayıt yalnız açıkken değişir: öğrenci podcast'i bitirdiyse (kontrolsüz 1/1 yazıldı) dokunulmaz. Kontrolsüz bölüm
 * önbelleğe yazılmaz kuralı korunur: önbellek kontrolle (yazılamadıysa boş) birlikte burada yazılır.
 */
export async function fillPodcastCheckLater(
  service: SupabaseClient,
  input: {
    attemptId: string;
    prepId: string;
    userId: string;
    topicLabel: string;
    task: () => Promise<QuizQuestion[]>;
  },
): Promise<{ check: number; attached: boolean }> {
  let check: QuizQuestion[] = [];
  try {
    check = await input.task();
  } catch {
    check = [];
  }
  try {
    const { data } = await service
      .from("exam_prep_node_attempts")
      .select("payload, status")
      .eq("id", input.attemptId)
      .maybeSingle();
    const payload = (data?.payload ?? null) as Record<string, unknown> | null;
    const episode = podcastPayloadEpisode(payload);
    if (episode) {
      await writePodcastCache(service, {
        prepId: input.prepId,
        userId: input.userId,
        topicLabel: input.topicLabel,
        episode,
        check,
      });
    }
    if (!payload || data?.status !== "active" || podcastCheckOf(payload).length) {
      return { check: check.length, attached: false };
    }
    const rest = { ...payload };
    delete rest.checkPending;
    const next = check.length ? { ...rest, check } : rest;
    const { error } = await service
      .from("exam_prep_node_attempts")
      .update({ payload: next, ...(check.length ? { total: check.length } : {}) })
      .eq("id", input.attemptId)
      .eq("status", "active");
    console.info("podcast_check_later", { attemptId: input.attemptId, check: check.length, attached: !error });
    return { check: check.length, attached: !error && check.length > 0 };
  } catch (error) {
    console.warn("podcast_check_later_failed", {
      attemptId: input.attemptId,
      cause: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
    return { check: check.length, attached: false };
  }
}
