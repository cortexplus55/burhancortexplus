import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dropPrefetch, nextPrefetchNode, requestNodePrefetch } from "@/lib/learning/lesson-prefetch";
import { lessonQuizContext, loadTopicLessons } from "@/lib/learning/lesson-quiz-context";

/**
 * Konu testi dersi bilir (20 Ekim 2026, ürün sahibinin kararı: önceden yazılan test ders parmak
 * iziyle anahtarlanır ve ders kaydedilince yenilenir).
 *
 * Sıradaki test, öğrenci dersi açınca arka planda yazılıyor (`requestNextPrefetch`); soğuk ya da
 * devralınan derste o an ders henüz kaydedilmemiş olur ve test dersi bilmeden yazılır. Anahtar
 * (`prefetchVariant` + `lessonKey`) böyle bir testi açılışta düşürür; burada ders kaydedilir
 * kaydedilmez test derse göre yeniden istenir ki öğrenci açılışta beklemesin.
 *
 * Kimin hangi derse göre yazdığı kaydın kendisinde: test yazımı sahiplendiği satıra anahtarını
 * yazar (`tagQuizPrefetchClaim`). Bitince satır hâlâ onunsa ve ders değişmediyse saklar.
 *
 * Bedel: soğuk/devralınan ders yolunda konu testi iki kez yazılır (ikisi de önceden yazım,
 * `CONTENT_PREFETCH`; öğrenciden kredi düşmez).
 */

type PathNode = { id: string; kind: string; status: string | null; session_meta: unknown };

const storedVariant = (payload: unknown): string | null => {
  const value = (payload as { prefetchVariant?: unknown } | null)?.prefetchVariant;
  return typeof value === "string" ? value : null;
};

/** Sahiplenilen test yazımına anahtarını yaz (yazım sürerken satır `creating`, içerik yok). */
export async function tagQuizPrefetchClaim(service: SupabaseClient, input: { nodeId: string; variant: string }): Promise<void> {
  await service
    .from("exam_prep_prefetch")
    .update({ payload: { prefetchVariant: input.variant } })
    .eq("node_id", input.nodeId)
    .eq("status", "creating")
    .then(undefined, () => undefined);
}

/** Ders kaydı yeni bir dersse ve sıradaki etkinlik bu konunun testiyse, test önceden yazımını derse göre yenile. */
export async function refreshQuizPrefetchAfterLesson(
  service: SupabaseClient,
  input: { origin: string; userId: string; prepId: string; afterSortOrder: number; topicId: string },
): Promise<void> {
  try {
    const next = await nextPrefetchNode(service, { prepId: input.prepId, afterSortOrder: input.afterSortOrder });
    // Sıradaki bir ders parçasıysa ("Ders 2/3") onun kaydı yeniden tetikler.
    if (!next || next.kind !== "quiz") return;
    const context = lessonQuizContext((await loadTopicLessons(service, input.topicId)).lessons);
    if (!context) return;
    const { data: row } = await service
      .from("exam_prep_prefetch")
      .select("status, payload, topic_id")
      .eq("node_id", next.id)
      .maybeSingle();
    if (row) {
      // Başka konunun testi: bu dersten etkilenmez.
      if (row.topic_id && row.topic_id !== input.topicId) return;
      // Hazır ya da yazılmakta olan test zaten bu derse göre.
      if (storedVariant(row.payload)?.endsWith(`:${context.key}`)) return;
      await dropPrefetch(service, next.id);
    }
    await requestNodePrefetch(service, { origin: input.origin, userId: input.userId, prepId: input.prepId, node: next });
  } catch (error) {
    console.error("quiz_prefetch_refresh_failed", {
      cause: error instanceof Error ? error.message.slice(0, 160) : "unknown",
    });
  }
}

/**
 * Önceden yazılan test bitti; saklansın mı? Satırı başka bir yazım sahiplendiyse (ders kaydı yeniledi)
 * ya da satır yoksa hayır ve ona dokunulmaz. Yazım sürerken konunun dersi değiştiyse test eski derse göredir: kendi
 * satırı silinir, derse göre yenisi istenir. Okuma düşerse saklanır; açılıştaki anahtar yine korur.
 */
export async function quizPrefetchStorable(
  service: SupabaseClient,
  input: { origin: string; userId: string; prepId: string; node: PathNode; topicId: string; variant: string; lessonKey: string | null },
): Promise<boolean> {
  try {
    const { data: row } = await service
      .from("exam_prep_prefetch")
      .select("status, payload")
      .eq("node_id", input.node.id)
      .maybeSingle();
    const tagged = storedVariant(row?.payload);
    // Satır artık bu yazımın değil (silindi, başkası sahiplendi ya da hazır): saklanacak yer yok.
    if (!row || row.status !== "creating" || (tagged && tagged !== input.variant)) return false;
    const latest = lessonQuizContext((await loadTopicLessons(service, input.topicId)).lessons)?.key ?? null;
    if (latest === input.lessonKey) return true;
    console.info("quiz_prefetch_outdated", { nodeId: input.node.id });
    await dropPrefetch(service, input.node.id);
    await requestNodePrefetch(service, { origin: input.origin, userId: input.userId, prepId: input.prepId, node: input.node });
    return false;
  } catch {
    return true;
  }
}
