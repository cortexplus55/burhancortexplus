/**
 * Düğümün konusu hangi `exam_prep_topics` satırı? AYNI KONUNUN İKİ KİMLİĞİ VAR (`nodeForTopic`
 * notu): belgesiz hazırlıkta düğümün `sessionMeta.topicId` alanı konu satırının `id`'si, belgeli
 * hazırlıkta belgeden gelen `document_topic_node_id`. Yalnız `id` ile arayan sorgu belgeli
 * hazırlıkta sessizce hiçbir şey bulmaz: 18 Ekim 2026'da Pediatri belgesinde kurulumda verilen
 * aşinalık okunmadı, her ders açılışında yeniden soruldu ve konu kaydına hiçbir şey yazılmadı.
 *
 * PostgREST `or` süzgeci; kimlikte yalnız harf, rakam, tire ve alt çizgi olabilir (virgül, nokta
 * ya da parantezle süzgece başka koşul girmesin).
 */
const SAFE_ID = /^[0-9A-Za-z_-]{1,64}$/;

export function prepTopicMatch(topicId: string): string | null {
  return SAFE_ID.test(topicId) ? `id.eq.${topicId},document_topic_node_id.eq.${topicId}` : null;
}

type TopicLookupClient = {
  from: (table: string) => {
    select: (columns: string) => {
      eq: (column: string, value: string) => {
        or: (filter: string) => {
          limit: (n: number) => { maybeSingle: () => PromiseLike<{ data: unknown; error: unknown }> };
        };
      };
    };
  };
};

/**
 * Konu kimliği ne olursa olsun (konu satırının `id`'si ya da belgeden gelen `document_topic_node_id`) hazırlığın
 * konu satırını döndürür; yoksa null (30 Ekim 2026, kalıcı tek kimlik). Canlı ölçüm: konu kimliği taşıyan 1.851 yol
 * adımının 1.830'u belge konu düğümünü tutuyordu; yalnız `id` ile arayan uçlar (ders sonu "Şimdi dinle", konu
 * seçimi, video, kaynak çözümü) sessizce 404 ya da boş dönüyordu. Konu kimliği alan her uç bunu kullanır.
 */
export async function resolvePrepTopicRow<T extends Record<string, unknown> = { id: string }>(
  service: unknown,
  prepId: string,
  anyTopicId: string | null | undefined,
  columns = "id",
): Promise<T | null> {
  const id = (anyTopicId ?? "").trim();
  const match = id ? prepTopicMatch(id) : null;
  if (!match) return null;
  const select = columns.split(",").map((c) => c.trim()).includes("id") ? columns : `id, ${columns}`;
  const { data, error } = await (service as TopicLookupClient)
    .from("exam_prep_topics")
    .select(select)
    .eq("exam_prep_id", prepId)
    .or(match)
    .limit(1)
    .maybeSingle();
  if (error || !data) return null;
  return data as T;
}
