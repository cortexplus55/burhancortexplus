import type { SupabaseClient } from "@supabase/supabase-js";
import { notifyInApp, type NotifyOutcome } from "@/lib/notifications/in-app";
import { normalizeTopicKey } from "@/lib/learning/learning-tracking";

/**
 * Olay bildirimleri (Faz 6, 20 Kasım 2026): model çağrısı yok, maliyet 0. Hepsi `notifyInApp` üzerinden; öğrenci uygulama
 * içi bildirimi kapattıysa yazılmaz. Hiçbiri çağıranın işini durdurmaz (hata günlüğe iner).
 */

const enc = encodeURIComponent;

export function notifyVideoReady(
  service: SupabaseClient,
  input: { userId: string; prepId: string; topicId: string | null; topicLabel: string; videoId: string },
): Promise<NotifyOutcome> {
  const query = [`v=${enc(input.videoId)}`, input.topicId ? `topicId=${enc(input.topicId)}` : null].filter(Boolean).join("&");
  return notifyInApp(service, {
    userId: input.userId,
    kind: "video_ready",
    title: "Video dersin hazır",
    body: `${input.topicLabel} için video ders hazırlandı; istediğin an izleyebilirsin.`,
    actionUrl: `/deneme-sinavlari/${enc(input.prepId)}/video?${query}`,
    dedupeKey: `video_ready:${input.videoId}`,
  });
}

export function notifyPodcastReady(
  service: SupabaseClient,
  input: { userId: string; prepId: string; topicId: string; topicLabel: string; length: string },
): Promise<NotifyOutcome> {
  return notifyInApp(service, {
    userId: input.userId,
    kind: "podcast_ready",
    title: "Podcast'in hazır",
    body: `${input.topicLabel} podcast'i hazırlandı; kaldığın yerden dinleyebilirsin.`,
    actionUrl: `/deneme-sinavlari/${enc(input.prepId)}/podcast?topicId=${enc(input.topicId)}&length=${enc(input.length)}`,
    dedupeKey: `podcast_ready:${input.prepId}:${input.topicId}:${input.length}`,
  });
}

/** Konu "Öğrendin" rozetine ulaştı: konu başına bir kez. */
export function notifyTopicLearned(
  service: SupabaseClient,
  input: { userId: string; prepId: string; topicLabel: string },
): Promise<NotifyOutcome> {
  return notifyInApp(service, {
    userId: input.userId,
    kind: "topic_learned",
    title: "Bir konuyu öğrendin 🎉",
    body: `${input.topicLabel} konusu artık "Öğrendin" seviyesinde. Günü gelince kısa bir tekrarla kalıcı hâle gelir.`,
    actionUrl: `/deneme-sinavlari/${enc(input.prepId)}`,
    dedupeKey: `topic_learned:${input.prepId}:${normalizeTopicKey(input.topicLabel)}`.slice(0, 200),
  });
}

/** Etkinlikte yeni sınav tuzağı (yanılgı) tespit edildi: etkinlik başına bir bildirim. */
export function notifyBlindSpots(
  service: SupabaseClient,
  input: { userId: string; prepId: string; attemptId: string; count: number; topicLabel: string | null },
): Promise<NotifyOutcome> {
  const where = input.topicLabel ? `${input.topicLabel} konusunda ` : "";
  return notifyInApp(service, {
    userId: input.userId,
    kind: "blind_spot_detected",
    title: input.count === 1 ? "Yeni bir sınav tuzağı yakaladık" : `${input.count} yeni sınav tuzağı yakaladık`,
    body: `${where}karıştırılan noktayı not ettik. Günü gelen tekrarda yeniden sorulacak; tekrarlar kredi harcamaz.`,
    actionUrl: `/deneme-sinavlari/${enc(input.prepId)}/tekrar`,
    dedupeKey: `blind_spot:${input.attemptId}`,
  });
}
