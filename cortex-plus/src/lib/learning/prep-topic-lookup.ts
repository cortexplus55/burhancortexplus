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
